"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";

import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui/panel";

const IMPACT_COLOR = {
  high: "bg-(--color-down)",
  medium: "bg-(--color-warn)",
  low: "bg-(--color-fg-mute)",
} as const;

export function EventStrip() {
  const { data, isLoading } = api.calendar.upcoming.useQuery(
    { impact: ["high", "medium"], days: 14 },
    { staleTime: 5 * 60_000 },
  );

  return (
    <Panel
      title="Next 14 days"
      right={
        <Link
          href="/calendar"
          className="flex items-center gap-1 text-[11px] text-(--color-fg-dim) hover:text-(--color-fg)"
        >
          <CalendarDays size={12} />
          Full calendar
          <ArrowRight size={11} />
        </Link>
      }
    >
      <ul className="flex flex-col">
        {isLoading && (
          <li className="py-2 text-xs text-(--color-fg-mute)">loading…</li>
        )}
        {(data ?? []).slice(0, 6).map((e) => (
          <li
            key={e.id}
            className="flex items-center gap-3 border-b border-(--color-border)/40 py-2 last:border-0"
          >
            <span
              className={`size-1.5 rounded-full ${IMPACT_COLOR[e.impact]}`}
              aria-hidden
            />
            <div className="w-16 shrink-0">
              <div className="tabular text-[11px] text-(--color-fg)">
                {fmtDate(e.date)}
              </div>
              <div className="text-[10px] text-(--color-fg-mute)">
                {e.time || "—"} UTC
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs text-(--color-fg)">
                {e.title}
              </div>
              <div className="text-[10px] text-(--color-fg-mute)">
                {e.country} · {e.category}
                {e.forecast ? ` · fcst ${e.forecast}` : ""}
                {e.previous ? ` · prev ${e.previous}` : ""}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function fmtDate(d: string): string {
  const date = new Date(`${d}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
