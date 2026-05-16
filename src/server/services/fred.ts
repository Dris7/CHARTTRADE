import "server-only";

// FRED (St. Louis Fed) — the most reliable free macro data source.
// The `fredgraph.csv` endpoint requires NO API key. We use it for yields,
// VIX history, USD index, gold, oil.

export interface YieldPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export const YIELD_SERIES = {
  US2Y: { fred: "DGS2", label: "US 2Y", source: "fred" },
  US5Y: { fred: "DGS5", label: "US 5Y", source: "fred" },
  US10Y: { fred: "DGS10", label: "US 10Y", source: "fred" },
  US30Y: { fred: "DGS30", label: "US 30Y", source: "fred" },
  DE10Y: { fred: "IRLTLT01DEM156N", label: "DE 10Y", source: "fred" },
} as const;

export type YieldKey = keyof typeof YIELD_SERIES;

// --- generic FRED CSV/JSON layer --------------------------------------------

interface CacheEntry<T> {
  expires: number;
  value: T;
}
const memCache = new Map<string, CacheEntry<unknown>>();
function cacheGet<T>(k: string): T | undefined {
  const e = memCache.get(k);
  if (!e || e.expires < Date.now()) {
    memCache.delete(k);
    return undefined;
  }
  return e.value as T;
}
function cacheSet<T>(k: string, v: T, ttlMs: number) {
  memCache.set(k, { expires: Date.now() + ttlMs, value: v });
}

async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<string> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/csv,*/*",
      },
      cache: "no-store",
      signal: c.signal,
    });
    if (!res.ok) throw new Error(`FRED ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Fetch a FRED series via the no-key `fredgraph.csv` endpoint.
 * Returns an array of { date, value } points, sorted ascending.
 */
export async function getFredSeries(
  seriesId: string,
  ttlMs = 1000 * 60 * 30,
): Promise<YieldPoint[]> {
  const key = `fred:${seriesId}`;
  const hit = cacheGet<YieldPoint[]>(key);
  if (hit) return hit;

  try {
    const csv = await fetchWithTimeout(
      `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`,
    );
    const rows = csv.trim().split(/\r?\n/);
    rows.shift(); // header
    const out: YieldPoint[] = [];
    for (const line of rows) {
      const [date, valueStr] = line.split(",");
      if (!date || !valueStr || valueStr === "." || valueStr === "NA") continue;
      const v = parseFloat(valueStr);
      if (Number.isFinite(v)) out.push({ date, value: v });
    }
    cacheSet(key, out, ttlMs);
    return out;
  } catch (e) {
    console.warn(`[fred] ${seriesId} failed:`, (e as Error).message);
    return [];
  }
}

// --- Yields snapshot (used by the Yield Monitor widget) ---------------------

export interface YieldRow {
  key: YieldKey;
  label: string;
  value: number | null;
  change1d: number | null; // in percentage points
  change1w: number | null;
  change1m: number | null;
  source: "fred" | "none";
}

export async function getLatestYields(): Promise<YieldRow[]> {
  const keys = Object.keys(YIELD_SERIES) as YieldKey[];
  return Promise.all(
    keys.map(async (key) => {
      const cfg = YIELD_SERIES[key];
      const series = await getFredSeries(cfg.fred);
      if (series.length === 0) {
        return {
          key,
          label: cfg.label,
          value: null,
          change1d: null,
          change1w: null,
          change1m: null,
          source: "none" as const,
        };
      }
      const last = series[series.length - 1]!.value;
      const prev = series[series.length - 2]?.value ?? last;
      const wk = series[series.length - 6]?.value ?? last;
      const mo = series[series.length - 22]?.value ?? last;
      return {
        key,
        label: cfg.label,
        value: last,
        change1d: last - prev,
        change1w: last - wk,
        change1m: last - mo,
        source: "fred" as const,
      };
    }),
  );
}

