import { useState } from 'react';
import SortableTable from './SortableTable';

/**
 * Email / Klaviyo — the owned channel, measured.
 *
 * CORRECTION worth keeping: from Shopify session data alone it looked like the
 * whole channel was switched off (3 email sessions in June, 0 in July). The API
 * says otherwise — 10 flows are LIVE. Sessions were the wrong instrument: flow
 * emails without UTM tags land in Shopify as "direct".
 *
 * What is genuinely dormant is BROADCAST: four campaigns ever, the last in
 * January. And the Placed Order metric shows Klaviyo recorded zero orders in
 * July against a month of real Shopify sales, which means the integration has
 * stopped feeding it and every purchase-triggered flow is silently dead.
 *
 * So the tab leads with the distinction between automated and broadcast, and
 * shouts about the stalled integration.
 *
 * `planned` are the flow designs held in Airtable (Gamma Waves' ME set). They
 * are the plan of record and are shown BESIDE what the API reports is live,
 * never merged with it: a designed flow and a running flow are different things.
 */

const int = v => (v === '' || v == null ? '—' : Number(v).toLocaleString('en-GB'));
const money = v => {
  const n = Number(v);
  if (!Number.isFinite(n) || v === '' || v == null) return '—';
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function KlaviyoPanel({
  lists = [], flows = [], campaigns = [], revenue = [], planned = [],
  emailSessions = null, connected = false,
}) {
  const [sub, setSub] = useState('Flows');

  const live = flows.filter(f => String(f.Status).toLowerCase() === 'live' && f.Archived !== 'Yes');
  // Placed Order fires on EVERY order, so Klaviyo's count should track
  // Shopify's. A zero in the latest month means the integration stopped.
  const months = [...revenue].sort((a, b) => String(a.Month).localeCompare(String(b.Month)));
  const latest = months[months.length - 1] || {};
  const latestMonth = latest.Month || '';
  const latestOrders = Number(latest['Orders Recorded']) || 0;
  const hadOrders = months.some(m => Number(m['Orders Recorded']) > 0);
  const integrationStalled = hadOrders && latestOrders === 0;
  // Attributed revenue, unlike the Placed Order metric: these come from the
  // flow/campaign value reports, which credit the message that drove the sale.
  const flowRevenue = flows.reduce((s, f) => s + (Number(f['Revenue (£)']) || 0), 0);
  const campaignRevenue = campaigns.reduce((s, c) => s + (Number(c['Revenue (£)']) || 0), 0);
  const draft = flows.filter(f => String(f.Status).toLowerCase() !== 'live' && f.Archived !== 'Yes');
  const profiles = lists.reduce((s, l) => s + (Number(l.Profiles) || 0), 0);

  if (!connected) {
    return (
      <>
        <div className="sp-flag sp-flag--warn">
          <div className="sp-flag-title">Klaviyo is not connected yet</div>
          <p>
            Shopify recorded <strong>{emailSessions == null ? 'almost no' : emailSessions}</strong> sessions from
            email in the last full month. Email is the cheapest revenue in the business and it is
            currently switched off, which makes this the highest-return thing on the UK store.
          </p>
          <p>
            Add a private API key and the OS will show live flows, campaigns, list growth and
            attributed revenue here:
          </p>
          <p style={{ fontFamily: 'var(--mono, monospace)', fontSize: 12 }}>
            Klaviyo → Settings → Account → API Keys → Create Private API Key (read scopes)<br />
            npx vercel env add KLAVIYO_API_KEY production<br />
            node --env-file-if-exists=.env.local scripts/klaviyo-pull.js
          </p>
        </div>

        {planned.length > 0 && (
          <>
            <div className="sp-card-label" style={{ marginTop: 20, marginBottom: 10 }}>
              Flows designed but not yet live
            </div>
            <SortableTable
              cols={[
                { label: 'Flow', key: 'Flow Name' },
                { label: 'Type', key: 'Flow Type' },
                { label: 'Status', key: 'Status' },
                { label: 'Market', key: 'Market' },
              ]}
              data={planned}
              hideDates
              emptyMsg="No planned flows."
              renderRow={f => (
                <tr key={f.id || f['Flow Name']}>
                  <td>{f['Flow Name']}</td>
                  <td>{f['Flow Type'] || '—'}</td>
                  <td><span className="sp-status sp-status--pending">{f.Status || '—'}</span></td>
                  <td>{f.Market || '—'}</td>
                </tr>
              )}
            />
            <p className="sp-note">
              These are designs, not running flows. Nothing here is earning until it is live in
              Klaviyo and the API confirms it.
            </p>
          </>
        )}
      </>
    );
  }

  const SUBS = ['Flows', 'Campaigns', 'Lists', 'Revenue'];

  return (
    <>
      <div className="wh-banner">
        <div className="wh-banner-inner">
          <span className="wh-banner-label">Email · Klaviyo</span>
          <span className="wh-banner-sub">The owned channel</span>
        </div>
        <div className="wh-banner-stats">
          <div className="wh-banner-stat">
            <span className="wh-banner-num">{live.length}</span>
            <span className="wh-banner-unit">Live flows</span>
          </div>
          <div className="wh-banner-stat">
            <span className="wh-banner-num">{int(profiles)}</span>
            <span className="wh-banner-unit">Profiles</span>
          </div>
        </div>
      </div>

      {live.length === 0 ? (
        <div className="sp-caveat">
          Klaviyo is connected but <strong>no flow is live</strong>. A list with nothing running
          is the cheapest revenue in the business, unclaimed.
        </div>
      ) : (
        <div className="sp-caveat">
          <strong>{live.length} flows are live and earned {money(flowRevenue)}</strong> in the last
          twelve months, against {money(campaignRevenue)} from broadcast. The automated side is
          doing the work: {campaigns.filter(c => String(c.Status).toLowerCase() === 'sent').length} campaigns
          have ever been sent, the last on {(campaigns.filter(c => c.Sent).map(c => c.Sent).sort().pop()) || 'an unknown date'}.
        </div>
      )}

      {integrationStalled && (
        <div className="sp-flag sp-flag--warn">
          <div className="sp-flag-title">Klaviyo has stopped receiving orders</div>
          <p>
            Klaviyo recorded <strong>{int(latestOrders)} orders</strong> in {latestMonth} while Shopify
            recorded sales in the same month. Klaviyo&apos;s Placed Order metric fires on every order,
            so a zero means the Shopify integration is no longer feeding it.
          </p>
          <p>
            Every flow that triggers on a purchase is silently dead while this lasts: post-purchase,
            winback, review request, and order-based segmentation. This is worth fixing before any
            campaign work.
          </p>
        </div>
      )}

      <div className="os-sub-tabs" style={{ marginTop: 20, marginBottom: 16, overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {SUBS.map(t => (
          <button key={t} className={`os-sub-tab${sub === t ? ' active' : ''}`} onClick={() => setSub(t)}>{t}</button>
        ))}
      </div>

      {sub === 'Flows' && (
        <SortableTable
          cols={[
            { label: 'Flow', key: 'Flow' }, { label: 'Status', key: 'Status' },
            { label: 'Recipients', key: 'Recipients', type: 'number' },
            { label: 'Open rate', key: 'Open Rate %', type: 'number' },
            { label: 'Conversions', key: 'Conversions', type: 'number' },
            { label: 'Revenue', key: 'Revenue (£)', type: 'number' },
          ]}
          data={flows} hideDates emptyMsg="No flows."
          renderRow={f => (
            <tr key={f.id || f.Flow}>
              <td>{f.Flow}<div className="sp-note-inline">{f.Trigger || ''}</div></td>
              <td>
                <span className={`sp-status sp-status--${String(f.Status).toLowerCase() === 'live' ? 'actual' : 'pending'}`}>
                  {f.Status}
                </span>
              </td>
              <td className="sp-num">{int(f.Recipients)}</td>
              <td className="sp-num">{f['Open Rate %'] === '' ? '—' : `${Number(f['Open Rate %']).toFixed(1)}%`}</td>
              <td className="sp-num">{int(f.Conversions)}</td>
              <td className="sp-num">{f['Revenue (£)'] === '' ? '—' : money(f['Revenue (£)'])}</td>
            </tr>
          )}
        />
      )}

      {sub === 'Campaigns' && (
        <SortableTable
          cols={[
            { label: 'Campaign', key: 'Campaign' }, { label: 'Sent', key: 'Sent', type: 'date' },
            { label: 'Recipients', key: 'Recipients', type: 'number' },
            { label: 'Open rate', key: 'Open Rate %', type: 'number' },
            { label: 'Conversions', key: 'Conversions', type: 'number' },
            { label: 'Revenue', key: 'Revenue (£)', type: 'number' },
          ]}
          data={campaigns} hideDates emptyMsg="No campaigns sent."
          renderRow={c => (
            <tr key={c.id || c.Campaign}>
              <td>{c.Campaign}<div className="sp-note-inline">{c.Status}</div></td>
              <td className="sp-num">{c.Sent || '—'}</td>
              <td className="sp-num">{int(c.Recipients)}</td>
              <td className="sp-num">{c['Open Rate %'] === '' ? '—' : `${Number(c['Open Rate %']).toFixed(1)}%`}</td>
              <td className="sp-num">{int(c.Conversions)}</td>
              <td className="sp-num">{c['Revenue (£)'] === '' ? '—' : money(c['Revenue (£)'])}</td>
            </tr>
          )}
        />
      )}

      {sub === 'Lists' && (
        <SortableTable
          cols={[
            { label: 'List', key: 'List' }, { label: 'Profiles', key: 'Profiles', type: 'number' },
            { label: 'Created', key: 'Created', type: 'date' },
          ]}
          data={lists} hideDates emptyMsg="No lists."
          renderRow={l => (
            <tr key={l.id || l.List}>
              <td>{l.List}</td>
              <td className="sp-num">{int(l.Profiles)}</td>
              <td className="sp-num">{l.Created || '—'}</td>
            </tr>
          )}
        />
      )}

      {sub === 'Revenue' && (
        revenue.length === 0
          ? (
            <div className="sp-flag">
              <div className="sp-flag-title">Order metric not readable</div>
              <p>
                Klaviyo&apos;s Placed Order metric could not be read, so this shows nothing rather
                than zero. A channel that earned nothing and a channel we cannot measure must never
                look the same.
              </p>
            </div>
          )
          : (
            <SortableTable
              cols={[
                { label: 'Month', key: 'Month' },
                { label: 'Order value', key: 'Order Value (£)', type: 'number' },
                { label: 'Orders recorded', key: 'Orders Recorded', type: 'number' },
              ]}
              data={revenue} hideDates emptyMsg="No revenue data."
              renderRow={r => (
                <tr key={r.id || r.Month}>
                  <td>{r.Month}</td>
                  <td className="sp-num">{money(r['Order Value (£)'])}</td>
                  <td className="sp-num">{int(r['Orders Recorded'])}</td>
                </tr>
              )}
            />
          )
      )}
    </>
  );
}
