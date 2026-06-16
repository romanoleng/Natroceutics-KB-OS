export default function SearchBar({ value, onChange, count, total }) {
  return (
    <>
      <input
        className="search-input"
        type="search"
        placeholder="Search title or content…"
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label="Search knowledge base"
      />
      {total > 0 && (
        <span className="results-count">
          {count === total ? `${total} entries` : `${count} of ${total}`}
        </span>
      )}
    </>
  );
}
