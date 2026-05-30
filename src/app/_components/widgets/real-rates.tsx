"use client";

import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui/panel";
import { Spark } from "~/app/_components/ui/spark";

const VOL_TONE: Record<string, string> = {
  Low: "border-(--color-up)/40 bg-(--color-up)/10 text-(--color-up)",
  Normal: "border-(--color-up)/40 bg-(--color-up)/10 text-(--color-up)",
  Elevated: "border-(--color-warn)/40 bg-(--color-warn)/10 text-(--color-warn)",
  High: "border-(--color-down)/40 bg-(--color-down)/10 text-(--color-down)",
};

export function RealRates() {
  const rr = api.macro.realRates.useQuery(undefined, { staleTime: 30 * 60_000 });
  const rv = api.macro.rateVol.useQuery(undefined, { staleTime: 30 * 60_000 });

  const isLoading = rr.isLoading;
  const vol = rv.data;

  return (
    <Panel
      title="Real Rates & Inflation"
      hint={isLoading ? "chargement…" : "FRED · TIPS & points morts"}
      right={
        vol?.value != null ? (
          <span
            className={`tabular rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${
              VOL_TONE[vol.classification] ?? ""
            }`}
            title={`Vol réalisée 10Y — ${vol.percentile?.toFixed(0)}e percentile (proxy MOVE)`}
          >
            Rate Vol {vol.value.toFixed(0)}bp · {vol.classification}
          </span>
        ) : null
      }
    >
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-(--color-border) bg-(--color-border) sm:grid-cols-4">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[76px] animate-pulse bg-(--color-panel-2)/60" />
          ))}
        {(rr.data ?? []).map((r) => {
          const rising = (r.change ?? 0) > 0;
          const tone =
            (r.change ?? 0) === 0
              ? "text-(--color-fg-mute)"
              : rising
                ? "text-(--color-up)"
                : "text-(--color-down)";
          return (
            <div key={r.key} className="flex flex-col gap-1 bg-(--color-panel) px-2.5 py-2">
              <span className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
                {r.label}
              </span>
              <div className="tabular flex items-baseline gap-1.5">
                <span className="text-sm font-semibold text-(--color-fg)">
                  {r.value == null ? "—" : `${r.value.toFixed(2)}%`}
                </span>
                {r.change != null && r.change !== 0 && (
                  <span className={`tabular text-[10px] ${tone}`}>
                    {r.change >= 0 ? "+" : ""}
                    {(r.change * 100).toFixed(0)}bp
                  </span>
                )}
              </div>
              <Spark
                data={r.spark}
                width={104}
                height={18}
                stroke={rising ? "var(--color-up)" : "var(--color-down)"}
              />
              <span className="text-[9px] text-(--color-fg-mute)">{r.fred}</span>
            </div>
          );
        })}
      </div>
      {!isLoading && (rr.data?.length ?? 0) === 0 && (
        <div className="py-6 text-center text-sm text-(--color-fg-mute)">
          Flux FRED indisponible.
        </div>
      )}
    </Panel>
  );
}
