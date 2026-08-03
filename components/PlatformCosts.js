import { useState } from 'react';

/**
 * The Gamma Waves platform cost quote, rendered in the shape it actually has.
 *
 * These rows live in ME.FINANCE alongside regional revenue, but they share no
 * fields with it: revenue rows carry Period, Market and AED figures, and these
 * carry a cost component priced across three regions. Rendered through the
 * revenue table they came out as ten rows of dashes with only a Status badge,
 * which is how a fully populated quote managed to look like an empty table.
 *
 * Two shapes in one table is the real fault. Splitting the rendering is the
 * cheap fix and it is honest: Finance holds both, and now both are legible.
 *
 * The quote covers US, UK and ME. It is filed under ME because ME is Gamma
 * Waves' first project, not because it is ME-only, so the region columns are
 * shown in full rather than narrowed to the Middle East.
 */

const REGIONS = [
  { key: 'United States', short: 'US' },
  { key: 'United Kingdom', short: 'UK' },
  { key: 'Middle East (UAE + Kuwait)', short: 'ME' },
];

/* Rows that price something, versus rows that explain something. Both belong,
   but a decision rationale has no per-region figure and should not pretend to. */
const CONTEXT_CATEGORIES = new Set(['Phase 2 / deferred', 'Decision / rationale', 'Context']);

export default function PlatformCosts({ rows }) {
  const [open, setOpen] = useState({});
  if (!rows.length) return null;

  const costs = rows.filter(r => !CONTEXT_CATEGORIES.has(r.Category));
  const context = rows.filter(r => CONTEXT_CATEGORIES.has(r.Category));
  const source = rows[0]?.Source;

  const toggle = id => setOpen(o => ({ ...o, [id]: !o[id] }));

  return (
    <div className="sp-card" style={{ marginTop: 16 }}>
      <div className="sp-card-label">
        Platform costs
        <span className="pc-count">{costs.length} lines · all three regions</span>
      </div>

      <div className="pc-caveat">
        USD estimates from a <strong>draft for internal review</strong>, not a signed quote and not
        measured cost. Gamma Waves service fees are not included here, they sit under the MSA and
        SOW. Ranges for Klaviyo and UpPromote scale with contact volume and referral sales, so they
        should be revisited after 90 days of live data.
      </div>

      <div className="pc-list">
        {costs.map(r => {
          const id = r.id || r['Cost Component'];
          const isTotal = r.Category === 'Total';
          const isOpen = open[id];
          return (
            <div key={id} className={`pc-row${isTotal ? ' pc-row--total' : ''}`}>
              <div className="pc-head">
                <span className="pc-name">{r['Cost Component']}</span>
                {r.Category && <span className="pc-cat">{r.Category}</span>}
                {r.Frequency && <span className="pc-freq">{r.Frequency}</span>}
              </div>
              <div className="pc-regions">
                {REGIONS.map(reg => (
                  <div className="pc-region" key={reg.key}>
                    <span className="pc-region-label">{reg.short}</span>
                    <span className="pc-region-value">{r[reg.key] || '—'}</span>
                  </div>
                ))}
              </div>
              {r.Notes && (
                <>
                  {isOpen && <p className="pc-note">{r.Notes}</p>}
                  <button type="button" className="pc-btn" onClick={() => toggle(id)}>
                    {isOpen ? 'Less' : 'Note'}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {context.length > 0 && (
        <div className="pc-context">
          <div className="pc-context-label">Scope and rationale</div>
          {context.map(r => {
            const id = r.id || r['Cost Component'];
            const isOpen = open[id];
            return (
              <div className="pc-ctx-row" key={id}>
                <button type="button" className="pc-ctx-head" onClick={() => toggle(id)}>
                  <span className="pc-ctx-name">{r['Cost Component']}</span>
                  <span className="pc-ctx-status">{r.Status}</span>
                </button>
                {isOpen && r.Notes && <p className="pc-note">{r.Notes}</p>}
              </div>
            );
          })}
        </div>
      )}

      {source && <div className="pc-source">Source: {source}</div>}
    </div>
  );
}
