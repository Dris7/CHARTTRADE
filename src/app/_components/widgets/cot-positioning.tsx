"use client";

import { useMemo } from "react";

import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui/panel";

const GROUP_LABEL: Record<string, string> = {
  rates: "Rates",
  equity: "Equity Index",
  fx: "FX",
  metals: "Metals",
  energy: "Energy",
};
const GROUP_ORDER = ["rates", "equity", "fx", "metals", "energy"];

export function CotPositioning() {
  const { data, isLoading } = api.macro.cotPositioning.useQuery(undefined, {
    staleTime: 30 * 60_000,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, typeof data>();
    for (const r of data ?? []) {
      const arr = map.get(r.group) ?? [];
      arr.push(r);
      map.set(r.group, arr);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map(
      (g) => [g, map.get(g)!] as const,
    );
  }, [data]);

  const reportDate = data?.[0]?.reportDate;

  return (
    <Panel
      title="CFTC Positioning"
      hint={
        isLoading
          ? "loading…"
          : reportDate
            ? `COT · report ${reportDate}`
            : "feed unavailable"
      }
      right={
        <span className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
          smart money · net %
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        {grouped.map(([group, rows]) => (
          <div key={group}>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
                {GROUP_LABEL[group]}
              </span>
              <span className="text-[9px] text-(--color-fg-mute)">
                {group === "metals" || group === "energy"
                  ? "managed money"
                  : "asset managers"}
              </span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {(rows ?? []).map((r) => (
                <PosBar key={r.code} row={r} />
              ))}
            </ul>
          </div>
        ))}

        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-6 animate-pulse rounded-sm bg-(--color-panel-2)/60"
            />
          ))}

        {!isLoading && grouped.length === 0 && (
          <div className="py-6 text-center text-sm text-(--color-fg-mute)">
            COT feed unavailable.
          </div>
        )}
      </div>
    </Panel>
  );
}

function PosBar({
  row,
}: {
  row: {
    label: string;
    symbol: string;
    assetMgrNetPct: number;
    levMoneyNetPct: number | null;
    netChange1w: number | null;
  };
}) {
  const net = row.assetMgrNetPct;
  const long = net >= 0;
  // Bar fills from the centre outward; |net| sets width of each half (max 50%).
  const half = Math.min(50, Math.abs(net) / 2);

  return (
    <li className="grid grid-cols-[110px_1fr_84px] items-center gap-2 text-[11px]">
      <div className="flex items-baseline gap-1.5">
        <span className="text-(--color-fg)">{row.label}</span>
        <span className="text-[9px] text-(--color-fg-mute)">{row.symbol}</span>
      </div>

      {/* diverging bar from centre */}
      <div className="relative h-4 overflow-hidden rounded-sm bg-(--color-panel-2)">
        <div className="absolute inset-y-0 left-1/2 w-px bg-(--color-border-strong)" />
        {long ? (
          <div
            className="absolute inset-y-0 left-1/2 bg-(--color-up)/70"
            style={{ width: `${half}%` }}
          />
        ) : (
          <div
            className="absolute inset-y-0 bg-(--color-down)/70"
            style={{ right: "50%", width: `${half}%` }}
          />
        )}
        {/* leveraged-funds tick (financials only) */}
        {row.levMoneyNetPct != null && (
          <div
            className="absolute inset-y-0 w-0.5 bg-(--color-accent)"
            style={{
              left: `${50 + Math.max(-50, Math.min(50, row.levMoneyNetPct / 2))}%`,
            }}
            title={`Leveraged funds: ${fmtPct(row.levMoneyNetPct)}`}
          />
        )}
      </div>

      <div className="flex items-baseline justify-end gap-1.5">
        <span
          className={`tabular font-semibold ${
            long ? "text-(--color-up)" : "text-(--color-down)"
          }`}
        >
          {fmtPct(net)}
        </span>
        {row.netChange1w != null && row.netChange1w !== 0 && (
          <span
            className={`tabular text-[9px] ${
              row.netChange1w > 0
                ? "text-(--color-up)/70"
                : "text-(--color-down)/70"
            }`}
            title="Week-over-week change in net contracts"
          >
            {row.netChange1w > 0 ? "▲" : "▼"}
          </span>
        )}
      </div>
    </li>
  );
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`;
}
