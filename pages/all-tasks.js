/**
 * ALL TASKS — Cross-region aggregated task view.
 * Pulls from UK Ops, SA Ops, and ME Ops.
 * Each task is tagged with its region of origin.
 */
import { useState, useMemo } from 'react';
import OsLayout from '../components/OsLayout';
import SortableTable from '../components/SortableTable';
import { useStatusEditor, StatusSelect, DONE_VALS, CANONICAL_STATUSES } from '../components/StatusSelect';
import { getUKTasks, getSATasks, getMETasks } from '../lib/airtable';

/* Region base + table IDs — needed for inline status updates */
const REGION_META = {
  UK: { baseId: 'appb0pnXsdtALWq80', tableId: 'tbl5GXDhdcu6iwCA8' },
  SA: { baseId: 'appz7wLo78sxzLhjV', tableId: 'tblAv5lowKpohE27i' },
  ME: { baseId: 'appdN9dWxVcB2KFZ6', tableId: 'tbleGswAUGSDhcrE9' },
};

function fmt(v) { return (v === null || v === undefined || v === '') ? '—' : v; }

/* Priority pill colours */
const PRIORITY_STYLE = {
  'High':   { background: 'rgba(217,119,6,0.12)',  color: '#b45309', border: '1px solid rgba(217,119,6,0.3)' },
  'Medium': { background: 'rgba(202,138,4,0.1)',   color: '#a16207', border: '1px solid rgba(202,138,4,0.28)' },
  'Normal': { background: 'rgba(100,116,139,0.1)', color: '#475569', border: '1px solid rgba(100,116,139,0.25)' },
  'Low':    { background: 'rgba(22,163,74,0.1)',   color: '#15803d', border: '1px solid rgba(22,163,74,0.25)' },
};
function PriorityPill({ priority }) {
  if (!priority) return <span className="os-muted">—</span>;
  const style = PRIORITY_STYLE[priority] || PRIORITY_STYLE['Normal'];
  const dot = priority === 'High' ? '#f59e0b' : priority === 'Low' ? '#22c55e' : '#94a3b8';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      ...style,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      {priority}
    </span>
  );
}

const REGION_STYLES = {
  UK: { background: 'rgba(29,65,48,0.12)', color: '#1d4130', border: '1px solid rgba(29,65,48,0.25)' },
  SA: { background: 'rgba(180,110,30,0.12)', color: '#7a4a00', border: '1px solid rgba(180,110,30,0.25)' },
  ME: { background: 'rgba(0,90,160,0.1)', color: '#00508a', border: '1px solid rgba(0,90,160,0.25)' },
};

function RegionTag({ region }) {
  const style = REGION_STYLES[region] || {};
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 7px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.06em',
      fontFamily: 'var(--font-mono)',
      ...style,
    }}>{region}</span>
  );
}

export default function AllTasksPage({ tasks, error }) {
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const editor = useStatusEditor(tasks);

  // Use canonical set — no emoji, no Airtable variants, no duplicates
  const statuses = CANONICAL_STATUSES;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return editor.dataWithStatus.filter(t => {
      const matchQ = !q ||
        (t.Task || '').toLowerCase().includes(q) ||
        (t.Owner || '').toLowerCase().includes(q) ||
        (t['Business Area'] || t.Phase || '').toLowerCase().includes(q);
      const matchR = !regionFilter || t._region === regionFilter;
      const matchS = !statusFilter || t.Status === statusFilter;
      return matchQ && matchR && matchS;
    });
  }, [editor.dataWithStatus, search, regionFilter, statusFilter]);

  const allWithStatus = editor.dataWithStatus;
  const openCount = allWithStatus.filter(t => !DONE_VALS.has(t.Status)).length;
  const doneCount  = allWithStatus.filter(t =>  DONE_VALS.has(t.Status)).length;
  const ukCount = allWithStatus.filter(t => t._region === 'UK' && !DONE_VALS.has(t.Status)).length;
  const saCount = allWithStatus.filter(t => t._region === 'SA' && !DONE_VALS.has(t.Status)).length;
  const meCount = allWithStatus.filter(t => t._region === 'ME' && !DONE_VALS.has(t.Status)).length;

  return (
    <OsLayout title="All Tasks">
      <section className="os-hero" style={{background:'var(--forest-900)'}}>
        <div className="os-hero-inner">
          <p className="os-eyebrow">Cross-Region</p>
          <h1 className="os-hero-title">✅ All Tasks</h1>
          <div className="region-hero-stats" style={{marginTop:20}}>
            <div className="rhs"><span className="rhs-num">{openCount}</span><span className="rhs-label">Open</span></div>
            <div className="rhs"><span className="rhs-num" style={{color:'rgba(255,255,255,0.45)'}}>{doneCount}</span><span className="rhs-label" style={{color:'rgba(255,255,255,0.35)'}}>Done</span></div>
            <div className="rhs"><span className="rhs-num">{ukCount}</span><span className="rhs-label">🇬🇧 UK</span></div>
            <div className="rhs"><span className="rhs-num">{saCount}</span><span className="rhs-label">🇿🇦 SA</span></div>
            <div className="rhs"><span className="rhs-num">{meCount}</span><span className="rhs-label">🇦🇪 ME</span></div>
          </div>
        </div>
      </section>

      <div className="os-page-wrap">
        {error && <div className="os-alert-error">{error}</div>}
        {editor.updateError && <div className="os-alert-error" style={{ marginBottom: 8 }}>{editor.updateError}</div>}

        <div className="os-toolbar">
          <input
            className="os-search"
            placeholder="Search tasks, owners, areas…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="os-select" value={regionFilter} onChange={e => setRegionFilter(e.target.value)}>
            <option value="">All Regions</option>
            <option value="UK">🇬🇧 UK</option>
            <option value="SA">🇿🇦 SA</option>
            <option value="ME">🇦🇪 ME</option>
          </select>
          {statuses.length > 0 && (
            <select className="os-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <span className="os-count">{filtered.length} task{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        <SortableTable
          cols={[
            { label: 'Region', key: '_region', w: 70 },
            { label: 'Task', key: 'Task' },
            { label: 'Area / Phase', key: 'Business Area', w: 140 },
            { label: 'Status', key: 'Status', w: 130 },
            { label: 'Priority', key: 'Priority', w: 110 },
            { label: 'Owner', key: 'Owner', w: 120 },
          ]}
          data={filtered}
          sinkCompleted="Status"
          renderRow={t => {
            const isDone = DONE_VALS.has(t.Status);
            return (
              <tr key={`${t._region}-${t.id}`} className={isDone ? 'row-done' : ''}>
                <td><RegionTag region={t._region} /></td>
                <td>
                  <strong>{fmt(t.Task)}</strong>
                  {t.Notes && <p className="os-table-note">{t.Notes}</p>}
                </td>
                <td className="os-muted">{fmt(t['Business Area'] || t.Phase)}</td>
                <td onClick={e => e.stopPropagation()}>
                  <StatusSelect
                    record={t}
                    allStatuses={statuses}
                    handleStatusChange={editor.handleStatusChange}
                    saving={editor.saving}
                  />
                </td>
                <td><PriorityPill priority={t.Priority} /></td>
                <td className="os-muted">{fmt(t.Owner)}</td>
              </tr>
            );
          }}
          emptyMsg="No tasks found."
        />
      </div>
    </OsLayout>
  );
}

export async function getServerSideProps() {
  try {
    const [ukTasks, saTasks, meTasks] = await Promise.all([
      getUKTasks(),
      getSATasks(),
      getMETasks(),
    ]);

    const tasks = [
      ...ukTasks.map(t => ({ ...t, _region: 'UK', _baseId: REGION_META.UK.baseId, _tableId: REGION_META.UK.tableId })),
      ...saTasks.map(t => ({ ...t, _region: 'SA', _baseId: REGION_META.SA.baseId, _tableId: REGION_META.SA.tableId })),
      ...meTasks.map(t => ({ ...t, _region: 'ME', _baseId: REGION_META.ME.baseId, _tableId: REGION_META.ME.tableId })),
    ];

    return { props: { tasks, error: null } };
  } catch (e) {
    return { props: { tasks: [], error: e.message } };
  }
}
