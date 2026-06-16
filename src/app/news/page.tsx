"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui/panel";
// Type-only import — the news service is server-only; pulling a runtime value
// from it into this Client Component would bundle "server-only" into the client.
import { type NewsCategory, type NewsImpact } from "~/server/services/news";

type FilterId = "all" | "critical" | "normal";

const CATEGORIES: NewsCategory[] = [
  "Bonds",
  "Commodities",
  "Crypto",
  "Equities",
  "Forex",
  "Indexes",
  "Macro",
  "Market Moving",
  "Elite",
  "Risk",
];

const FILTERS: Array<{ id: FilterId; label: string; dot?: string }> = [
  { id: "all", label: "Tout" },
  { id: "critical", label: "Critiques", dot: "bg-(--color-down)" },
  { id: "normal", label: "Normales", dot: "bg-(--color-accent)" },
];

export default function NewsPage() {
  const [filter, setFilter] = useState<FilterId>("all");
  const [cats, setCats] = useState<Set<NewsCategory>>(new Set());
  const [q, setQ] = useState("");

  const toggleCat = (c: NewsCategory) =>
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  // Client "now" for relative timestamps without a hydration mismatch.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  // Live tape — poll for fresh headlines.
  const { data, isLoading } = api.feeds.news.useQuery(undefined, {
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const counts = useMemo(() => {
    let critical = 0;
    for (const n of data ?? []) if (n.impact === "critical") critical++;
    return { all: data?.length ?? 0, critical, normal: (data?.length ?? 0) - critical };
  }, [data]);

  // Per-category counts for the chip badges.
  const catCounts = useMemo(() => {
    const m = new Map<NewsCategory, number>();
    for (const n of data ?? [])
      for (const c of n.categories) m.set(c, (m.get(c) ?? 0) + 1);
    return m;
  }, [data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? []).filter((n) => {
      if (filter !== "all" && n.impact !== filter) return false;
      if (cats.size && !n.categories.some((c) => cats.has(c))) return false;
      if (needle && !n.title.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [data, filter, cats, q]);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label">Fil d’actualité</div>
          <h1 className="display text-3xl">
            Le tape en direct ·{" "}
            <span className="text-(--color-fg-mute)">
              {FILTERS.find((f) => f.id === filter)?.label.toLowerCase()}
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-(--color-fg-mute)">
          <span
            className={`size-1.5 rounded-full ${
              (data?.length ?? 0) > 0 ? "bg-(--color-up)" : "bg-(--color-warn)"
            }`}
          />
          {(data?.length ?? 0) > 0
            ? "Flux FinancialJuice · temps réel"
            : "flux indisponible"}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-md border border-(--color-border) bg-(--color-panel)/60 p-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
              Impact
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {FILTERS.map((f) => (
                <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.dot && <span className={`size-1.5 rounded-full ${f.dot}`} />}
                  {f.label}
                  <span className="tabular text-(--color-fg-mute)">
                    {f.id === "all"
                      ? counts.all
                      : f.id === "critical"
                        ? counts.critical
                        : counts.normal}
                  </span>
                </Chip>
              ))}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 rounded-sm border border-(--color-border) bg-(--color-panel-2) px-2 py-1">
            <Search size={12} className="text-(--color-fg-mute)" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filtrer les titres…"
              className="w-44 bg-transparent text-xs text-(--color-fg) placeholder:text-(--color-fg-mute) focus:outline-none"
            />
            {q && (
              <button onClick={() => setQ("")} aria-label="effacer">
                <X size={12} className="text-(--color-fg-mute) hover:text-(--color-fg)" />
              </button>
            )}
          </div>
        </div>

        {/* Category chips (multi-select, OR semantics) */}
        <div className="flex flex-wrap items-center gap-2 border-t border-(--color-border) pt-3">
          <span className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
            Catégories
          </span>
          {cats.size > 0 && (
            <Chip active={false} onClick={() => setCats(new Set())}>
              <X size={11} /> Effacer
            </Chip>
          )}
          {CATEGORIES.map((c) => (
            <Chip key={c} active={cats.has(c)} onClick={() => toggleCat(c)}>
              {c}
              <span className="tabular text-(--color-fg-mute)">
                {catCounts.get(c) ?? 0}
              </span>
            </Chip>
          ))}
        </div>
      </div>

      <Panel noPad hint={isLoading ? "chargement…" : `${filtered.length} titres`}>
        <ul className="flex flex-col">
          {isLoading &&
            Array.from({ length: 12 }).map((_, i) => (
              <li
                key={i}
                className="h-11 animate-pulse border-b border-(--color-border)/40 bg-(--color-panel-2)/40"
              />
            ))}

          {!isLoading &&
            filtered.map((n) => <NewsRow key={n.id} n={n} now={now} />)}

          {!isLoading && filtered.length === 0 && (
            <li className="py-12 text-center text-sm text-(--color-fg-mute)">
              Aucun titre ne correspond à ce filtre.
            </li>
          )}
        </ul>
      </Panel>
    </div>
  );
}

function NewsRow({
  n,
  now,
}: {
  n: {
    title: string;
    url: string;
    source: string;
    ts: number;
    impact: NewsImpact;
    tag: string;
  };
  now: number | null;
}) {
  const critical = n.impact === "critical";
  return (
    <li
      className={`group border-b border-(--color-border)/40 transition ${
        critical ? "bg-(--color-down)/[0.06]" : ""
      } hover:bg-(--color-panel-2)/50`}
    >
      <a
        href={n.url}
        target="_blank"
        rel="noopener noreferrer"
        className="grid grid-cols-[52px_44px_1fr] items-center gap-3 px-3 py-2.5 text-xs"
      >
        {/* time + impact bar */}
        <div className="flex items-center gap-2">
          <span
            className={`h-7 w-0.5 rounded-full ${
              critical ? "bg-(--color-down)" : "bg-(--color-accent)"
            }`}
            aria-hidden
          />
          <span className="tabular text-(--color-fg-dim)" title={fmtFull(n.ts)}>
            {fmtTime(n.ts)}
          </span>
        </div>

        {/* topic chip */}
        <span
          className={`justify-self-start rounded-sm px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest ${
            critical
              ? "bg-(--color-down)/15 text-(--color-down)"
              : "bg-(--color-panel-2) text-(--color-fg-mute)"
          }`}
        >
          {n.tag}
        </span>

        {/* headline */}
        <div className="flex items-baseline gap-2">
          <span
            className={`min-w-0 ${critical ? "font-medium text-(--color-fg)" : "text-(--color-fg-dim)"} group-hover:text-(--color-fg)`}
          >
            {n.title}
          </span>
          <span className="tabular ml-auto shrink-0 text-[10px] text-(--color-fg-mute)">
            {now != null ? rel(n.ts, now) : ""}
          </span>
        </div>
      </a>
    </li>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[11px] transition ${
        active
          ? "border-(--color-border-strong) bg-(--color-panel-2) text-(--color-fg)"
          : "border-(--color-border) text-(--color-fg-mute) hover:text-(--color-fg-dim)"
      }`}
    >
      {children}
    </button>
  );
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtFull(ts: number): string {
  return new Date(ts).toLocaleString("fr-FR");
}
function rel(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return "à l’instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return `il y a ${d} j`;
}
