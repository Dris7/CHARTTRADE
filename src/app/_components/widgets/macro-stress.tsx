"use client";

import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui/panel";
import { Spark } from "~/app/_components/ui/spark";

export function MacroStress() {
  const { data, isLoading } = api.macro.indicators.useQuery(undefined, {
    staleTime: 30 * 60_000,
  });

  return (
    <Panel
      title="Macro Stress"
      hint={isLoading ? "chargement…" : "FRED · derniers relevés"}
      right={
        <span className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
          taux · vol · crédit · emploi
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-(--color-border) bg-(--color-border) sm:grid-cols-3 lg:grid-cols-5">
        {isLoading &&
          Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-[78px] animate-pulse bg-(--color-panel-2)/60" />
          ))}
        {(data ?? []).map((ind) => {
          // Tone: a "stress-up" indicator turns red when rising.
          const rising = (ind.change ?? 0) > 0;
          const stress = ind.invert ? rising : !rising;
          const changeTone =
            (ind.change ?? 0) === 0
              ? "text-(--color-fg-mute)"
              : stress
                ? "text-(--color-down)"
                : "text-(--color-up)";
          const sparkColor = stress
            ? "var(--color-down)"
            : "var(--color-up)";
          return (
            <div key={ind.key} className="flex flex-col gap-1 bg-(--color-panel) px-2.5 py-2">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
                  {ind.label}
                </span>
              </div>
              <div className="tabular flex items-baseline gap-1.5">
                <span className="text-sm font-semibold text-(--color-fg)">
                  {ind.display}
                </span>
                {ind.change != null && ind.change !== 0 && (
                  <span className={`tabular text-[10px] ${changeTone}`}>
                    {ind.changeDisplay}
                  </span>
                )}
              </div>
              <Spark data={ind.spark} width={110} height={20} stroke={sparkColor} />
              <span className="text-[9px] text-(--color-fg-mute)">{ind.fred}</span>
            </div>
          );
        })}
      </div>
      {!isLoading && (data?.length ?? 0) === 0 && (
        <div className="py-6 text-center text-sm text-(--color-fg-mute)">
          Flux FRED indisponible.
        </div>
      )}
    </Panel>
  );
}
