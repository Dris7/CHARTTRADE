"use client";

import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui/panel";

const SOURCE_TONE: Record<string, string> = {
  Fed: "border-(--color-accent-2)/40 bg-(--color-accent-2)/10 text-(--color-accent-2)",
  ECB: "border-(--color-accent)/40 bg-(--color-accent)/10 text-(--color-accent)",
};

const TAG_TONE: Record<string, string> = {
  Rates: "text-(--color-down)",
  Minutes: "text-(--color-warn)",
  Speech: "text-(--color-fg-dim)",
  Outlook: "text-(--color-accent)",
  Press: "text-(--color-fg-mute)",
};

export function CentralBankWatch() {
  const { data, isLoading } = api.feeds.centralBanks.useQuery(undefined, {
    staleTime: 15 * 60_000,
  });

  return (
    <Panel
      title="Central Bank Watch"
      hint={isLoading ? "chargement…" : "communiqués Fed · ECB"}
    >
      <ul className="flex flex-col">
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="py-2">
              <div className="h-3 w-3/4 animate-pulse rounded bg-(--color-panel-2)" />
            </li>
          ))}
        {(data ?? []).slice(0, 10).map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-2 border-b border-(--color-border)/40 py-2 last:border-0"
          >
            <span
              className={`mt-0.5 shrink-0 rounded-sm border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest ${
                SOURCE_TONE[item.source] ?? ""
              }`}
            >
              {item.source}
            </span>
            <div className="min-w-0 flex-1">
              <a
                href={item.url}
                target="_blank"
                rel="noopener"
                className="line-clamp-2 text-xs text-(--color-fg) hover:text-(--color-accent)"
              >
                {item.title}
              </a>
              <div className="mt-0.5 flex items-center gap-2 text-[10px]">
                <span
                  className={`uppercase tracking-widest ${TAG_TONE[item.tag] ?? "text-(--color-fg-mute)"}`}
                >
                  {item.tag}
                </span>
                <span className="text-(--color-fg-mute)">{fmtAgo(item.ts)}</span>
              </div>
            </div>
          </li>
        ))}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <li className="py-6 text-center text-sm text-(--color-fg-mute)">
            Flux des banques centrales indisponibles.
          </li>
        )}
      </ul>
    </Panel>
  );
}

function fmtAgo(ts: number): string {
  const diff = Date.now() - ts;
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "à l'instant";
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}
