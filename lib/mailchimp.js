/**
 * Mailchimp client — the SA email channel into the OS.
 *
 * SA runs Mailchimp where UK runs Klaviyo. Same job, same discipline: measure
 * the owned channel honestly, and never let "we could not read it" render as
 * zero.
 *
 * Auth is an API key in MAILCHIMP_API_KEY. Mailchimp keys carry their own data
 * centre as a suffix ("…-us14"), so the base URL is derived from the key rather
 * than configured separately — one fewer thing to get wrong.
 *
 * Reads only. Nothing here sends a campaign or edits an audience.
 */
const { realEnv } = require('./airtable-tables');

function creds() {
  const key = realEnv('MAILCHIMP_API_KEY');
  if (!key) throw new Error('MAILCHIMP_API_KEY not set');
  const dc = key.split('-')[1];
  if (!dc) {
    throw new Error('MAILCHIMP_API_KEY looks malformed: it should end with a data centre, e.g. "…-us14".');
  }
  return { key, base: `https://${dc}.api.mailchimp.com/3.0` };
}

async function mc(path, params = {}) {
  const { key, base } = creds();
  const url = new URL(`${base}/${path.replace(/^\//, '')}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);

  const res = await fetch(url, {
    // Mailchimp accepts HTTP Basic with any username and the key as password.
    headers: {
      Authorization: `Basic ${Buffer.from(`anystring:${key}`).toString('base64')}`,
      accept: 'application/json',
    },
  });
  if (res.status === 401) throw new Error('Mailchimp rejected the key. Check it is current and has read access.');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Mailchimp ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Audiences with their member counts and recent growth. */
async function getAudiences() {
  const json = await mc('lists', { count: 100, fields: 'lists.id,lists.name,lists.stats,lists.date_created' });
  return (json.lists || []).map(l => ({
    id: l.id,
    name: l.name,
    members: l.stats?.member_count ?? null,
    unsubscribed: l.stats?.unsubscribe_count ?? null,
    cleaned: l.stats?.cleaned_count ?? null,
    openRate: l.stats?.open_rate ?? null,
    clickRate: l.stats?.click_rate ?? null,
    lastSent: l.stats?.campaign_last_sent || null,
    created: l.date_created ? String(l.date_created).slice(0, 10) : null,
  }));
}

/** Sent campaigns with their real performance, newest first. */
async function getCampaigns(count = 50) {
  const json = await mc('campaigns', {
    count, status: 'sent', sort_field: 'send_time', sort_dir: 'DESC',
    fields: 'campaigns.id,campaigns.settings,campaigns.send_time,campaigns.emails_sent,campaigns.report_summary,campaigns.recipients',
  });
  return (json.campaigns || []).map(c => ({
    id: c.id,
    name: c.settings?.title || c.settings?.subject_line || '(untitled)',
    subject: c.settings?.subject_line || '',
    sent: c.send_time ? String(c.send_time).slice(0, 10) : null,
    emails: c.emails_sent ?? null,
    opens: c.report_summary?.unique_opens ?? null,
    openRate: c.report_summary?.open_rate ?? null,
    clicks: c.report_summary?.subscriber_clicks ?? null,
    clickRate: c.report_summary?.click_rate ?? null,
    // Only present when the account has ecommerce tracking wired up.
    revenue: c.report_summary?.ecommerce?.total_revenue ?? null,
    orders: c.report_summary?.ecommerce?.total_orders ?? null,
    audience: c.recipients?.list_name || '',
  }));
}

/** Automations (Mailchimp's flows), so "is it switched on" is answerable. */
async function getAutomations() {
  const json = await mc('automations', { count: 100 });
  return (json.automations || []).map(a => ({
    id: a.id,
    name: a.settings?.title || '(untitled)',
    status: a.status,
    emailsSent: a.emails_sent ?? null,
    started: a.start_time ? String(a.start_time).slice(0, 10) : null,
    audience: a.recipients?.list_name || '',
  }));
}

const isConfigured = () => !!realEnv('MAILCHIMP_API_KEY');

module.exports = { getAudiences, getCampaigns, getAutomations, isConfigured };
