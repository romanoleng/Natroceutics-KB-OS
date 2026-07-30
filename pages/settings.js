import { useEffect, useState } from 'react';
import OsLayout from '../components/OsLayout';
import { NAV_MODULES, MAX_PINS, loadPins, savePins } from '../lib/nav-modules';

/**
 * /settings — the app's control room.
 * Navigation pinning (mobile bottom bar), data source overview, and the
 * Natro AI placeholder. Client-side preferences live in localStorage.
 */
export default function Settings() {
  const [pins, setPins] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setPins(loadPins()); }, []);

  function togglePin(code) {
    setSaved(false);
    setPins(prev => {
      const has = prev.includes(code);
      if (has) return prev.filter(c => c !== code);
      if (prev.length >= MAX_PINS) return prev;   // full — ignore
      return [...prev, code];
    });
  }

  function save() {
    savePins(pins);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <OsLayout title="Settings">
      <section className="os-hero">
        <div className="os-hero-inner">
          <p className="os-eyebrow">Preferences</p>
          <h1 className="os-hero-title">Settings</h1>
          <p className="os-hero-sub">Navigation, data sources, and what&rsquo;s coming next.</p>
        </div>
      </section>

      <div className="os-page-wrap">

        {/* ── navigation pins ── */}
        <h2 className="guide-h2">Bottom bar (mobile)</h2>
        <div className="settings-card">
          <p className="settings-hint">
            Home and Settings are always there. Pick up to {MAX_PINS} modules for the slots between them.
          </p>
          {pins === null ? (
            <p className="settings-hint">Loading…</p>
          ) : (
            <>
              <div className="settings-pins">
                {NAV_MODULES.filter(m => m.pinnable).map(m => {
                  const checked = pins.includes(m.code);
                  const full = !checked && pins.length >= MAX_PINS;
                  return (
                    <label key={m.code} className={`settings-pin${checked ? ' settings-pin--on' : ''}${full ? ' settings-pin--full' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={full}
                        onChange={() => togglePin(m.code)}
                      />
                      <span>{m.label}</span>
                    </label>
                  );
                })}
              </div>
              <div className="settings-actions">
                <button type="button" className="btn btn-primary" onClick={save} disabled={!pins.length}>
                  {saved ? 'Saved ✓' : 'Save navigation'}
                </button>
                <span className="settings-hint">{pins.length}/{MAX_PINS} selected · saved on this device</span>
              </div>
            </>
          )}
        </div>

        {/* ── data sources ── */}
        <h2 className="guide-h2">Data sources</h2>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-row-name">Natro-OS database</span>
            <span className="guide-pill" style={{ background: 'var(--ok-bg)', color: 'var(--ok-fg)', border: '1px solid var(--ok-bg)' }}>Live</span>
            <span className="settings-row-note">Neon Postgres — what every dashboard reads. See <a href="/guide">How the OS Works</a> for per-module freshness.</span>
          </div>
          <div className="settings-row">
            <span className="settings-row-name">Uploads &amp; paste</span>
            <span className="guide-pill" style={{ background: 'var(--ok-bg)', color: 'var(--ok-fg)', border: '1px solid var(--ok-bg)' }}>Live</span>
            <span className="settings-row-note">Sellerboard CSVs, Excel workbooks, the stock take PDF, copied emails — <a href="/upload">Upload Data</a>.</span>
          </div>
          <div className="settings-row">
            <span className="settings-row-name">Shopify sync</span>
            <span className="guide-pill" style={{ background: 'var(--amber-bg)', color: 'var(--amber-fg)', border: '1px solid var(--amber-bg)' }}>Token needed</span>
            <span className="settings-row-note">The store&rsquo;s Admin API token needs rotating (Shopify Admin → Apps → Develop apps), then updating in Vercel as <code>SHOPIFY_ADMIN_TOKEN</code>.</span>
          </div>
          <div className="settings-row">
            <span className="settings-row-name">Natro-OS-Data-Fetch</span>
            <span className="guide-pill" style={{ background: 'var(--amber-bg)', color: 'var(--amber-fg)', border: '1px solid var(--amber-bg)' }}>From 1 Aug</span>
            <span className="settings-row-note">The daily scheduler — scans the Natroceutics inbox (orders, sellerboard, warehouse emails) and writes into the database. Runs in Claude, where the email connectors live.</span>
          </div>
          <div className="settings-row">
            <span className="settings-row-name">Airtable</span>
            <span className="guide-pill" style={{ background: 'var(--field)', color: 'var(--charcoal-45)', border: '1px solid var(--cream-dark)' }}>Retiring</span>
            <span className="settings-row-note">Read fallback until the 1 Aug migration; being phased out entirely.</span>
          </div>
        </div>

        {/* ── Natro AI ── */}
        <h2 className="guide-h2">Natro AI</h2>
        <div className="settings-card settings-card--ai">
          <div className="settings-ai-badge">Coming soon</div>
          <p className="settings-hint" style={{ marginBottom: 6 }}>
            <strong>The OS&rsquo;s built-in agent.</strong> Planned: ask questions across all modules
            (&ldquo;how did Ashwagandha do this month?&rdquo;), read screenshots and documents you drop
            in, propose where data belongs, and morning briefings.
          </p>
          <p className="settings-hint">
            Ships once an Anthropic API key is added to the environment — the same kind of key already
            used in the finance app.
          </p>
        </div>

      </div>
    </OsLayout>
  );
}
