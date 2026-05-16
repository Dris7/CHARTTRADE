"use client";

import { useMemo, useState } from "react";

import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui/panel";

const IMPACTS = ["high", "medium", "low"] as const;
type Impact = (typeof IMPACTS)[number];

const IMPACT_COLOR: Record<Impact, string> = {
  high: "bg-(--color-down)",
  medium: "bg-(--color-warn)",
  low: "bg-(--color-fg-mute)",
};

const FLAG: Record<string, string> = {
  US: "🇺🇸",
  EU: "🇪🇺",
  DE: "🇩🇪",
  UK: "🇬🇧",
  JP: "🇯🇵",
  GLOBAL: "🌍",
};

export default function CalendarPage() {
  const [impacts, setImpacts] = useState<Set<Impact>>(
    new Set(["high", "medium"]),
  );
  const [days, setDays] = useState<number>(45);

  const { data, isLoading } = api.calendar.upcoming.useQuery({
    impact: Array.from(impacts) as Impact[],
    days,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, typeof data>();
    for (const e of data ?? []) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
  }, [data]);

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label">Smart Calendar</div>
          <h1 className="display text-3xl">
            Catalysts ahead ·{" "}
            <span className="text-(--color-fg-mute)">next {days}d</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {IMPACTS.map((i) => (
            <button
              key={i}
              onClick={() => {
                const next = new Set(impacts);
                if (next.has(i)) next.delete(i);
                else next.add(i);
                setImpacts(next);
              }}
              className={`flex items-center gap-1.5 rounded-sm border px-2 py-1 transition ${
                impacts.has(i)
                  ? "border-(--color-border-strong) bg-(--color-panel-2) text-(--color-fg)"
                  : "border-(--color-border) text-(--color-fg-mute)"
              }`}
            >
              <span className={`size-1.5 rounded-full ${IMPACT_COLOR[i]}`} />
              <span className="capitalize">{i}</span>
            </button>
          ))}
          <div className="mx-2 h-5 w-px bg-(--color-border)" />
          {[14, 30, 45, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-sm border px-2 py-1 transition ${
                days === d
                  ? "border-(--color-border-strong) bg-(--color-panel-2) text-(--color-fg)"
                  : "border-(--color-border) text-(--color-fg-mute)"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <Panel hint={isLoading ? "loading…" : `${data?.length ?? 0} events`}>
        <div className="flex flex-col gap-6">
          {grouped.map(([date, events]) => (
            <div key={date}>
              <div className="sticky top-0 mb-2 flex items-baseline gap-3 border-b border-(--color-border) pb-1">
                <span className="display text-xl">{fmtLongDate(date)}</span>
                <span className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
                  {fmtDow(date)}
                </span>
              </div>
              <ul className="flex flex-col divide-y divide-(--color-border)/40">
                {(events ?? []).map((e) => (
                  <li
                    key={e.id}
                    className="grid grid-cols-[80px_60px_1fr_120px] items-start gap-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`size-1.5 rounded-full ${IMPACT_COLOR[e.impact]}`}
                      />
                      <span className="tabular text-(--color-fg)">
                        {e.time || "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-(--color-fg-dim)">
                      <span aria-hidden>{FLAG[e.country] ?? "·"}</span>
                      <span className="text-[11px]">{e.country}</span>
                    </div>
                    <div>
                      <div className="text-(--color-fg)">{e.title}</div>
                      {e.notes && (
                        <div className="pt-0.5 text-[11px] text-(--color-fg-mute)">
                          {e.notes}
                        </div>
                      )}
                    </div>
                    <div className="tabular text-right text-[11px] text-(--color-fg-dim)">
                      {e.forecast && (
                        <div>
                          fcst <span className="text-(--color-fg)">{e.forecast}</span>
                        </div>
                      )}
                      {e.previous && (
                        <div>
                          prev <span className="text-(--color-fg-mute)">{e.previous}</span>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!isLoading && grouped.length === 0 && (
            <div className="py-8 text-center text-sm text-(--color-fg-mute)">
              No events for the selected filters.
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function fmtLongDate(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
function fmtDow(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
}
