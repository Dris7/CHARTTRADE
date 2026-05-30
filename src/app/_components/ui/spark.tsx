// Lightweight inline-SVG sparkline (no chart lib) for dense terminal tiles.
// Mirrors the World Monitor pattern: a single normalized polyline.

export function Spark({
  data,
  width = 120,
  height = 28,
  stroke,
  className = "",
}: {
  data: number[];
  width?: number;
  height?: number;
  /** Override colour; defaults to up/down by net direction of the series. */
  stroke?: string;
  className?: string;
}) {
  const pts = data.filter((v) => Number.isFinite(v));
  if (pts.length < 2) {
    return <svg width={width} height={height} className={className} />;
  }
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const stepX = width / (pts.length - 1);
  const pad = 1.5;
  const usable = height - pad * 2;

  const poly = pts
    .map((v, i) => {
      const x = i * stepX;
      const y = pad + (1 - (v - min) / range) * usable;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const color =
    stroke ??
    (pts[pts.length - 1]! >= pts[0]!
      ? "var(--color-up)"
      : "var(--color-down)");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
    >
      <polyline
        points={poly}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
