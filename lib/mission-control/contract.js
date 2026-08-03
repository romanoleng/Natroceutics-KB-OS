/**
 * The Mission Control contract.
 *
 * Mission Control knows nothing. Modules contribute; it aggregates and
 * presents. That is the whole architecture, and this file is the agreement
 * that makes it safe to grow: add a module, it appears, and no page is
 * redesigned.
 *
 * ── The three states, which are the point ──────────────────────────────────
 *
 * Every contribution resolves to exactly one of:
 *
 *   READY  data exists. Render it confidently.
 *   EMPTY  there is genuinely nothing yet. Say why, in business terms.
 *   ERROR  we could not find out. Say what failed.
 *
 * EMPTY and ERROR must never be confused. That is not a nicety, it is the
 * failure this OS keeps having: the ME Finance tab rendered ten fully
 * populated rows as dashes; /admin/data showed UK.RISKS as empty while it held
 * eleven rows; a feed that stopped writing looked identical to a quiet day. In
 * every case something broken wore the costume of something calm.
 *
 * Two rules enforce it here rather than trusting each author to remember:
 *
 *   1. `safeLoad` wraps every loader in try/catch. A throw becomes ERROR. It
 *      is impossible for a crash to surface as an empty widget.
 *   2. `empty()` REQUIRES a reason. There is no way to declare emptiness
 *      without explaining it, because "no data" with no explanation is the
 *      thing that reads as broken.
 *
 * ── Why a widget decides for itself ────────────────────────────────────────
 *
 * Mission Control asks "what can render?" and each module answers. A widget
 * that needs the ME store to be live returns EMPTY with that reason until it
 * is, then starts rendering on its own. Nobody edits Mission Control to make
 * that happen, which is the property that stops this page needing a redesign
 * every time the business changes.
 */

const STATE = { READY: 'ready', EMPTY: 'empty', ERROR: 'error' };

/** Data exists. `data` is whatever the widget's renderer expects. */
const ready = (data, extra = {}) => ({ state: STATE.READY, data, ...extra });

/**
 * Genuinely nothing yet. The reason is mandatory and should be a business
 * fact ("the ME store is not live"), not a technical one ("query returned 0").
 */
function empty(reason) {
  if (!reason || typeof reason !== 'string') {
    throw new Error('empty() requires a reason — an unexplained blank is what makes a working panel look broken');
  }
  return { state: STATE.EMPTY, reason };
}

/** We could not find out. Carries what failed so it can be acted on. */
const error = (reason, detail) => ({ state: STATE.ERROR, reason: reason || 'Unknown error', detail: detail || null });

/**
 * Run a contribution and guarantee it resolves to a legal state.
 *
 * Anything that throws becomes ERROR, never EMPTY. A loader that returns
 * something malformed also becomes ERROR: silently coercing a bad shape to
 * "empty" would reintroduce exactly the confusion this contract exists to
 * remove.
 */
async function safeLoad(descriptor, ctx) {
  try {
    const out = await descriptor.load(ctx);
    if (!out || !Object.values(STATE).includes(out.state)) {
      return error('Widget returned an invalid result', `${descriptor.id} did not return ready/empty/error`);
    }
    if (out.state === STATE.EMPTY && !out.reason) {
      return error('Widget reported empty without a reason', descriptor.id);
    }
    return out;
  } catch (e) {
    return error('Could not load', e?.message || String(e));
  }
}

/* ── Severity, so the Attention Centre can rank across modules ───────────────
 * Ordered by consequence, matching the findings pass: money, an account, or a
 * decision taken on a wrong figure. A number so unrelated modules can be sorted
 * against each other without knowing about one another.
 */
const SEVERITY = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const severityRank = s => SEVERITY[s] ?? SEVERITY.info;

/**
 * One item in the Attention Centre.
 *
 * `why` is required for the same reason `empty` needs a reason: an alert you
 * cannot act on is noise, and noise is how a panel stops being read.
 */
function attention({ id, title, why, severity = 'medium', region, area, href, source, dedupeKey }) {
  if (!id || !title || !why) {
    throw new Error('attention() requires id, title and why — an item you cannot act on is noise');
  }
  return {
    id, title, why, severity,
    region: region || null, area: area || null, href: href || null, source: source || null,
    // Two modules can legitimately notice the same fact: the Amazon module sees
    // zero FBA stock, and the findings pass sees zero stock CONTRADICTING an
    // open inbound-block task. Same problem, different depth. A shared key lets
    // the Attention Centre keep the better-explained one and record that the
    // other agreed, rather than listing the problem twice and reading as noise.
    dedupeKey: dedupeKey || null,
  };
}

/* ── Health, so an area can be compared with another ─────────────────────────
 * A score is only allowed when something real was measured. `unknown` is a
 * first-class answer and is NOT the same as 0%: an area nobody has instrumented
 * is not an area in trouble, and colouring it red teaches you to ignore the
 * panel.
 */
const HEALTH = { good: 'good', warn: 'warn', bad: 'bad', unknown: 'unknown' };

/**
 * One scale for every module.
 *
 * Modules were each choosing their own state, which produced Amazon UK reading
 * "bad" beside a score of 87% while Shopify UK read "bad" at 38%. A strip whose
 * colours do not correspond to its numbers is not comparable, and comparing
 * areas is the only reason the strip exists. Counts belong in the note.
 */
function stateFromScore(score) {
  if (score === null || score === undefined || Number.isNaN(score)) return HEALTH.unknown;
  if (score >= 90) return HEALTH.good;
  if (score >= 70) return HEALTH.warn;
  return HEALTH.bad;
}

function health({ label, state = HEALTH.unknown, score = null, note = '', trend = null }) {
  if (!label) throw new Error('health() requires a label');
  if (state === HEALTH.unknown && score !== null) {
    throw new Error('health() cannot be unknown AND carry a score — pick one');
  }
  return { label, state, score, note, trend };
}

/* ── Actions and insights: what a page can tell you ─────────────────────────
 *
 * These are what the per-page panel renders. The bar is enforced here rather
 * than left to whoever writes the next module, because advice is the fastest
 * thing in any product to decay into wallpaper.
 *
 * The findings pass survives because a finding must name TWO RECORDS THAT
 * DISAGREE. These need an equivalent, or "revenue is up, tell the team" gets
 * generated every single day and stops being read inside a week — and then the
 * week it matters, it is missed.
 *
 * So: an INSIGHT must cite a number AND what that number is measured against.
 * An ACTION must name the concrete next step, not the general area of concern.
 * Anything that cannot do both does not render, by construction.
 */

/**
 * Something that changed, with the evidence attached.
 *
 * `tellTeam` is optional and deliberately separate: it marks an insight worth
 * SAYING to someone rather than acting on. Nothing else in the OS notices that
 * distinction, and a good week nobody hears about is a wasted one.
 */
function insight({ id, headline, value, comparison, why, tellTeam = null, tone = 'flat' }) {
  if (!id || !headline) throw new Error('insight() requires id and headline');
  if (!value || !comparison) {
    throw new Error(
      `insight "${id}" needs a value AND a comparison — a number with nothing to measure it against is not an insight, it is a reading`
    );
  }
  return { id, headline, value, comparison, why: why || '', tellTeam, tone };
}

/** Something to do, where `next` is the actual next step, not the topic. */
function action({ id, title, next, why, severity = 'medium', href = null }) {
  if (!id || !title) throw new Error('action() requires id and title');
  if (!next) {
    throw new Error(
      `action "${id}" needs a next step — naming a problem without naming the move is what makes an advice panel ignorable`
    );
  }
  return { id, title, next, why: why || '', severity, href };
}

/**
 * Ask one module for its page panel. Same guarantee as safeLoad: a module that
 * throws reports the failure, it does not quietly contribute nothing.
 */
async function loadPanel(module, ctx = {}) {
  const out = { actions: [], insights: [], error: null };
  try {
    if (typeof module.actions === 'function') out.actions = (await module.actions(ctx)) || [];
    if (typeof module.insights === 'function') out.insights = (await module.insights(ctx)) || [];
  } catch (e) {
    out.error = e?.message || String(e);
  }
  out.actions.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  return out;
}

module.exports = {
  STATE, ready, empty, error, safeLoad,
  SEVERITY, severityRank, attention,
  HEALTH, health, stateFromScore,
  insight, action, loadPanel,
};
