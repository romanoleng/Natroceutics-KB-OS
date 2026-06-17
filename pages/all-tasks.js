/**
 * ALL TASKS — Cross-region aggregated task view.
 * Pulls from UK Ops, SA Ops, and ME Ops.
 * Each task is tagged with its region of origin.
 */
import { useState, useMemo } from 'react';
import OsLayout from '../components/OsLayout';
import SortableTable from '../components/SortableTable';
import { getUKTasks, getSATasks, getMETasks } from '../lib/airtable';

const STATUS_CLASS = {
  'Done': 'pill-done', 'Complete': 'pill-done', 'Completed': 'pill-done', 'Approved': 'pill-done',
  'In Progress': 'pill-progress', 'Active': 'pill-progress', 'Under Review': 'pill-progress',
  'To Do': 'pill-todo', 'Not Started': 'pill-todo', 'Pending': 'pill-todo',
  'Blocked': 'pill-blocked', 'At Risk': 'pill-blocked', 'Rejected': 'pill-blocked',
};
function statusClass(s) { return STATUS_CLASS[s] || 'pill-default'; }
function fmt(v) { return (v === null || v === undefined || v === '') ? '—' : v; }

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

  const statuses = useMemo(() => [...new Set(tasks.map(t => t.Status).filter(Boolean))].sort(), [tasks]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tasks.filter(t => {
      const matchQ = !q ||
        (t.Task || '').toLowerCase().includes(q) ||
        (t.Owner || '').toLowerCase().includes(q) ||
        (t['Business Area'] || t.Phase || '').toLowerCase().includes(q);
      const matchR = !regionFilter || t._region === regionFilter;
      const matchS = !statusFilter || t.Status === statusFilter;
      return matchQ && matchR && matchS;
    });
  }, [tasks, search, regionFilter, statusFilter]);

  const ukCount = tasks.filter(t => t._region === 'UK').length;
  const saCount = tasks.filter(t => t._region === 'SA').length;
  const meCount = tasks.filter(t => t._region === 'ME').length;
  const openCount = tasks.filter(t => !['Done','Complete','Completed','Approved'].includes(t.Status)).length;

  return (
    <OsLayout title="All Tasks">
      <section className="os-hero" style={{background:'var(--forest-900)'}}>
        <div className="os-hero-inner">
          <p className="os-eyebrow">Cross-Region</p>
          <h1 className="os-hero-title">✅ All Tasks</h1>
          <div className="region-hero-stats" style={{marginTop:20}}>
            <div className="rhs"><span className="rhs-num">{tasks.length}</span><span className="rhs-label">Total Tasks</span></div>
            <div className="rhs"><span className="rhs-num">{openCount}</span><span className="rhs-label">Open</span></div>
            <div className="rhs"><span className="rhs-num">{ukCount}</span><span className="rhs-label">🇬🇧 UK</span></div>
            <div className="rhs"><span className="rhs-num">{saCount}</span><span className="rhs-label">🇿🇦 SA</span></div>
            <div className="rhs"><span className="rhs-num">{meCount}</span><span className="rhs-label">🇦🇪 ME</span></div>
          </div>
        </div>
      </section>

      <div className="os-page-wrap">
        {error && <div className="os-alert-error">{error}</div>}

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
            { label: 'Status', key: 'Status', w: 120 },
            { label: 'Priority', key: 'Priority', w: 110 },
            { label: 'Owner', key: 'Owner', w: 120 },
            { label: 'Due', key: 'Due Date', type: 'date', w: 100 },
          ]}
          data={filtered}
          renderRow={t => (
            <tr key={`${t._region}-${t.id}`}>
              <td><RegionTag region={t._region} /></td>
              <td><strong>{fmt(t.Task)}</strong>
                {t.Notes && <p className="os-table-note">{t.Notes}</p>}
              </td>
              <td className="os-muted">{fmt(t['Business Area'] || t.Phase)}</td>
              <td>{t.Status ? <span className={`os-pill ${statusClass(t.Status)}`}>{t.Status}</span> : '—'}</td>
              <td>{t.Priority ? <span className="os-pill pill-default">{t.Priority}</span> : '—'}</td>
              <td className="os-muted">{fmt(t.Owner)}</td>
              <td className="os-mono">{fmt(t['Due Date'])}</td>
            </tr>
          )}
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
      ...ukTasks.map(t => ({ ...t, _region: 'UK' })),
      ...saTasks.map(t => ({ ...t, _region: 'SA' })),
      ...meTasks.map(t => ({ ...t, _region: 'ME' })),
    ];

    return { props: { tasks, error: null } };
  } catch (e) {
    return { props: { tasks: [], error: e.message } };
  }
}
