/**
 * Which module answers "what should I do here?" on each desk.
 *
 * One map, so adding a panel to a page is a line here rather than an edit to
 * the page. Pages ask for a key and render whatever comes back; they do not
 * know which module served it, which is the same separation Mission Control
 * keeps.
 *
 * A desk with no entry gets no panel, deliberately. A panel that has nothing to
 * say is worse than no panel: it teaches you the control is not worth opening,
 * and that lesson is hard to unlearn.
 */
const { loadPanel } = require('./contract');

const DESK_MODULE = {
  'uk:Amazon UK':  'amazon-uk',
  'uk:Shopify UK': 'shopify-uk',
  'uk:Warehouse':  'warehouse',
  'me:Overview':   'middle-east',
  'me:Shopify ME': 'middle-east',
  'me:Launch':     'middle-east',
};

/**
 * Load every panel a page needs, keyed by desk.
 *
 * Failures are contained per desk: loadPanel already turns a throwing module
 * into a panel carrying its error, so one broken module cannot take a region
 * page down with it.
 */
async function loadPanelsFor(pageKey) {
  const keys = Object.keys(DESK_MODULE).filter(k => k.startsWith(`${pageKey}:`));
  const out = {};
  await Promise.all(keys.map(async key => {
    const desk = key.slice(pageKey.length + 1);
    try {
      const mod = require(`./modules/${DESK_MODULE[key]}`);
      out[desk] = JSON.parse(JSON.stringify(await loadPanel(mod)));
    } catch (e) {
      out[desk] = { actions: [], insights: [], error: e?.message || String(e) };
    }
  }));
  return out;
}

module.exports = { DESK_MODULE, loadPanelsFor };
