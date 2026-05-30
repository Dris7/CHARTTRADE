"use client";

import { useMemo } from "react";

import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui/panel";

export function NetLiquidity() {
  const { data, isLoading } = api.macro.netLiquidity.useQuery(undefined, {
    staleTime: 60 * 60_000,
  });

  const series = useMemo(() => data?.series ?? [], [data]);
  const W = 520;
  const H = 120;
  const padL = 30;
  const padR = 8;
  const padT = 8;
  const padB = 8;

  const { path, area, yTicks } = useMemo(() => {
    if (series.length < 2) return { path: "", area: "", yTicks: [] };
    const vals = series.map((p) => p.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const iW = W - padL - padR;
    const iH = H - padT - padB;
    const x = (i: number) => padL + (i / (series.length - 1)) * iW;
    const y = (v: number) => padT + (1 - (v - min) / range) * iH;
    const path = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
    const area = `${path} L${x(series.length - 1).toFixed(1)},${(H - padB).toFixed(1)} L${padL},${(H - padB).toFixed(1)} Z`;
    const yTicks = [max, (max + min) / 2, min].map((v) => ({ y: y(v), label: `$${v.toFixed(2)}T` }));
    return { path, area, yTicks };
  }, [series]);

  return (
    <Panel
      title="Net Liquidity"
      hint={isLoading ? "chargement…" : data?.date ? `WALCL − TGA − RRP · ${data.date}` : "flux indisponible"}
      right={
        data?.value != null ? (
          <div className="flex items-baseline gap-2">
            <span className="tabular text-sm font-semibold text-(--color-fg)">
              ${data.value.toFixed(2)}T
            </span>
            {data.change1m != null && (
              <span
                className={`tabular text-[10px] ${
                  data.change1m > 0
                    ? "text-(--color-up)"
                    : data.change1m < 0
                      ? "text-(--color-down)"
                      : "text-(--color-fg-mute)"
                }`}
              >
                {data.change1m >= 0 ? "+" : ""}
                {(data.change1m * 1000).toFixed(0)}B/mois
              </span>
            )}
          </div>
        ) : null
      }
    >
      {isLoading ? (
        <div className="h-[120px] animate-pulse rounded-sm bg-(--color-panel-2)/60" />
      ) : series.length < 2 ? (
        <div className="py-8 text-center text-sm text-(--color-fg-mute)">
          Flux FRED indisponible.
        </div>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block">
            {yTicks.map((t, i) => (
              <g key={i}>
                <line x1={padL} y1={t.y} x2={W - padR} y2={t.y} stroke="var(--color-border)" strokeWidth={0.5} />
                <text x={padL - 3} y={t.y} textAnchor="end" dominantBaseline="middle" fontSize={7} fill="var(--color-fg-mute)">
                  {t.label}
                </text>
              </g>
            ))}
            <path d={area} fill="var(--color-accent-2)" opacity={0.1} />
            <path d={path} fill="none" stroke="var(--color-accent-2)" strokeWidth={1.5} strokeLinejoin="round" />
          </svg>
          <p className="mt-1 text-[10px] text-(--color-fg-mute)">
            Bilan de la Fed moins la trésorerie du Treasury &amp; le reverse repo — la liquidité en dollars qui
            tend à précéder les actifs risqués.
          </p>
        </>
      )}
    </Panel>
  );
}
