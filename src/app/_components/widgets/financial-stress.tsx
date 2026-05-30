"use client";

import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui/panel";
import { Spark } from "~/app/_components/ui/spark";

const TONE: Record<string, string> = {
  Low: "text-(--color-up)",
  Normal: "text-(--color-up)",
  Elevated: "text-(--color-warn)",
  High: "text-(--color-down)",
};

export function FinancialStress() {
  const { data, isLoading } = api.macro.financialStress.useQuery(undefined, {
    staleTime: 30 * 60_000,
  });

  const v = data?.value ?? null;
  const cls = data?.classification ?? "Normal";
  // Map STLFSI4 (~ -1.5 … +5) onto a 0..100 fill, 0 anchored mid-low.
  const fill =
    v == null ? 0 : Math.max(0, Math.min(100, ((v + 2) / 7) * 100));

  return (
    <Panel
      title="Financial Stress"
      hint={isLoading ? "loading…" : data?.date ? `STLFSI4 · ${data.date}` : "feed unavailable"}
    >
      {isLoading ? (
        <div className="h-24 animate-pulse rounded-sm bg-(--color-panel-2)/60" />
      ) : v == null ? (
        <div className="py-6 text-center text-sm text-(--color-fg-mute)">
          FRED feed unavailable.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-end justify-between">
            <div>
              <div className={`tabular text-3xl font-bold ${TONE[cls]}`}>
                {v >= 0 ? "+" : ""}
                {v.toFixed(2)}
              </div>
              <div className={`text-[11px] uppercase tracking-widest ${TONE[cls]}`}>
                {cls} stress
              </div>
            </div>
            <Spark
              data={data?.spark ?? []}
              width={120}
              height={40}
              stroke={
                cls === "High"
                  ? "var(--color-down)"
                  : cls === "Elevated"
                    ? "var(--color-warn)"
                    : "var(--color-up)"
              }
            />
          </div>
          {/* gradient stress bar */}
          <div>
            <div
              className="relative h-2 overflow-hidden rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, var(--color-up), var(--color-warn), var(--color-down))",
              }}
            >
              <div
                className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 bg-(--color-fg)"
                style={{ left: `${fill}%`, boxShadow: "0 0 4px rgba(255,255,255,0.8)" }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-(--color-fg-mute)">
              <span>calm</span>
              <span>0 = avg</span>
              <span>crisis</span>
            </div>
          </div>
          <p className="text-[10px] text-(--color-fg-mute)">
            St. Louis Fed composite of 18 yield-spread, vol &amp; rate series. Positive =
            above-average market stress.
          </p>
        </div>
      )}
    </Panel>
  );
}
