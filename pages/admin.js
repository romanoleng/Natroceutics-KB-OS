import { useState } from 'react';
import Link from 'next/link';
import Layout from '../components/Layout';

const CATEGORIES = [
  'Amazon', 'Brand', 'Customer Service', 'Finance', 'Inventory',
  'Marketing', 'Middle East', 'Operations', 'Products', 'Shopify',
  'SOPs', 'Suppliers', 'Website', 'Other'
];
const EMPTY = { title: '', category: '', content: '', tags: '' };

export default function Admin() {
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async e => {
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
      <div className="page-wrap">
        <p className="section-eyebrow">Knowledge</p>
        <h1 className="section-title">Add Entry</h1>
        <p className="section-sub">Create a new knowledge item. Published instantly to Airtable.</p>
        <hr className="section-rule" />

        <div className="form-wrap">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="title">Title *</label>
              <input id="title" className="form-input" type="text"
                placeholder="e.g. Berberine Complex — Dispensary Protocol"
                value={form.title} onChange={e => set('title', e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="category">Category *</label>
              <select id="category" className="form-select" value={form.category}
                onChange={e => set('category', e.target.value)} required>
                <option value="">Select a category</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="content">Content</label>
              <textarea id="content" className="form-textarea"
                placeholder="Full details, context, mechanisms of action, protocol notes…"
                value={form.content} onChange={e => set('content', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="tags">Tags</label>
              <input id="tags" className="form-input" type="text"
                placeholder="e.g. berberine, metabolic, formulation"
                value={form.tags} onChange={e => set('tags', e.target.value)} />
              <p className="form-hint">Comma-separated. Optional.</p>
            </div>

            {status === 'success' && (
              <div className="alert alert-ok">
                Entry saved.{' '}
                <Link href="/knowledge" style={{ textDecoration: 'underline' }}>View in Knowledge Base →</Link>
              </div>
            )}
            {status === 'error' && (
              <div className="alert alert-error">{errorMsg || 'An error occurred.'}</div>
            )}

            <button className="btn btn-primary" type="submit" disabled={status === 'loading'} style={{ marginTop: 8 }}>
              {status === 'loading' ? 'Saving…' : 'Save to Airtable'}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
