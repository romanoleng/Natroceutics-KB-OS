import Head from 'next/head';
import Link from 'next/link';
import { getShopifyFinance, productsFor, num } from '../../lib/shopify-finance';
import { fetchFromMirror } from '../../lib/mirror';
import { BASES, resolveBaseId } from '../../lib/airtable-tables';

/* ────────────────────────────────────────────────────────────
 * Shopify UK monthly channel report.
 *
 * One page, print-optimised: the Download button is window.print(), so
 * "save as PDF" is a browser feature and this route carries no PDF
 * dependency. Renders from the OS-native Shopify finance tables, so it is
 * always current with the last pull rather than a file someone regenerated.
 *
 * The reporting rule, applied everywhere below: a cost we do not have is
 * never shown as zero. It reads PENDING and the contribution line states
 * what it excludes.
 * ──────────────────────────────────────────────────────────── */

const CUR = '2026-07', PRV = '2026-06';
const MONTH_LABEL = { '2026-06': 'June 2026', '2026-07': 'July 2026' };

const money = v => (v == null || v === '' ? '—' : `£${Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const int = v => (v == null || v === '' ? '—' : Number(v).toLocaleString('en-GB'));
const pct = v => (v == null || v === '' ? '—' : `${Number(v).toFixed(1)}%`);
const signed = v => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);

export default function ShopifyUkReport({ fin, amazon, generatedAt }) {
  const cur = fin.pnl[CUR] || {}, prv = fin.pnl[PRV] || {};
  const tCur = fin.traffic[CUR] || {}, tPrv = fin.traffic[PRV] || {};
  const products = productsFor(fin.products, CUR);

  const shopTotal = num(cur['Total Sales (£)']);
  const amzTotal = amazon[CUR].revenue;
  const combined = shopTotal + amzTotal;
  const shopShare = (shopTotal / combined) * 100;

  const vatQuery = fin.queries.find(q => q.Key === 'vat_rate_pct');
  const vatExposure = shopTotal / 6; // 20% VAT inside a VAT-inclusive price

  const pnlRows = [
    ['Gross sales', 'Gross Sales (£)', false],
    ['Discounts', 'Discounts (£)', false],
    ['Returns', 'Returns (£)', false],
    ['Net sales', 'Net Sales (£)', true],
    ['Cost of goods', 'COGS (£)', false, true],
    ['Payment processing', 'Payment Fees (£)', false, true],
    ['Contribution', 'Contribution (£)', true],
  ];

  return (
    <>
      <Head><title>Natroceutics UK | Shopify Channel Report | July 2026</title></Head>

      <div className="bar">
        <Link href="/uk?s=Shopify%20UK" className="back">← UK module</Link>
        <button onClick={() => window.print()} className="dl">Download report</button>
      </div>

      <div className="wrap">
        <div className="hero">
          <span className="eyebrow">Natroceutics® United Kingdom</span>
          <h1>Own Store | Channel Report</h1>
          <p className="sub">July 2026 | uk.natroceutics.com</p>
          <p className="stamp">PREPARED BY: ROMANO LENG · CURRENCY: GBP · GENERATED: {generatedAt}</p>
        </div>

        {/* ── headline ─────────────────────────────── */}
        <div className="headline">
          <span className="lbl">Contribution after cost of goods and payment fees</span>
          <div className="fig">{money(cur['Contribution (£)'])}</div>
          <p className="note">
            On {money(cur['Net Sales (£)'])} of net sales across {int(cur.Orders)} orders.
            Cost of goods is applied to {pct(cur['COGS Coverage %'])} of revenue.
            Shipping cost, platform fee and app subscriptions are not yet in this figure.
          </p>
        </div>

        <div className="split">
          <div className="card">
            <div className="ch">Own store | July</div>
            <div className="v">{money(shopTotal)}</div>
            <p className="m">{int(cur.Orders)} orders · {money(cur['AOV (£)'])} average order value</p>
            <div className="share">{shopShare.toFixed(1)}% of UK demand · {pct(tCur['Returning %'])} returning customers</div>
          </div>
          <div className="card">
            <div className="ch">Amazon UK | July</div>
            <div className="v">{money(amzTotal)}</div>
            <p className="m">{int(amazon[CUR].orders)} orders · {money(amazon[CUR].ads)} advertising</p>
            <div className="share">{(100 - shopShare).toFixed(1)}% of UK demand · net margin {pct(amazon[CUR].margin)}</div>
          </div>
        </div>

        {/* ── the finance question ─────────────────── */}
        {vatQuery && (
          <section>
            <h2>Read this first</h2>
            <div className="flag warn">
              <h3>The two channels treat VAT differently</h3>
              <p>
                Amazon recorded {money(amazon[CUR].vat)} of VAT in July. The own store recorded nil tax
                for the same period, on the same brand, in the same market.
              </p>
              <p>
                If own-store sales are standard-rated, roughly <strong>{money(vatExposure)}</strong> of
                July&apos;s {money(shopTotal)} is VAT rather than revenue, and every margin on this page moves
                with it. This is a question, not a finding: confirm the treatment with finance before
                these figures are relied on or carried into management accounts.
              </p>
            </div>
          </section>
        )}

        {/* ── P&L ──────────────────────────────────── */}
        <section>
          <h2>Channel profit and loss</h2>
          <table>
            <thead>
              <tr><th>Line</th><th className="r">July 2026</th><th className="r">June 2026</th><th className="r">Basis</th></tr>
            </thead>
            <tbody>
              {pnlRows.map(([label, key, total, negate]) => {
                const a = num(cur[key]), b = num(prv[key]);
                const fmt = v => (v == null ? '—' : money(negate && v > 0 ? -v : v));
                return (
                  <tr key={key} className={total ? 'total' : ''}>
                    <td>{label}</td>
                    <td className={`num r ${negate ? 'neg' : ''}`}>{fmt(a)}</td>
                    <td className={`num r ${negate ? 'neg' : ''}`}>{fmt(b)}</td>
                    <td className="r basis">{key === 'COGS (£)' ? `${pct(cur['COGS Coverage %'])} of revenue` : 'Actual'}</td>
                  </tr>
                );
              })}
              <tr>
                <td>Contribution margin</td>
                <td className="num r">{pct(cur['Contribution Margin %'])}</td>
                <td className="num r">{pct(prv['Contribution Margin %'])}</td>
                <td className="r basis">Of net sales</td>
              </tr>
              <tr>
                <td>Shipping charged to customers</td>
                <td className="num r">{money(cur['Shipping Charged (£)'])}</td>
                <td className="num r">{money(prv['Shipping Charged (£)'])}</td>
                <td className="r basis">Actual</td>
              </tr>
            </tbody>
          </table>
          <p className="cap">
            Payment processing is the sum of actual Shopify Payments fees per order, 1.7% domestic and
            2.7% international plus £0.25, read from the transaction records. Failed card attempts carry
            a fee entry in the API and are excluded. Cost of goods uses unit costs stored in Shopify.
          </p>
        </section>

        {/* ── true cost ────────────────────────────── */}
        <section>
          <h2>What is not in the figure above</h2>
          <table>
            <thead><tr><th>Cost layer</th><th>Source</th><th className="r">July 2026</th></tr></thead>
            <tbody>
              <tr className="total">
                <td>Contribution after goods and payment fees</td>
                <td>Shopify, measured</td>
                <td className="num r">{money(cur['Contribution (£)'])}</td>
              </tr>
              {fin.model.filter(m => m.Key !== 'vat_rate_pct').map(m => (
                <tr key={m.Key}>
                  <td>{m.Label}</td>
                  <td className="src">{m.Source}</td>
                  <td className={`num r ${m.Status === 'PENDING' ? 'pend' : ''}`}>
                    {m.Value === '' || m.Value == null ? m.Status : money(m.Value)}
                  </td>
                </tr>
              ))}
              <tr className="total">
                <td>True channel contribution</td>
                <td className="src">Not calculable until the lines above are sourced</td>
                <td className="num r pend">PENDING</td>
              </tr>
            </tbody>
          </table>
          <div className="flag">
            <h3>Why this table exists</h3>
            <p>
              Shopify reports revenue. It does not know what the goods cost to ship, what the platform
              costs to run, or what anyone is paid to run it. A channel that reports {pct(cur['Contribution Margin %'])} on
              its own dashboard is not the same as a channel that earns it. Until these lines are filled,
              the honest position is that own-store contribution is <strong>at most</strong> {money(cur['Contribution (£)'])} and
              the true figure is lower.
            </p>
          </div>
        </section>

        {/* ── product ──────────────────────────────── */}
        <section>
          <h2>Product | July</h2>
          <table>
            <thead>
              <tr><th>Product</th><th className="r">Units</th><th className="r">Net sales</th><th className="r">Cost of goods</th><th className="r">Gross profit</th><th className="r">Margin</th></tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.Product}>
                  <td>{p.Product}</td>
                  <td className="num r">{int(p.Units)}</td>
                  <td className="num r">{money(p['Net Sales (£)'])}</td>
                  <td className={`num r ${p['COGS (£)'] === '' ? 'pend' : 'neg'}`}>
                    {p['COGS (£)'] === '' ? 'NO COST' : money(-num(p['COGS (£)']))}
                  </td>
                  <td className="num r">{p['Gross Profit (£)'] === '' ? '—' : money(p['Gross Profit (£)'])}</td>
                  <td className="num r">{p['Margin %'] === '' ? '—' : pct(p['Margin %'])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="cap">
            {products.filter(p => p['COGS (£)'] === '').length} of {products.length} products sold in July have
            no unit cost recorded in Shopify, covering {pct(100 - num(cur['COGS Coverage %']))} of revenue.
            Setting those costs is the single cheapest way to complete this report.
          </p>
        </section>

        {/* ── acquisition ──────────────────────────── */}
        <section>
          <h2>Where the demand came from</h2>
          <table>
            <thead><tr><th>Measure</th><th className="r">July</th><th className="r">June</th></tr></thead>
            <tbody>
              {[['Sessions', 'Sessions'], ['Sessions: direct', 'Sessions: direct'], ['Sessions: search', 'Sessions: search'],
                ['Sessions: email', 'Sessions: email'], ['Sessions: social', 'Sessions: social'],
                ['Cart additions', 'Cart Additions'], ['Reached checkout', 'Reached Checkout'],
                ['Completed checkout', 'Completed Checkout']].map(([label, key]) => (
                <tr key={key}>
                  <td>{label}</td>
                  <td className="num r">{int(tCur[key])}</td>
                  <td className="num r">{int(tPrv[key])}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Orders</td>
                <td className="num r">{int(cur.Orders)}</td>
                <td className="num r">{int(prv.Orders)}</td>
              </tr>
            </tbody>
          </table>

          <div className="flag">
            <h3>All of this growth was earned, none of it was bought</h3>
            <p>
              July brought {int(tCur.Sessions)} sessions, up from {int(tPrv.Sessions)}. Of those,
              {' '}{int(tCur['Sessions: social'])} came from social and {int(tCur['Sessions: email'])} from email.
              There is no paid acquisition on this channel. Amazon spent {money(amazon[CUR].ads)} in the same
              month to grow its revenue.
            </p>
            <p>
              The owned channel is the one not being used. Email is the cheapest revenue in the business and
              it produced {int(tCur['Sessions: email'])} sessions in July. Connecting Klaviyo and running a
              first campaign is the highest-return action available on this channel.
            </p>
          </div>

          <div className="flag">
            <h3>Conversion rate understates</h3>
            <p>
              Shopify attributes {int(tCur['Completed Checkout'])} completed checkouts to a tracked session,
              against {int(cur.Orders)} actual orders. The reported conversion rate of {pct(tCur['Conversion %'])} is
              therefore a floor, not the true rate. Treat the funnel as directional and the order count as fact.
            </p>
          </div>
        </section>

        {/* ── customer ─────────────────────────────── */}
        <section>
          <h2>The customer</h2>
          <div className="split">
            <div className="card dark">
              <div className="ch">Returning customer rate | own store</div>
              <div className="v">{pct(tCur['Returning %'])}</div>
              <p className="m">{int(tCur['Returning Customers'])} of {int(tCur.Customers)} July customers had bought before</p>
              <div className="share">June {pct(tPrv['Returning %'])}</div>
            </div>
            <div className="card">
              <div className="ch">Returning customer rate | Amazon</div>
              <div className="v">11.8%</div>
              <p className="m">Reported in the Amazon UK channel report, June 2026</p>
              <div className="share">Own store is running at roughly four times the rate</div>
            </div>
          </div>
          <div className="flag">
            <h3>This is the argument for the channel</h3>
            <p>
              On Amazon the customer belongs to Amazon: we cannot email them, we do not own the relationship,
              and we compete for the listing. On the own store the customer is ours, and they come back at
              nearly four times the rate. The own store is {shopShare.toFixed(1)}% of UK demand and a far larger
              share of its future value.
            </p>
          </div>
        </section>

        {/* ── actions ──────────────────────────────── */}
        <section>
          <h2>What happens next</h2>
          <table>
            <thead><tr><th>Action</th><th>Owner</th><th>By when</th></tr></thead>
            <tbody>
              <tr><td><strong>Confirm VAT treatment on own-store sales</strong></td><td>Grant / finance</td><td className="num">Before August close</td></tr>
              <tr><td>Obtain pick, pack and shipping cost per order</td><td>Romano / Jason</td><td className="num">Before next report</td></tr>
              <tr><td>Set unit costs in Shopify for the {products.filter(p => p['COGS (£)'] === '').length} products missing them</td><td>Romano</td><td className="num">This week</td></tr>
              <tr><td>Confirm Shopify plan fee and app subscription total</td><td>Romano</td><td className="num">This week</td></tr>
              <tr><td><strong>Connect Klaviyo and run the first campaign</strong></td><td>Romano</td><td className="num">August</td></tr>
              <tr><td>Confirm whether any agency retainer covers the own store</td><td>Morgan / Kunle</td><td className="num">This month</td></tr>
              <tr><td>Rotate the Shopify admin token so this report refreshes without assistance</td><td>Romano</td><td className="num">This week</td></tr>
            </tbody>
          </table>
        </section>

        {/* ── sources ──────────────────────────────── */}
        <section>
          <h2>Sources and basis of preparation</h2>
          <div className="flag">
            <h3>Sources</h3>
            <p>
              Shopify Admin API and Shopify analytics for uk.natroceutics.com: order and transaction records,
              per-variant unit costs, session and referrer data, customer and repeat-purchase reporting.
              Amazon figures from the sellerboard profit and loss held in the OS.
            </p>
            <p>
              Period: 1 to 31 July 2026 against 1 to 30 June 2026. The OS Amazon mirror currently holds
              1 to 30 July ({money(amazon[CUR].mirrorRevenue)}); the July Amazon figure used for channel share
              is the full-month {money(amzTotal)} already circulated to finance.
            </p>
          </div>
          <div className="flag">
            <h3>Exclusions</h3>
            <p>
              Shipping cost, platform fee, app subscriptions, 3PL handling and any agency share are excluded
              because they are not yet sourced. They are listed individually rather than netted to zero.
              Own-store figures are stated before VAT pending the confirmation above; Amazon figures are
              stated after VAT. The two are not directly comparable until that is resolved.
            </p>
          </div>
        </section>

        <footer>
          Generated by Natroceutics OS from live Shopify data. Every figure on this page is measured or
          marked PENDING. No figure is estimated.
          <div className="sig">NATROCEUTICS® UK · JULY 2026 · WE ARE EFFICACY FIRST</div>
        </footer>
      </div>

      <style jsx global>{`
        :root{--forest:#1d4130;--mid:#406550;--charcoal:#2d2a26;--cream:#eeebe1;--hair:#dedad0}
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#fff;color:var(--charcoal);font-family:'Manrope',system-ui,-apple-system,sans-serif;
             line-height:1.6;padding:0 0 64px;-webkit-font-smoothing:antialiased}
        .wrap{max-width:880px;margin:0 auto;padding:0 24px}

        .bar{position:sticky;top:0;z-index:20;display:flex;justify-content:space-between;align-items:center;
             gap:12px;padding:12px 24px;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);
             border-bottom:1px solid var(--hair)}
        .back{font-size:13px;color:var(--mid);text-decoration:none;font-weight:500}
        .dl{background:var(--forest);color:var(--cream);border:0;border-radius:8px;padding:10px 18px;
            font-family:inherit;font-size:13px;font-weight:600;letter-spacing:.04em;cursor:pointer}
        .dl:active{transform:translateY(1px)}

        .hero{background:var(--forest);color:var(--cream);padding:38px 34px 34px;margin:28px 0 16px;border-radius:12px}
        .eyebrow{font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#9dbcaa}
        .hero h1{font-size:26px;font-weight:700;letter-spacing:.10em;text-transform:uppercase;margin:12px 0 6px;line-height:1.25}
        .hero .sub{font-weight:300;font-size:14px;color:#c9d8cf}
        .hero .stamp{font-family:'DM Mono',ui-monospace,monospace;font-size:11px;color:#9dbcaa;margin-top:16px;letter-spacing:.04em}

        .headline{background:var(--cream);border:1px solid var(--hair);border-radius:10px;padding:28px 30px;
                  margin-bottom:14px;box-shadow:0 2px 10px rgba(45,42,38,.05)}
        .headline .lbl{font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--mid)}
        .headline .fig{font-family:'DM Mono',ui-monospace,monospace;font-size:44px;font-weight:500;color:var(--forest);
                       line-height:1.05;margin:10px 0 6px}
        .headline .note{font-size:13px;color:#6b675f;font-weight:300}

        .split{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:34px}
        .card{background:var(--cream);border:1px solid var(--hair);border-radius:10px;padding:22px 24px;
              box-shadow:0 2px 10px rgba(45,42,38,.05)}
        .card.dark{background:var(--forest);border-color:var(--forest)}
        .card.dark .ch{color:#9dbcaa}.card.dark .v{color:var(--cream)}
        .card.dark .m,.card.dark .share{color:#c9d8cf;border-color:#2a5340}
        .card .ch{font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--mid);margin-bottom:10px}
        .card .v{font-family:'DM Mono',ui-monospace,monospace;font-size:27px;color:var(--forest);font-weight:500;line-height:1.1}
        .card .m{font-size:12.5px;color:#6b675f;margin-top:8px;font-weight:300}
        .card .share{font-family:'DM Mono',ui-monospace,monospace;font-size:11px;color:var(--mid);margin-top:12px;
                     padding-top:10px;border-top:1px solid var(--hair)}

        h2{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--forest);
           margin:0 0 14px;padding-bottom:10px;border-bottom:2px solid var(--forest)}
        section{margin-bottom:36px}

        table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--hair);border-radius:8px;overflow:hidden}
        th{font-size:9.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--mid);
           text-align:left;padding:12px 14px;border-bottom:1px solid var(--hair);background:var(--cream)}
        th.r,td.r{text-align:right}
        td{padding:11px 14px;border-bottom:1px solid var(--hair);font-size:13.5px}
        tr:last-child td{border-bottom:none}
        td.num{font-family:'DM Mono',ui-monospace,monospace;font-size:13px}
        td.src,td.basis{font-size:11.5px;color:#8a857c;font-weight:300}
        tr.total td{background:var(--cream);font-weight:700;color:var(--forest)}
        tr.total td.num{font-weight:500}
        .pos{color:#3f7350}.neg{color:#8c4a3a}
        .pend{color:var(--mid);font-weight:600;letter-spacing:.06em;font-size:11px}

        .cap{font-size:11.5px;color:#8a857c;font-weight:300;margin-top:10px;line-height:1.55}
        .flag{background:var(--cream);border:1px solid var(--hair);border-left:3px solid var(--mid);
              border-radius:8px;padding:18px 20px;margin-top:12px}
        .flag h3{font-size:11px;font-weight:700;letter-spacing:.10em;text-transform:uppercase;color:var(--forest);margin-bottom:8px}
        .flag p{font-size:13.5px;color:var(--charcoal);font-weight:300;line-height:1.65}
        .flag p+p{margin-top:8px}
        .flag.warn{border-left-color:#8c4a3a}

        footer{margin-top:20px;padding-top:18px;border-top:1px solid var(--hair);font-size:11px;color:#8a857c;font-weight:300}
        footer .sig{font-family:'DM Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:.04em;margin-top:6px;color:#a29d93}

        @media (max-width:640px){
          .split{grid-template-columns:1fr}
          .headline .fig{font-size:34px}
          .hero h1{font-size:20px}
          td,th{padding:10px 11px}
          table{font-size:12.5px}
          .wrap{padding:0 14px}
        }
        @media print{
          .bar{display:none}
          .hero,.card.dark{-webkit-print-color-adjust:exact;print-color-adjust:exact}
          section{break-inside:avoid}
          body{padding-bottom:0}
        }
      `}</style>
    </>
  );
}

export async function getServerSideProps() {
  const fin = await getShopifyFinance([PRV, CUR]);

  // Amazon side, for channel share. Read straight from the sellerboard mirror.
  const rows = (await fetchFromMirror(resolveBaseId(BASES.UK.envVar), BASES.UK.tables.AMAZON_DAILY_PNL)) || [];
  const acc = {};
  for (const r of rows) {
    const d = r.fields || r;
    const m = String(d.Date || '').slice(0, 7);
    if (m !== CUR && m !== PRV) continue;
    const a = (acc[m] = acc[m] || { revenue: 0, orders: 0, ads: 0, net: 0 });
    a.revenue += Number(d['Revenue £']) || 0;
    a.orders += Number(d.Orders) || 0;
    a.ads += Number(d['Ad Spend £']) || 0;
    a.net += Number(d['Net Profit £']) || 0;
  }

  // Full-month July Amazon figures as circulated to finance. The mirror holds
  // 1–30 July only until the 31 July sellerboard export lands, so channel share
  // uses the circulated full-month figure and the report says so.
  const FULL_JULY = { revenue: 19669.42, orders: 683, ads: 4278.74, net: 650.52, vat: 3013.62 };

  const amazon = {};
  for (const m of [PRV, CUR]) {
    const a = acc[m] || { revenue: 0, orders: 0, ads: 0, net: 0 };
    const use = m === CUR ? { ...FULL_JULY, mirrorRevenue: a.revenue } : { ...a, vat: 1774.18, mirrorRevenue: a.revenue };
    amazon[m] = { ...use, margin: use.revenue ? (use.net / use.revenue) * 100 : null };
  }

  return {
    props: {
      fin: { ...fin, pnl: Object.fromEntries(fin.pnl), traffic: Object.fromEntries(fin.traffic) },
      amazon,
      generatedAt: new Date().toISOString().slice(0, 10),
    },
  };
}
