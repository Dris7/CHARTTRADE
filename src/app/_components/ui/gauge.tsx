"use client";

import { useMemo } from "react";

// Semi-circle gauge with -100…+100 range.
// Risk-Off (red) on the left, Neutral in the middle, Risk-On (green) on the right.
export function RiskGauge({
  score,
  size = 220,
}: {
  score: number;
  size?: number;
}) {
  const clamped = Math.max(-100, Math.min(100, score));
  const radius = (size - 24) / 2;
  const cx = size / 2;
  const cy = size - 16;
  const startAngle = Math.PI; // 180°
  const endAngle = 0; // 0°
  const angle = startAngle + ((clamped + 100) / 200) * (endAngle - startAngle);

  const segments = useMemo(() => {
    // 5 bands: extreme off, off, neutral, on, extreme on
    return [
      { from: -100, to: -60, color: "#a4282d" },
      { from: -60, to: -20, color: "#d44b50" },
      { from: -20, to: 20, color: "#6b7180" },
      { from: 20, to: 60, color: "#3da776" },
      { from: 60, to: 100, color: "#15a35d" },
    ];
  }, []);

  const arcPath = (from: number, to: number) =>
    arc(cx, cy, radius, score2angle(from), score2angle(to));

  function score2angle(v: number) {
    return startAngle + ((v + 100) / 200) * (endAngle - startAngle);
  }

  const needleX = cx + Math.cos(angle) * (radius - 4);
  const needleY = cy + Math.sin(angle) * (radius - 4);

  return (
    <svg width={size} height={size / 2 + 28} className="select-none">
      {segments.map((s, i) => (
        <path
          key={i}
          d={arcPath(s.from, s.to)}
          stroke={s.color}
          strokeWidth={10}
          fill="none"
          strokeLinecap="butt"
          opacity={0.85}
        />
      ))}
      {/* tick marks */}
      {[-100, -50, 0, 50, 100].map((v) => {
        const a = score2angle(v);
        const x1 = cx + Math.cos(a) * (radius - 14);
        const y1 = cy + Math.sin(a) * (radius - 14);
        const x2 = cx + Math.cos(a) * (radius + 4);
        const y2 = cy + Math.sin(a) * (radius + 4);
        return (
          <line
            key={v}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#3a4555"
            strokeWidth={1}
          />
        );
      })}
      {/* needle */}
      <line
        x1={cx}
        y1={cy}
        x2={needleX}
        y2={needleY}
        stroke="#eef2f7"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={5} fill="#0c1117" stroke="#eef2f7" strokeWidth={1.5} />
      {/* labels */}
      <text
        x={20}
        y={cy + 16}
        fontSize={9}
        fill="#5b6473"
        letterSpacing={1.4}
        fontFamily="var(--font-mono)"
      >
        RISK-OFF
      </text>
      <text
        x={size - 20}
        y={cy + 16}
        textAnchor="end"
        fontSize={9}
        fill="#5b6473"
        letterSpacing={1.4}
        fontFamily="var(--font-mono)"
      >
        RISK-ON
      </text>
    </svg>
  );
}

function arc(
  cx: number,
  cy: number,
  r: number,
  start: number,
  end: number,
): string {
  const sx = cx + Math.cos(start) * r;
  const sy = cy + Math.sin(start) * r;
  const ex = cx + Math.cos(end) * r;
  const ey = cy + Math.sin(end) * r;
  const large = end - start > Math.PI ? 1 : 0;
  const sweep = end > start ? 1 : 0;
  return `M${sx} ${sy} A${r} ${r} 0 ${large} ${sweep} ${ex} ${ey}`;
}
