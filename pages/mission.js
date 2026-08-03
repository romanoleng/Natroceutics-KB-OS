import OsLayout from '../components/OsLayout';
import Widget from '../components/Widget';
import { loadWidgets, loadAttention, loadHealth } from '../lib/mission-control/registry';

/**
 * /mission — Mission Control.
 *
 * This page contains no business knowledge, and that is the design. It asks the
 * registry one question, "what can render?", and presents whatever comes back.
 * Adding Marketing, CRM, CreativeDigital or Personal means adding a module file
 * and listing it in the registry; this file does not change.
 *
 * It sits alongside Home rather than replacing it. Home is proven and in daily
 * use; this earns its place before anything is retired.
 *
 * The Attention Centre leads because it answers the question the whole surface
 * exists for: if I only have an hour today, where does it go? Everything below
 * it is context for that decision rather than a competing headline.
 */

const SEV_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };

export default function Mission({ widgets, attention, health, generatedAt }) {
  const errors = widgets.filter(w => w.result.state === 'error');
  const live = widgets.filter(w => w.result.state === 'ready');
  const waiting = widgets.filter(w => w.result.state === 'empty');
  const topSeverity = attention[0]?.severity;

  return (
    <OsLayout title="Mission Control" serverTime={generatedAt}>
      <section className="os-hero">
        <div className="os-hero-inner">
          <p className="os-eyebrow">Natroceutics OS</p>
          <h1 className="os-hero-title">Mission Control</h1>
          <p className="today-sub">
            {attention.length === 0
              ? 'Nothing is asking for attention.'
              : `${attention.length} thing${attention.length === 1 ? '' : 's'} want attention` +
                (topSeverity ? `, worst is ${SEV_LABEL[topSeverity].toLowerCase()}` : '')}
            {errors.length > 0 && ` · ${errors.length} widget${errors.length === 1 ? '' : 's'} failed to load`}
          </p>
        </div>
      </section>

      <div className="os-page-wrap">
        {/* ── Health strip ─────────────────────────────── */}
        <div className="mc-health">
          {health.map(h => (
            <div className={`mc-h mc-h--${h.state}`} key={h.module}>
              <div className="mc-h-label">{h.label}</div>
              <div className="mc-h-score">
                {h.state === 'unknown' ? 'Not measured' : h.score === null ? SEV_LABEL[h.state] || h.state : `${h.score}%`}
              </div>
              <div className="mc-h-note">{h.note}</div>
            </div>
          ))}
        </div>

        {/* ── Attention Centre ─────────────────────────── */}
        <div className="sp-card" style={{ marginTop: 18 }}>
          <div className="sp-card-label">
            Attention
            <span className="fd-count">
              {attention.length ? `${attention.length} open` : 'clear'}
            </span>
          </div>
          {attention.length === 0 ? (
            <div className="fd-empty">
              Nothing from any module is asking for attention. That is a real answer,
              not an empty panel: every module reported and none raised anything.
            </div>
          ) : (
            <div className="mc-att">
              {attention.map(a => (
                <div className={`mc-a mc-a--${a.severity}`} key={a.id}>
                  <div className="mc-a-head">
                    <span className={`st-badge st-badge--${a.severity === 'critical' || a.severity === 'high' ? 'bad' : a.severity === 'medium' ? 'warn' : 'idle'}`}>
                      {SEV_LABEL[a.severity]}
                    </span>
                    <span className="mc-a-title">{a.title}</span>
                    {a.region && <span className="mc-a-tag">{a.region}</span>}
                  </div>
                  <p className="mc-a-why">{a.why}</p>
                  <div className="mc-a-foot">
                    <span className="mc-a-src">
                      {a.source}
                      {a.alsoFrom?.length > 0 && ` · also flagged by ${a.alsoFrom.join(', ')}`}
                    </span>
                    {a.href && <a className="mc-a-link" href={a.href}>Open</a>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Widgets ──────────────────────────────────── */}
        {errors.length > 0 && (
          <>
            <div className="mc-section">Failed to load</div>
            <div className="mc-grid">
              {errors.map(w => <Widget key={w.id} widget={w} />)}
            </div>
          </>
        )}

        <div className="mc-section">Live</div>
        <div className="mc-grid">
          {live.map(w => <Widget key={w.id} widget={w} />)}
        </div>

        {waiting.length > 0 && (
          <>
            <div className="mc-section">
              Not yet
              <span className="mc-section-note">
                Nothing is wrong with these. They will start rendering on their own once the data exists.
              </span>
            </div>
            <div className="mc-grid">
              {waiting.map(w => <Widget key={w.id} widget={w} />)}
            </div>
          </>
        )}

        <p className="today-foot">
          {widgets.length} widgets from {new Set(widgets.map(w => w.module)).size} modules ·
          {' '}{live.length} live, {waiting.length} waiting, {errors.length} failed
        </p>
      </div>
    </OsLayout>
  );
}

export async function getServerSideProps() {
  // Each of these already isolates its own failures: a module that throws
  // becomes an ERROR widget or an attention item saying it could not report,
  // never a blank page and never silence.
  const [widgets, attention, health] = await Promise.all([
    loadWidgets(), loadAttention(), loadHealth(),
  ]);
  return {
    props: {
      widgets: JSON.parse(JSON.stringify(widgets)),
      attention: JSON.parse(JSON.stringify(attention)),
      health: JSON.parse(JSON.stringify(health)),
      generatedAt: new Date().toISOString(),
    },
  };
}
