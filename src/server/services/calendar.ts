import "server-only";

import { cfetch } from "~/server/services/http";

// Economic calendar. Primary source is ForexFactory's own calendar page, whose
// embedded `calendarComponentStates` blob carries actual / forecast / previous
// prints plus their better-or-worse flag. If the scrape is blocked we fall back
// to the free ForexFactory JSON mirror (faireconomy.media) — same events but
// without `actual` — and finally to a small curated seed so the page is never
// empty.

export type Impact = "high" | "medium" | "low" | "holiday";

export type Category =
  | "CPI"
  | "NFP"
  | "Rates"
  | "PMI"
  | "GDP"
  | "Retail"
  | "Jobs"
  | "Sentiment"
  | "Housing"
  | "Trade"
  | "Speech"
  | "Holiday"
  | "Other";

export interface EconEvent {
  id: string;
  ts: number; // event time, ms since epoch (UTC)
  date: string; // YYYY-MM-DD in UTC
  time: string; // HH:mm UTC, "" for all-day / holidays / tentative
  country: string; // currency / region code: USD, EUR, GBP, JPY, CHF, CAD…
  title: string;
  impact: Impact;
  category: Category;
  forecast?: string;
  previous?: string;
  actual?: string;
  /** ForexFactory's verdict on the actual vs forecast: 1 better, -1 worse, 0 neutral. */
  actualTrend?: -1 | 0 | 1;
  source: "forexfactory" | "seed";
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// --- in-process cache (L1; the fetch() data cache is the shared L2) ----------
let cache: { exp: number; events: EconEvent[] } | null = null;

function normImpact(raw: string | undefined): Impact {
  switch ((raw ?? "").toLowerCase()) {
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
      return "low";
    case "holiday":
    case "non-economic":
      return "holiday";
    default:
      return "low";
  }
}

function categorize(title: string, impact: Impact): Category {
  const t = title.toLowerCase();
  if (impact === "holiday") return "Holiday";
  if (/\bcpi|inflation|price index\b/.test(t)) return "CPI";
  if (/non-?farm|nfp/.test(t)) return "NFP";
  if (/rate (decision|statement)|interest rate|fomc|fed funds|bank rate|cash rate|policy rate/.test(t))
    return "Rates";
  if (/\bpmi\b|purchasing managers/.test(t)) return "PMI";
  if (/\bgdp\b|gross domestic/.test(t)) return "GDP";
  if (t.includes("retail sales")) return "Retail";
  if (/employment|jobless|unemployment|payroll|claims|labou?r/.test(t))
    return "Jobs";
  if (/sentiment|confidence|expectations|ifo|zew|ism/.test(t))
    return "Sentiment";
  if (/housing|building permits|home sales|mortgage/.test(t)) return "Housing";
  if (/trade balance|exports|imports|current account/.test(t)) return "Trade";
  if (/speaks|speech|press conference|testimony|member/.test(t))
    return "Speech";
  return "Other";
}

/** Treat empty / whitespace-only feed strings as absent. */
function blank(s: string | undefined): string | undefined {
  return s && s.trim() !== "" ? s : undefined;
}

// --- ForexFactory page scrape (rich: includes actuals) -----------------------

interface FfEvent {
  id?: number;
  name?: string;
  country?: string;
  currency?: string;
  dateline?: number; // unix seconds, exact event time
  impactName?: string;
  timeLabel?: string;
  timeMasked?: boolean;
  actual?: string;
  forecast?: string;
  previous?: string;
  actualBetterWorse?: number;
}
interface FfDay {
  events?: FfEvent[];
}

// Pull the JSON array that follows `days:` out of the embedded state blob.
// The blob is a JS object literal (unquoted top-level keys), but the `days`
// array itself is valid JSON, so we bracket-match it out and JSON.parse.
function extractDays(html: string): FfDay[] | null {
  const anchor = html.indexOf("calendarComponentStates");
  if (anchor === -1) return null;
  const daysKey = html.indexOf("days:", anchor);
  if (daysKey === -1) return null;
  const start = html.indexOf("[", daysKey);
  if (start === -1) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as FfDay[];
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// ForexFactory encodes its actual-vs-forecast verdict as 1 = better (green),
// 2 = worse (red), 0 = neutral. Normalize to a signed trend.
function trendOf(n: number | undefined): -1 | 0 | 1 | undefined {
  if (n === 1) return 1;
  if (n === 2) return -1;
  if (n === 0) return 0;
  return undefined;
}

function ffEventsToEcon(days: FfDay[]): EconEvent[] {
  const out: EconEvent[] = [];
  for (const d of days) {
    for (const e of d.events ?? []) {
      if (!e.name || !e.dateline) continue;
      const ts = e.dateline * 1000;
      const iso = new Date(ts).toISOString();
      const impact = normImpact(e.impactName);
      const allDay =
        impact === "holiday" ||
        e.timeMasked === true ||
        /day|tentative/i.test(e.timeLabel ?? "");
      const country = e.currency ?? e.country ?? "";
      out.push({
        id: `ff-${e.id ?? `${ts}-${e.name}`}`,
        ts,
        date: iso.slice(0, 10),
        time: allDay ? "" : iso.slice(11, 16),
        country,
        title: e.name,
        impact,
        category: categorize(e.name, impact),
        forecast: blank(e.forecast),
        previous: blank(e.previous),
        actual: blank(e.actual),
        actualTrend: blank(e.actual) ? trendOf(e.actualBetterWorse) : undefined,
        source: "forexfactory",
      });
    }
  }
  return out;
}

async function fetchFfWeek(week: "this" | "next"): Promise<EconEvent[]> {
  const url =
    week === "next"
      ? "https://www.forexfactory.com/calendar?week=next"
      : "https://www.forexfactory.com/calendar";
  try {
    const res = await cfetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      // The page only refreshes a few times an hour; cache it on the shared
      // Next.js data cache (Netlify Blobs on prod).
      revalidate: 900,
      timeoutMs: 9000,
    });
    if (!res.ok) throw new Error(`ff ${res.status}`);
    const html = await res.text();
    const days = extractDays(html);
    if (!days) throw new Error("ff: no parseable calendar state");
    return ffEventsToEcon(days);
  } catch (e) {
    console.warn(`[calendar] ff ${week} failed:`, (e as Error).message);
    return [];
  }
}

// --- faireconomy JSON mirror (fallback: no actuals) --------------------------

interface FfRow {
  title?: string;
  country?: string;
  date?: string;
  impact?: string;
  forecast?: string;
  previous?: string;
}

async function fetchMirror(): Promise<EconEvent[]> {
  const urls = [
    "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
    "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
  ];
  const batches = await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await cfetch(url, {
          headers: { "User-Agent": UA, Accept: "application/json,*/*" },
          revalidate: 1800,
          timeoutMs: 8000,
        });
        if (!res.ok) throw new Error(`mirror ${res.status}`);
        return (await res.json()) as FfRow[];
      } catch (e) {
        console.warn(`[calendar] mirror ${url} failed:`, (e as Error).message);
        return [];
      }
    }),
  );
  const out: EconEvent[] = [];
  for (const r of batches.flat()) {
    if (!r.title || !r.date || !r.country) continue;
    const ts = new Date(r.date).getTime();
    if (!Number.isFinite(ts)) continue;
    const impact = normImpact(r.impact);
    const iso = new Date(ts).toISOString();
    out.push({
      id: `mirror-${ts}-${r.country}-${slug(r.title)}`,
      ts,
      date: iso.slice(0, 10),
      time: impact === "holiday" ? "" : iso.slice(11, 16),
      country: r.country,
      title: r.title,
      impact,
      category: categorize(r.title, impact),
      forecast: blank(r.forecast),
      previous: blank(r.previous),
      source: "forexfactory",
    });
  }
  return out;
}

export async function getCalendar(): Promise<EconEvent[]> {
  if (cache && cache.exp > Date.now()) return cache.events;

  // Prefer the rich FF scrape (has actuals); fall back to the JSON mirror.
  const [thisWeek, nextWeek] = await Promise.all([
    fetchFfWeek("this"),
    fetchFfWeek("next"),
  ]);
  let events = [...thisWeek, ...nextWeek];

  if (events.length === 0) events = await fetchMirror();
  if (events.length === 0) events = seedEvents();

  // De-dupe and sort chronologically.
  const seen = new Set<string>();
  events = events
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((a, b) => a.ts - b.ts);

  cache = { exp: Date.now() + 15 * 60_000, events };
  return events;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32);
}

// --- curated fallback --------------------------------------------------------
// Used only when both live sources are unreachable.

function seedEvents(): EconEvent[] {
  const mk = (
    offsetDays: number,
    time: string,
    country: string,
    title: string,
    impact: Impact,
    forecast?: string,
    previous?: string,
  ): EconEvent => {
    const base = new Date();
    const d = new Date(
      Date.UTC(
        base.getUTCFullYear(),
        base.getUTCMonth(),
        base.getUTCDate() + offsetDays,
        Number(time.slice(0, 2)),
        Number(time.slice(3, 5)),
      ),
    );
    const ts = d.getTime();
    const iso = d.toISOString();
    return {
      id: `seed-${ts}-${slug(title)}`,
      ts,
      date: iso.slice(0, 10),
      time: impact === "holiday" ? "" : iso.slice(11, 16),
      country,
      title,
      impact,
      category: categorize(title, impact),
      forecast,
      previous,
      source: "seed",
    };
  };

  return [
    mk(2, "12:30", "USD", "US CPI y/y", "high", "3.1%", "3.2%"),
    mk(4, "12:30", "USD", "Non-Farm Payrolls", "high", "+180K", "+175K"),
    mk(6, "18:00", "USD", "FOMC Rate Decision", "high", "Hold", "Hold"),
    mk(7, "12:15", "EUR", "ECB Main Refinancing Rate", "high", "Hold", "Hold"),
    mk(9, "09:00", "EUR", "Eurozone CPI Flash y/y", "high", "2.4%", "2.5%"),
    mk(11, "13:45", "USD", "S&P Global Flash PMI", "medium", "52.0", "51.8"),
    mk(13, "12:30", "USD", "Retail Sales m/m", "medium", "0.3%", "0.4%"),
  ];
}
