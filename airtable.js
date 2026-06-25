const Airtable = require('airtable');

const TABLE = process.env.AIRTABLE_TABLE_NAME || 'Knowledge_Items';

function getBase() {
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
    throw new Error('Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID env vars');
  }
  return new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
}

export async function getAllItems() {
  const base = getBase();
  const records = [];
  await new Promise((resolve, reject) => {
    base(TABLE)
      .select({ sort: [{ field: 'last_updated', direction: 'desc' }] })
      .eachPage(
        (page, next) => { page.forEach(r => records.push({ id: r.id, ...r.fields })); next(); },
        (err) => err ? reject(err) : resolve()
      );
  });
  return records;
}

export async function createItem(fields) {
  const base = getBase();
  return new Promise((resolve, reject) => {
    base(TABLE).create([{ fields }], (err, created) => err ? reject(err) : resolve(created));
  });
}

export async function getStats() {
  const items = await getAllItems();
  const categories = {};
  items.forEach(item => {
    const cat = item.category || 'Uncategorised';
    categories[cat] = (categories[cat] || 0) + 1;
  });
  return { total: items.length, categories };
}
