export default function FilterBar({ categories, active, onChange }) {
  return (
    <div className="filter-row">
      <button
        className={`filter-btn${!active ? ' active' : ''}`}
        onClick={() => onChange('')}
      >
        All
      </button>
      {categories.map(cat => (
        <button
          key={cat}
          className={`filter-btn${active === cat ? ' active' : ''}`}
          onClick={() => onChange(cat)}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
