"use client";

import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui/panel";

export function PredictionMarkets() {
  const { data, isLoading } = api.feeds.predictions.useQuery(undefined, {
    staleTime: 10 * 60_000,
  });

  return (
    <Panel
      title="Prediction Markets"
      hint={isLoading ? "loading…" : "Polymarket · macro"}
      right={
        <span className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
          implied odds
        </span>
      }
    >
      <ul className="flex flex-col gap-2.5">
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="h-10 animate-pulse rounded-sm bg-(--color-panel-2)/60" />
          ))}
        {(data ?? []).map((p) => {
          const lean =
            p.prob >= 65
              ? "text-(--color-up)"
              : p.prob <= 35
                ? "text-(--color-down)"
                : "text-(--color-warn)";
          return (
            <li key={p.id} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener"
                  className="truncate text-xs text-(--color-fg) hover:text-(--color-accent)"
                >
                  {p.title}
                </a>
                <span className={`tabular shrink-0 text-xs font-semibold ${lean}`}>
                  {p.prob.toFixed(0)}%
                </span>
              </div>
              <div className="relative h-1.5 overflow-hidden rounded-full bg-(--color-panel-2)">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full ${
                    p.prob >= 50 ? "bg-(--color-up)/70" : "bg-(--color-down)/70"
                  }`}
                  style={{ width: `${Math.max(2, Math.min(100, p.prob))}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[9px] text-(--color-fg-mute)">
                <span className="truncate">{p.outcomeLabel}</span>
                <span className="tabular shrink-0">
                  ${fmtVol(p.volume)} vol{p.endDate ? ` · ${p.endDate}` : ""}
                </span>
              </div>
            </li>
          );
        })}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <li className="py-6 text-center text-sm text-(--color-fg-mute)">
            Prediction feed unavailable.
          </li>
        )}
      </ul>
    </Panel>
  );
}

function fmtVol(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return `${Math.round(v)}`;
}
