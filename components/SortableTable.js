import { useState, useMemo } from 'react';
import React from 'react';
import RecordDetailPanel from './RecordDetailPanel';
import { relativeDate, fullDate } from '../lib/dateUtils';

/**
 * SortableTable — site-wide sortable table component
 *
 * Props:
 *   cols            Array<{ label, key?, type?, w? }>
 *                   key  = field name on data object; omit to disable sort for that column
 *                   type = 'string' | 'number' | 'date'  (default: 'string')
 *                   w    = fixed pixel width
 *   data            Array of raw data objects
 *   renderRow       (row, index) => <tr key={...}>...</tr>
 *   emptyMsg        String shown when data is empty (default: 'No records.')
 *   sinkCompleted   Field name (e.g. 'Status') — if set, rows whose value is in
 *                   DONE_VALUES are always sorted to the bottom, regardless of sort col.
 *   hideDates       Set true to suppress the auto Date Created / Last Updated columns.
 *   updatedLabel    Label for the auto "Updated" column (default 'Updated'). Pass 'Last Sync'
 *                    for tables populated by a scheduled/external sync (Shopify, Amazon, etc.)
 *                    rather than by manual editing, so the header reflects what the date means.
 *
 * Date columns (auto-appended unless hideDates={true}):
 *   • "Created"     — always shown; reads createdTime (available on every Airtable record)
 *   • "Updated"     — always shown; reads _updatedAt when available (from "Last Modified"
 *                     Airtable field, or a "Last Synced"-style field — see lib/airtable.js
 *                     normaliseRecord), falls back to createdTime. Add a "Last modified time"
 *                     field named "Last Modified" (manual tables) or a date field named
 *                     "Last Synced" / "<X> Last Synced" (sync-driven tables) to enable this.
 *
 * Auto-expand:
 *   If a rendered <tr> does NOT already have an onClick prop, SortableTable
 *   automatically adds click-to-expand that opens RecordDetailPanel.
 *   Pass noExpand={true} to disable globally.
 */
const DONE_VALUES = new Set(['Done', 'Complete', 'Completed', 'Approved']);

// Inline date cell style — compact, muted
const dateCellStyle = {
  fontSize: '0.72rem',
  color: 'rgba(45,42,38,0.55)',
  whiteSpace: 'nowrap',
  letterSpacing: '0.01em',
};

function DateCell({ iso }) {
  if (!iso) return <td style={dateCellStyle}>—</td>;
  return (
    <td style={dateCellStyle} title={fullDate(iso)}>
      {relativeDate(iso)}
    </td>
  );
}

export default function SortableTable({
  cols,
  data,
  renderRow,
  emptyMsg = 'No records.',
  sinkCompleted,
  noExpand,
  hideDates = false,
  updatedLabel = 'Updated',
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [detail, setDetail] = useState(null);

  // "Updated" always shows — uses _updatedAt when available, falls back to createdTime
  const hasUpdated = !hideDates;
  const showCreated = !hideDates;

  // Build the full column list including date meta columns.
  // Auto-Created is suppressed when the caller already defined a date-type column
  // (e.g. ME tasks already shows "Date of Entry" — no need to duplicate).
  const callerHasDateCol = useMemo(() => cols.some(c => c.type === 'date'), [cols]);

  const allCols = useMemo(() => {
    if (hideDates) return cols;
    const meta = [];
    if (showCreated && !callerHasDateCol)
      meta.push({ label: 'Created', key: 'createdTime', type: 'date', w: 88 });
    if (hasUpdated)
      meta.push({ label: updatedLabel, key: '_updatedAt', type: 'date', w: 88 });
    return [...cols, ...meta];
  }, [cols, hideDates, showCreated, hasUpdated, callerHasDateCol, updatedLabel]);

  const sorted = useMemo(() => {
    let result = data;
    if (sortKey) {
      const col = allCols.find(c => c.key === sortKey);
      const type = col?.type || 'string';
      result = [...data].sort((a, b) => {
        let av = a[sortKey], bv = b[sortKey];
        if (type === 'number') {
          av = parseFloat(String(av).replace(/[^0-9.-]/g, '')) || 0;
          bv = parseFloat(String(bv).replace(/[^0-9.-]/g, '')) || 0;
        } else if (type === 'date') {
          av = av ? new Date(av).getTime() : 0;
          bv = bv ? new Date(bv).getTime() : 0;
        } else {
          av = String(av ?? '').toLowerCase();
          bv = String(bv ?? '').toLowerCase();
        }
        return (av < bv ? -1 : av > bv ? 1 : 0) * (sortDir === 'asc' ? 1 : -1);
      });
    }
    if (sinkCompleted) {
      const active = result.filter(r => !DONE_VALUES.has(r[sinkCompleted]));
      const done   = result.filter(r =>  DONE_VALUES.has(r[sinkCompleted]));
      result = [...active, ...done];
    }
    return result;
  }, [data, sortKey, sortDir, allCols, sinkCompleted]);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  if (!data.length) return <div className="os-empty">{emptyMsg}</div>;

  /**
   * The same rows as cards, for phones.
   *
   * A table on a 390px screen is a horizontal scroll with a frozen column, and
   * you cannot see a record without dragging sideways. Every list in the OS now
   * reads as cards there instead: priorities, risks, stock, campaigns, the lot,
   * matching what tasks already do.
   *
   * Rather than ask fifty call sites to supply a second renderer, this reuses
   * the <tr> the caller already returns: each <td> is paired with its column
   * label, the first becomes the card title, and empty cells are dropped. Both
   * views therefore stay in step by construction, and no page needed changing.
   */
  function renderCards() {
    return sorted.map((row, i) => {
      const el = renderRow(row, i);
      const cells = React.Children.toArray(el.props.children);
      const own = el.props.onClick;
      const open = own || (noExpand ? undefined : () => setDetail(row));

      // A row rendered with colSpan is a spacer or a message, not a record.
      if (cells.length === 1 && cells[0]?.props?.colSpan) return null;

      const title = cells[0];
      const rest = cells.slice(1)
        .map((cell, n) => ({ cell, label: allCols[n + 1]?.label }))
        // An empty cell on a card is a blank line, not information.
        .filter(({ cell }) => {
          const v = cell?.props?.children;
          return v !== null && v !== undefined && v !== '' && v !== '—';
        });

      return (
        <div
          key={i}
          className={`st-card${open ? ' st-card--tap' : ''}`}
          onClick={open}
          role={open ? 'button' : undefined}
          tabIndex={open ? 0 : undefined}
          onKeyDown={open ? e => { if (e.key === 'Enter') open(e); } : undefined}
        >
          <div className="st-card-title">{title?.props?.children ?? title}</div>
          <dl className="st-card-fields">
            {rest.map(({ cell, label }, n) => (
              <div className="st-card-field" key={n}>
                <dt>{label || ''}</dt>
                <dd>{cell?.props?.children ?? cell}</dd>
              </div>
            ))}
          </dl>
          {!hideDates && (
            <div className="st-card-foot">
              {row._updatedAt || row.createdTime
                ? `Updated ${relativeDate(row._updatedAt || row.createdTime)}`
                : ''}
            </div>
          )}
        </div>
      );
    }).filter(Boolean);
  }

  return (
    <>
      {/* Cards on phones, the table on everything else. Both render; CSS picks
          one, so sorting state is shared and there is no layout flash. */}
      <div className="st-cards">{renderCards()}</div>

      <div className="table-scroll">
        <table className="os-table">
          <thead>
            <tr>
              {allCols.map((c, i) => (
                <th
                  key={i}
                  style={c.w ? { width: c.w } : {}}
                  className={c.key ? 'th-sort' : ''}
                  onClick={c.key ? () => handleSort(c.key) : undefined}
                >
                  {c.label}
                  {c.key && (
                    <span className={`sort-icon${sortKey === c.key ? ' active' : ''}`}>
                      {sortKey === c.key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const el = renderRow(row, i);
              // Append date cells to the rendered <tr>
              // Only inject Created cell if we actually added the Created header column
              const injectCreated = showCreated && !callerHasDateCol;
              const withDates = (!hideDates && (injectCreated || hasUpdated))
                ? React.cloneElement(el, {}, [
                    ...(React.Children.toArray(el.props.children)),
                    injectCreated && <DateCell key="__created" iso={row.createdTime} />,
                    hasUpdated    && <DateCell key="__updated" iso={row._updatedAt || row.createdTime} />,
                  ].filter(Boolean))
                : el;

              // If caller already set onClick on the tr, don't interfere
              if (noExpand || withDates.props.onClick) return withDates;
              // Auto-expand: click row to open RecordDetailPanel
              return React.cloneElement(withDates, {
                style: { ...withDates.props.style, cursor: 'pointer' },
                onClick: () => setDetail(row),
              });
            })}
          </tbody>
        </table>
      </div>
      {detail && (
        <RecordDetailPanel
          record={detail}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}
