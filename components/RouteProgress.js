import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';

/**
 * Thin top loading bar for client-side navigation — page data is fetched
 * server-side on every link click (getServerSideProps), so without this the
 * app looks frozen for the duration. No dependencies.
 */
export default function RouteProgress() {
  const router = useRouter();
  const [state, setState] = useState('idle');   // idle | loading | done
  const timerRef = useRef(null);

  useEffect(() => {
    const start = url => {
      if (url === router.asPath) return;
      clearTimeout(timerRef.current);
      setState('loading');
    };
    const done = () => {
      setState('done');
      timerRef.current = setTimeout(() => setState('idle'), 350);
    };

    router.events.on('routeChangeStart', start);
    router.events.on('routeChangeComplete', done);
    router.events.on('routeChangeError', done);
    return () => {
      router.events.off('routeChangeStart', start);
      router.events.off('routeChangeComplete', done);
      router.events.off('routeChangeError', done);
      clearTimeout(timerRef.current);
    };
  }, [router]);

  if (state === 'idle') return null;
  return <div className={`route-progress route-progress--${state}`} aria-hidden="true" />;
}
