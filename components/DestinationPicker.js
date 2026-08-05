import { useEffect, useState } from 'react';

/**
 * "Where does this go?" — one control, used by the paste box, the file drop and
 * Smart Capture.
 *
 * Two levels, because that is the shape the OS actually has: a base (UK, ME,
 * Global) and a table inside it. The old Section dropdown offered ten flat
 * labels that were not destinations at all — picking STOCK wrote the word
 * "STOCK" onto a task in UK.TASKS — so there was no way to reach "Amazon UK"
 * because there was no level below the label to reach.
 *
 * Feed-owned tables are listed and DISABLED with their reason rather than
 * hidden. A table that silently is not in the list looks like a bug; one that
 * says "Sellerboard replaces this nightly" teaches the rule.
 */
export default function DestinationPicker({
  value, onChange, label = 'Where does this go?', allowAuto = false, autoLabel = 'Work it out from the columns',
}) {
  const [groups, setGroups] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let live = true;
    fetch('/api/destinations?includeLocked=1')
      .then(r => r.json())
      .then(d => { if (live && d.ok) setGroups(d.groups || []); })
      .catch(e => live && setErr(e.message));
    return () => { live = false; };
  }, []);

  const flat = groups.flatMap(g => g.items);
  const chosen = flat.find(i => i.value === value);

  return (
    <label className="sc-field">
      <span>{label}</span>
      <select value={value || ''} onChange={e => onChange(e.target.value)}>
        {allowAuto && <option value="auto">{autoLabel}</option>}
        {!allowAuto && !value && <option value="">Choose a table…</option>}
        {groups.map(g => (
          <optgroup key={g.baseKey} label={g.label}>
            {g.items.map(i => (
              <option key={i.value} value={i.value} disabled={i.locked}>
                {i.label}{i.locked ? ' — fed automatically' : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {chosen?.locked && (
        <span className="sc-note sc-note--warn">{chosen.lockReason}</span>
      )}
      {err && <span className="sc-note sc-note--warn">Could not load destinations: {err}</span>}
    </label>
  );
}
