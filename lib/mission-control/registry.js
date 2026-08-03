/**
 * The Mission Control registry.
 *
 * Modules register themselves; Mission Control asks one question — "give me
 * everything that can render" — and presents whatever comes back. Adding a
 * capability means adding a module file and listing it in `MODULES` below. No
 * page changes, which is the property that stops Mission Control needing a
 * redesign every time the business grows.
 *
 * Registration is explicit rather than a directory scan. A scan looks tidy and
 * then silently drops a module when a filename changes or a build tree-shakes
 * it, and a missing widget is invisible by definition. One list you can read is
 * worth more than cleverness here.
 */

const { safeLoad, severityRank } = require('./contract');

/* Every module contributing to Mission Control. Order is irrelevant: widgets
   sort by their own priority, attention items by severity. */
const MODULES = [
  require('./modules/attention-feeds'),
  require('./modules/attention-findings'),
  require('./modules/tasks'),
  require('./modules/shopify-uk'),
  require('./modules/amazon-uk'),
  require('./modules/warehouse'),
  require('./modules/affiliates'),
  require('./modules/middle-east'),
];

/** Flat list of every declared widget, whether or not it can render today. */
function allWidgets() {
  return MODULES.flatMap(m => (m.widgets || []).map(w => ({
    ...w,
    module: m.id,
    region: w.region ?? m.region ?? null,
    area: w.area ?? m.area ?? null,
  })));
}

/**
 * Load every widget concurrently and attach its state.
 *
 * One module cannot take down the page: `safeLoad` turns any throw into an
 * ERROR state on that widget alone. A slow module delays only itself.
 */
async function loadWidgets(ctx = {}) {
  const declared = allWidgets();
  const loaded = await Promise.all(declared.map(async w => ({
    ...w,
    result: await safeLoad(w, ctx),
  })));

  return loaded.sort((a, b) => {
    // Anything broken sorts to the top regardless of priority. A widget that
    // failed is more urgent than one that succeeded, whatever it was about.
    const aBad = a.result.state === 'error' ? 0 : 1;
    const bBad = b.result.state === 'error' ? 0 : 1;
    if (aBad !== bBad) return aBad - bBad;
    return (a.priority ?? 50) - (b.priority ?? 50);
  });
}

/**
 * Everything that wants attention, ranked across modules.
 *
 * A module that cannot compute its items reports the failure AS an attention
 * item, rather than contributing nothing. Silence from a broken check is the
 * thing that lets a real problem hide.
 */
async function loadAttention(ctx = {}) {
  const items = [];
  await Promise.all(MODULES.map(async m => {
    if (typeof m.attention !== 'function') return;
    try {
      const got = await m.attention(ctx);
      if (Array.isArray(got)) items.push(...got);
    } catch (e) {
      items.push({
        id: `module-failed:${m.id}`,
        title: `${m.label || m.id} could not report`,
        why: `Its attention check threw: ${e?.message || e}. Whatever it watches is unwatched until this is fixed.`,
        severity: 'high',
        region: m.region || null,
        area: m.area || null,
        source: m.id,
      });
    }
  }));

  const ranked = items.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  // Collapse duplicates by shared key. The first survivor wins because the list
  // is already severity-sorted, and every module that agreed is recorded on it
  // — a corroborated problem is stronger evidence, not a repeat.
  const seen = new Map();
  const out = [];
  for (const item of ranked) {
    if (!item.dedupeKey) { out.push(item); continue; }
    const kept = seen.get(item.dedupeKey);
    if (!kept) {
      const copy = { ...item, alsoFrom: [] };
      seen.set(item.dedupeKey, copy);
      out.push(copy);
    } else if (item.source && item.source !== kept.source && !kept.alsoFrom.includes(item.source)) {
      kept.alsoFrom.push(item.source);
    }
  }
  return out;
}

/** Health per module, for the executive strip. */
async function loadHealth(ctx = {}) {
  return Promise.all(MODULES.filter(m => typeof m.health === 'function').map(async m => {
    try {
      return { module: m.id, label: m.label, region: m.region || null, ...(await m.health(ctx)) };
    } catch (e) {
      // An area whose health cannot be computed is UNKNOWN, never healthy and
      // never zero. Guessing either way is how a dashboard starts lying.
      return {
        module: m.id, label: m.label, region: m.region || null,
        state: 'unknown', score: null,
        note: `Health could not be computed: ${e?.message || e}`,
      };
    }
  }));
}

module.exports = { MODULES, allWidgets, loadWidgets, loadAttention, loadHealth };
