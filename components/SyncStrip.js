import Link from 'next/link';

/**
 * The line on the home page that answers "did everything come in?" before you
 * go looking at any numbers.
 *
 * Deliberately says the bad thing first and names it. "3 feeds need attention"
 * is a prompt to click; "Shopify finance, Klaviyo and GoAffPro are stale" is
 * information you can act on from the strip itself.
 */
export default function SyncStrip({ health }) {
  if (!health?.ok || !health.headline) return null;
  const { tone, bad, due, names } = health.headline;

  const text =
    tone === 'bad'
      ? `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''} need attention`
      : tone === 'warn'
        ? `${due} feed${due === 1 ? '' : 's'} overdue, everything else current`
        : 'All feeds current';

  return (
    <Link href="/status" className={`sync-strip sync-strip--${tone}`}>
      <span className="sync-strip-dot" aria-hidden />
      <span className="sync-strip-label">Data</span>
      <span className="sync-strip-text">{text}</span>
      <span className="sync-strip-go">→</span>
    </Link>
  );
}
