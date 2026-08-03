import { useState } from 'react';
import TaskCard from './TaskCard';

/**
 * A collapsible run of task cards under a heading with a count.
 *
 * Extracted from Today so section tabs can use the same thing. Today groups by
 * urgency (Overdue / Today / Waiting); sections group by status. Both want the
 * identical behaviour: a heading you can fold away, a count you can trust, and
 * nothing rendered at all when the group is empty, because a row of zeroes is
 * just noise to scroll past.
 */
export default function TaskGroup({
  title, hint, tasks, tone, open = true,
  onStatus, onSnooze, onDelete, onField, onOpen, busyId,
}) {
  const [show, setShow] = useState(open);
  if (!tasks.length) return null;
  return (
    <section className={`tg tg--${tone}`}>
      <button className="tg-head" onClick={() => setShow(s => !s)} type="button">
        <span className="tg-title">{title}</span>
        <span className="tg-count">{tasks.length}</span>
        {hint && <span className="tg-hint">{hint}</span>}
        <span className={`tg-chev${show ? ' open' : ''}`}>▾</span>
      </button>
      {show && (
        <div className="tg-body">
          {tasks.map(t => (
            <TaskCard
              key={t.id} task={t}
              onStatus={onStatus} onSnooze={onSnooze} onDelete={onDelete}
              onField={onField} onOpen={onOpen} busy={busyId === t.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}
