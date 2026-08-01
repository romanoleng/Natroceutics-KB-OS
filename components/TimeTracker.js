import { useEffect, useRef, useState } from 'react';

/**
 * Passive time tracking.
 *
 * Romano's brief, and the reason Clockify failed him: he always forgot to press
 * start. So nothing here has a start button. While an OS tab is open and
 * visible it sends a heartbeat; a session closes itself after five minutes of
 * nothing. Time in the OS therefore records itself.
 *
 * Two honesty rules:
 *   1. It only claims time you were ACTUALLY looking at the OS. Hidden tabs
 *      stop counting immediately (visibilitychange), so a window left open
 *      overnight does not bill you eight hours.
 *   2. It cannot see work done outside the OS: meetings, Outlook, the
 *      warehouse. The report says so rather than implying the total is your
 *      working day.
 *
 * Heartbeats are 60s and coalesce server-side into sessions, so a day costs
 * ~480 tiny writes rather than a stream.
 */

const HEARTBEAT_MS = 60_000;

export default function TimeTracker() {
  const [on, setOn] = useState(false);
  const timer = useRef(null);
  const path = useRef('');

  useEffect(() => {
    // Opt-out lives in localStorage so it survives reloads and needs no account.
    try { setOn(localStorage.getItem('natro.timeTracking') !== 'off'); } catch { setOn(true); }
  }, []);

  useEffect(() => {
    if (!on) return undefined;

    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      const body = JSON.stringify({
        path: location.pathname + location.search,
        at: new Date().toISOString(),
      });
      // keepalive so the last beat still lands if the tab is closing.
      fetch('/api/time-beat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
      path.current = location.pathname;
    };

    beat();
    timer.current = setInterval(beat, HEARTBEAT_MS);

    const onVisible = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [on]);

  return null;   // entirely invisible: that is the point
}
