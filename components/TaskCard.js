import { useState, useRef } from 'react';
import { PEOPLE } from '../lib/tasks';

/**
 * One task, as a card you can act on with a thumb.
 *
 * Swipe right marks Done with an undo window. Swipe left opens the action
 * sheet (snooze, block, reassign). Both are pointer-event based rather than
 * touch-only, so the same gesture works with a trackpad on desktop and the
 * card never needs a second implementation.
 *
 * Deliberately NOT a drag library: the bottom bar took days to stop fighting
 * iOS Safari, and every extra layer that hijacks touch is a chance to break it
 * again. This listens on the card itself, only claims horizontal movement, and
 * releases immediately if the gesture turns out to be a vertical scroll.
 */

const SWIPE_TRIGGER = 88;    // px of travel before an action commits
// Raised from 12px after testing on a phone: at 12 a slightly diagonal scroll
// got claimed as a swipe, so the list felt like it was fighting back. The
// buttons are the primary path; the swipe is a shortcut for people who find it.
const CLAIM_AXIS = 24;

const FLAG = { UK: '🇬🇧', ME: '🇦🇪', SA: '🇿🇦', PT: '🇵🇹', AFF: '🤝', GLOBAL: '🌐' };

const STATUS_TONE = {
  'Done': 'done', 'Blocked': 'blocked', 'Waiting': 'waiting',
  'In Progress': 'progress', 'Under Review': 'review',
};

export default function TaskCard({ task, onStatus, onSnooze, onDelete, onField, busy }) {
  const [dx, setDx] = useState(0);
  const [sheet, setSheet] = useState(false);
  // Which chip is currently being edited in place. The chips are the fastest
  // route to the two things that actually change on a task: when it is due and
  // who has it. Opening a whole detail panel for that is friction.
  const [editing, setEditing] = useState(null);
  const start = useRef(null);
  const axis = useRef(null);

  const done = task.status === 'Done';

  function down(e) {
    if (busy) return;
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = null;
  }
  function move(e) {
    if (!start.current) return;
    const mx = e.clientX - start.current.x;
    const my = e.clientY - start.current.y;

    if (!axis.current) {
      if (Math.abs(mx) < CLAIM_AXIS && Math.abs(my) < CLAIM_AXIS) return;
      // Vertical wins decisively, not just on ties: a horizontal claim needs to
      // be clearly horizontal (twice the vertical movement). Anything else is
      // someone scrolling, and stealing that gesture is what made the list feel
      // broken on a phone.
      axis.current = Math.abs(mx) > Math.abs(my) * 2 ? 'x' : 'y';
      if (axis.current === 'x') e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (axis.current !== 'x') return;
    e.preventDefault?.();
    setDx(Math.max(-140, Math.min(140, mx)));
  }
  function up() {
    if (axis.current === 'x') {
      if (dx > SWIPE_TRIGGER && !done) onStatus?.(task, 'Done');
      else if (dx < -SWIPE_TRIGGER) setSheet(true);
    }
    start.current = null;
    axis.current = null;
    setDx(0);
  }

  const revealRight = dx > 20;
  const revealLeft = dx < -20;

  return (
    <div className="tc-wrap">
      {/* action hints revealed under the card as it moves */}
      <div className={`tc-under tc-under--right${revealRight ? ' on' : ''}`}>
        {dx > SWIPE_TRIGGER ? 'Release to complete' : 'Complete'}
      </div>
      <div className={`tc-under tc-under--left${revealLeft ? ' on' : ''}`}>
        {dx < -SWIPE_TRIGGER ? 'Release for actions' : 'Actions'}
      </div>

      <article
        className={`tc${done ? ' tc--done' : ''}${busy ? ' tc--busy' : ''}`}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? 'none' : undefined }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <div className="tc-head">
          <span className="tc-flag" title={task.regionLabel}>{FLAG[task.region] || '•'}</span>
          <h3 className="tc-title">{task.title}</h3>
          {/* Due sits beside priority because it is a SCANNING field: down a
              list of forty cards you read the top-right corner, not the meta
              row. An empty slot becomes "+ due", which is how the 181 tasks
              with no date ever get one. */}
          {onField ? (
            <button
              className={`tc-due tc-due--edit${task.overdue ? ' tc-due--overdue' : task.dueToday ? ' tc-due--today' : ''}${task.due ? '' : ' tc-due--empty'}`}
              onClick={e => { e.stopPropagation(); setEditing(editing === 'due' ? null : 'due'); }}
              title={task.due ? 'Change due date' : 'Set a due date'}
            >
              {task.due ? (task.dueToday ? 'today' : task.due.slice(5)) : '+ due'}
            </button>
          ) : task.due && (
            <span className={`tc-due${task.overdue ? ' tc-due--overdue' : task.dueToday ? ' tc-due--today' : ''}`}>
              {task.dueToday ? 'today' : task.due.slice(5)}
            </span>
          )}
          {task.priority && (
            <span className={`tc-prio tc-prio--${task.priority.toLowerCase()}`}>{task.priority}</span>
          )}
        </div>

        <div className="tc-meta">
          <span className={`tc-status tc-status--${STATUS_TONE[task.status] || 'todo'}`}>{task.status}</span>
          {task.area && <span className="tc-chip">{task.area}</span>}
          {onField ? (
            <button
              className="tc-chip tc-chip--who tc-chip--edit"
              onClick={e => { e.stopPropagation(); setEditing(editing === 'owner' ? null : 'owner'); }}
              title="Reassign"
            >
              {task.owner || 'Unassigned'}
            </button>
          ) : task.owner && <span className="tc-chip tc-chip--who">{task.owner}</span>}

          {task.waitingOn && <span className="tc-chip tc-chip--wait">waiting on {task.waitingOn}</span>}

        </div>

        {editing === 'due' && (
          <div className="tc-edit">
            <input
              type="date"
              defaultValue={task.due || ''}
              onChange={e => { onField(task, { 'Due Date': e.target.value }, { due: e.target.value }); setEditing(null); }}
              autoFocus
            />
            {[['Today', 0], ['Tomorrow', 1], ['Next week', 7]].map(([l, d]) => (
              <button key={l} onClick={() => {
                const v = new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
                onField(task, { 'Due Date': v }, { due: v }); setEditing(null);
              }}>{l}</button>
            ))}
            {task.due && (
              <button className="tc-edit-clear" onClick={() => { onField(task, { 'Due Date': '' }, { due: null }); setEditing(null); }}>
                Clear
              </button>
            )}
          </div>
        )}

        {editing === 'owner' && (
          <div className="tc-edit tc-edit--wrap">
            {PEOPLE.map(p => (
              <button
                key={p}
                className={task.owner === p ? 'on' : ''}
                onClick={() => { onField(task, { Owner: p }, { owner: p, waitingOn: null }); setEditing(null); }}
              >{p}</button>
            ))}
          </div>
        )}

        {task.notes && <p className="tc-notes">{task.notes}</p>}

        <div className="tc-actions">
          {!done && (
            <button className="tc-btn tc-btn--done" onClick={() => onStatus?.(task, 'Done')} disabled={busy}>
              Complete
            </button>
          )}
          {task.status !== 'In Progress' && !done && (
            <button className="tc-btn" onClick={() => onStatus?.(task, 'In Progress')} disabled={busy}>
              Start
            </button>
          )}
          <button className="tc-btn" onClick={() => setSheet(s => !s)} disabled={busy}>More</button>
        </div>

        {sheet && (
          <div className="tc-sheet">
            {['In Progress', 'Under Review', 'Blocked', 'Waiting', 'To Do'].map(s => (
              <button key={s} className="tc-sheet-btn" onClick={() => { onStatus?.(task, s); setSheet(false); }}>
                {s}
              </button>
            ))}
            <button className="tc-sheet-btn" onClick={() => { onSnooze?.(task, 7); setSheet(false); }}>
              Snooze 7 days
            </button>
            {onDelete && (
              <button
                className="tc-sheet-btn tc-sheet-btn--danger"
                onClick={() => { onDelete(task); setSheet(false); }}
              >
                Delete
              </button>
            )}
            <button className="tc-sheet-btn tc-sheet-btn--close" onClick={() => setSheet(false)}>Close</button>
          </div>
        )}
      </article>
    </div>
  );
}
