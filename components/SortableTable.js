import { useState, useMemo } from 'react';
import React from 'react';
import RecordDetailPanel from './RecordDetailPanel';

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
 *
 * Auto-expand:
 *   If a rendered <tr> does NOT already have an onClick prop, SortableTable
 *   automatically adds click-to-expand that opens RecordDetailPanel.
 *   To opt out for a specific row, add a no-op onClick to the <tr>:
 *     <tr key={r.id} onClick={null}>  — won't help, null is falsy
 *     <tr key={r.id} data-no-expand>  — not checked
 *   Instead pass noExpand={true} to the SortableTable to disable globally.
 */
const DONE_VALUES = new Set(['Done', 'Complete', 'Completed', 'Approved']);

export default function SortableTable({
  cols,
  data,
  renderRow,
  emptyMsg = 'No records.',
  sinkCompleted,
  noExpand,
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [detail, setDetail] = useState(null);

  const sorted = useMemo(() => {
    let result = data;
    if (sortKey) {
      const col = cols.find(c => c.key === sortKey);
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
  }, [data, sortKey, sortDir, cols, sinkCompleted]);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  if (!data.length) return <div className="os-empty">{emptyMsg}</div>;

  return (
    <>
      <div className="table-scroll">
        <table className="os-table">
          <thead>
            <tr>
              {cols.map((c, i) => (
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
              // If caller already set onClick on the tr (e.g. TaskTable), don't interfere
              if (noExpand || el.props.onClick) return el;
              // Auto-expand: click row to open RecordDetailPanel
              return React.cloneElement(el, {
                style: { ...el.props.style, cursor: 'pointer' },
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
