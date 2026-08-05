import { useState, useRef } from 'react';

/**
 * "Tell the OS" — type or speak an instruction, see where it will land, confirm.
 *
 * Voice is an input method, not a pipeline: the mic fills the same box typing
 * does, using the browser's own speech recognition. On iPhone the keyboard mic
 * already dictates into it, so voice costs nothing and needs no infrastructure.
 *
 * Nothing is written until you press Confirm, and every field on the preview is
 * editable first. That is the whole trust model.
 */

import { areasFor } from '../lib/business-areas';

const REGIONS = [['UK', '🇬🇧 United Kingdom'], ['ME', '🇦🇪 Middle East'],
                 ['SA', '🇿🇦 South Africa'], ['PT', '🇵🇹 Portugal'], ['AFF', '🤝 Affiliates']];
const TABLES = [['TASKS', 'Task'], ['RISKS', 'Risk']];
const PRIORITIES = ['Critical', 'High', 'Normal', 'Low'];

export default function SmartCapture() {
  const [text, setText] = useState('');
  const [proposal, setProposal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState(null);
  const [listening, setListening] = useState(false);
  const rec = useRef(null);

  const speechOK = typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  function toggleMic() {
    if (listening) { rec.current?.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = 'en-GB';
    r.interimResults = true;
    r.continuous = true;
    let final = text ? text + ' ' : '';
    r.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += chunk;
        else interim += chunk;
      }
      setText((final + interim).replace(/\s{2,}/g, ' '));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  }

  async function preview() {
    setBusy(true); setErr(null); setDone(null);
    try {
      const res = await fetch('/api/smart-capture', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not read that');
      setProposal(d.proposal);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function commit() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/smart-capture', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, confirm: true, overrides: proposal }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not save');
      setDone(d);
      setProposal(null);
      setText('');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const set = (k, v) => setProposal(p => ({ ...p, [k]: v }));

  return (
    <div className="sc">
      <div className="sc-head">
        <h2 className="sc-title">Tell the OS</h2>
        <p className="sc-sub">
          Type or speak it plainly. You will see where it lands before anything is saved.
        </p>
      </div>

      <div className="sc-box">
        <textarea
          className="sc-input"
          rows={3}
          value={text}
          placeholder="log Farenaaz message under UK to ask her about a list of B2B customers"
          onChange={e => { setText(e.target.value); setProposal(null); }}
        />
        <div className="sc-box-actions">
          {speechOK && (
            <button className={`sc-mic${listening ? ' on' : ''}`} onClick={toggleMic} type="button"
                    title={listening ? 'Stop' : 'Speak'}>
              {listening ? '● Listening' : '🎙 Speak'}
            </button>
          )}
          <button className="sc-go" onClick={preview} disabled={!text.trim() || busy} type="button">
            {busy ? 'Reading…' : 'Where does this go?'}
          </button>
        </div>
      </div>

      {err && <div className="os-alert-error" style={{ marginTop: 10 }}>{err}</div>}

      {done && (
        <div className="sc-done">
          Filed in <strong>{done.landedIn}</strong>. It will show in Today and in the capture receipts.
        </div>
      )}

      {proposal && (
        <div className="sc-preview">
          <div className="sc-preview-head">
            <span className={`sc-conf sc-conf--${proposal.confidence}`}>{proposal.confidence} confidence</span>
            <span className="sc-why">{proposal.reasons.join(' · ')}</span>
          </div>

          <label className="sc-field">
            <span>Title</span>
            <input value={proposal.title} onChange={e => set('title', e.target.value)} />
          </label>

          <div className="sc-row">
            <label className="sc-field">
              <span>Region</span>
              <select value={proposal.region || 'UK'} onChange={e => set('region', e.target.value)}>
                {REGIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label className="sc-field">
              <span>File as</span>
              <select value={proposal.tableKey} onChange={e => set('tableKey', e.target.value)}>
                {TABLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
          </div>

          <div className="sc-row">
            <label className="sc-field">
              {/* Named "Business area" because that is the FIELD it writes. It
                  was labelled "Section", which read like a destination and is
                  not one: this tags the task, the Region and File-as controls
                  above choose where it lands. */}
              <span>Business area</span>
              <select value={proposal.section || ''} onChange={e => set('section', e.target.value)}>
                <option value="">(none)</option>
                {areasFor(proposal.region || 'UK', proposal.section ? [proposal.section] : [])
                  .map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="sc-field">
              <span>Priority</span>
              <select value={proposal.priority} onChange={e => set('priority', e.target.value)}>
                {PRIORITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>

          {proposal.waitingOn && (
            <p className="sc-note">Owner stays <strong>Romano</strong>, waiting on <strong>{proposal.waitingOn}</strong>.</p>
          )}
          {proposal.confidence === 'low' && (
            <p className="sc-note sc-note--warn">
              No region or section recognised, so this defaults to a UK task. Correct it above
              before saving.
            </p>
          )}

          <div className="sc-preview-actions">
            <button className="sc-confirm" onClick={commit} disabled={busy} type="button">
              {busy ? 'Saving…' : 'Confirm and file'}
            </button>
            <button className="sc-cancel" onClick={() => setProposal(null)} type="button">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
