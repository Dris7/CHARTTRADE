"use client";

export interface HeatItem {
  label: string;
  sub?: string;
  pct: number; // % change
  size?: number; // weight 1..3 to make tiles non-uniform
}

export function PerfHeatmap({ items }: { items: HeatItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((it) => {
        const intensity = Math.max(0, Math.min(1, Math.abs(it.pct) / 2));
        const bg =
          it.pct >= 0
            ? `rgba(33, 201, 123, ${0.08 + intensity * 0.4})`
            : `rgba(236, 77, 82, ${0.08 + intensity * 0.4})`;
        const border =
          it.pct >= 0
            ? `rgba(33, 201, 123, ${0.25 + intensity * 0.45})`
            : `rgba(236, 77, 82, ${0.25 + intensity * 0.45})`;
        return (
          <div
            key={it.label}
            className="relative flex flex-col justify-between rounded-sm p-2.5"
            style={{ background: bg, border: `1px solid ${border}` }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium tracking-wide text-(--color-fg)">
                {it.label}
              </span>
              {it.sub && (
                <span className="text-[10px] text-(--color-fg-mute)">
                  {it.sub}
                </span>
              )}
            </div>
            <div className="tabular pt-2 text-base font-semibold">
              {it.pct >= 0 ? "+" : ""}
              {it.pct.toFixed(2)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}
