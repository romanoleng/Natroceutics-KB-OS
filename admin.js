import { useState } from 'react';
import Layout from '../components/Layout';
import Link from 'next/link';

const CATEGORIES = [
  'Amazon', 'Brand', 'Customer Service', 'Finance', 'Inventory',
  'Marketing', 'Middle East', 'Operations', 'Products', 'Shopify',
  'SOPs', 'Suppliers', 'Website', 'Other'
];

const EMPTY = { title: '', category: '', content: '', tags: '' };

export default function Admin() {
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setStatus('error'); setErrorMsg('Title is required.'); return; }
    if (!form.category) { setStatus('error'); setErrorMsg('Category is required.'); return; }

    setStatus('loading');
    setErrorMsg('');

    try {
      const fields = {
        title: form.title.trim(),
        category: form.category,
        content: form.content.trim(),
        ...(form.tags.trim() && { tags: form.tags.trim() }),
        last_updated: new Date().toISOString().split('T')[0],
      };

      const res = await fetch('/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });

      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }

      setStatus('success');
      setForm(EMPTY);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message);
    }
  };

  return (
    <Layout title="Add Entry">
      <div className="page-sm">
        <div className="page-header">
          <p className="page-eyebrow">Admin · Natroceutics</p>
          <h1 className="page-title">Add Entry</h1>
          <p className="page-sub">Create a new knowledge item. It will appear instantly in the Knowledge Base.</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="title">Title *</label>
              <input
                id="title"
                className="form-input"
                type="text"
                placeholder="e.g. Berberine Complex — Dispensary Protocol"
                value={form.title}
                onChange={e => set('title', e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="category">Category *</label>
              <select
                id="category"
                className="form-select"
                value={form.category}
                onChange={e => set('category', e.target.value)}
                required
              >
                <option value="">Select a category</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="content">Content</label>
              <textarea
                id="content"
                className="form-textarea"
                placeholder="Full details, context, mechanisms of action, protocol notes…"
                value={form.content}
                onChange={e => set('content', e.target.value)}
                style={{ minHeight: 180 }}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="tags">Tags</label>
              <input
                id="tags"
                className="form-input"
                type="text"
                placeholder="e.g. berberine, metabolic, formulation"
                value={form.tags}
                onChange={e => set('tags', e.target.value)}
              />
              <p className="form-hint">Comma-separated. Optional.</p>
            </div>

            {status === 'success' && (
              <div className="alert alert-success">
                Entry saved. <Link href="/knowledge" style={{ color: 'inherit', textDecoration: 'underline' }}>View in Knowledge Base →</Link>
              </div>
            )}
            {status === 'error' && (
              <div className="alert alert-error">{errorMsg || 'An error occurred.'}</div>
            )}

            <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" type="submit" disabled={status === 'loading'}>
                {status === 'loading' ? 'Saving…' : 'Save to Airtable'}
              </button>
              <Link href="/knowledge" className="btn btn-outline">View Base</Link>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
