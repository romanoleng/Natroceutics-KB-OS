/**
 * dateUtils.js — shared date formatting for Natroceutics OS
 *
 * relativeDate(isoString) → human-friendly string
 *   "Today 14:32"  |  "Yesterday"  |  "25 Jun"  |  "25 Jun 2025"
 */

export function relativeDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yestStart  = new Date(todayStart - 86400000);
  const weekStart  = new Date(todayStart - 6 * 86400000);

  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');

  if (d >= todayStart) {
    return `Today ${hh}:${mm}`;
  }
  if (d >= yestStart) {
    return 'Yesterday';
  }
  // Within the last 7 days — show day name
  if (d >= weekStart) {
    return d.toLocaleDateString('en-GB', { weekday: 'short' }); // "Mon", "Tue" …
  }
  // Older — show date, include year if not current year
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/**
 * fullDate(isoString) → used in tooltips for precise timestamp
 *   "Mon 25 Jun 2026, 14:32"
 */
export function fullDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
