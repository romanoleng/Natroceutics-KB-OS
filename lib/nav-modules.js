/**
 * The OS's navigable modules, in one place — the header switcher, the mobile
 * bottom bar and the Settings page all read this list.
 *
 * `pinnable` modules can be chosen (in Settings) for the mobile bottom bar.
 * Pins live in localStorage under `natro.navPins`; defaults below.
 */
export const NAV_MODULES = [
  { href: '/global',         code: 'GLOBAL',   label: 'Global',          pinnable: true },
  { href: '/sa',             code: 'SA',       label: 'South Africa',    pinnable: true },
  { href: '/kb',             code: 'KB',       label: 'Knowledge Base',  pinnable: true },
  { href: '/partner-brands', code: 'PARTNERS', label: 'Partner Brands',  pinnable: true },
  { href: '/all-tasks',      code: 'TASKS',    label: 'All Tasks',       pinnable: true },
  { href: '/upload',         code: 'UPLOAD',   label: 'Upload Data',     pinnable: true },
  { href: '/guide',          code: 'GUIDE',    label: 'How the OS Works', pinnable: true },
];

export const DEFAULT_PINS = ['GLOBAL', 'TASKS', 'UPLOAD'];
export const MAX_PINS = 3;
const STORAGE_KEY = 'natro.navPins';

export function loadPins() {
  if (typeof window === 'undefined') return DEFAULT_PINS;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (Array.isArray(raw) && raw.length) {
      const valid = raw.filter(c => NAV_MODULES.some(m => m.code === c && m.pinnable));
      if (valid.length) return valid.slice(0, MAX_PINS);
    }
  } catch { /* corrupted storage — fall through to defaults */ }
  return DEFAULT_PINS;
}

export function savePins(pins) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pins.slice(0, MAX_PINS)));
    // Same-tab listeners (the bottom bar) don't get 'storage' events — nudge them.
    window.dispatchEvent(new Event('natro:navpins'));
  } catch { /* private mode etc. — pins just won't persist */ }
}
