import { useState } from 'react';
import SortableTable from './SortableTable';

/**
 * Email / Klaviyo — the owned channel, measured.
 *
 * The context that makes this tab matter: Shopify recorded 3 email sessions in
 * June and 0 in July, against a list that snapshotted at 362 profiles. Email is
 * the cheapest revenue in the business and it is switched off. So the tab leads
 * with that gap rather than with a vanity list count.
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

      {live.length === 0 && (
        <div className="sp-caveat">
          Klaviyo is connected but <strong>no flow is live</strong>. A list of {int(profiles)} profiles
          with nothing running is the cheapest revenue in the business, unclaimed.
        </div>
      )}

      <div className="os-subtab-row" style={{ marginTop: 20, marginBottom: 16, overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {SUBS.map(t => (
          <button key={t} className={`os-subtab-btn${sub === t ? ' active' : ''}`} onClick={() => setSub(t)}>{t}</button>
        ))}
      </div>

      {sub === 'Flows' && (
        <SortableTable
          cols={[
            { label: 'Flow', key: 'Flow' }, { label: 'Status', key: 'Status' },
            { label: 'Trigger', key: 'Trigger' }, { label: 'Updated', key: 'Updated', type: 'date' },
          ]}
          data={flows} hideDates emptyMsg="No flows."
          renderRow={f => (
            <tr key={f.id || f.Flow}>
              <td>{f.Flow}</td>
              <td>
                <span className={`sp-status sp-status--${String(f.Status).toLowerCase() === 'live' ? 'actual' : 'pending'}`}>
                  {f.Status}
                </span>
              </td>
              <td>{f.Trigger || '—'}</td>
              <td className="sp-num">{f.Updated || '—'}</td>
            </tr>
          )}
        />
      )}

      {sub === 'Campaigns' && (
        <SortableTable
          cols={[
            { label: 'Campaign', key: 'Campaign' }, { label: 'Status', key: 'Status' },
            { label: 'Sent', key: 'Sent', type: 'date' },
          ]}
          data={campaigns} hideDates emptyMsg="No campaigns sent."
          renderRow={c => (
            <tr key={c.id || c.Campaign}>
              <td>{c.Campaign}</td>
              <td>{c.Status || '—'}</td>
              <td className="sp-num">{c.Sent || '—'}</td>
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
              <div className="sp-flag-title">Attributed revenue not measurable</div>
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
                { label: 'Attributed revenue', key: 'Attributed Revenue (£)', type: 'number' },
                { label: 'Attributed orders', key: 'Attributed Orders', type: 'number' },
              ]}
              data={revenue} hideDates emptyMsg="No revenue data."
              renderRow={r => (
                <tr key={r.id || r.Month}>
                  <td>{r.Month}</td>
                  <td className="sp-num">{money(r['Attributed Revenue (£)'])}</td>
                  <td className="sp-num">{int(r['Attributed Orders'])}</td>
                </tr>
              )}
            />
          )
      )}
    </>
  );
}
