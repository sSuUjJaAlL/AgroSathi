export function ItemSelector({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="row" style={{ gap: "0.5rem" }}>
      <span className="muted" style={{ fontWeight: 700, fontSize: "0.78rem", textTransform: "uppercase" }}>
        Commodity
      </span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)} style={{ minWidth: 220 }}>
        {items.map((i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </select>
    </label>
  );
}
