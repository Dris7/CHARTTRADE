"use client";

import { useMemo } from "react";

import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui/panel";

export function YieldCurve() {
  const { data, isLoading } = api.macro.yieldCurve.useQuery(undefined, {
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const pts = useMemo(
    () => (data?.points ?? []).filter((p) => p.value != null),
    [data],
  );

  const spread = data?.spread2s10s ?? null;
  const inverted = spread != null && spread < 0;

  // SVG geometry
  const W = 460;
  const H = 150;
  const padL = 34;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const { curPath, prevPath, dots, yTicks, xLabels } = useMemo(() => {
    if (pts.length < 2)
      return { curPath: "", prevPath: "", dots: [], yTicks: [], xLabels: [] };
    const vals = pts.flatMap((p) => [p.value!, p.prev ?? p.value!]);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const minMonth = pts[0]!.months;
    const maxMonth = pts[pts.length - 1]!.months;
    // log scale on tenor so the short end isn't crushed
    const lx = (m: number) =>
      padL +
      ((Math.log(m) - Math.log(minMonth)) /
        (Math.log(maxMonth) - Math.log(minMonth))) *
        innerW;
    const ly = (v: number) => padT + (1 - (v - min) / range) * innerH;

    const curPath = pts
      .map((p, i) => `${i ? "L" : "M"}${lx(p.months).toFixed(1)},${ly(p.value!).toFixed(1)}`)
      .join(" ");
    const prevPath = pts
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${lx(p.months).toFixed(1)},${ly(p.prev ?? p.value!).toFixed(1)}`,
      )
      .join(" ");
    const dots = pts.map((p) => ({
      x: lx(p.months),
      y: ly(p.value!),
      label: p.tenor,
      value: p.value!,
    }));
    const yTicks = [min, (min + max) / 2, max].map((v) => ({
      y: ly(v),
      label: `${v.toFixed(2)}%`,
    }));
    const xLabels = pts.map((p) => ({ x: lx(p.months), label: p.tenor }));
    return { curPath, prevPath, dots, yTicks, xLabels };
  }, [pts, innerW, innerH]);

  return (
    <Panel
      title="Yield Curve"
      hint={isLoading ? "chargement…" : data?.date ? `UST · ${data.date}` : "flux indisponible"}
      right={
        spread != null ? (
          <span
            className={`tabular rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${
              inverted
                ? "border-(--color-down)/40 bg-(--color-down)/15 text-(--color-down)"
                : "border-(--color-up)/40 bg-(--color-up)/15 text-(--color-up)"
            }`}
          >
            2s10s {spread >= 0 ? "+" : ""}
            {(spread * 100).toFixed(0)}bp {inverted ? "· inversée" : ""}
          </span>
        ) : null
      }
    >
      {isLoading ? (
        <div className="h-[150px] animate-pulse rounded-sm bg-(--color-panel-2)/60" />
      ) : pts.length < 2 ? (
        <div className="py-10 text-center text-sm text-(--color-fg-mute)">
          Flux FRED indisponible.
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block">
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={padL}
                y1={t.y}
                x2={W - padR}
                y2={t.y}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
              <text
                x={padL - 4}
                y={t.y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={8}
                fill="var(--color-fg-mute)"
              >
                {t.label}
              </text>
            </g>
          ))}
          {/* prior curve (dashed) */}
          <path
            d={prevPath}
            fill="none"
            stroke="var(--color-fg-mute)"
            strokeWidth={1.2}
            strokeDasharray="4 3"
            opacity={0.6}
          />
          {/* current curve */}
          <path
            d={curPath}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {dots.map((d, i) => (
            <g key={i}>
              <circle cx={d.x} cy={d.y} r={2.5} fill="var(--color-accent)" />
            </g>
          ))}
          {xLabels.map((x, i) => (
            <text
              key={i}
              x={x.x}
              y={H - 8}
              textAnchor="middle"
              fontSize={8}
              fill="var(--color-fg-mute)"
            >
              {x.label}
            </text>
          ))}
        </svg>
      )}
      {/* tenor table */}
      {pts.length >= 2 && (
        <div className="tabular mt-2 grid grid-cols-8 gap-px overflow-hidden rounded-sm border border-(--color-border) bg-(--color-border) text-center text-[10px]">
          {pts.map((p) => {
            const chg = p.value != null && p.prev != null ? p.value - p.prev : null;
            return (
              <div key={p.tenor} className="bg-(--color-panel) px-1 py-1">
                <div className="text-(--color-fg-mute)">{p.tenor}</div>
                <div className="text-(--color-fg)">{p.value?.toFixed(2)}</div>
                {chg != null && (
                  <div
                    className={
                      chg > 0
                        ? "text-(--color-up)"
                        : chg < 0
                          ? "text-(--color-down)"
                          : "text-(--color-fg-mute)"
                    }
                  >
                    {chg >= 0 ? "+" : ""}
                    {(chg * 100).toFixed(0)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
