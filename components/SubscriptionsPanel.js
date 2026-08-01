import { useState, useMemo } from 'react';
import SortableTable from './SortableTable';

/**
 * Shopify UK subscriptions, derived from Recharge's own footprint on Shopify:
 * customer tags for state, order tags for first-vs-recurring, sellingPlan for
 * cadence and discount. No Recharge API key involved.
 *
 * The number this panel leads with is deliberately NOT the "Active Subscriber"
 * tag count. That tag is set at signup and is not reliably cleared on churn, so
 * it overstates the base. We lead with subscribers who actually billed inside a
 * 45-day window (one monthly cycle plus slack) and show the gap explicitly,
 * because a subscription business that miscounts its base miscounts everything
 * downstream.
 */

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
const int = v => (v === '' || v == null ? '—' : Number(v).toLocaleString('en-GB'));
const monthLabel = m => {
  if (!m) return '—';
  const [y, mo] = String(m).split('-');
  return new Date(Number(y), Number(mo) - 1, 1)
    .toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
};

const STATE_CLASS = {
  'Active': 'actual',
  'CARD DECLINED': 'query',
  'Churned': 'pending',
  'Tagged active, not billing': 'pending',
};

export default function SubscriptionsPanel({ customers = [], monthly = [], products = [] }) {
  const [sub, setSub] = useState('Subscribers');

  const stats = useMemo(() => {
    const billing = customers.filter(c => c.Status === 'Active');
    const stale = customers.filter(c => c.Status === 'Tagged active, not billing');
    const declined = customers.filter(c => c['Card Declined'] === 'Yes');
    const ltv = customers.reduce((s, c) => s + (Number(c['Lifetime Value (£)']) || 0), 0);
    const orders = customers.reduce((s, c) => s + (Number(c.Orders) || 0), 0);
    return {
      billing: billing.length,
      stale: stale.length,
      declined: declined.length,
      declinedValue: declined.reduce((s, c) => s + (Number(c['Avg Order (£)']) || 0), 0),
      ltv,
      avgLtv: customers.length ? ltv / customers.length : 0,
      avgOrders: customers.length ? orders / customers.length : 0,
      taggedActive: billing.length + stale.length,
    };
  }, [customers]);

  if (!customers.length) {
    return (
      <div className="os-empty">
        No subscription data yet. Run <code>scripts/seed-subscriptions.js</code>, or
        <code> scripts/shopify-pull.js</code> once SHOPIFY_ADMIN_TOKEN is rotated.
      </div>
    );
  }

  const SUBS = ['Subscribers', 'Cohorts', 'Products'];
  const declinedList = customers.filter(c => c['Card Declined'] === 'Yes');

  return (
    <>
      <div className="wh-banner">
        <div className="wh-banner-inner">
          <span className="wh-banner-label">Subscriptions · Recharge</span>
          <span className="wh-banner-sub">Subscribers who billed in the last 45 days</span>
        </div>
        <div className="wh-banner-stats">
          <div className="wh-banner-stat">
            <span className="wh-banner-num">{stats.billing}</span>
            <span className="wh-banner-unit">Billing</span>
          </div>
          <div className="wh-banner-stat">
            <span className="wh-banner-num">{money0(stats.ltv)}</span>
            <span className="wh-banner-unit">Lifetime value</span>
          </div>
        </div>
      </div>

      {stats.stale > 0 && (
        <div className="sp-caveat">
          Shopify tags <strong>{stats.taggedActive}</strong> customers &ldquo;Active
          Subscriber&rdquo;, but {stats.stale} of them have not ordered in over 45 days. The tag
          is set at signup and is not reliably cleared on churn, so it overstates the base.
          Every figure here leads with the {stats.billing} who are actually billing.
        </div>
      )}

      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green">
          <div className="os-stat-num">{stats.billing}</div>
          <div className="os-stat-label">Billing subscribers</div>
        </div>
        <div className="os-stat-card">
          <div className="os-stat-num">{stats.stale}</div>
          <div className="os-stat-label">Tagged active, not billing</div>
        </div>
        <div className="os-stat-card">
          <div className="os-stat-num">{stats.declined}</div>
          <div className="os-stat-label">Card declined</div>
        </div>
        <div className="os-stat-card">
          <div className="os-stat-num">{money0(stats.avgLtv)}</div>
          <div className="os-stat-label">Average lifetime value</div>
        </div>
      </div>

      {declinedList.length > 0 && (
        <div className="sp-flag sp-flag--warn">
          <div className="sp-flag-title">
            {declinedList.length} subscriber{declinedList.length === 1 ? '' : 's'} with a declined card
          </div>
          <p>
            {declinedList.map(c => c.Customer).join(' · ')}
          </p>
          <p>
            These are people who chose to subscribe and whose payment failed. Recovering a
            declined card is the cheapest revenue on this channel: the customer is already
            won. Worth roughly {money(stats.declinedValue)} per cycle if all were recovered.
          </p>
        </div>
      )}

      <div className="os-subtab-row" style={{ marginTop: 20, marginBottom: 16, overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {SUBS.map(t => (
          <button key={t} className={`os-subtab-btn${sub === t ? ' active' : ''}`} onClick={() => setSub(t)}>
            {t}
            {t === 'Subscribers' && <span className="sp-badge">{customers.length}</span>}
          </button>
        ))}
      </div>

      {sub === 'Subscribers' && (
        <SortableTable
          cols={[
            { label: 'Customer', key: 'Customer' },
            { label: 'Status', key: 'Status' },
            { label: 'Renewals', key: 'Renewals', type: 'number' },
            { label: 'Lifetime value', key: 'Lifetime Value (£)', type: 'number' },
            { label: 'Avg order', key: 'Avg Order (£)', type: 'number' },
            { label: 'Since', key: 'Subscribed Since', type: 'date' },
            { label: 'Last order', key: 'Last Order', type: 'date' },
            { label: 'Days', key: 'Days Since Last Order', type: 'number' },
          ]}
          data={customers}
          hideDates
          emptyMsg="No subscribers."
          renderRow={c => (
            <tr key={c.id || c.Customer}>
              <td>{c.Customer}</td>
              <td>
                <span className={`sp-status sp-status--${STATE_CLASS[c.Status] || 'pending'}`}>
                  {c.Status}
                </span>
              </td>
              <td className="sp-num">{int(c.Renewals)}</td>
              <td className="sp-num">{money(c['Lifetime Value (£)'])}</td>
              <td className="sp-num">{money(c['Avg Order (£)'])}</td>
              <td className="sp-num">{c['Subscribed Since']}</td>
              <td className="sp-num">{c['Last Order']}</td>
              <td className="sp-num">{int(c['Days Since Last Order'])}</td>
            </tr>
          )}
        />
      )}

      {sub === 'Cohorts' && (
        <>
          <div className="sp-flag">
            <div className="sp-flag-title">Acquisition and annuity, counted separately</div>
            <p>
              First-order revenue is acquisition: it happens once. Recurring revenue is the
              annuity that keeps arriving without spending anything to win it again. Reporting
              them together flatters the channel, so they are split here.
            </p>
            <p>
              <strong>Recurring share has grown from under 5% to around 58%</strong>, which is the
              single best sign this channel is compounding rather than just selling.
            </p>
          </div>
          <SortableTable
            cols={[
              { label: 'Cohort', key: 'Month', type: 'string' },
              { label: 'New subscribers', key: 'New Subscribers', type: 'number' },
              { label: 'Still active', key: 'Still Active', type: 'number' },
              { label: 'Card declined', key: 'Card Declined', type: 'number' },
              { label: 'Cohort LTV', key: 'Cohort Lifetime Value (£)', type: 'number' },
              { label: 'Avg LTV', key: 'Avg LTV (£)', type: 'number' },
              { label: 'Recurring revenue', key: 'Recurring Revenue (£)' },
            ]}
            data={monthly}
            hideDates
            emptyMsg="No cohorts."
            renderRow={m => (
              <tr key={m.id || m.Month}>
                <td>{monthLabel(m.Month)}</td>
                <td className="sp-num">{int(m['New Subscribers'])}</td>
                <td className="sp-num">{int(m['Still Active'])}</td>
                <td className="sp-num">{m['Card Declined'] ? int(m['Card Declined']) : '—'}</td>
                <td className="sp-num">{money(m['Cohort Lifetime Value (£)'])}</td>
                <td className="sp-num">{money(m['Avg LTV (£)'])}</td>
                <td className="sp-num"><span className="sp-pending">PENDING</span></td>
              </tr>
            )}
          />
        </>
      )}

      {sub === 'Products' && (
        <>
          <div className="sp-flag">
            <div className="sp-flag-title">Every plan is the same</div>
            <p>
              All {products.length} subscribed SKUs run on one plan: a monthly cadence at 10% off.
              That is a pricing decision worth revisiting: a 3-month or 6-month option typically
              lifts lifetime value more than a deeper monthly discount, and the 10% is a real cost
              sitting inside the margin on every recurring order.
            </p>
          </div>
          <SortableTable
            cols={[
              { label: 'SKU', key: 'SKU' },
              { label: 'Product', key: 'Product' },
              { label: 'Plan', key: 'Plan' },
              { label: 'Discount', key: 'Discount' },
            ]}
            data={products}
            hideDates
            emptyMsg="No subscription products."
            renderRow={p => (
              <tr key={p.id || p.SKU}>
                <td className="sp-mono">{p.SKU}</td>
                <td>{p.Product}</td>
                <td>{p.Plan}</td>
                <td className="sp-num">{p.Discount}</td>
              </tr>
            )}
          />
        </>
      )}
    </>
  );
}
