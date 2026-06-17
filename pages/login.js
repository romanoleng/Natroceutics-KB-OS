import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push('/');
      } else {
        setError('Incorrect password. Please try again.');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Access · Natroceutics OS</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <div className="login-page">
        <div className="login-card">
          <p className="login-brand">Natroceutics®</p>
          <p className="login-sub">Operations OS · Internal Access</p>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="password">Access Password</label>
              <input
                id="password"
                className="form-input"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoFocus
              />
              {error && <p className="login-error">{error}</p>}
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !password}
            >
              {loading ? 'Verifying…' : 'Access OS'}
            </button>
          </form>

          <p className="login-footer">We are efficacy first.</p>
        </div>
      </div>
    </>
  );
}
