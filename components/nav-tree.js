import { IconBook, IconHandshake, IconCheck, IconBox, IconCart, IconWarehouse, IconFileText, IconCoins, IconUsers, IconChart, IconUpload, IconLeaf, IconGear, IconGlobe, IconSparkle } from './Icons';

/**
 * The OS navigation tree — ONE source of truth.
 *
 * The desktop sidebar, the mobile /menu page and anything else that lists
 * destinations all render from this file, so the two surfaces cannot drift.
 * Ordering is Romano's call (30 Jul): company-wide first, then regions, then
 * tools.
 *
 * Design rule behind the shape: with ~100 tables across 7 Airtable bases the
 * nav must be Region → Section, never a table list. Sections resolve to the
 * in-page tabs (?s= desks on UK, ?t= tabs elsewhere) — the third level lives
 * inside the page, not in the nav.
 */
export const COMPANY = [
  // Today leads: the first item in the rail should be the first thing you do.
  { href: '/all-tasks',      icon: <IconCheck />,     name: 'Today' },
  { href: '/kb',             icon: <IconBook />,      name: 'Knowledge Base' },
  { href: '/partner-brands', icon: <IconHandshake />, name: 'Partner Brands' },
];

/**
 * `overview` is the explicit deep link for "back to the region's first desk".
 * It matters on desktop: the region pages switch tabs by REACTING to query
 * changes, and a bare href (no query) fires no change when you are already
 * on the page — so Overview must carry its query like every other sub-link.
 */
export const REGIONS = [
  {
    icon: '🇬🇧', name: 'United Kingdom', href: '/uk', overview: '/uk?s=overview',
    // `tabs` = the desk's inner tabs (third nav level). The desktop sidebar
    // shows them ONLY while that desk is active — progressive disclosure, so
    // the rail stays ~30 items instead of listing all ~100 tables. Values must
    // match uk.js SECTION_TABS exactly: links carry ?tab= and uk.js reacts to
    // router.query.tab (which also sets the section).
    overviewTabs: ['Tasks', 'Priorities', 'Risks', 'Reporting', 'Products'],
    subs: [
      { href: '/uk?s=amazon', icon: <IconBox />, name: 'Amazon', key: 'amazon',
        tabs: ['Amazon UK', 'Finance', 'Google'] },
      { href: '/uk?s=shopify', icon: <IconCart />, name: 'Shopify', key: 'shopify',
        tabs: ['Tasks', 'Priorities', 'Risks', 'Orders', 'Shopify', 'Customers', 'B2B',
               'Affiliates', 'Email / Klaviyo', 'Marketing', 'Subscriptions',
               'Customer Service', 'Finance', 'Google'] },
      { href: '/uk?s=warehouse', icon: <IconWarehouse />, name: 'Warehouse', key: 'warehouse',
        tabs: ['Stock on Hand', 'Inbound Stock', 'Bionature Batch'] },
      { href: '/report/shopify-uk', icon: <IconChart />, name: 'Shopify Report' },
    ],
  },
  {
    icon: '🇦🇪', name: 'Middle East', href: '/me', overview: '/me?t=tasks',
    subs: [
      { href: '/me?t=registrations', icon: <IconFileText />, name: 'Registrations' },
      { href: '/me?t=inventory',     icon: <IconBox />,      name: 'Inventory' },
      { href: '/me?t=finance',       icon: <IconCoins />,    name: 'Finance' },
      { href: '/me?t=partners',      icon: <IconUsers />,    name: 'Partners' },
      { href: '/me?t=reporting',     icon: <IconChart />,    name: 'Reporting' },
    ],
  },
  {
    icon: '🇿🇦', name: 'South Africa', href: '/sa', overview: '/sa?t=tasks',
    subs: [
      { href: '/sa?t=inventory', icon: <IconBox />,     name: 'Inventory' },
      { href: '/sa?t=finance',   icon: <IconCoins />,   name: 'Finance' },
      { href: '/sa?t=customers', icon: <IconUsers />,   name: 'Customers' },
      { href: '/sa?t=reporting', icon: <IconChart />,   name: 'Reporting' },
      // "Events" is the human name; the page tab (and Airtable table) is
      // Webinar — the ?t= normaliser maps webinar → the Webinar tab.
      { href: '/sa?t=emailmailchimp', icon: <IconUsers />, name: 'Email / Mailchimp' },
      { href: '/sa?t=webinar',   icon: <IconSparkle />, name: 'Events' },
    ],
  },
  {
    icon: '🇵🇹', name: 'Portugal', href: '/pt', overview: '/pt?t=tasks',
    subs: [
      { href: '/pt?t=inventory', icon: <IconBox />,   name: 'Inventory' },
      { href: '/pt?t=finance',   icon: <IconCoins />, name: 'Finance' },
      { href: '/pt?t=customers', icon: <IconUsers />, name: 'Customers' },
      { href: '/pt?t=reporting', icon: <IconChart />, name: 'Reporting' },
    ],
  },
  { icon: <IconGlobe />, name: 'Global Overview', href: '/global', subs: [] },
];

export const TOOLS = [
  { href: '/capture',  icon: <IconUpload />, name: 'Capture' },
  { href: '/time',     icon: <IconChart />,  name: 'Time' },
  { href: '/guide',    icon: <IconLeaf />,   name: 'How the OS Works' },
  { href: '/settings', icon: <IconGear />,   name: 'Settings' },
];
