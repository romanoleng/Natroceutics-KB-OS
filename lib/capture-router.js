/**
 * Smart Capture routing — plain instructions to the right place in the OS.
 *
 * Romano's example, which is the whole spec:
 *   "log Farenaaz message under UK natro to ask her about a list of B2B
 *    customers for that section"
 *   → Task: "Ask Farenaaz for a list of B2B customers"
 *     UK · B2B · owner Romano · waiting on Farenaaz
 *
 * RULES ONLY, NO MODEL CALL. This runs at zero credit cost so the feature works
 * the day it ships with no API key, no quota and no external dependency. When
 * ANTHROPIC_API_KEY eventually lands, an LLM handles only what `confidence`
 * marks as weak — the box, the preview and the confirm step never change, only
 * the hit rate.
 *
 * The router NEVER writes. It returns a proposal; the UI shows it and the user
 * confirms. A capture tool that silently files things in the wrong place gets
 * abandoned after the first mistake.
 */

const PEOPLE = [
  'Romano', 'Kiara', 'Kevin', 'Kunle', 'Morgan', 'Maria', 'Shajee', 'Saji',
  'Jason', 'Grant', 'Farenaaz', 'Kate', 'Helena',
];

const REGIONS = [
  { key: 'UK', label: 'United Kingdom', words: ['uk', 'united kingdom', 'britain', 'england', 'natro uk'] },
  // NOT bare 'me': "remind me to chase Jason" is a pronoun, not the Middle East.
  // Uppercase standalone ME is handled separately in detectRegion.
  { key: 'ME', label: 'Middle East', words: ['middle east', 'uae', 'dubai', 'emirates'] },
  { key: 'SA', label: 'South Africa', words: ['south africa', 'rsa'] },
  { key: 'PT', label: 'Portugal', words: ['pt', 'portugal'] },
  { key: 'AFF', label: 'Affiliate Ops', words: ['affiliate', 'affiliates', 'goaffpro'] },
];

/**
 * Section keywords → the table a note should land in. Order matters: the first
 * match wins, so put the specific before the general.
 */
const SECTIONS = [
  { key: 'B2B', words: ['b2b', 'wholesale', 'trade account', 'practitioner'] },
  { key: 'RISKS', words: ['risk', 'blocker', 'blocked', 'issue', 'problem'] },
  { key: 'ORDERS', words: ['order', 'orders'] },
  { key: 'STOCK', words: ['stock', 'soh', 'inventory', 'warehouse'] },
  { key: 'SUBSCRIPTIONS', words: ['subscription', 'subscriber', 'recharge'] },
  { key: 'CUSTOMERS', words: ['customer', 'customers'] },
  { key: 'MARKETING', words: ['marketing', 'campaign', 'klaviyo', 'mailer', 'email list'] },
  { key: 'BILLING', words: ['invoice', 'billing', 'bill', 'fee'] },
  { key: 'CS', words: ['complaint', 'customer service', 'support ticket'] },
  { key: 'MEETINGS', words: ['meeting', 'call with', 'granola'] },
];

/** Verbs that mean "this is a task", not just a note. */
const TASK_VERBS = ['ask', 'chase', 'follow up', 'remind', 'send', 'get', 'request',
  'check', 'confirm', 'review', 'call', 'email', 'book', 'order', 'update', 'log',
  'add', 'create', 'fix', 'sort', 'arrange'];

const PRIORITY_WORDS = [
  { p: 'Critical', words: ['urgent', 'asap', 'critical', 'immediately', 'today'] },
  { p: 'High', words: ['important', 'high priority', 'priority', 'soon'] },
  { p: 'Low', words: ['whenever', 'low priority', 'someday', 'nice to have'] },
];

const lower = s => String(s || '').toLowerCase();

/** Whole-word-ish match, so "me" does not fire inside "some" or "customer". */
function hasWord(text, word) {
  if (word.includes(' ')) return text.includes(word);
  return new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`, 'i').test(text);
}

function detectRegion(text, raw) {
  for (const r of REGIONS) {
    for (const w of r.words) if (hasWord(text, w)) return r;
  }
  // Uppercase two-letter codes are unambiguous where the lowercase word is not:
  // "ME registration paperwork" is the region, "remind me" is not.
  const code = String(raw || '').match(/(^|[^A-Za-z])(ME|SA|PT|UK)([^A-Za-z]|$)/);
  if (code) return REGIONS.find(r => r.key === code[2]) || null;
  return null;
}

function detectSection(text) {
  for (const s of SECTIONS) {
    for (const w of s.words) if (hasWord(text, w)) return s.key;
  }
  return null;
}

function detectPeople(raw) {
  const found = PEOPLE
    .map(p => ({ p, at: lower(raw).indexOf(p.toLowerCase()) }))
    .filter(x => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(x => x.p);
  return found;
}

function detectPriority(text) {
  for (const { p, words } of PRIORITY_WORDS) {
    for (const w of words) if (hasWord(text, w)) return p;
  }
  return 'Normal';
}

/** Strip the routing instruction so the task title is the actual job. */
function buildTitle(raw) {
  let t = String(raw || '').trim();

  // "log X message under UK natro to ask her about Y" → keep from the verb on.
  const verbMatch = t.match(
    new RegExp(`\\b(?:to\\s+)?(${TASK_VERBS.join('|')})\\b`, 'i')
  );
  if (verbMatch && verbMatch.index > 0) {
    const tail = t.slice(verbMatch.index).replace(/^to\s+/i, '');
    if (tail.length > 12) t = tail;
  }

  // Drop the routing clause wherever it sits.
  // Remove ONLY the routing phrase, never the rest of the sentence: an earlier
  // version ended with [^,.]* and swallowed "to ask her about a list of B2B
  // customers", turning the instruction into "Log Farenaaz message".
  t = t.replace(/\b(?:under|in|on|for)\s+(?:the\s+)?(?:uk|me|sa|pt|united kingdom|middle east|south africa|portugal)\b/gi, ' ')
       .replace(/\bnatro(?:ceutics)?\b/gi, ' ')
       .replace(/\bfor that section\b/gi, ' ')
       .replace(/\s*,\s*(?=$)/g, '')
       .replace(/\s{2,}/g, ' ')
       .trim();

  if (!t) t = String(raw).trim();
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return t.length > 160 ? `${t.slice(0, 157)}…` : t;
}

/**
 * @returns {{kind, region, section, tableKey, title, owner, waitingOn,
 *            priority, notes, confidence, reasons}}
 */
function route(rawText) {
  const raw = String(rawText || '').trim();
  const text = lower(raw);
  const reasons = [];

  const region = detectRegion(text, raw);
  if (region) reasons.push(`region "${region.key}" from the wording`);

  const section = detectSection(text);
  if (section) reasons.push(`section "${section}" from a keyword`);

  const people = detectPeople(raw);
  // "log Farenaaz message ... to ask her" — the named person is who we chase,
  // and the task stays Romano's because this is his cockpit.
  const waitingOn = people.find(p => p !== 'Romano') || null;
  if (waitingOn) reasons.push(`mentions ${waitingOn}`);

  const isTask = TASK_VERBS.some(v => hasWord(text, v));
  const isRisk = section === 'RISKS';
  const kind = isRisk ? 'Risk' : isTask ? 'Task' : 'Note';
  reasons.push(isRisk ? 'reads as a risk' : isTask ? 'contains an action verb' : 'no action verb, filed as a note');

  // Tasks and notes both land in TASKS unless it is explicitly a risk: a note
  // with no home is worse than a task nobody has to do.
  const tableKey = isRisk ? 'RISKS' : 'TASKS';

  // Confidence is honest about what we actually recognised.
  let confidence = 'low';
  if (region && (section || waitingOn)) confidence = 'high';
  else if (region || section || waitingOn) confidence = 'medium';

  return {
    kind,
    region: region ? region.key : null,
    regionLabel: region ? region.label : null,
    section,
    tableKey,
    title: buildTitle(raw),
    owner: 'Romano',
    waitingOn,
    priority: detectPriority(text),
    notes: raw,
    confidence,
    reasons,
  };
}

/** Turn a confirmed proposal into the record /api/ingest expects. */
function toRecord(proposal, overrides = {}) {
  const p = { ...proposal, ...overrides };
  const today = new Date().toISOString().slice(0, 10);
  const owner = p.waitingOn ? `${p.owner} (to ${p.waitingOn})` : p.owner;

  if (p.tableKey === 'RISKS') {
    return {
      fields: {
        Risk: p.title,
        Status: 'Open',
        Owner: owner,
        Notes: p.notes,
        'Date of Entry': today,
      },
    };
  }
  return {
    fields: {
      Task: p.title,
      Status: 'To Do',
      Priority: p.priority || 'Normal',
      Owner: owner,
      'Business Area': p.section || '',
      'Date of Entry': today,
      Notes: p.notes,
    },
  };
}

module.exports = { route, toRecord, PEOPLE, REGIONS, SECTIONS };
