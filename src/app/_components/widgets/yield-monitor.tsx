"use client";

import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui/panel";
import { Delta } from "~/app/_components/ui/delta";

export function YieldMonitor({ compact = false }: { compact?: boolean }) {
  const { data, isLoading } = api.macro.yields.useQuery(undefined, {
    refetchInterval: 120_000,
  });

  const rows = data ?? [];

  return (
    <Panel
      title="Yield Monitor"
      hint="FRED · daily close"
      noPad
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
            <tr className="border-b border-(--color-border)">
              <th className="px-3 py-2 text-left font-medium">Tenor</th>
              <th className="px-3 py-2 text-right font-medium">Last</th>
              <th className="px-3 py-2 text-right font-medium">1d</th>
              <th className="px-3 py-2 text-right font-medium">1w</th>
              {!compact && (
                <th className="px-3 py-2 text-right font-medium">1m</th>
              )}
            </tr>
          </thead>
          <tbody className="tabular">
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-(--color-fg-mute)">
                  loading…
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.key}
                className="border-b border-(--color-border)/40 last:border-0 hover:bg-(--color-panel-2)/50"
              >
                <td className="px-3 py-1.5 text-(--color-fg)">{r.label}</td>
                <td className="px-3 py-1.5 text-right">
                  {r.value == null ? "—" : `${r.value.toFixed(2)}%`}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <Delta
                    value={r.change1d == null ? null : r.change1d * 100}
                    unit="bp"
                    digits={1}
                  />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <Delta
                    value={r.change1w == null ? null : r.change1w * 100}
                    unit="bp"
                    digits={1}
                  />
                </td>
                {!compact && (
                  <td className="px-3 py-1.5 text-right">
                    <Delta
                      value={r.change1m == null ? null : r.change1m * 100}
                      unit="bp"
                      digits={1}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
