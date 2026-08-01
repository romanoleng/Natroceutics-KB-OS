import { useState, useMemo, useEffect, useRef } from 'react';
import SortableTable from './SortableTable';

/**
 * Shopify UK performance — the own store's answer to the Amazon Sales tab.
 *
 * Amazon has sellerboard handing it a finished P&L; Shopify reports revenue and
 * stops. This renders the P&L we assemble ourselves from data Shopify holds but
 * never puts together: unit costs per variant, payment fees per transaction.
 *
 * The reporting rule from /report/shopify-uk applies here too and is the whole
 * point of the tab: a cost we do not have is NEVER drawn as zero. It reads
 * PENDING, and contribution states what it excludes. A tab that quietly showed
 * 85% margin because shipping was missing would be worse than no tab.
 */

const money = v => {
  if (v === '' || v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '−' : ''}£${abs}`;
};
const money0 = v => {
  const n = Number(v);
  if (!Number.isFinite(n) || v === '' || v == null) return '—';
  return `£${Math.round(n).toLocaleString('en-GB')}`;
};
const pct = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? '—' : `${Number(v).toFixed(1)}%`);
const int = v => (v === '' || v == null ? '—' : Number(v).toLocaleString('en-GB'));
const num = v => (typeof v === 'number' ? v : v === '' || v == null ? null : Number(v));

const monthLabel = m => {
  if (!m) return '—';
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1)
    .toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
};

/** Percentage change, or null when it cannot be computed honestly. */
function delta(prev, cur) {
  const a = num(prev), b = num(cur);
  if (a == null || b == null || a === 0) return null;
  return ((b - a) / Math.abs(a)) * 100;
}
function Delta({ prev, cur, invert }) {
  const d = delta(prev, cur);
  if (d == null) return <span className="sp-delta sp-delta--flat">—</span>;
  const good = invert ? d < 0 : d > 0;
  return (
    <span className={`sp-delta ${good ? 'sp-delta--up' : 'sp-delta--down'}`}>
      {d > 0 ? '+' : ''}{d.toFixed(1)}%
    </span>
  );
}

/**
 * Freeze locks the first column and the header row in place so you keep sight
 * of which row you are on while scrolling sideways through a wide table. It was
 * on silently, which meant nobody could find it or turn it off.
 */
function FreezeToggle({ on, set }) {
  return (
    <div className="sp-freeze-bar">
      <button className={`sp-freeze-btn${on ? ' on' : ''}`} onClick={() => set(!on)} type="button">
        {on ? '🔒 First column frozen' : '🔓 Freeze first column'}
      </button>
      <span className="sp-freeze-note">
        {on ? 'Scroll sideways: the month column and header stay put.' : 'Scroll freely, nothing pinned.'}
      </span>
    </div>
  );
}

export default function ShopifyPerformance({ pnl = [], products = [], traffic = [], costs = [], costModel = [], payouts = [], ytd = null }) {
  const [sub, setSub] = useState('Summary');
  // Freeze was silently always-on, so it was invisible and unexplained.
  const [freeze, setFreeze] = useState(true);
  // Keep the selected tab on screen. With seven tabs on a phone the row
  // scrolls, and a tab selected off-screen looks like nothing happened.
  const tabRow = useRef(null);
  useEffect(() => {
    tabRow.current?.querySelector('.os-sub-tab.active')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  }, [sub]);

  const months = useMemo(
    () => [...pnl].sort((a, b) => String(a.Month).localeCompare(String(b.Month))),
    [pnl]
  );

  // The newest row is usually the month we are IN, which is partial: on 1 Aug
  // it held 3 orders and made the whole tab look like the channel had
  // collapsed. Default to the last COMPLETE month and label the current one.
  const thisMonth = new Date().toISOString().slice(0, 7);
  const complete = months.filter(m => m.Month < thisMonth);
  const [picked, setPicked] = useState(
    (complete[complete.length - 1] || months[months.length - 1] || {}).Month || ''
  );

  const idx = Math.max(0, months.findIndex(m => m.Month === picked));
  const cur = months[idx] || {};
  const prev = months[idx - 1] || {};
  const isPartial = cur.Month === thisMonth;
  const curTraffic = traffic.find(t => t.Month === cur.Month) || {};
  const prevTraffic = traffic.find(t => t.Month === prev.Month) || {};

  const curProducts = useMemo(
    () => products
      .filter(p => p.Month === cur.Month)
      .sort((a, b) => (num(b['Net Sales (£)']) || 0) - (num(a['Net Sales (£)']) || 0)),
    [products, cur.Month]
  );
  const noCost = curProducts.filter(p => p['COGS (£)'] === '' || p['COGS (£)'] == null);
  const pending = costModel.filter(c => c.Status === 'PENDING');
  const queries = costModel.filter(c => c.Status === 'QUERY');
  // Lines we DO have a source for. STALE counts as sourced but flags that the
  // upstream stopped updating, which is different from a cost being zero.
  const sourced = costModel.filter(c => c.Status === 'ACTUAL' || c.Status === 'STALE');

  if (!months.length) {
    return (
      <div className="os-empty">
        No Shopify performance data yet. Run <code>scripts/shopify-pull.js</code> once
        SHOPIFY_ADMIN_TOKEN is rotated, or seed the 31 July snapshot with
        <code> scripts/seed-shopify-finance.js</code>.
      </div>
    );
  }

  const SUBS = ['Summary', 'Profit & Loss', 'Year to date', 'Payouts', 'Products', 'Traffic', 'Cost model'];

  return (
    <>
      {/* ── headline banner ─────────────────────────── */}
      <div className="wh-banner">
        <div className="wh-banner-inner">
          <span className="wh-banner-label">Shopify UK · {monthLabel(cur.Month)}</span>
          <span className="wh-banner-sub">
            Contribution after cost of goods and payment fees
          </span>
        </div>
        <div className="wh-banner-stats">
          <div className="wh-banner-stat">
            <span className="wh-banner-num">{money0(cur['Contribution (£)'])}</span>
            <span className="wh-banner-unit">Contribution</span>
          </div>
          <div className="wh-banner-stat">
            <span className="wh-banner-num">{pct(cur['Contribution Margin %'])}</span>
            <span className="wh-banner-unit">Margin</span>
          </div>
        </div>
      </div>

      <div className="sp-monthbar">
        <label>
          <span>Month</span>
          <select value={picked} onChange={e => setPicked(e.target.value)}>
            {[...months].reverse().map(m => (
              <option key={m.Month} value={m.Month}>
                {monthLabel(m.Month)}{m.Month === thisMonth ? ' (in progress)' : ''}
              </option>
            ))}
          </select>
        </label>
        <span className="sp-monthbar-note">
          {months.length} months held, {monthLabel(months[0]?.Month)} to {monthLabel(months[months.length - 1]?.Month)}
        </span>
      </div>

      {isPartial && (
        <div className="sp-caveat">
          <strong>{monthLabel(cur.Month)} is still in progress.</strong> These figures cover part of
          the month only and will keep moving. Compare complete months for anything that matters.
        </div>
      )}

      {/* Never let the headline stand alone without its caveat. */}
      <div className="sp-caveat">
        Still <strong>PENDING</strong>: shipping cost, platform fee, apps and any agency
        share. Cost of goods covers {pct(cur['COGS Coverage %'])} of revenue.
        {' '}The true contribution is lower than the figure above.
      </div>

      <div className="os-stat-row">
        <div className="os-stat-card os-stat-green">
          <div className="os-stat-num">{money0(cur['Net Sales (£)'])}</div>
          <div className="os-stat-label">Net sales <Delta prev={prev['Net Sales (£)']} cur={cur['Net Sales (£)']} /></div>
        </div>
        <div className="os-stat-card">
          <div className="os-stat-num">{int(cur.Orders)}</div>
          <div className="os-stat-label">Orders <Delta prev={prev.Orders} cur={cur.Orders} /></div>
        </div>
        <div className="os-stat-card">
          <div className="os-stat-num">{money(cur['AOV (£)'])}</div>
          <div className="os-stat-label">Average order <Delta prev={prev['AOV (£)']} cur={cur['AOV (£)']} /></div>
        </div>
        <div className="os-stat-card">
          <div className="os-stat-num">{pct(curTraffic['Returning %'])}</div>
          <div className="os-stat-label">Returning customers</div>
        </div>
      </div>

      <div className="os-sub-tabs" ref={tabRow} style={{ marginTop: 20, marginBottom: 16 }}>
        {SUBS.map(t => (
          <button key={t} className={`os-sub-tab${sub === t ? ' active' : ''}`} onClick={() => setSub(t)}>
            {t}
            {t === 'Cost model' && pending.length > 0 && <span className="sp-badge">{pending.length}</span>}
          </button>
        ))}
      </div>

      {/* ── Summary ──────────────────────────────────── */}
      {sub === 'Summary' && (
        <>
          {queries.map(q => (
            <div key={q.Key} className="sp-flag sp-flag--warn">
              <div className="sp-flag-title">{q.Label} · needs confirming</div>
              <p>{q.Note}</p>
            </div>
          ))}
          <div className="sp-grid">
            <div className="sp-card">
              <div className="sp-card-label">Where the money went · {monthLabel(cur.Month)}</div>
              <table className="sp-mini">
                <tbody>
                  <tr><td>Gross sales</td><td className="sp-num">{money(cur['Gross Sales (£)'])}</td></tr>
                  <tr><td>Discounts</td><td className="sp-num sp-neg">{money(cur['Discounts (£)'])}</td></tr>
                  <tr><td>Returns</td><td className="sp-num sp-neg">{money(cur['Returns (£)'])}</td></tr>
                  <tr className="sp-sub"><td>Net sales</td><td className="sp-num">{money(cur['Net Sales (£)'])}</td></tr>
                  <tr><td>Cost of goods</td><td className="sp-num sp-neg">{money(-Math.abs(num(cur['COGS (£)']) || 0))}</td></tr>
                  <tr><td>Payment fees</td><td className="sp-num sp-neg">{money(-Math.abs(num(cur['Payment Fees (£)']) || 0))}</td></tr>
                  <tr className="sp-total"><td>Contribution</td><td className="sp-num">{money(cur['Contribution (£)'])}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="sp-card">
              <div className="sp-card-label">Not yet in that figure</div>
              {sourced.length > 0 && (
                <table className="sp-mini" style={{ marginBottom: 12 }}>
                  <tbody>
                    {sourced.map(c => (
                      <tr key={c.Key}>
                        <td>{c.Label}<span className="sp-src">{c.Source}</span></td>
                        <td className="sp-num sp-neg">
                          {c.Value === '' || c.Value == null
                            ? <span className="sp-pending">{c.Status}</span>
                            : money(-Math.abs(Number(c.Value)))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {pending.length === 0
                ? <p className="sp-note">Every remaining cost line is sourced.</p>
                : (
                  <table className="sp-mini">
                    <tbody>
                      {pending.map(c => (
                        <tr key={c.Key}>
                          <td>{c.Label}<span className="sp-src">{c.Source}</span></td>
                          <td className="sp-num sp-pending">PENDING</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              <p className="sp-note">
                Shopify reports revenue. It does not know what the goods cost to ship or
                what the platform costs to run. Until these are filled, own-store
                contribution is <strong>at most</strong> {money(cur['Contribution (£)'])}.
              </p>
            </div>
          </div>
        </>
      )}

      {/* ── P&L ──────────────────────────────────────── */}
      {sub === 'Profit & Loss' && (
        <>
        <FreezeToggle on={freeze} set={setFreeze} />
        <div className={`sp-scroll${freeze ? ' sp-scroll--freeze' : ''}`}>
          <table className="sp-table">
            <thead>
              <tr>
                <th>Line</th>
                {months.map(m => <th key={m.Month} className="sp-num">{monthLabel(m.Month)}</th>)}
                <th className="sp-num">Basis</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Gross sales', 'Gross Sales (£)', false, 'Actual'],
                ['Discounts', 'Discounts (£)', false, 'Actual'],
                ['Returns', 'Returns (£)', false, 'Actual'],
                ['Net sales', 'Net Sales (£)', true, 'Actual'],
                ['Cost of goods', 'COGS (£)', false, 'Partial, see coverage'],
                ['Payment processing', 'Payment Fees (£)', false, 'Actual, per transaction'],
                ['Contribution', 'Contribution (£)', true, 'Before shipping, platform, apps'],
              ].map(([label, key, total, basis]) => (
                <tr key={key} className={total ? 'sp-total' : ''}>
                  <td>{label}</td>
                  {months.map(m => {
                    const v = num(m[key]);
                    const negate = key === 'COGS (£)' || key === 'Payment Fees (£)';
                    return (
                      <td key={m.Month} className={`sp-num${negate ? ' sp-neg' : ''}`}>
                        {money(negate && v > 0 ? -v : v)}
                      </td>
                    );
                  })}
                  <td className="sp-basis">{basis}</td>
                </tr>
              ))}
              <tr>
                <td>Cost of goods coverage</td>
                {months.map(m => <td key={m.Month} className="sp-num">{pct(m['COGS Coverage %'])}</td>)}
                <td className="sp-basis">Share of revenue with a unit cost</td>
              </tr>
              <tr>
                <td>Contribution margin</td>
                {months.map(m => <td key={m.Month} className="sp-num">{pct(m['Contribution Margin %'])}</td>)}
                <td className="sp-basis">Of net sales</td>
              </tr>
              <tr>
                <td>Shipping charged to customers</td>
                {months.map(m => <td key={m.Month} className="sp-num">{money(m['Shipping Charged (£)'])}</td>)}
                <td className="sp-basis">Actual</td>
              </tr>
              <tr>
                <td>Orders</td>
                {months.map(m => <td key={m.Month} className="sp-num">{int(m.Orders)}</td>)}
                <td className="sp-basis">Actual</td>
              </tr>
            </tbody>
          </table>
          <p className="sp-note">
            Payment processing is the sum of actual Shopify Payments fees per order
            (1.7% domestic, 2.7% international, plus £0.25), read from the transaction
            records. Failed card attempts carry a fee entry in the API and are excluded.
          </p>
        </div>
        </>
      )}

      {/* ── Year to date ─────────────────────────────── */}
      {sub === 'Year to date' && (
        ytd ? (
          <>
            <div className="os-stat-row">
              <div className="os-stat-card os-stat-green">
                <div className="os-stat-num">{money0(ytd['Net Sales (£)'])}</div>
                <div className="os-stat-label">Net sales · {ytd.Months} months</div>
              </div>
              <div className="os-stat-card">
                <div className="os-stat-num">{int(ytd.Orders)}</div>
                <div className="os-stat-label">Orders</div>
              </div>
              <div className="os-stat-card">
                <div className="os-stat-num">{money0(ytd['Contribution (£)'])}</div>
                <div className="os-stat-label">Contribution</div>
              </div>
              <div className="os-stat-card">
                <div className="os-stat-num">{pct(ytd['Contribution Margin %'])}</div>
                <div className="os-stat-label">Margin</div>
              </div>
            </div>
            <div className="sp-scroll">
              <table className="sp-table">
                <thead><tr><th>Line</th><th className="sp-num">{ytd.Period}</th></tr></thead>
                <tbody>
                  {[['Gross sales','Gross Sales (£)'],['Discounts','Discounts (£)'],
                    ['Returns','Returns (£)'],['Net sales','Net Sales (£)'],
                    ['Cost of goods','COGS (£)'],['Payment fees','Payment Fees (£)'],
                    ['Contribution','Contribution (£)'],
                    ['Shipping charged','Shipping Charged (£)']].map(([label, key]) => (
                    <tr key={key} className={key === 'Contribution (£)' || key === 'Net Sales (£)' ? 'sp-total' : ''}>
                      <td>{label}</td>
                      <td className="sp-num">{money(ytd[key])}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>Cost of goods coverage</td>
                    <td className="sp-num">{pct(ytd['COGS Coverage %'])}</td>
                  </tr>
                </tbody>
              </table>
              <p className="sp-note">
                Coverage is weighted by revenue, not an average of monthly percentages: a £100
                month and a £4,000 month must not count equally. Contribution still excludes the
                lines marked PENDING in the cost model.
              </p>
            </div>
          </>
        ) : <div className="os-empty">No year-to-date figures yet. Run scripts/shopify-finance-pull.js.</div>
      )}

      {/* ── Payouts ──────────────────────────────────── */}
      {sub === 'Payouts' && (
        payouts.length === 0
          ? <div className="os-empty">No payout data yet. Run scripts/shopify-finance-pull.js.</div>
          : (
            <>
              <div className="sp-flag">
                <div className="sp-flag-title">Why this tab exists</div>
                <p>
                  Shopify Payments deposits real money into the bank; the P&amp;L says what the
                  orders were worth. Nothing else in the OS can check one against the other. The
                  variance column is our computed fees against what Shopify actually charged: near
                  zero is the strongest evidence the finance engine is right, and a growing figure
                  is the earliest warning that it is not.
                </p>
                <p>
                  Payouts are grouped by issue date and orders pay out days later, so a month of
                  payouts never equals a month of sales. The fee comparison is the meaningful one.
                </p>
              </div>
              <FreezeToggle on={freeze} set={setFreeze} />
              <div className={`sp-scroll${freeze ? ' sp-scroll--freeze' : ''}`}>
                <table className="sp-table">
                  <thead>
                    <tr>
                      <th>Month</th><th className="sp-num">Payouts</th><th className="sp-num">Paid out</th>
                      <th className="sp-num">Shopify fees</th><th className="sp-num">Fees per P&amp;L</th>
                      <th className="sp-num">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...payouts].sort((a, b) => String(b.Month).localeCompare(String(a.Month))).map(p => {
                      const v = num(p['Fee Variance (£)']);
                      return (
                        <tr key={p.Month}>
                          <td>{monthLabel(p.Month)}</td>
                          <td className="sp-num">{int(p.Payouts)}</td>
                          <td className="sp-num">{money(p['Paid Out (£)'])}</td>
                          <td className="sp-num">{money(p['Shopify Fees (£)'])}</td>
                          <td className="sp-num">{p['Fees per P&L (£)'] === '' ? '—' : money(p['Fees per P&L (£)'])}</td>
                          <td className={`sp-num${v != null && Math.abs(v) > 20 ? ' sp-neg' : ''}`}>
                            {v == null ? '—' : money(v)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )
      )}

      {/* ── Products ─────────────────────────────────── */}
      {sub === 'Products' && (
        <>
          {noCost.length > 0 && (
            <div className="sp-flag">
              <div className="sp-flag-title">{noCost.length} of {curProducts.length} products have no unit cost</div>
              <p>
                They sold {money0(noCost.reduce((s, p) => s + (num(p['Net Sales (£)']) || 0), 0))} in
                {' '}{monthLabel(cur.Month)} and are excluded from cost of goods, which is why coverage
                reads {pct(cur['COGS Coverage %'])}. Setting cost per item in Shopify completes this P&L.
              </p>
            </div>
          )}
          <SortableTable
            cols={[
              { label: 'Product', key: 'Product' },
              { label: 'Units', key: 'Units', type: 'number' },
              { label: 'Net sales', key: 'Net Sales (£)', type: 'number' },
              { label: 'Unit cost', key: 'Unit Cost (£)', type: 'number' },
              { label: 'COGS', key: 'COGS (£)', type: 'number' },
              { label: 'Gross profit', key: 'Gross Profit (£)', type: 'number' },
              { label: 'Margin', key: 'Margin %', type: 'number' },
            ]}
            data={curProducts}
            hideDates
            emptyMsg="No product performance for this month."
            renderRow={p => {
              const missing = p['COGS (£)'] === '' || p['COGS (£)'] == null;
              return (
                <tr key={p.id || `${p.Month}-${p.Product}`}>
                  <td>{p.Product}</td>
                  <td className="sp-num">{int(p.Units)}</td>
                  <td className="sp-num">{money(p['Net Sales (£)'])}</td>
                  <td className="sp-num">{missing ? <span className="sp-pending">NO COST</span> : money(p['Unit Cost (£)'])}</td>
                  <td className="sp-num sp-neg">{missing ? '—' : money(-Math.abs(num(p['COGS (£)'])))}</td>
                  <td className="sp-num">{missing ? '—' : money(p['Gross Profit (£)'])}</td>
                  <td className="sp-num">{missing ? '—' : pct(p['Margin %'])}</td>
                </tr>
              );
            }}
          />
        </>
      )}

      {/* ── Traffic ──────────────────────────────────── */}
      {sub === 'Traffic' && (
        <>
          <div className="os-stat-row">
            <div className="os-stat-card">
              <div className="os-stat-num">{int(curTraffic.Sessions)}</div>
              <div className="os-stat-label">Sessions <Delta prev={prevTraffic.Sessions} cur={curTraffic.Sessions} /></div>
            </div>
            <div className="os-stat-card">
              <div className="os-stat-num">{int(curTraffic['Sessions: email'])}</div>
              <div className="os-stat-label">From email</div>
            </div>
            <div className="os-stat-card">
              <div className="os-stat-num">{int(curTraffic['Sessions: social'])}</div>
              <div className="os-stat-label">From social</div>
            </div>
            <div className="os-stat-card os-stat-green">
              <div className="os-stat-num">{pct(curTraffic['Returning %'])}</div>
              <div className="os-stat-label">Returning customers</div>
            </div>
          </div>

          <div className="sp-flag">
            <div className="sp-flag-title">All of this growth was earned, none of it was bought</div>
            <p>
              {monthLabel(cur.Month)} brought {int(curTraffic.Sessions)} sessions. Of those,
              {' '}{int(curTraffic['Sessions: social'])} came from social and {int(curTraffic['Sessions: email'])} from
              email. There is no paid acquisition on this channel. The owned channel is the one
              not being used: email is the cheapest revenue in the business.
            </p>
          </div>

          <div className="sp-scroll">
            <table className="sp-table">
              <thead>
                <tr>
                  <th>Measure</th>
                  {traffic.map(t => <th key={t.Month} className="sp-num">{monthLabel(t.Month)}</th>)}
                </tr>
              </thead>
              <tbody>
                {[
                  ['Sessions', 'Sessions'],
                  ['Direct', 'Sessions: direct'],
                  ['Search', 'Sessions: search'],
                  ['Email', 'Sessions: email'],
                  ['Social', 'Sessions: social'],
                  ['Cart additions', 'Cart Additions'],
                  ['Reached checkout', 'Reached Checkout'],
                  ['Completed checkout', 'Completed Checkout'],
                  ['Customers', 'Customers'],
                  ['Returning customers', 'Returning Customers'],
                ].map(([label, key]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    {traffic.map(t => <td key={t.Month} className="sp-num">{int(t[key])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="sp-note">
              Only {int(curTraffic['Completed Checkout'])} of {int(cur.Orders)} orders attribute to a
              tracked session, so the reported conversion rate of {pct(curTraffic['Conversion %'])} is a
              floor, not the true rate. Treat the funnel as directional and the order count as fact.
            </p>
          </div>
        </>
      )}

      {/* ── Cost model ───────────────────────────────── */}
      {sub === 'Cost model' && (
        <>
          <div className="sp-flag">
            <div className="sp-flag-title">What Shopify cannot tell us</div>
            <p>
              Every line below is a real cost of running the channel that sits outside
              Shopify&apos;s reporting. They are listed individually rather than netted to
              zero, because a missing cost shown as £0 silently overstates profit.
            </p>
          </div>
          <SortableTable
            cols={[
              { label: 'Cost', key: 'Label' },
              { label: 'Value', key: 'Value' },
              { label: 'Unit', key: 'Unit' },
              { label: 'Source', key: 'Source' },
              { label: 'Status', key: 'Status' },
            ]}
            data={costModel}
            hideDates
            emptyMsg="No cost model rows."
            renderRow={c => (
              <tr key={c.id || c.Key}>
                <td>{c.Label}<div className="sp-note-inline">{c.Note}</div></td>
                <td className="sp-num">{c.Value === '' || c.Value == null ? '—' : c.Value}</td>
                <td>{c.Unit}</td>
                <td>{c.Source}</td>
                <td>
                  <span className={`sp-status sp-status--${String(c.Status || '').toLowerCase()}`}>
                    {c.Status}
                  </span>
                </td>
              </tr>
            )}
          />
          <div style={{ marginTop: 24 }}>
            <div className="sp-card-label" style={{ marginBottom: 10 }}>Unit costs held in Shopify</div>
            <SortableTable
              cols={[
                { label: 'SKU', key: 'SKU' },
                { label: 'Product', key: 'Product' },
                { label: 'Retail', key: 'Retail Price (£)', type: 'number' },
                { label: 'Unit cost', key: 'Unit Cost (£)', type: 'number' },
                { label: 'Gross margin', key: 'Gross Margin %', type: 'number' },
                { label: 'Status', key: 'Status' },
              ]}
              data={costs}
              hideDates
              emptyMsg="No unit costs recorded."
              renderRow={c => {
                const missing = c['Unit Cost (£)'] === '' || c['Unit Cost (£)'] == null;
                return (
                  <tr key={c.id || c.SKU}>
                    <td className="sp-mono">{c.SKU}</td>
                    <td>{c.Product}</td>
                    <td className="sp-num">{money(c['Retail Price (£)'])}</td>
                    <td className="sp-num">{missing ? <span className="sp-pending">NOT SET</span> : money(c['Unit Cost (£)'])}</td>
                    <td className="sp-num">{missing ? '—' : pct(c['Gross Margin %'])}</td>
                    <td><span className={`sp-status sp-status--${missing ? 'pending' : 'actual'}`}>{missing ? 'NEEDS DATA' : 'ACTUAL'}</span></td>
                  </tr>
                );
              }}
            />
          </div>
        </>
      )}
    </>
  );
}
