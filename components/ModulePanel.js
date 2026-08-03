import { useState } from 'react';

/**
 * The advice panel for one desk. Collapsed until asked.
 *
 * Hidden by default is the whole point. A page that shouts advice every time
 * you open it gets scrolled past within a week; a panel you choose to open is
 * one you actually read. It costs a single line of screen when closed.
 *
 * The contract does the work of keeping it worth opening: an insight cannot
 * exist without a number AND something to measure it against, and an action
 * cannot exist without naming the next step. Neither rule is enforced here,
 * because a rule enforced in the renderer is a rule the next module skips.
 *
 * `tellTeam` gets its own treatment. Everything else in the OS is about what to
 * DO; this is the only thing that notices what is worth SAYING, and a good week
 * nobody hears about is a wasted one. It offers the words. Sending stays
 * Romano's — the OS drafts, it does not speak for him.
 */
export default function ModulePanel({ panel, label = 'this area' }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(null);

  if (!panel) return null;
  const { actions = [], insights = [], error } = panel;
  const count = actions.length + insights.length;

  // Nothing to say is a legitimate answer and says so, rather than rendering an
  // empty box that reads as broken.
  if (!error && count === 0) {
    return (
      <div className="mp mp--quiet">
        <span className="mp-quiet-text">Nothing to flag on {label} right now.</span>
      </div>
    );
  }

  async function copy(text, id) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(c => (c === id ? null : c)), 2500);
    } catch { /* clipboard blocked; the text is on screen to copy by hand */ }
  }

  return (
    <div className="mp">
      <button className="mp-head" onClick={() => setOpen(o => !o)} type="button">
        <span className="mp-title">What should I do here?</span>
        {actions.length > 0 && <span className="mp-count mp-count--do">{actions.length}</span>}
        {insights.length > 0 && <span className="mp-count">{insights.length}</span>}
        <span className={`mp-chev${open ? ' open' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="mp-body">
          {error && (
            <div className="mp-error">
              This panel could not be built: {error}. Treat the absence of advice as unknown, not as all clear.
            </div>
          )}

          {actions.length > 0 && (
            <>
              <div className="mp-section">Do next</div>
              {actions.map(a => (
                <div className={`mp-item mp-item--${a.severity}`} key={a.id}>
                  <div className="mp-item-title">{a.title}</div>
                  <p className="mp-next">{a.next}</p>
                  {a.why && <p className="mp-why">{a.why}</p>}
                  {a.href && <a className="mp-link" href={a.href}>Open</a>}
                </div>
              ))}
            </>
          )}

          {insights.length > 0 && (
            <>
              <div className="mp-section">What changed</div>
              {insights.map(i => (
                <div className="mp-item" key={i.id}>
                  <div className="mp-item-title">{i.headline}</div>
                  <div className={`mp-figure mp-figure--${i.tone}`}>
                    <span className="mp-value">{i.value}</span>
                    <span className="mp-comp">{i.comparison}</span>
                  </div>
                  {i.why && <p className="mp-why">{i.why}</p>}
                  {i.tellTeam && (
                    <div className="mp-tell">
                      <div className="mp-tell-label">Worth saying</div>
                      <p className="mp-tell-text">{i.tellTeam}</p>
                      <button className="fd-btn" type="button" onClick={() => copy(i.tellTeam, i.id)}>
                        {copied === i.id ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
