import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { IconFileText, IconClipboard, IconCart, IconSparkle } from './Icons';

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
  if (router.pathname === '/capture' || router.pathname === '/login') return null;

  return (
    <details className="qa-root">
      <summary className="qa-fab" aria-label="Add data">+</summary>
      <div className="qa-sheet" role="menu">
        <Link href="/capture" className="qa-item" role="menuitem">
          <span className="qa-item-icon"><IconFileText /></span>
          <span>
            <span className="qa-item-title">Capture files</span>
            <span className="qa-item-sub">Sellerboard CSVs · stock take PDF</span>
          </span>
        </Link>
        <Link href="/capture#paste" className="qa-item" role="menuitem">
          <span className="qa-item-icon"><IconClipboard /></span>
          <span>
            <span className="qa-item-title">Paste data</span>
            <span className="qa-item-sub">Excel cells · emails → task / risk / order</span>
          </span>
        </Link>
        <button type="button" className="qa-item" role="menuitem" onClick={syncShopify} disabled={syncState === 'syncing'}>
          <span className="qa-item-icon"><IconCart /></span>
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
        <div className="qa-item qa-item--soon" role="menuitem" aria-disabled="true">
          <span className="qa-item-icon"><IconSparkle /></span>
          <span>
            <span className="qa-item-title">Natro AI <span className="qa-soon-pill">coming soon</span></span>
            <span className="qa-item-sub">Ask anything · read screenshots · fetch from email</span>
          </span>
        </div>
      </div>
    </details>
  );
}
