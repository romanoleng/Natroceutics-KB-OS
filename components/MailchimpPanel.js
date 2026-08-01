import { useState } from 'react';
import SortableTable from './SortableTable';

/**
 * Email / Mailchimp — SA's owned channel.
 *
 * Same discipline as the Klaviyo panel: lead with whether the channel is
 * actually running, and never let "not tracked" render as zero.
 *
 * Verified 1 Aug 2026: this account has NO connected store (ecommerce/stores
 * returns zero), and Romano confirmed there is no SA store to connect yet. So
 * revenue reads NOT TRACKED and the panel says that is expected rather than
 * flagging it as a fault to fix. Engagement is the measure here until a later
 * phase.
 */

const int = v => (v === '' || v == null ? '—' : Number(v).toLocaleString('en-GB'));
const pct = v => (v === '' || v == null ? '—' : `${Number(v).toFixed(1)}%`);
const money = v => {
  const n = Number(v);
  if (!Number.isFinite(n) || v === '' || v == null) return null;
  return `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function MailchimpPanel({ audiences = [], campaigns = [], automations = [], connected = false }) {
  const [sub, setSub] = useState('Campaigns');

  if (!connected) {
    return (
      <div className="sp-flag sp-flag--warn">
        <div className="sp-flag-title">Mailchimp is not connected yet</div>
        <p>
          SA runs Mailchimp where the UK runs Klaviyo. Once a key is added, this tab shows
          audiences and list growth, every sent campaign with its real open and click rates,
          and automations with whether they are actually running.
        </p>
        <p style={{ fontFamily: 'var(--mono, monospace)', fontSize: 12 }}>
          Mailchimp → Account &amp; billing → Extras → API keys → Create A Key<br />
          npx vercel env add MAILCHIMP_API_KEY production<br />
          node --env-file-if-exists=.env.local scripts/mailchimp-pull.js
        </p>
        <p>
          The key ends with its data centre (&ldquo;…-us14&rdquo;), and the OS reads that from the
          key itself, so there is nothing else to configure.
        </p>
      </div>
    );
  }

  const members = audiences.reduce((s, a) => s + (Number(a.Members) || 0), 0);
  const running = automations.filter(a => String(a.Status).toLowerCase() === 'sending').length;
  // Mailchimp returns 0, not null, when no store is connected. So every
  // campaign reading exactly 0 means untracked, not "earned nothing" — and
  // presenting it as R0 would libel a channel with 45% open rates.
  const earning = campaigns.filter(c => Number(c.Revenue) > 0).length;
  const untracked = campaigns.length > 0 && earning === 0;
  const SUBS = ['Campaigns', 'Audiences', 'Automations'];

  return (
    <>
      <div className="wh-banner">
        <div className="wh-banner-inner">
          <span className="wh-banner-label">Email · Mailchimp</span>
          <span className="wh-banner-sub">South Africa owned channel</span>
        </div>
        <div className="wh-banner-stats">
          <div className="wh-banner-stat">
            <span className="wh-banner-num">{int(members)}</span>
            <span className="wh-banner-unit">Members</span>
          </div>
          <div className="wh-banner-stat">
            <span className="wh-banner-num">{running}</span>
            <span className="wh-banner-unit">Running</span>
          </div>
        </div>
      </div>

      {running === 0 && automations.length > 0 && (
        <div className="sp-caveat">
          {automations.length} automation{automations.length === 1 ? '' : 's'} exist but
          {' '}<strong>none is running</strong>. A list of {int(members)} members with nothing
          automated is the cheapest revenue in the region, unclaimed.
        </div>
      )}
      {untracked && (
        <div className="sp-caveat">
          <strong>Revenue is not tracked on this channel, by design for now.</strong> There is no SA
          store connected to Mailchimp, so campaign revenue can only ever report 0 and all
          {' '}{campaigns.length} campaigns read <strong>NOT TRACKED</strong> rather than R0. Judge this
          channel on reach and engagement until a store is connected in a later phase: open rates
          here run around 45%, roughly double a typical retail benchmark.
        </div>
      )}

      <div className="os-sub-tabs" style={{ marginTop: 20, marginBottom: 16, overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {SUBS.map(t => (
          <button key={t} className={`os-sub-tab${sub === t ? ' active' : ''}`} onClick={() => setSub(t)}>{t}</button>
        ))}
      </div>

      {sub === 'Campaigns' && (
        <SortableTable
          cols={[
            { label: 'Campaign', key: 'Campaign' }, { label: 'Sent', key: 'Sent', type: 'date' },
            { label: 'Emails', key: 'Emails', type: 'number' },
            { label: 'Open rate', key: 'Open Rate %', type: 'number' },
            { label: 'Click rate', key: 'Click Rate %', type: 'number' },
            { label: 'Revenue', key: 'Revenue', type: 'number' },
          ]}
          data={campaigns} hideDates emptyMsg="No campaigns sent."
          renderRow={c => {
            const rev = money(c.Revenue);
            return (
              <tr key={c.id || c.Campaign}>
                <td>{c.Campaign}<div className="sp-note-inline">{c.Subject}</div></td>
                <td className="sp-num">{c.Sent || '—'}</td>
                <td className="sp-num">{int(c.Emails)}</td>
                <td className="sp-num">{pct(c['Open Rate %'])}</td>
                <td className="sp-num">{pct(c['Click Rate %'])}</td>
                <td className="sp-num">{rev || <span className="sp-pending">NOT TRACKED</span>}</td>
              </tr>
            );
          }}
        />
      )}

      {sub === 'Audiences' && (
        <SortableTable
          cols={[
            { label: 'Audience', key: 'Audience' }, { label: 'Members', key: 'Members', type: 'number' },
            { label: 'Unsubscribed', key: 'Unsubscribed', type: 'number' },
            { label: 'Open rate', key: 'Open Rate %', type: 'number' },
            { label: 'Last campaign', key: 'Last Campaign', type: 'date' },
          ]}
          data={audiences} hideDates emptyMsg="No audiences."
          renderRow={a => (
            <tr key={a.id || a.Audience}>
              <td>{a.Audience}</td>
              <td className="sp-num">{int(a.Members)}</td>
              <td className="sp-num">{int(a.Unsubscribed)}</td>
              <td className="sp-num">{pct(a['Open Rate %'])}</td>
              <td className="sp-num">{a['Last Campaign'] || '—'}</td>
            </tr>
          )}
        />
      )}

      {sub === 'Automations' && (
        <SortableTable
          cols={[
            { label: 'Automation', key: 'Automation' }, { label: 'Status', key: 'Status' },
            { label: 'Emails sent', key: 'Emails Sent', type: 'number' },
            { label: 'Started', key: 'Started', type: 'date' },
          ]}
          data={automations} hideDates emptyMsg="No automations."
          renderRow={a => (
            <tr key={a.id || a.Automation}>
              <td>{a.Automation}</td>
              <td>
                <span className={`sp-status sp-status--${String(a.Status).toLowerCase() === 'sending' ? 'actual' : 'pending'}`}>
                  {a.Status}
                </span>
              </td>
              <td className="sp-num">{int(a['Emails Sent'])}</td>
              <td className="sp-num">{a.Started || '—'}</td>
            </tr>
          )}
        />
      )}
    </>
  );
}
