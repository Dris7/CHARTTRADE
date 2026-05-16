"use client";

import { useMemo } from "react";

export function Sparkline({
  data,
  width = 96,
  height = 28,
  stroke,
  fill = true,
  baseline,
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: boolean;
  baseline?: number;
}) {
  const { path, area, color, last } = useMemo(() => {
    if (!data || data.length < 2) {
      return { path: "", area: "", color: "var(--color-fg-mute)", last: 0 };
    }
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);
    const points = data.map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return [x, y] as const;
    });
    const d = points
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(" ");
    const a = `${d} L${width},${height} L0,${height} Z`;
    const base = baseline ?? data[0]!;
    const lastV = data[data.length - 1]!;
    const c =
      stroke ??
      (lastV > base
        ? "var(--color-up)"
        : lastV < base
          ? "var(--color-down)"
          : "var(--color-fg-dim)");
    return { path: d, area: a, color: c, last: lastV };
  }, [data, width, height, stroke, baseline]);

  if (!path) {
    return (
      <svg width={width} height={height} className="opacity-30">
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeDasharray="2 2"
        />
      </svg>
    );
  }

  const id = `g-${color.replace(/[^a-zA-Z0-9]/g, "")}-${data.length}`;
  return (
    <svg width={width} height={height} aria-hidden="true">
      {fill && (
        <>
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${id})`} />
        </>
      )}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={width}
        cy={height - 1}
        r={1.5}
        fill={color}
        opacity={0}
      />
      {/* anchor last point for tooltip consistency */}
      <title>{last.toFixed(2)}</title>
    </svg>
  );
}
