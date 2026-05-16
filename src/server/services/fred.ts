import "server-only";

// FRED (St. Louis Fed) — the most reliable free macro data source.
//
// Two paths, in priority order:
//   1. Official JSON API (`api.stlouisfed.org/fred/series/observations`)
//      — requires FRED_API_KEY (free at https://fredaccount.stlouisfed.org/apikeys).
//      — fast (under 1s), 120 req/min, no AWS-IP throttling.
//   2. Public CSV gateway (`fredgraph.csv?id=...`)
//      — no key but slow from cloud IPs and bot-throttled.
//      — used as fallback when no key is configured.

import { env } from "~/env";

export interface YieldPoint {
  date: string;
  value: number;
}

export const YIELD_SERIES = {
  US2Y: { fred: "DGS2", label: "US 2Y" },
  US5Y: { fred: "DGS5", label: "US 5Y" },
  US10Y: { fred: "DGS10", label: "US 10Y" },
  US30Y: { fred: "DGS30", label: "US 30Y" },
  DE10Y: { fred: "IRLTLT01DEM156N", label: "DE 10Y" },
} as const;

export type YieldKey = keyof typeof YIELD_SERIES;

// --- generic fetch + cache --------------------------------------------------

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

async function fetchWithTimeout(url: string, timeoutMs = 6000): Promise<string> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/csv,*/*",
      },
      // 30-min Next.js fetch cache. On Netlify this lands in the Blobs store
      // and is shared across all Lambda invocations — fixes the cold-start
      // timeouts we were hitting on serverless.
      next: { revalidate: 1800 },
      signal: c.signal,
    });
    if (!res.ok) throw new Error(`FRED ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

interface FredApiResp {
  observations?: Array<{ date: string; value: string }>;
}

async function fetchFromApi(seriesId: string): Promise<YieldPoint[] | null> {
  if (!env.FRED_API_KEY) return null;
  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(env.FRED_API_KEY)}` +
    `&file_type=json` +
    `&sort_order=desc` +
    `&limit=400`;

  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 6000);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 1800 },
      signal: c.signal,
    });
    if (!res.ok) throw new Error(`FRED API ${res.status}`);
    const json = (await res.json()) as FredApiResp;
    const out: YieldPoint[] = [];
    for (const o of json.observations ?? []) {
      if (o.value === "." || o.value === "NA") continue;
      const v = parseFloat(o.value);
      if (Number.isFinite(v)) out.push({ date: o.date, value: v });
    }
    // API returns newest-first; flip to oldest-first to match CSV semantics
    return out.reverse();
  } catch (e) {
    console.warn(`[fred-api] ${seriesId} failed:`, (e as Error).message);
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchFromCsv(seriesId: string): Promise<YieldPoint[]> {
  // Clip to last ~2 years so the CSV payload stays under ~10KB.
  const cosd = new Date(Date.now() - 730 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  try {
    const csv = await fetchWithTimeout(
      `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}&cosd=${cosd}`,
    );
    const rows = csv.trim().split(/\r?\n/);
    rows.shift();
    const out: YieldPoint[] = [];
    for (const line of rows) {
      const [date, valueStr] = line.split(",");
      if (!date || !valueStr || valueStr === "." || valueStr === "NA") continue;
      const v = parseFloat(valueStr);
      if (Number.isFinite(v)) out.push({ date, value: v });
    }
    return out;
  } catch (e) {
    console.warn(`[fred-csv] ${seriesId} failed:`, (e as Error).message);
    return [];
  }
}

export async function getFredSeries(
  seriesId: string,
  ttlMs = 1000 * 60 * 30,
): Promise<YieldPoint[]> {
  const cacheKey = `fred:${seriesId}`;
  const hit = cacheGet<YieldPoint[]>(cacheKey);
  if (hit) return hit;

  // Prefer the official API (fast + reliable from cloud IPs); fall back to CSV.
  const apiResult = await fetchFromApi(seriesId);
  const out = apiResult ?? (await fetchFromCsv(seriesId));
  cacheSet(cacheKey, out, ttlMs);
  return out;
}

// --- yields snapshot --------------------------------------------------------

export interface YieldRow {
  key: YieldKey;
  label: string;
  value: number | null;
  change1d: number | null;
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

// --- macro series for the regime engine -------------------------------------

/** ICE BofA US High Yield OAS, in %. Multiply by 100 for basis points. */
export function getHyOasSeries() {
  return getFredSeries("BAMLH0A0HYM2");
}

export async function getCurve2s10sSeries(): Promise<YieldPoint[]> {
  const [twos, tens] = await Promise.all([
    getFredSeries("DGS2"),
    getFredSeries("DGS10"),
  ]);
  const byDate2 = new Map(twos.map((p) => [p.date, p.value]));
  const out: YieldPoint[] = [];
  for (const t of tens) {
    const two = byDate2.get(t.date);
    if (two !== undefined) {
      out.push({ date: t.date, value: t.value - two });
    }
  }
  return out;
}

/**
 * Fed Net Liquidity = WALCL (Fed balance sheet, $M)
 *                   − WTREGEN (Treasury General Account, $M)
 *                   − RRPONTSYD (Reverse Repo, $B → ×1000 to $M)
 * Returned in $ trillions for display.
 */
export async function getNetLiquiditySeries(): Promise<YieldPoint[]> {
  const [walcl, tga, rrp] = await Promise.all([
    getFredSeries("WALCL"), // $ millions, weekly
    getFredSeries("WTREGEN"), // $ millions, weekly
    getFredSeries("RRPONTSYD"), // $ billions, daily
  ]);
  if (walcl.length === 0) return [];

  // Build a daily forward-fill of TGA and RRP onto WALCL's weekly dates.
  const tgaByDate = new Map(tga.map((p) => [p.date, p.value]));
  const rrpByDate = new Map(rrp.map((p) => [p.date, p.value]));

  let lastTga = tga[0]?.value ?? 0;
  let lastRrp = rrp[0]?.value ?? 0;

  const out: YieldPoint[] = [];
  // Iterate WALCL weeks; for each, pick the closest TGA/RRP value at or before
  for (const w of walcl) {
    const t = tgaByDate.get(w.date);
    if (t !== undefined) lastTga = t;
    const r = rrpByDate.get(w.date);
    if (r !== undefined) lastRrp = r;
    // Net liq in $T = (WALCL − TGA − RRP×1000) / 1_000_000
    const netLiqUsdM = w.value - lastTga - lastRrp * 1000;
    out.push({ date: w.date, value: netLiqUsdM / 1_000_000 });
  }
  return out;
}

export function getSpxSeries() {
  return getFredSeries("SP500");
}

export function getVixSeries() {
  return getFredSeries("VIXCLS");
}

export function getDxySeries() {
  return getFredSeries("DTWEXBGS");
}
