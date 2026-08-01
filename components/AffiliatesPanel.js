import { useState, useMemo } from 'react';
import SortableTable from './SortableTable';

/**
 * Affiliates, live from GoAffPro.
 *
 * The number that matters is not how many affiliates exist but how many earn.
 * 91 are signed up and 18 have ever referred an order, so a roster sorted by
 * name would tell you almost nothing. This leads with concentration and with
 * the cost: a blended ~24% commission makes affiliates the most expensive
 * acquisition channel the business runs.
 */

const int = v => (v === '' || v == null ? '—' : Number(v).toLocaleString('en-GB'));
const money = v => {
  const n = Number(v);
  if (!Number.isFinite(n) || v === '' || v == null) return '—';
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const money0 = v => {
  const n = Number(v);
  if (!Number.isFinite(n) || v === '' || v == null) return '—';
  return `£${Math.round(n).toLocaleString('en-GB')}`;
};
const monthLabel = m => {
  if (!m) return '—';
  const [y, mo] = String(m).split('-');
  return new Date(Number(y), Number(mo) - 1, 1)
    .toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
};

export default function AffiliatesPanel({ affiliates = [], monthly = [] }) {
  const [sub, setSub] = useState('Performance');

  const stats = useMemo(() => {
    const earning = affiliates.filter(a => Number(a.Orders) > 0);
    const revenue = affiliates.reduce((s, a) => s + (Number(a['Revenue (£)']) || 0), 0);
    const commission = affiliates.reduce((s, a) => s + (Number(a['Commission (£)']) || 0), 0);
    const ranked = [...earning].sort((a, b) => (Number(b['Revenue (£)']) || 0) - (Number(a['Revenue (£)']) || 0));
    const top3 = ranked.slice(0, 3).reduce((s, a) => s + (Number(a['Revenue (£)']) || 0), 0);
    return {
      total: affiliates.length,
      earning: earning.length,
      revenue, commission,
      rate: revenue ? (commission / revenue) * 100 : 0,
      // Concentration is the risk nobody looks at until a top affiliate leaves.
      concentration: revenue ? (top3 / revenue) * 100 : 0,
      ranked,
    };
  }, [affiliates]);

  if (!affiliates.length) {
    return (
      <div className="sp-flag sp-flag--warn">
        <div className="sp-flag-title">GoAffPro is not connected yet</div>
        <p style={{ fontFamily: 'var(--mono, monospace)', fontSize: 12 }}>
          GoAffPro → Settings → Advanced → API Keys<br />
          npx vercel env add GOAFFPRO_ACCESS_TOKEN development<br />
          node --env-file-if-exists=.env.local scripts/goaffpro-pull.js
        </p>
      </div>
    );
  }

  const SUBS = ['Performance', 'By month', 'All affiliates'];
  const dormant = stats.total - stats.earning;

  return (
    <>
      <div className="wh-banner">
        <div className="wh-banner-inner">
          <span className="wh-banner-label">Affiliates · GoAffPro</span>
          <span className="wh-banner-sub">Referred revenue and what it costs</span>
        </div>
        <div className="wh-banner-stats">
          <div className="wh-banner-stat">
            <span className="wh-banner-num">{money0(stats.revenue)}</span>
            <span className="wh-banner-unit">Referred</span>
          </div>
          <div className="wh-banner-stat">
            <span className="wh-banner-num">{stats.rate.toFixed(1)}%</span>
            <span className="wh-banner-unit">Commission</span>
          </div>
        </div>
      </div>

      <div className="sp-caveat">
        <strong>{stats.earning} of {stats.total} affiliates have ever referred an order.</strong>{' '}
        {dormant} are signed up and dormant. At a blended {stats.rate.toFixed(1)}% this is the most
        expensive acquisition channel the business runs, so it is worth judging on the {stats.earning} that
        work rather than the {stats.total} that exist.
      </div>

      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green">
          <div className="os-stat-num">{money0(stats.revenue)}</div>
          <div className="os-stat-label">Referred revenue</div>
        </div>
        <div className="os-stat-card">
          <div className="os-stat-num">{money0(stats.commission)}</div>
          <div className="os-stat-label">Commission paid</div>
        </div>
        <div className="os-stat-card">
          <div className="os-stat-num">{stats.earning}</div>
          <div className="os-stat-label">Earning affiliates</div>
        </div>
        <div className="os-stat-card">
          <div className="os-stat-num">{stats.concentration.toFixed(0)}%</div>
          <div className="os-stat-label">Top 3 share</div>
        </div>
      </div>

      {stats.concentration > 60 && (
        <div className="sp-flag sp-flag--warn">
          <div className="sp-flag-title">Concentration risk</div>
          <p>
            The top three affiliates drive {stats.concentration.toFixed(0)}% of referred revenue.
            That is a single relationship away from a material drop, and it is the argument for
            recruiting rather than for paying the existing few more.
          </p>
        </div>
      )}

      <div className="os-subtab-row" style={{ marginTop: 20, marginBottom: 16, overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {SUBS.map(t => (
          <button key={t} className={`os-subtab-btn${sub === t ? ' active' : ''}`} onClick={() => setSub(t)}>
            {t}{t === 'All affiliates' && <span className="sp-badge">{stats.total}</span>}
          </button>
        ))}
      </div>

      {sub === 'Performance' && (
        <SortableTable
          cols={[
            { label: 'Affiliate', key: 'Affiliate' },
            { label: 'Orders', key: 'Orders', type: 'number' },
            { label: 'Revenue', key: 'Revenue (£)', type: 'number' },
            { label: 'Commission', key: 'Commission (£)', type: 'number' },
            { label: 'Rate', key: 'Commission Rate %', type: 'number' },
            { label: 'Last referral', key: 'Last Referral', type: 'date' },
          ]}
          data={stats.ranked}
          hideDates
          emptyMsg="No affiliate has referred an order yet."
          renderRow={a => (
            <tr key={a.id || a.Affiliate}>
              <td>{a.Affiliate}{a.Coupon && <div className="sp-note-inline">{a.Coupon}</div>}</td>
              <td className="sp-num">{int(a.Orders)}</td>
              <td className="sp-num">{money(a['Revenue (£)'])}</td>
              <td className="sp-num sp-neg">{money(a['Commission (£)'])}</td>
              <td className="sp-num">{a['Commission Rate %'] === '' ? '—' : `${Number(a['Commission Rate %']).toFixed(1)}%`}</td>
              <td className="sp-num">{a['Last Referral'] || '—'}</td>
            </tr>
          )}
        />
      )}

      {sub === 'By month' && (
        <SortableTable
          cols={[
            { label: 'Month', key: 'Month' },
            { label: 'Orders', key: 'Affiliate Sales', type: 'number' },
            { label: 'Revenue', key: 'Affiliate Revenue (£)', type: 'number' },
            { label: 'Commission', key: 'Commission (£)', type: 'number' },
            { label: 'Rate', key: 'Commission Rate %', type: 'number' },
          ]}
          data={[...monthly].sort((a, b) => String(b.Month).localeCompare(String(a.Month)))}
          hideDates
          emptyMsg="No monthly figures."
          renderRow={m => (
            <tr key={m.id || m.Month}>
              <td>{monthLabel(m.Month)}</td>
              <td className="sp-num">{int(m['Affiliate Sales'])}</td>
              <td className="sp-num">{money(m['Affiliate Revenue (£)'])}</td>
              <td className="sp-num sp-neg">{money(m['Commission (£)'])}</td>
              <td className="sp-num">{m['Commission Rate %'] === '' ? '—' : `${Number(m['Commission Rate %']).toFixed(1)}%`}</td>
            </tr>
          )}
        />
      )}

      {sub === 'All affiliates' && (
        <SortableTable
          cols={[
            { label: 'Affiliate', key: 'Affiliate' },
            { label: 'Status', key: 'Status' },
            { label: 'Coupon', key: 'Coupon' },
            { label: 'Orders', key: 'Orders', type: 'number' },
            { label: 'Revenue', key: 'Revenue (£)', type: 'number' },
            { label: 'Signed up', key: 'Signed Up', type: 'date' },
          ]}
          data={affiliates}
          hideDates
          emptyMsg="No affiliates."
          renderRow={a => (
            <tr key={a.id || a.Affiliate}>
              <td>{a.Affiliate}<div className="sp-note-inline">{a.Email}</div></td>
              <td>
                <span className={`sp-status sp-status--${Number(a.Orders) > 0 ? 'actual' : 'pending'}`}>
                  {Number(a.Orders) > 0 ? a.Status : 'dormant'}
                </span>
              </td>
              <td className="sp-mono">{a.Coupon || '—'}</td>
              <td className="sp-num">{int(a.Orders)}</td>
              <td className="sp-num">{money(a['Revenue (£)'])}</td>
              <td className="sp-num">{a['Signed Up'] || '—'}</td>
            </tr>
          )}
        />
      )}
    </>
  );
}
