export function Delta({
  value,
  unit = "%",
  digits = 2,
  showSign = true,
  className = "",
}: {
  value: number | null | undefined;
  unit?: "%" | "bp" | "" | string;
  digits?: number;
  showSign?: boolean;
  className?: string;
}) {
  if (value == null || !Number.isFinite(value)) {
    return <span className={`text-(--color-fg-mute) ${className}`}>—</span>;
  }
  const up = value > 0;
  const down = value < 0;
  const sign = showSign && value > 0 ? "+" : "";
  return (
    <span
      className={`tabular ${className} ${
        up
          ? "text-(--color-up)"
          : down
            ? "text-(--color-down)"
            : "text-(--color-fg-dim)"
      }`}
    >
      {sign}
      {value.toFixed(digits)}
      {unit}
    </span>
  );
}

export function Arrow({ value }: { value: number | null | undefined }) {
  if (value == null) return null;
  if (value > 0) return <span className="text-(--color-up)">▲</span>;
  if (value < 0) return <span className="text-(--color-down)">▼</span>;
  return <span className="text-(--color-fg-mute)">◆</span>;
}
