export default function FilterBar({ categories, active, onChange }) {
  return (
    <select
      className="filter-select"
      value={active}
      onChange={e => onChange(e.target.value)}
      aria-label="Filter by category"
    >
      <option value="">All categories</option>
      {categories.map(cat => (
        <option key={cat} value={cat}>{cat}</option>
      ))}
    </select>
  );
}
