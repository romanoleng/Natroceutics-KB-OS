/**
 * One Mission Control widget, rendered according to its state.
 *
 * The three states look DIFFERENT on purpose. An empty widget and a broken one
 * must never be mistaken for each other at a glance, so empty is quiet and
 * explanatory while error is loud and names the failure. That is the whole
 * design principle of this surface expressed in about forty lines of markup.
 *
 * Mission Control does not know what any widget contains. Each module returns
 * its own display rows as plain data, so adding a module needs no change here.
 */
export default function Widget({ widget }) {
  const { result } = widget;

  if (result.state === 'error') {
    return (
      <div className="wg wg--error">
        <div className="wg-head">
          <span className="wg-name">{widget.name}</span>
          <span className="wg-badge wg-badge--error">Failed</span>
        </div>
        <p className="wg-error">{result.reason}</p>
        {result.detail && <p className="wg-detail">{result.detail}</p>}
      </div>
    );
  }

  if (result.state === 'empty') {
    return (
      <div className="wg wg--empty">
        <div className="wg-head">
          <span className="wg-name">{widget.name}</span>
          <span className="wg-badge wg-badge--empty">Not yet</span>
        </div>
        <p className="wg-empty">{result.reason}</p>
      </div>
    );
  }

  // Rows come from the module as DATA, not as a render function. Functions
  // cannot cross getServerSideProps, and a renderer map living here would mean
  // Mission Control knows what each widget contains — the one thing this
  // architecture is designed to avoid.
  const { headline, sub, rows = [] } = result.data || {};
  return (
    <div className="wg">
      <div className="wg-head">
        <span className="wg-name">{widget.name}</span>
        {widget.region && <span className="wg-region">{widget.region}</span>}
      </div>
      {headline && <div className="wg-headline">{headline}</div>}
      {sub && <div className="wg-sub">{sub}</div>}
      <div className="wg-rows">
        {rows.map(r => (
          <div className={`wg-row${r.tone ? ` wg-row--${r.tone}` : ''}`} key={r.label}>
            <span className="wg-label">{r.label}</span>
            <span className="wg-value">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
