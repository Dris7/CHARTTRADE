"use client";

import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui/panel";
import { PerfHeatmap, type HeatItem } from "~/app/_components/ui/heatmap";
import { type SymbolKey } from "~/server/services/symbols";

const SET: Array<{ key: SymbolKey; label: string; sub: string }> = [
  { key: "SPX", label: "SPX", sub: "S&P 500" },
  { key: "NQ", label: "NQ", sub: "Nasdaq Fut" },
  { key: "DAX", label: "DAX", sub: "DE 40" },
  { key: "FGBL", label: "BUND", sub: "EU 10Y Fut" },
  { key: "ZN", label: "ZN", sub: "US 10Y Fut" },
  { key: "ZB", label: "ZB", sub: "US 30Y Fut" },
  { key: "VIX", label: "VIX", sub: "Vol" },
  { key: "DXY", label: "DXY", sub: "USD Idx" },
  { key: "GOLD", label: "GOLD", sub: "Spot" },
  { key: "OIL", label: "WTI", sub: "Crude" },
  { key: "BTC", label: "BTC", sub: "Crypto" },
];

export function CrossAssetHeatmap() {
  const { data, isLoading } = api.market.quotes.useQuery(
    { keys: SET.map((s) => s.key) },
    { refetchInterval: 30_000 },
  );

  const items: HeatItem[] = SET.map((s) => {
    const q = data?.find((d) => d.key === s.key);
    return {
      label: s.label,
      sub: s.sub,
      pct: q?.changePct ?? 0,
    };
  });

  return (
    <Panel title="Cross-Asset Today" hint="Δ vs clôture préc.">
      {isLoading ? (
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
          {SET.map((s) => (
            <div
              key={s.key}
              className="h-16 animate-pulse rounded-sm bg-(--color-panel-2)/60"
            />
          ))}
        </div>
      ) : (
        <PerfHeatmap items={items} />
      )}
    </Panel>
  );
}
