import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

/**
 * Floating "+" quick-add button — visible on every page, thumb-reachable on
 * mobile. Opens an action sheet with the ways to get data into the OS.
 *
 * Built on a native <details> disclosure rather than React state so the
 * open/close behaviour is browser-level and survives anything that interferes
 * with synthetic event delegation. First brick of the app-like navigation
 * from the mobile design brief.
 */
export default function QuickAdd() {
  const [syncState, setSyncState] = useState('idle');   // idle | syncing | done | error
  const router = useRouter();

  async function syncShopify(e) {
    e.preventDefault();
    if (syncState === 'syncing') return;
    setSyncState('syncing');
    try {
      const res = await fetch('/api/sync-shopify', { method: 'POST' });
      const d = await res.json();
      if (res.ok && d.ok) {
        setSyncState('done');
        setTimeout(() => window.location.reload(), 800);
      } else {
        setSyncState('error');
        setTimeout(() => setSyncState('idle'), 3500);
      }
    } catch {
      setSyncState('error');
      setTimeout(() => setSyncState('idle'), 3500);
    }
  }

  // No point floating an upload button on top of the upload page itself.
  if (router.pathname === '/upload' || router.pathname === '/login') return null;

  return (
    <details className="qa-root">
      <summary className="qa-fab" aria-label="Add data">+</summary>
      <div className="qa-sheet" role="menu">
        <Link href="/upload" className="qa-item" role="menuitem">
          <span className="qa-item-icon">📄</span>
          <span>
            <span className="qa-item-title">Upload files</span>
            <span className="qa-item-sub">Sellerboard CSVs · stock take PDF</span>
          </span>
        </Link>
        <Link href="/upload#paste" className="qa-item" role="menuitem">
          <span className="qa-item-icon">📋</span>
          <span>
            <span className="qa-item-title">Paste data</span>
            <span className="qa-item-sub">Excel cells · emails → task / risk / order</span>
          </span>
        </Link>
        <button type="button" className="qa-item" role="menuitem" onClick={syncShopify} disabled={syncState === 'syncing'}>
          <span className="qa-item-icon">🛒</span>
          <span>
            <span className="qa-item-title">
              {syncState === 'syncing' ? 'Syncing Shopify…'
                : syncState === 'done' ? 'Synced ✓'
                : syncState === 'error' ? 'Sync failed — see UK → Orders'
                : 'Sync Shopify orders'}
            </span>
            <span className="qa-item-sub">Pull latest orders from the store</span>
          </span>
        </button>
      </div>
    </details>
  );
}
