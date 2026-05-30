"use client";

import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui/panel";

// Maps a daily % change to a heat tone (5 buckets each side).
function heatTone(pct: number | null): string {
  if (pct == null) return "bg-(--color-panel-2) text-(--color-fg-mute)";
  if (pct >= 1.5) return "bg-(--color-up)/30 text-(--color-up)";
  if (pct >= 0.5) return "bg-(--color-up)/18 text-(--color-up)";
  if (pct > 0) return "bg-(--color-up)/8 text-(--color-up)";
  if (pct <= -1.5) return "bg-(--color-down)/30 text-(--color-down)";
  if (pct <= -0.5) return "bg-(--color-down)/18 text-(--color-down)";
  if (pct < 0) return "bg-(--color-down)/8 text-(--color-down)";
  return "bg-(--color-panel-2) text-(--color-fg-dim)";
}

export function SectorBoard() {
  const { data, isLoading } = api.market.sectors.useQuery(undefined, {
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const breadth = data?.breadth;

  return (
    <Panel
      title="Sector Heatmap"
      hint={isLoading ? "chargement…" : "secteurs S&P SPDR · quotidien"}
      right={
        breadth ? (
          <div className="flex items-center gap-3 text-[10px]">
            <BreadthPill label="&gt;50j" pct={breadth.above50Pct} />
            <BreadthPill label="&gt;200j" pct={breadth.above200Pct} />
          </div>
        ) : null
      }
    >
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
        {isLoading &&
          Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-sm bg-(--color-panel-2)/60" />
          ))}
        {(data?.sectors ?? []).map((s) => (
          <div
            key={s.ticker}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-sm px-1 py-2 ${heatTone(
              s.changePct,
            )}`}
            title={`${s.name}${s.above50 != null ? ` · ${s.above50 ? "au-dessus" : "en dessous"} 50j` : ""}`}
          >
            <span className="text-[11px] font-semibold">{s.ticker}</span>
            <span className="tabular text-[11px]">
              {s.changePct == null
                ? "—"
                : `${s.changePct >= 0 ? "+" : ""}${s.changePct.toFixed(2)}%`}
            </span>
            <span className="text-[8px] uppercase tracking-wide opacity-70">
              {s.name}
            </span>
          </div>
        ))}
      </div>
      {!isLoading && (data?.sectors.length ?? 0) === 0 && (
        <div className="py-6 text-center text-sm text-(--color-fg-mute)">
          Flux des secteurs indisponible.
        </div>
      )}
      {breadth && (
        <p className="mt-2 text-[10px] text-(--color-fg-mute)">
          Indicateur de largeur : {breadth.counted}/{breadth.total} secteurs avec un
          historique suffisant. {breadth.above50Pct.toFixed(0)}% au-dessus de leur MM 50j, {" "}
          {breadth.above200Pct.toFixed(0)}% au-dessus de la MM 200j.
        </p>
      )}
    </Panel>
  );
}

function BreadthPill({ label, pct }: { label: string; pct: number }) {
  const tone =
    pct >= 60
      ? "text-(--color-up)"
      : pct <= 40
        ? "text-(--color-down)"
        : "text-(--color-warn)";
  return (
    <span className="flex items-center gap-1">
      <span className="uppercase tracking-widest text-(--color-fg-mute)">{label}</span>
      <span className={`tabular font-semibold ${tone}`}>{pct.toFixed(0)}%</span>
    </span>
  );
}
