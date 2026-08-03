import { useState, useRef, useEffect } from 'react';

/**
 * An inline, click-to-edit cell that writes straight to the mirror.
 *
 * The rule this component exists to enforce: EDIT ONLY WHAT NO FEED OWNS.
 * A hand-typed figure on a row that a pull script rewrites survives until the
 * next run and then vanishes, which is worse than never having been editable,
 * because you trust it in between. `locked` renders the value as plain text
 * with a reason on hover instead of pretending it can be changed.
 *
 * Saving is optimistic with a rollback, matching the task cards. There is no
 * save button by design: Enter commits, Escape abandons, blur commits. A field
 * you must remember to save is a field that silently loses work.
 */
export default function EditableValue({
  value, onSave, locked, lockReason,
  placeholder = '—', suffix = '', type = 'text', align = 'right',
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef(null);

  useEffect(() => { if (!editing) setDraft(value ?? ''); }, [value, editing]);
  useEffect(() => { if (editing && ref.current) ref.current.select(); }, [editing]);

  const shown = value === '' || value === null || value === undefined ? null : value;

  if (locked) {
    return (
      <span className="ev ev--locked" title={lockReason || 'Maintained by a feed'}>
        {shown === null ? placeholder : `${shown}${suffix}`}
        <span className="ev-lock" aria-hidden>·</span>
      </span>
    );
  }

  const commit = async () => {
    const next = String(draft).trim();
    if (next === String(value ?? '')) { setEditing(false); return; }
    setBusy(true);
    setError('');
    try {
      await onSave(next);
      setEditing(false);
    } catch (e) {
      setError(e.message || 'Could not save');
      setDraft(value ?? '');
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <span className="ev ev--editing">
        <input
          ref={ref}
          className="ev-input"
          style={{ textAlign: align }}
          type={type}
          value={draft}
          disabled={busy}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); }
          }}
          onBlur={commit}
          autoFocus
        />
        {error && <span className="ev-error">{error}</span>}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`ev ev--btn${shown === null ? ' ev--empty' : ''}`}
      onClick={() => setEditing(true)}
      title="Click to edit"
    >
      {shown === null ? placeholder : `${shown}${suffix}`}
    </button>
  );
}
