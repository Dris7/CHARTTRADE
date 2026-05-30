"use client";

import { useMemo } from "react";

import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui/panel";
import { Spark } from "~/app/_components/ui/spark";

function corrTone(c: number | null): string {
  if (c == null) return "text-(--color-fg-mute)";
  if (c >= 0.4) return "text-(--color-up)";
  if (c <= -0.4) return "text-(--color-down)";
  return "text-(--color-warn)";
}

export function CrossAssetCorr() {
  const { data, isLoading } = api.market.crossAsset.useQuery(undefined, {
    staleTime: 30 * 60_000,
  });

  const sb = data?.stockBond;
  const cg = data?.copperGold;

  // stock-bond corr line geometry
  const W = 240;
  const H = 64;
  const sbPath = useMemo(() => {
    const s = sb?.series ?? [];
    if (s.length < 2) return { path: "", zeroY: 0 };
    const min = Math.min(-1, ...s);
    const max = Math.max(1, ...s);
    const range = max - min || 1;
    const y = (v: number) => 4 + (1 - (v - min) / range) * (H - 8);
    const x = (i: number) => (i / (s.length - 1)) * W;
    return {
      path: s.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" "),
      zeroY: y(0),
    };
  }, [sb]);

  return (
    <Panel
      title="Cross-Asset Correlations"
      hint={isLoading ? "chargement…" : "glissant 60j"}
      right={
        <span className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
          régime de corrélations
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
        {/* Left: stock-bond corr hero + copper/gold */}
        <div className="flex flex-col gap-3">
          <div className="rounded-sm border border-(--color-border) bg-(--color-panel-2)/40 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
                Stock ↔ Bond
              </span>
              <span className={`tabular text-lg font-bold ${corrTone(sb?.current ?? null)}`}>
                {sb?.current == null ? "—" : sb.current.toFixed(2)}
              </span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="mt-1 block">
              <line x1={0} y1={sbPath.zeroY} x2={W} y2={sbPath.zeroY} stroke="var(--color-border-strong)" strokeWidth={0.5} />
              <path d={sbPath.path} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} strokeLinejoin="round" />
            </svg>
            <p className="text-[10px] text-(--color-fg-mute)">{sb?.note}</p>
          </div>

          <div className="flex items-center justify-between rounded-sm border border-(--color-border) bg-(--color-panel-2)/40 px-3 py-2">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
                Copper / Gold
              </div>
              <div className="text-[9px] text-(--color-fg-mute)">ratio croissance ↔ peur</div>
            </div>
            <div className="flex items-center gap-2">
              <Spark data={cg?.series ?? []} width={70} height={24} />
              <div className="text-right">
                <div className="tabular text-sm font-semibold text-(--color-fg)">
                  {cg?.current == null ? "—" : cg.current.toFixed(1)}
                </div>
                {cg?.change1m != null && (
                  <div
                    className={`tabular text-[10px] ${
                      cg.change1m >= 0 ? "text-(--color-up)" : "text-(--color-down)"
                    }`}
                  >
                    {cg.change1m >= 0 ? "+" : ""}
                    {cg.change1m.toFixed(1)}%/mois
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: pair correlation rows */}
        <ul className="flex flex-col divide-y divide-(--color-border)/40">
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="py-2">
                <div className="h-4 animate-pulse rounded bg-(--color-panel-2)" />
              </li>
            ))}
          {(data?.pairs ?? []).map((p) => (
            <li key={p.label} className="grid grid-cols-[1fr_70px_44px] items-center gap-2 py-2 text-[11px]">
              <div className="min-w-0">
                <div className="truncate text-(--color-fg)">{p.label}</div>
                <div className="text-[9px] text-(--color-fg-mute)">{p.sub}</div>
              </div>
              <Spark
                data={p.spark}
                width={70}
                height={18}
                stroke={
                  (p.corr ?? 0) >= 0 ? "var(--color-up)" : "var(--color-down)"
                }
              />
              <span className={`tabular text-right font-semibold ${corrTone(p.corr)}`}>
                {p.corr == null ? "—" : p.corr.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {!isLoading && !data && (
        <div className="py-6 text-center text-sm text-(--color-fg-mute)">
          Flux de corrélation indisponible.
        </div>
      )}
    </Panel>
  );
}
