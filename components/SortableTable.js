import { useState, useMemo } from 'react';

/**
 * SortableTable — site-wide sortable table component
 *
 * Props:
 *   cols       Array<{ label, key?, type?, w? }>
 *              key  = field name on data object; omit to disable sort for that column
 *              type = 'string' | 'number' | 'date'  (default: 'string')
 *              w    = fixed pixel width
 *   data       Array of raw data objects
 *   renderRow  (row, index) => <tr key={...}>...</tr>
 *   emptyMsg   String shown when data is empty (default: 'No records.')
 */
export default function SortableTable({ cols, data, renderRow, emptyMsg = 'No records.' }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    const col = cols.find(c => c.key === sortKey);
    const type = col?.type || 'string';
    return [...data].sort((a, b) => {
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
  }, [data, sortKey, sortDir, cols]);

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
        <tbody>{sorted.map((row, i) => renderRow(row, i))}</tbody>
      </table>
    </div>
  );
}
