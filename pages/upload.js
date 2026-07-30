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
  pending:  { icon: '…', cls: 'upload-item--pending' },
  ok:       { icon: '✓', cls: 'upload-item--ok' },
  error:    { icon: '✕', cls: 'upload-item--error' },
};

export default function Upload() {
  const [items, setItems] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const counter = useRef(0);

  const processFiles = useCallback(async fileList => {
    const files = [...fileList].filter(f => /\.(csv|tsv|txt)$/i.test(f.name));
    if (!files.length) return;

    // Queue entries first so the user sees everything immediately.
    const queued = files.map(f => ({ id: ++counter.current, name: f.name, status: 'pending', detail: 'Uploading…' }));
    setItems(prev => [...queued, ...prev]);

    // Sequential on purpose: imports are replace-per-table, and parallel
    // uploads of two files for the same table would race.
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = queued[i].id;
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
    }
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
