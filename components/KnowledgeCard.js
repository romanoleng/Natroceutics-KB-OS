export default function KnowledgeCard({ item }) {
  const preview = (item.content || '').substring(0, 180);
  const tags = typeof item.tags === 'string'
    ? item.tags.split(',').map(t => t.trim()).filter(Boolean)
    : Array.isArray(item.tags) ? item.tags : [];

  const dateStr = item.last_updated
    ? new Date(item.last_updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="k-card">
      <div className="k-card-header">
        <div className="k-card-title">{item.title || 'Untitled'}</div>
        {item.category && <span className="badge badge-cat">{item.category}</span>}
      </div>
      {preview && (
        <p className="k-content">{preview}{(item.content || '').length > 180 ? '…' : ''}</p>
      )}
      {tags.length > 0 && (
        <div className="k-tags">
          {tags.map(t => <span key={t} className="k-tag">{t}</span>)}
        </div>
      )}
      {dateStr && (
        <div className="k-meta">
          <span>{dateStr}</span>
        </div>
      )}
    </div>
  );
}
