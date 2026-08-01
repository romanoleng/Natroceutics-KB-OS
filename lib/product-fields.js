/**
 * Field resolution for the product catalogue.
 *
 * The UI was written against a schema that no longer exists. It expected
 * "Product Name", "Short Description", "Indication", "Key Ingredients" and
 * per-market booleans; the Airtable table actually holds a practitioner price
 * list: Product, Brand, Category, Format, Qty / Size, mg / l, three rand
 * prices, Nappi Code, Barcode, Channel, Notes.
 *
 * Every one of the 80 products therefore rendered as "Unnamed", and filtering
 * by market returned nothing at all, because `!!p[undefined]` is false for
 * every row.
 *
 * Rather than hardcode the new names and break again on the next schema change,
 * resolve by trying candidates in order. A field that exists under any known
 * name is found; one that exists under none returns null, and the UI omits the
 * element instead of rendering an empty label.
 */

/** First candidate key present and non-empty on the record. */
function pick(record, candidates) {
  for (const k of candidates) {
    const v = record?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

const NAME = ['Product Name', 'Product', 'Name', 'Title'];
const DESC = ['Short Description', 'Description', 'Notes'];
const CATEGORY = ['Category', 'Product Category'];
const BRAND = ['Brand', 'Manufacturer'];
const FORMAT = ['Format', 'Form'];
const SIZE = ['Qty / Size', 'Pack Size', 'Size', 'Qty'];
const STRENGTH = ['mg / l', 'Strength', 'Dosage'];
const CHANNEL = ['Channel', 'Availability'];
const INDICATION = ['Indication', 'Indications'];
const INGREDIENTS = ['Key Ingredients', 'Ingredients', 'Actives'];

/** Prices, newest schema first. Returns { label, value } or null. */
const PRICES = [
  ['Patient price (R)', 'Patient price', 'R'],
  ['Price incl VAT (R)', 'Trade incl VAT', 'R'],
  ['Price excl VAT (R)', 'Trade excl VAT', 'R'],
  ['UK Trade Price', 'UK trade', '£'],
  ['Price', 'Price', '£'],
];

/** Market availability, only where the schema actually carries it. */
const MARKETS = [
  ['UK', 'UK Shopify'], ['AMZN', 'Amazon UK'],
  ['SA', 'SA Available'], ['ME', 'Middle East'],
];

/** Normalise one record into the shape the UI renders. */
function normaliseProduct(p) {
  const prices = PRICES
    .map(([key, label, sym]) => {
      const v = p?.[key];
      return v === undefined || v === null || v === '' ? null : { label, sym, value: Number(v) };
    })
    .filter(Boolean);

  const size = pick(p, SIZE);
  const format = pick(p, FORMAT);
  const strength = pick(p, STRENGTH);

  return {
    id: p.id,
    raw: p,
    name: pick(p, NAME) || 'Unnamed',
    brand: pick(p, BRAND),
    category: pick(p, CATEGORY),
    description: pick(p, DESC),
    indication: pick(p, INDICATION),
    ingredients: pick(p, INGREDIENTS),
    channel: pick(p, CHANNEL),
    // "60 · Veggie Cap · 740mg" reads better than three separate labels.
    spec: [size, format, strength ? `${strength}mg` : null].filter(Boolean).join(' · '),
    prices,
    markets: MARKETS.filter(([, key]) => !!p?.[key]).map(([code]) => code),
    code: pick(p, ['Nappi Code', 'SKU', 'Barcode']),
  };
}

/** True when ANY record carries market availability, so the UI can hide the
 *  market filter entirely rather than offering pills that match nothing. */
const hasMarketData = products =>
  products.some(p => MARKETS.some(([, key]) => p?.[key] !== undefined && p?.[key] !== ''));

/** Everything searchable about a product, lowercased. */
const searchText = n =>
  [n.name, n.brand, n.category, n.description, n.indication, n.ingredients, n.spec, n.code]
    .filter(Boolean).join(' ').toLowerCase();

module.exports = { pick, normaliseProduct, hasMarketData, searchText, MARKETS };
