import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * The off switch for passive time tracking.
 *
 * Stored in localStorage, so it is per-device and needs no account. The
 * preference is deliberately opt-OUT: the feature exists because Romano always
 * forgot to press start, and a tracker you must remember to enable has the same
 * problem as one you must remember to start.
 */
export default function TimeTrackingSetting() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    try { setOn(localStorage.getItem('natro.timeTracking') !== 'off'); } catch { /* private mode */ }
  }, []);

  function toggle(next) {
    setOn(next);
    try { localStorage.setItem('natro.timeTracking', next ? 'on' : 'off'); } catch { /* ignore */ }
    // The tracker reads this on mount, so a reload is the honest way to apply it.
    if (typeof window !== 'undefined') window.location.reload();
  }

  return (
    <div className="sp-card" style={{ marginBottom: 20 }}>
      <div className="sp-card-label">Time tracking</div>
      <p style={{ fontSize: 13.5, fontWeight: 300, lineHeight: 1.6, color: 'var(--charcoal-70)' }}>
        Records time while the OS is open and visible, with no start button. It cannot see work done
        outside the OS, so it measures time in the OS rather than hours worked.
        {' '}<Link href="/time" style={{ color: 'var(--navy-fg)', fontWeight: 600 }}>See what it has recorded →</Link>
      </p>
      <div className="tc-actions" style={{ marginTop: 12 }}>
        <button className={`tc-btn${on ? ' tc-btn--done' : ''}`} onClick={() => toggle(true)}>On</button>
        <button className={`tc-btn${!on ? ' tc-btn--done' : ''}`} onClick={() => toggle(false)}>Off</button>
      </div>
    </div>
  );
}
