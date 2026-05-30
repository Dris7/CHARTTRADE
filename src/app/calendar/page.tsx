"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui/panel";
import { type Impact } from "~/server/api/routers/calendar";

const IMPACTS: Impact[] = ["high", "medium", "low", "holiday"];

const IMPACT_META: Record<Impact, { color: string; label: string }> = {
  high: { color: "bg-(--color-down)", label: "Élevé" },
  medium: { color: "bg-(--color-warn)", label: "Moyen" },
  low: { color: "bg-(--color-fg-mute)", label: "Faible" },
  holiday: { color: "bg-(--color-accent-2)", label: "Férié" },
};

const FLAG: Record<string, string> = {
  USD: "🇺🇸",
  EUR: "🇪🇺",
  GBP: "🇬🇧",
  JPY: "🇯🇵",
  CHF: "🇨🇭",
  CAD: "🇨🇦",
  AUD: "🇦🇺",
  NZD: "🇳🇿",
  CNY: "🇨🇳",
};

const RANGES = [
  { id: "today", label: "Aujourd’hui", days: 1 },
  { id: "week", label: "Cette semaine", days: 7 },
  { id: "2w", label: "14j", days: 14 },
  { id: "month", label: "30j", days: 30 },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

export default function CalendarPage() {
  const [impacts, setImpacts] = useState<Set<Impact>>(
    new Set<Impact>(["high", "medium"]),
  );
  const [rangeId, setRangeId] = useState<RangeId>("week");
  const [countries, setCountries] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  // A client-side "now" so we can dim past events without hydration mismatch.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  // Fetch the full forward window once; all filtering is instant + client-side.
  const { data, isLoading } = api.calendar.upcoming.useQuery(
    { days: 30 },
    { staleTime: 5 * 60_000 },
  );

  const rangeDays = RANGES.find((r) => r.id === rangeId)?.days ?? 7;

  // Countries present in the dataset, ranked by frequency, for the filter row.
  const countryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of data ?? [])
      counts.set(e.country, (counts.get(e.country) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c);
  }, [data]);

  // Event types present in the dataset, for the Type filter row.
  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of data ?? [])
      counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c);
  }, [data]);

  const filtered = useMemo(() => {
    const cutoffEnd =
      (now ?? Date.now()) + rangeDays * 86_400_000 + 0; // forward window
    const startOfToday = startOfUtcDay(now ?? Date.now());
    const needle = q.trim().toLowerCase();
    return (data ?? []).filter((e) => {
      if (e.ts < startOfToday || e.ts > cutoffEnd) return false;
      if (!impacts.has(e.impact)) return false;
      if (countries.size && !countries.has(e.country)) return false;
      if (categories.size && !categories.has(e.category)) return false;
      if (needle && !e.title.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [data, impacts, countries, categories, q, rangeDays, now]);

  // The free ForexFactory feed only carries forecast/previous for upcoming
  // events — no "actual". Only surface the column if a source ever provides it.
  const hasActuals = useMemo(() => filtered.some((e) => e.actual), [filtered]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const e of filtered) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
  }, [filtered]);

  const todayStr = useMemo(
    () => new Date(startOfUtcDay(now ?? Date.now())).toISOString().slice(0, 10),
    [now],
  );

  const toggleImpact = (i: Impact) => {
    setImpacts((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };
  const toggleCountry = (c: string) => {
    setCountries((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };
  const toggleCategory = (c: string) => {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const live = (data ?? [])[0]?.source === "forexfactory";

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label">Calendrier économique</div>
          <h1 className="display text-3xl">
            Catalyseurs à venir ·{" "}
            <span className="text-(--color-fg-mute)">
              {RANGES.find((r) => r.id === rangeId)?.label.toLowerCase()}
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-(--color-fg-mute)">
          <span
            className={`size-1.5 rounded-full ${live ? "bg-(--color-up)" : "bg-(--color-warn)"}`}
          />
          {live ? "Flux ForexFactory · UTC" : "données de secours · UTC"}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-md border border-(--color-border) bg-(--color-panel)/60 p-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          {/* Range */}
          <FilterCluster label="Période">
            {RANGES.map((r) => (
              <Chip
                key={r.id}
                active={rangeId === r.id}
                onClick={() => setRangeId(r.id)}
              >
                {r.label}
              </Chip>
            ))}
          </FilterCluster>

          {/* Impact */}
          <FilterCluster label="Impact">
            {IMPACTS.map((i) => (
              <Chip key={i} active={impacts.has(i)} onClick={() => toggleImpact(i)}>
                <span className={`size-1.5 rounded-full ${IMPACT_META[i].color}`} />
                {IMPACT_META[i].label}
              </Chip>
            ))}
          </FilterCluster>

          {/* Search */}
          <div className="ml-auto flex items-center gap-2 rounded-sm border border-(--color-border) bg-(--color-panel-2) px-2 py-1">
            <Search size={12} className="text-(--color-fg-mute)" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher des événements…"
              className="w-40 bg-transparent text-xs text-(--color-fg) placeholder:text-(--color-fg-mute) focus:outline-none"
            />
            {q && (
              <button onClick={() => setQ("")} aria-label="effacer la recherche">
                <X size={12} className="text-(--color-fg-mute) hover:text-(--color-fg)" />
              </button>
            )}
          </div>
        </div>

        {/* Country chips */}
        {countryOptions.length > 0 && (
          <FilterCluster label="Région">
            {countries.size > 0 && (
              <Chip active={false} onClick={() => setCountries(new Set())}>
                <X size={11} /> Effacer
              </Chip>
            )}
            {countryOptions.map((c) => (
              <Chip
                key={c}
                active={countries.has(c)}
                onClick={() => toggleCountry(c)}
              >
                <span aria-hidden>{FLAG[c] ?? "🌐"}</span>
                {c}
              </Chip>
            ))}
          </FilterCluster>
        )}

        {/* Event-type chips */}
        {categoryOptions.length > 0 && (
          <FilterCluster label="Type">
            {categories.size > 0 && (
              <Chip active={false} onClick={() => setCategories(new Set())}>
                <X size={11} /> Effacer
              </Chip>
            )}
            {categoryOptions.map((c) => (
              <Chip
                key={c}
                active={categories.has(c)}
                onClick={() => toggleCategory(c)}
              >
                {c}
              </Chip>
            ))}
          </FilterCluster>
        )}
      </div>

      <Panel
        noPad
        hint={isLoading ? "chargement…" : `${filtered.length} événements`}
      >
        <div className="flex flex-col">
          {grouped.map(([date, events]) => (
            <div key={date}>
              <div className="sticky top-0 z-10 flex items-baseline gap-3 border-y border-(--color-border) bg-(--color-panel-2)/90 px-3 py-1.5 backdrop-blur-sm">
                <span className="display text-base">{fmtLongDate(date)}</span>
                <span className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
                  {fmtDow(date)}
                </span>
                {date === todayStr && (
                  <span className="rounded-sm bg-(--color-accent)/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-(--color-accent)">
                    Aujourd’hui
                  </span>
                )}
                <span className="ml-auto text-[10px] text-(--color-fg-mute)">
                  {events.length}
                </span>
              </div>
              <ul>
                {events.map((e) => (
                  <EventRow
                    key={e.id}
                    e={e}
                    showActual={hasActuals}
                    past={now != null && e.ts < now && e.time !== ""}
                  />
                ))}
              </ul>
            </div>
          ))}
          {!isLoading && grouped.length === 0 && (
            <div className="py-12 text-center text-sm text-(--color-fg-mute)">
              Aucun événement ne correspond à ces filtres.
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function EventRow({
  e,
  past,
  showActual,
}: {
  e: {
    id: string;
    time: string;
    country: string;
    title: string;
    impact: Impact;
    category: string;
    forecast?: string;
    previous?: string;
    actual?: string;
    actualTrend?: -1 | 0 | 1;
  };
  past: boolean;
  showActual: boolean;
}) {
  return (
    <li
      className={`grid grid-cols-[58px_72px_1fr_auto] items-center gap-3 border-b border-(--color-border)/40 px-3 py-2 text-xs transition hover:bg-(--color-panel-2)/40 ${
        past ? "opacity-45" : ""
      }`}
    >
      {/* time + impact bar */}
      <div className="flex items-center gap-2">
        <span
          className={`h-7 w-0.5 rounded-full ${IMPACT_META[e.impact].color}`}
          aria-hidden
        />
        <span className="tabular text-(--color-fg)">
          {e.time || "Toute la journée"}
        </span>
      </div>

      {/* region */}
      <div className="flex items-center gap-1.5 text-(--color-fg-dim)">
        <span aria-hidden>{FLAG[e.country] ?? "🌐"}</span>
        <span className="text-[11px]">{e.country}</span>
      </div>

      {/* title + category */}
      <div className="min-w-0">
        <div className="truncate text-(--color-fg)">{e.title}</div>
        <div className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
          {e.category}
        </div>
      </div>

      {/* actual (only when a source provides it) / forecast / previous */}
      <div className="tabular flex shrink-0 items-center gap-4 text-right text-[11px]">
        {showActual && (
          <Stat label="réel" value={e.actual} tone={trendTone(e.actualTrend)} />
        )}
        <Stat label="prév" value={e.forecast} />
        <Stat label="préc" value={e.previous} muted />
      </div>
    </li>
  );
}

function Stat({
  label,
  value,
  muted,
  tone,
}: {
  label: string;
  value?: string;
  muted?: boolean;
  tone?: string;
}) {
  return (
    <div className="w-14">
      <div className="text-[9px] uppercase tracking-widest text-(--color-fg-mute)">
        {label}
      </div>
      <div
        className={
          tone ??
          (value
            ? muted
              ? "text-(--color-fg-mute)"
              : "text-(--color-fg)"
            : "text-(--color-fg-mute)")
        }
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

function FilterCluster({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
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

// Color the actual print using ForexFactory's own better/worse verdict.
function trendTone(trend?: -1 | 0 | 1): string {
  if (trend === 1) return "text-(--color-up)";
  if (trend === -1) return "text-(--color-down)";
  return "text-(--color-fg)";
}

function startOfUtcDay(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function fmtLongDate(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("fr-FR", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
function fmtDow(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    timeZone: "UTC",
  });
}
