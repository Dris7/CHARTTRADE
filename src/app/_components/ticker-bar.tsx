"use client";

import { api } from "~/trpc/react";
import { TICKER_BAR } from "~/server/services/symbols";
import { Arrow } from "~/app/_components/ui/delta";

const NAMES: Record<string, string> = {
  SPX: "S&P 500",
  ES: "ES1!",
  NQ: "NQ1!",
  DAX: "DAX",
  VIX: "VIX",
  ZN: "ZN1!",
  FGBL: "BUND",
  DXY: "DXY",
  GOLD: "GOLD",
  OIL: "WTI",
  BTC: "BTC",
};

export function TickerBar() {
  const { data, isLoading } = api.market.quotes.useQuery(
    { keys: [...TICKER_BAR] },
    { refetchInterval: 30_000, staleTime: 15_000 },
  );

  const items =
    data ??
    TICKER_BAR.map((k) => ({
      key: k,
      symbol: k,
      price: undefined,
      changePct: undefined,
    }));

  return (
    <div className="relative h-9 shrink-0 overflow-hidden border-b border-(--color-border) bg-(--color-panel)/80">
      <div className="absolute left-0 top-0 z-10 h-full w-16 bg-gradient-to-r from-(--color-bg) to-transparent" />
      <div className="absolute right-0 top-0 z-10 h-full w-16 bg-gradient-to-l from-(--color-bg) to-transparent" />
      <div className="marquee h-full whitespace-nowrap will-change-transform">
        <Row items={items} loading={isLoading} />
        <Row items={items} loading={isLoading} />
      </div>
    </div>
  );
}

function Row({
  items,
  loading,
}: {
  items: Array<{
    key: string;
    price?: number | null;
    changePct?: number | null;
  }>;
  loading: boolean;
}) {
  return (
    <div className="inline-flex h-9 items-center">
      {items.map((it) => {
        const pct = it.changePct ?? 0;
        const up = pct > 0;
        const down = pct < 0;
        return (
          <div
            key={it.key}
            className="flex h-9 items-center gap-2 border-r border-(--color-border)/60 px-4 text-xs"
          >
            <span className="font-medium tracking-wide text-(--color-fg-dim)">
              {NAMES[it.key] ?? it.key}
            </span>
            <span className="tabular text-(--color-fg)">
              {loading || it.price == null
                ? "—"
                : it.price >= 1000
                  ? it.price.toFixed(0)
                  : it.price.toFixed(2)}
            </span>
            <span
              className={`tabular text-[11px] ${
                up
                  ? "text-(--color-up)"
                  : down
                    ? "text-(--color-down)"
                    : "text-(--color-fg-mute)"
              }`}
            >
              <Arrow value={it.changePct} />{" "}
              {it.changePct == null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
