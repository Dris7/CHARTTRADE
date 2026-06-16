"use client";

import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui/panel";
import { Spark } from "~/app/_components/ui/spark";

function tone(v: number): { color: string; cls: string } {
  if (v >= 75) return { color: "var(--color-up)", cls: "Extreme Greed" };
  if (v >= 55) return { color: "var(--color-up)", cls: "Greed" };
  if (v > 45) return { color: "var(--color-warn)", cls: "Neutral" };
  if (v > 25) return { color: "var(--color-down)", cls: "Fear" };
  return { color: "var(--color-down)", cls: "Extreme Fear" };
}

export function FearGreed() {
  const { data, isLoading } = api.macro.fearGreed.useQuery(undefined, {
    staleTime: 30 * 60_000,
  });

  const v = data?.value ?? null;
  const t = v != null ? tone(v) : null;

  // Semicircular gauge geometry
  const R = 52;
  const cx = 60;
  const cy = 60;
  const start = Math.PI; // 180°
  const angle = v != null ? start - (v / 100) * Math.PI : start;
  const nx = cx + R * Math.cos(angle);
  const ny = cy - R * Math.sin(angle);

  return (
    <Panel
      title="Fear & Greed"
      hint={isLoading ? "chargement…" : data?.date ? `actions US · ${data.date}` : "flux indisponible"}
    >
      {isLoading ? (
        <div className="h-28 animate-pulse rounded-sm bg-(--color-panel-2)/60" />
      ) : v == null || !t ? (
        <div className="py-6 text-center text-sm text-(--color-fg-mute)">
          Flux de sentiment indisponible.
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 120 70" width="130" className="shrink-0">
            {/* track gradient (red→amber→green) */}
            <defs>
              <linearGradient id="fg-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-down)" />
                <stop offset="50%" stopColor="var(--color-warn)" />
                <stop offset="100%" stopColor="var(--color-up)" />
              </linearGradient>
            </defs>
            <path
              d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
              fill="none"
              stroke="url(#fg-grad)"
              strokeWidth={7}
              strokeLinecap="round"
              opacity={0.85}
            />
            {/* needle */}
            <line
              x1={cx}
              y1={cy}
              x2={nx}
              y2={ny}
              stroke={t.color}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy} r={4} fill={t.color} />
            <text
              x={cx}
              y={cy - 14}
              textAnchor="middle"
              fontSize={20}
              fontWeight={700}
              fill={t.color}
            >
              {v}
            </text>
          </svg>
          <div className="flex flex-col gap-1">
            <span
              className="text-sm font-semibold uppercase tracking-widest"
              style={{ color: t.color }}
            >
              {data?.classification ?? t.cls}
            </span>
            <Spark data={data?.history ?? []} width={110} height={26} stroke={t.color} />
            <span className="text-[9px] text-(--color-fg-mute)">
              CNN · 30j
            </span>
          </div>
        </div>
      )}
    </Panel>
  );
}
