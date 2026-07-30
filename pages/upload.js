import { useCallback, useRef, useState } from 'react';
import OsLayout from '../components/OsLayout';

/**
 * /upload — drop data exports straight into the OS. No AI, no terminal.
 *
 * Reads each file in the browser, sends the text to /api/import-file, which
 * detects the export type by its header row and loads it into the database.
 * Dashboards pick the data up on their next load.
 */

const ACCEPTED = '.csv,.tsv,.txt';

const STATUS_META = {
  pending:  { icon: '⟳', cls: 'upload-item--pending' },
  ok:       { icon: '✓', cls: 'upload-item--ok' },
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

  async function submit() {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/import-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'pasted data', content, target }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const range = data.dateRange ? ` · ${data.dateRange.from} → ${data.dateRange.to}` : '';
        const preview = data.preview ? ` — “${String(data.preview).slice(0, 60)}”` : '';
        onResult({ name: 'Pasted data', status: 'ok', detail: `${data.detected} → ${data.table} · ${data.written} record${data.written === 1 ? '' : 's'}${range}${preview}` });
        setText('');
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
        className="paste-box-input"
        rows={5}
        placeholder={'Paste here — a table copied from Excel (first row = column headings),\nor an email you want captured as a task, risk, or order.'}
        value={text}
        onChange={e => setText(e.target.value)}
      />
      <div className="paste-box-actions">
        <select className="form-select paste-box-target" value={target} onChange={e => setTarget(e.target.value)}>
          {PASTE_TARGETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || !text.trim()}>
          {busy ? 'Importing…' : 'Import'}
        </button>
        {text.trim() && !busy && (
          <button type="button" className="btn btn-outline" onClick={() => setText('')}>Clear</button>
        )}
      </div>
    </div>
  );
}

export default function Upload() {
  const [items, setItems] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(null);   // { done, total } while a batch runs
  const inputRef = useRef(null);
  const counter = useRef(0);

  const processFiles = useCallback(async fileList => {
    const all = [...fileList];
    if (!all.length) return;

    const files = [];
    const entries = [];
    for (const f of all) {
      if (/\.(csv|tsv|txt)$/i.test(f.name)) {
        files.push(f);
        entries.push({ id: ++counter.current, name: f.name, status: 'pending', detail: 'Waiting…' });
      } else {
        // Never ignore a dropped file silently — say why it was skipped.
        const ext = (f.name.split('.').pop() || '?').toUpperCase();
        entries.push({
          id: ++counter.current, name: f.name, status: 'rejected',
          detail: `${ext} files aren't supported — this page reads table data (CSV / TSV). ` +
                  (ext === 'PDF' ? 'For PDFs, export the underlying report as CSV instead.' : ''),
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
        const content = await file.text();
        const res = await fetch('/api/import-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, content }),
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          const range = data.dateRange ? ` · ${data.dateRange.from} → ${data.dateRange.to}` : '';
          setItems(prev => prev.map(it => it.id === id
            ? { ...it, status: 'ok', detail: `${data.detected} — ${data.written} records${range}` }
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
  }, []);

  const onDrop = useCallback(e => {
    e.preventDefault();
    setDragOver(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  return (
    <OsLayout title="Upload Data">
      <section className="os-hero">
        <div className="os-hero-inner">
          <p className="os-eyebrow">Data In</p>
          <h1 className="os-hero-title">Upload Data</h1>
          <p className="os-hero-sub">Drop export files here — they land on the dashboards straight away.</p>
        </div>
      </section>

      <div className="os-page-wrap">

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
          <div className="upload-zone-icon">⬆</div>
          <div className="upload-zone-title">Tap to choose files, or drag them here</div>
          <div className="upload-zone-sub">CSV / TSV — filenames don&rsquo;t matter, the OS reads the columns</div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            multiple
            style={{ display: 'none' }}
            onChange={e => { processFiles(e.target.files); e.target.value = ''; }}
          />
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

        <PasteBox onResult={item => setItems(prev => [{ ...item, id: ++counter.current }, ...prev])} />

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

        <h2 className="guide-h2">What can I upload?</h2>
        <div className="guide-qa">
          <div className="guide-qa-item">
            <h3>Sellerboard exports (Amazon UK)</h3>
            <p>
              <strong>Dashboard by day</strong> → Amazon Daily P&amp;L · <strong>Dashboard by
              product</strong> → ASIN Daily · <strong>Orders</strong> → Amazon Orders ·{' '}
              <strong>Stock history</strong> → Stock on Hand. Export from sellerboard and drop the
              files exactly as downloaded — timestamped names are fine.
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
