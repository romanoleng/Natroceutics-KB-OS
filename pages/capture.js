import { useCallback, useEffect, useRef, useState } from 'react';
import OsLayout from '../components/OsLayout';
import { IconUpload } from '../components/Icons';
import SmartCapture from '../components/SmartCapture';
import DestinationPicker from '../components/DestinationPicker';

/**
 * /upload — drop data exports straight into the OS. No AI, no terminal.
 *
 * Reads each file in the browser, sends the text to /api/import-file, which
 * detects the export type by its header row and loads it into the database.
 * Dashboards pick the data up on their next load.
 */

const ACCEPTED = '.csv,.tsv,.txt,.pdf,.xlsx,.xls';

/** File → base64 without blowing the stack on large files. */
async function fileToBase64(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

const STATUS_META = {
  pending:  { icon: '⟳', cls: 'upload-item--pending' },
  ok:       { icon: '✓', cls: 'upload-item--ok' },
  // Written, but the file did not fully account for itself. Distinct from ok
  // on purpose: a stock import that cannot attribute every unit to a batch has
  // succeeded and still left a question, and a tick would bury it.
  warn:     { icon: '!', cls: 'upload-item--warn' },
  error:    { icon: '✕', cls: 'upload-item--error' },
  rejected: { icon: '—', cls: 'upload-item--rejected' },
};

/**
 * Paste-anything box. Copying cells from Excel/Sheets puts tab-separated text
 * on the clipboard, so the RSP sheet (or any tabular data) can be pasted here
 * directly — the server works out what it is from the header row, same as a
 * dropped file.
 */
const PASTE_TARGETS = [
  { value: 'auto',      label: 'Table data — work it out from the columns' },
  { value: 'UK.TASKS',  label: 'Add as a UK Task (e.g. copied email)' },
  { value: 'UK.RISKS',  label: 'Add as a UK Risk / Blocker' },
  { value: 'UK.ORDERS', label: 'Shopify order email → UK Orders' },
];

function PasteBox({ onResult }) {
  const [text, setText] = useState('');
  const [target, setTarget] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(null);
  const [keyColumn, setKeyColumn] = useState('');

  // A named table is imported verbatim, so the columns are worth seeing before
  // they become fields. 'auto' keeps the old one-press behaviour: those files
  // are recognised exports whose shape is already known.
  const needsPreview = target !== 'auto' && !target.startsWith('UK.TASKS')
    && !target.startsWith('UK.RISKS') && !target.startsWith('UK.ORDERS');

  async function check() {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/import-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'pasted data', content, target, preview: true, keyColumn: keyColumn || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.ok) { setPlan(data); setKeyColumn(data.keyColumn || ''); }
      else onResult({ name: 'Pasted data', status: 'error', detail: data.detail || data.error || `HTTP ${res.status}` });
    } catch (e) {
      onResult({ name: 'Pasted data', status: 'error', detail: e.message });
    } finally { setBusy(false); }
  }

  async function submit() {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/import-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'pasted data', content, target, keyColumn: keyColumn || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const range = data.dateRange ? ` · ${data.dateRange.from} → ${data.dateRange.to}` : '';
        const preview = data.preview ? ` — “${String(data.preview).slice(0, 60)}”` : '';
        // An import that succeeded but could not account for everything is not
        // a clean success, and saying so is the whole point of this surface.
        const warn = data.warnings?.length ? ` · ${data.warnings.join(' · ')}` : '';
        onResult({ name: 'Pasted data', status: data.warnings?.length ? 'warn' : 'ok', detail: `${data.detected} → ${data.table} · ${data.written} record${data.written === 1 ? '' : 's'}${range}${preview}${warn}` });
        setText('');
        setPlan(null);
        setKeyColumn('');
      } else {
        onResult({ name: 'Pasted data', status: 'error', detail: data.detail || data.error || `HTTP ${res.status}` });
      }
    } catch (e) {
      onResult({ name: 'Pasted data', status: 'error', detail: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="paste-box">
      <div className="paste-box-head">
        <span className="paste-box-title">…or paste it</span>
        <span className="paste-box-sub">
          Excel / Sheets cells, or text copied from an Outlook email — pick where it should live.
        </span>
      </div>
      <textarea
        id="paste-input"
        className="paste-box-input"
        rows={5}
        placeholder={'Paste here — a table copied from Excel (first row = column headings),\nor an email you want captured as a task, risk, or order.'}
        value={text}
        onChange={e => setText(e.target.value)}
      />
      <div className="paste-box-actions">
        <select
          className="form-select paste-box-target"
          value={PASTE_TARGETS.some(t => t.value === target) ? target : '__table'}
          onChange={e => {
            const v = e.target.value;
            setTarget(v === '__table' ? '' : v);
            setPlan(null); setKeyColumn('');
          }}
        >
          {PASTE_TARGETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          <option value="__table">Table data — into a table I choose…</option>
        </select>
        {!PASTE_TARGETS.some(t => t.value === target) && (
          <DestinationPicker value={target} onChange={v => { setTarget(v); setPlan(null); setKeyColumn(''); }} label="" />
        )}
        {needsPreview && !plan ? (
          <button type="button" className="btn btn-primary" onClick={check} disabled={busy || !text.trim() || !target}>
            {busy ? 'Reading…' : 'Check columns'}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || !text.trim() || !target}>
            {busy ? 'Importing…' : 'Import'}
          </button>
        )}
        {text.trim() && !busy && (
          <button type="button" className="btn btn-outline" onClick={() => { setText(''); setPlan(null); }}>Clear</button>
        )}
      </div>

      {plan && (
        <div className="paste-plan">
          <p className="paste-plan-head">
            <strong>{plan.rowCount}</strong> row{plan.rowCount === 1 ? '' : 's'} ·{' '}
            <strong>{plan.columns.length}</strong> columns → <code>{plan.table}</code>
            {plan.sheetName && <> · sheet “{plan.sheetName}”</>}
          </p>
          <label className="sc-field">
            <span>Row identity</span>
            <select value={keyColumn} onChange={e => { setKeyColumn(e.target.value); setPlan(null); }}>
              <option value="">
                {plan.keyColumn ? `Auto — ${plan.keyColumn}` : 'Auto — no unique column found'}
              </option>
              {plan.columns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <p className="paste-plan-note">
            {plan.keyColumn
              ? <>Re-importing this export will <strong>update</strong> rows matched on <code>{plan.keyColumn}</code>, not duplicate them.</>
              : <>No column identifies a row, so re-importing after an edit will <strong>add</strong> a row rather than update one. Pick a column above if one is unique.</>}
          </p>
          <div className="paste-plan-grid">
            <table>
              <thead><tr>{plan.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {plan.sample.map((r, i) => (
                  <tr key={i}>{plan.columns.map(c => <td key={c}>{r[c]}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {plan.warnings?.map((w, i) => <p key={i} className="paste-plan-warn">{w}</p>)}
        </div>
      )}
    </div>
  );
}

function timeAgo(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

/**
 * The evidence trail — every capture/sync, where it landed, what changed vs
 * the run before, and a link to see the data. Kills the "did it actually
 * work?" doubt with a persistent record instead of a flash of green text.
 */
function RecentCaptures({ refreshKey }) {
  const [recent, setRecent] = useState(null);

  useEffect(() => {
    fetch('/api/activity').then(r => r.json()).then(d => setRecent(d.recent || [])).catch(() => setRecent([]));
  }, [refreshKey]);

  if (!recent || !recent.length) return null;
  return (
    <>
      <h2 className="guide-h2">Recent captures</h2>
      <div className="receipts">
        {recent.map((r, i) => {
          const delta = r.prevRecords === null ? null : r.records - r.prevRecords;
          return (
            <a key={i} href={r.href} className="receipt">
              <span className="receipt-main">
                <span className="receipt-label">{r.label}</span>
                <span className="receipt-detail">
                  {r.records.toLocaleString('en-GB')} records
                  {delta !== null && delta !== 0 && (
                    <span className={delta > 0 ? 'receipt-delta receipt-delta--up' : 'receipt-delta'}>
                      {' '}{delta > 0 ? `+${delta}` : delta} vs previous
                    </span>
                  )}
                  {delta === 0 && <span className="receipt-delta"> refreshed, same count</span>}
                  {' · '}{r.source}
                </span>
              </span>
              <span className="receipt-side">
                <span className="receipt-time">{timeAgo(r.at)}</span>
                <span className="receipt-view">view →</span>
              </span>
            </a>
          );
        })}
      </div>
    </>
  );
}

export default function Capture() {
  const [items, setItems] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(null);   // { done, total } while a batch runs
  const [refreshKey, setRefreshKey] = useState(0);
  // '' means detect by header, which stays the default: the files dropped here
  // daily are recognised exports and asking for a destination every time would
  // be friction on the common path.
  const [uploadTarget, setUploadTarget] = useState('');
  const inputRef = useRef(null);
  const counter = useRef(0);

  // Arriving via the + button's "Paste data": jump straight into the paste box.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#paste') {
      const el = document.getElementById('paste-input');
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); }
    }
  }, []);

  const processFiles = useCallback(async fileList => {
    const all = [...fileList];
    if (!all.length) return;

    const files = [];
    const entries = [];
    for (const f of all) {
      if (/\.(csv|tsv|txt|pdf|xlsx|xls)$/i.test(f.name)) {
        files.push(f);
        entries.push({ id: ++counter.current, name: f.name, status: 'pending', detail: 'Waiting…' });
      } else {
        // Never ignore a dropped file silently — say why it was skipped.
        const ext = (f.name.split('.').pop() || '?').toUpperCase();
        const isImage = /^(PNG|JPG|JPEG|HEIC|WEBP|GIF)$/.test(ext);
        entries.push({
          id: ++counter.current, name: f.name, status: 'rejected',
          detail: isImage
            ? 'Screenshots can’t be read yet — but the text in them can: open the image, select the ' +
              'text (Mac highlights it automatically), copy, and use the paste box below with a destination. ' +
              'AI image reading is on the roadmap.'
            : `${ext} files aren't supported — this page reads CSV / TSV, the stock take PDF, or an Excel workbook.`,
        });
      }
    }
    setItems(prev => [...entries, ...prev]);
    if (!files.length) return;

    setProgress({ done: 0, total: files.length });
    const queued = entries.filter(e => e.status === 'pending');

    // Sequential on purpose: imports are replace-per-table, and parallel
    // uploads of two files for the same table would race.
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = queued[i].id;
      setItems(prev => prev.map(it => it.id === id ? { ...it, detail: 'Importing…' } : it));
      try {
        const isBinary = /\.(pdf|xlsx|xls)$/i.test(file.name);
        const body = isBinary
          ? { filename: file.name, contentBase64: await fileToBase64(file) }
          : { filename: file.name, content: await file.text() };
        if (uploadTarget) body.target = uploadTarget;
        const res = await fetch('/api/import-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          const range = data.dateRange ? ` · ${data.dateRange.from} → ${data.dateRange.to}` : '';
          const preview = data.preview ? ` · ${data.preview}` : '';
          const warn = data.warnings?.length ? ` · ${data.warnings.join(' · ')}` : '';
          setItems(prev => prev.map(it => it.id === id
            ? { ...it, status: data.warnings?.length ? 'warn' : 'ok', detail: `${data.detected} — ${data.written} records${range}${preview}${warn}` }
            : it));
        } else {
          setItems(prev => prev.map(it => it.id === id
            ? { ...it, status: 'error', detail: data.detail || data.error || `HTTP ${res.status}` }
            : it));
        }
      } catch (e) {
        setItems(prev => prev.map(it => it.id === id
          ? { ...it, status: 'error', detail: e.message }
          : it));
      }
      setProgress({ done: i + 1, total: files.length });
    }
    setTimeout(() => setProgress(null), 1200);
    setRefreshKey(k => k + 1);
    // uploadTarget is read inside, so a stale closure would silently send the
    // previous destination — the exact class of bug this page exists to avoid.
  }, [uploadTarget]);

  const onDrop = useCallback(e => {
    e.preventDefault();
    setDragOver(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  return (
    <OsLayout title="Capture">
      <section className="os-hero">
        <div className="os-hero-inner">
          <p className="os-eyebrow">Capture</p>
          <h1 className="os-hero-title">Capture</h1>
          <p className="os-hero-sub">Files, pastes, emails — everything lands in the OS from here.</p>
        </div>
      </section>

      <div className="os-page-wrap">

        {/* Tell the OS leads: typing an instruction is the fastest way in, and
            it costs nothing to run (rules-only router, no model call). */}
        <SmartCapture />

        <div
          className={`upload-zone${dragOver ? ' upload-zone--over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        >
          <div className="upload-zone-icon"><IconUpload /></div>
          <div className="upload-zone-title">Tap to choose files, or drag them here</div>
          <div className="upload-zone-sub">CSV / TSV / Excel, or the stock take PDF — filenames don&rsquo;t matter, the OS reads the contents</div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            multiple
            style={{ display: 'none' }}
            onChange={e => { processFiles(e.target.files); e.target.value = ''; }}
          />
        </div>

        <div className="upload-target">
          <label className="sc-field">
            <span>Destination</span>
            <select
              value={uploadTarget ? '__table' : ''}
              onChange={e => setUploadTarget(e.target.value === '__table' ? 'UK.TRANSPARENCY' : '')}
            >
              <option value="">Work it out from the file (Sellerboard, SOH, RSP)</option>
              <option value="__table">Put it in a table I choose…</option>
            </select>
          </label>
          {uploadTarget && (
            <DestinationPicker value={uploadTarget} onChange={setUploadTarget} label="Table" />
          )}
          {uploadTarget && (
            <p className="paste-plan-note">
              Detection is off. Every column in the file becomes a field on{' '}
              <code>{uploadTarget}</code>, exactly as written.
            </p>
          )}
        </div>

        {progress && (
          <div className="upload-progress">
            <div className="upload-progress-track">
              <div
                className="upload-progress-fill"
                style={{ width: `${Math.max(6, Math.round((progress.done / progress.total) * 100))}%` }}
              />
            </div>
            <span className="upload-progress-label">
              {progress.done < progress.total
                ? `Importing ${progress.done + 1} of ${progress.total}…`
                : `Done — ${progress.total} file${progress.total > 1 ? 's' : ''} processed`}
            </span>
          </div>
        )}

        <PasteBox onResult={item => { setItems(prev => [{ ...item, id: ++counter.current }, ...prev]); setRefreshKey(k => k + 1); }} />

        {items.length > 0 && (
          <div className="upload-results">
            {items.map(it => {
              const meta = STATUS_META[it.status];
              return (
                <div key={it.id} className={`upload-item ${meta.cls}`}>
                  <span className="upload-item-icon">{meta.icon}</span>
                  <div className="upload-item-body">
                    <div className="upload-item-name">{it.name}</div>
                    <div className="upload-item-detail">{it.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <RecentCaptures refreshKey={refreshKey} />

        <h2 className="guide-h2">What can I capture?</h2>
        <div className="guide-qa">
          <div className="guide-qa-item">
            <h3>Sellerboard exports (Amazon UK)</h3>
            <p>
              <strong>Dashboard by day</strong> → Amazon Daily P&amp;L · <strong>Dashboard by
              product</strong> → ASIN Daily · <strong>Orders</strong> → Amazon Orders ·{' '}
              <strong>Stock history</strong> → Amazon FBA stock. Export from sellerboard and drop the
              files exactly as downloaded — timestamped names are fine.
            </p>
          </div>
          <div className="guide-qa-item">
            <h3>Warehouse stock take (PDF)</h3>
            <p>
              The Sage &ldquo;Stock Take Report (by Stock Code)&rdquo; PDF drops straight in — it
              becomes the warehouse Stock on Hand. The import cross-checks the parsed units against
              the report&rsquo;s own total and refuses to load if they don&rsquo;t reconcile.
            </p>
          </div>
          <div className="guide-qa-item">
            <h3>RSP competitor sheet</h3>
            <p>
              Copy the pricing tab from the Amazon team&rsquo;s Excel file, paste it into a blank
              sheet, and save/export as <em>tab-separated</em> (.tsv). It needs the ASIN,
              Seller/Price columns and RRP.
            </p>
          </div>
          <div className="guide-qa-item">
            <h3>How fresh is the dashboard after an upload?</h3>
            <p>
              Immediately — the next time a page loads it reads the new data. Each upload replaces
              that table&rsquo;s previous contents, so always upload a full export, not a partial one.
            </p>
          </div>
          <div className="guide-qa-item">
            <h3>Something was rejected?</h3>
            <p>
              The OS reads the header row to work out what a file is. If it says &ldquo;not
              recognised&rdquo;, the export type isn&rsquo;t supported yet — note which report it
              was, and it can be added.
            </p>
          </div>
        </div>

      </div>
    </OsLayout>
  );
}
