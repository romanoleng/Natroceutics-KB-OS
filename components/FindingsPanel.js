import { useState } from 'react';

/**
 * The findings the OS has raised against itself, and the one action they
 * allow: closing with a reason.
 *
 * Closing is sacred. The findings pass never reopens a closed finding and
 * never overwrites the reason given, which is exactly why the reason is
 * required here: an empty Resolution would make the permanence pointless.
 * There is deliberately no delete and no snooze. A finding is either open,
 * closed with a recorded reason, or marked Stale by the pass itself.
 */
export default function FindingsPanel({ findings, baseId, tableId, otherCount }) {
  const [rows, setRows] = useState(findings);
  const [closing, setClosing] = useState(null); // recordId with the reason box open
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState({});

  const close = async f => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await fetch('/api/update-record', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseId, tableId, recordId: f.recordId,
          fields: { Status: 'Closed', Resolution: trimmed, 'Closed On': new Date().toISOString().slice(0, 10) },
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Update failed');
      setRows(rs => rs.filter(r => r.recordId !== f.recordId));
      setClosing(null);
      setReason('');
    } catch (e) {
      alert(`Could not close: ${e.message}`);
    } finally { setBusy(false); }
  };

  if (!rows.length) {
    return (
      <div className="sp-card" style={{ marginTop: 16 }}>
        <div className="sp-card-label">Findings</div>
        <div className="fd-empty">
          No open findings. {otherCount ? `${otherCount} closed or stale in the record.` : 'The pass has nothing to disagree with.'}
        </div>
      </div>
    );
  }

  return (
    <div className="sp-card" style={{ marginTop: 16 }}>
      <div className="sp-card-label">
        Findings
        <span className="fd-count">{rows.length} open</span>
      </div>
      <div className="fd-list">
        {rows.map(f => {
          const tone = f.Severity === 'High' ? 'bad' : f.Severity === 'Medium' ? 'warn' : 'idle';
          const isOpen = expanded[f.recordId];
          return (
            <div key={f.recordId} className="fd-row">
              <div className="fd-head">
                <span className={`st-badge st-badge--${tone}`}>{f.Severity}</span>
                <span className="fd-title">{f.Finding}</span>
                <span className="fd-age">
                  {f['Days Open'] > 0 ? `${f['Days Open']} day${f['Days Open'] === 1 ? '' : 's'} open` : 'raised today'}
                  {f.Escalated === 'YES' ? ' · escalated' : ''}
                </span>
              </div>
              <div className="fd-evidence">
                <div><span className="fd-side">A</span>{f['Evidence A']}</div>
                <div><span className="fd-side">B</span>{f['Evidence B']}</div>
              </div>
              {isOpen && (
                <div className="fd-body">
                  <p>{f['Why it matters']}</p>
                  <p><strong>Suggested:</strong> {f['Suggested action']}</p>
                  <p><strong>Money at risk:</strong> {f['Money at risk']}</p>
                </div>
              )}
              <div className="fd-actions">
                <button
                  type="button" className="fd-btn"
                  onClick={() => setExpanded(e => ({ ...e, [f.recordId]: !isOpen }))}
                >
                  {isOpen ? 'Less' : 'Why it matters'}
                </button>
                {closing === f.recordId ? (
                  <span className="fd-close-form">
                    <input
                      type="text" className="fd-reason" autoFocus
                      placeholder="What resolved it? Required."
                      value={reason} onChange={e => setReason(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') close(f); if (e.key === 'Escape') { setClosing(null); setReason(''); } }}
                    />
                    <button type="button" className="fd-btn fd-btn--confirm" disabled={busy || !reason.trim()} onClick={() => close(f)}>
                      {busy ? 'Closing…' : 'Close it'}
                    </button>
                    <button type="button" className="fd-btn" disabled={busy} onClick={() => { setClosing(null); setReason(''); }}>
                      Keep open
                    </button>
                  </span>
                ) : (
                  <button type="button" className="fd-btn" onClick={() => { setClosing(f.recordId); setReason(''); }}>
                    Close with reason
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {otherCount > 0 && (
        <div className="fd-footnote">{otherCount} closed or stale finding{otherCount === 1 ? '' : 's'} kept in the record.</div>
      )}
    </div>
  );
}
