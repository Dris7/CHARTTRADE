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

  // One retry: a cold dashboard fires 20+ FRED requests at once, so a single
  // series can transiently time out under the burst. Retrying once recovers it.
  for (let attempt = 0; attempt < 2; attempt++) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 9000);
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
      if (attempt === 1) {
        console.warn(`[fred-api] ${seriesId} failed:`, (e as Error).message);
        return null;
      }
      await new Promise((r) => setTimeout(r, 400));
    } finally {
      clearTimeout(t);
    }
  }
  return null;
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
  // Never cache a failed/empty fetch — otherwise a transient miss poisons the
  // series for the whole TTL. Only memoize real data.
  if (out.length > 0) cacheSet(cacheKey, out, ttlMs);
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

/** WTI crude, $/bbl, daily. Pro-cyclical growth/inflation proxy. */
export function getCrudeSeries() {
  return getFredSeries("DCOILWTICO");
}

export function getVixSeries() {
  return getFredSeries("VIXCLS");
}

export function getDxySeries() {
  return getFredSeries("DTWEXBGS");
}

// --- macro indicator tiles --------------------------------------------------

export type IndicatorUnit = "%" | "bps" | "level" | "$T" | "$B" | "k" | "idx";

export interface MacroIndicator {
  key: string;
  label: string;
  fred: string;
  value: number | null;
  prev: number | null;
  change: number | null; // value − prev, in the series' native unit
  display: string;
  changeDisplay: string;
  /** +1 if a rise is "risk-off"/tightening, -1 if a rise is benign. For tone. */
  invert: boolean;
  date: string;
  spark: number[]; // ~30 downsampled recent points
}

interface IndicatorSpec {
  key: string;
  label: string;
  fred: string;
  unit: IndicatorUnit;
  digits: number;
  invert: boolean; // true: higher = more stress (red)
}

const INDICATOR_SPECS: IndicatorSpec[] = [
  { key: "vix", label: "VIX", fred: "VIXCLS", unit: "level", digits: 2, invert: true },
  { key: "fedfunds", label: "Fed Funds", fred: "FEDFUNDS", unit: "%", digits: 2, invert: true },
  { key: "t10y2y", label: "10Y-2Y", fred: "T10Y2Y", unit: "%", digits: 2, invert: false },
  { key: "unrate", label: "Unemployment", fred: "UNRATE", unit: "%", digits: 1, invert: true },
  { key: "hy", label: "HY OAS", fred: "BAMLH0A0HYM2", unit: "%", digits: 2, invert: true },
  { key: "claims", label: "Jobless Claims", fred: "ICSA", unit: "k", digits: 0, invert: true },
  { key: "mortgage", label: "30Y Mortgage", fred: "MORTGAGE30US", unit: "%", digits: 2, invert: true },
  { key: "dgs10", label: "10Y Treasury", fred: "DGS10", unit: "%", digits: 2, invert: true },
  { key: "cpi", label: "CPI YoY", fred: "CPIAUCSL", unit: "%", digits: 1, invert: true },
  { key: "m2", label: "M2 Supply", fred: "M2SL", unit: "$T", digits: 2, invert: false },
];

function downsample(values: number[], target = 30): number[] {
  if (values.length <= target) return values;
  const step = (values.length - 1) / (target - 1);
  const out: number[] = [];
  for (let i = 0; i < target; i++) out.push(values[Math.round(i * step)]!);
  return out;
}

function fmtIndicator(v: number, unit: IndicatorUnit, digits: number): string {
  switch (unit) {
    case "%":
      return `${v.toFixed(digits)}%`;
    case "k":
      return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${Math.round(v)}`;
    case "$T":
      return `$${(v / 1000).toFixed(digits)}T`; // M2SL is in $B
    case "$B":
      return `$${v.toFixed(digits)}B`;
    case "bps":
      return `${(v * 100).toFixed(0)}bp`;
    default:
      return v.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
  }
}

export async function getMacroIndicators(): Promise<MacroIndicator[]> {
  const out = await Promise.all(
    INDICATOR_SPECS.map(async (spec): Promise<MacroIndicator> => {
      const series = await getFredSeries(spec.fred);
      const base: MacroIndicator = {
        key: spec.key,
        label: spec.label,
        fred: spec.fred,
        value: null,
        prev: null,
        change: null,
        display: "—",
        changeDisplay: "",
        invert: spec.invert,
        date: "",
        spark: [],
      };
      if (series.length === 0) return base;

      // CPI is an index; convert to YoY % (12 monthly obs back).
      let pts = series.map((p) => p.value);
      let dates = series.map((p) => p.date);
      if (spec.key === "cpi") {
        const yoy: number[] = [];
        const yoyDates: string[] = [];
        for (let i = 12; i < series.length; i++) {
          const prior = series[i - 12]!.value;
          if (prior) {
            yoy.push(((series[i]!.value - prior) / prior) * 100);
            yoyDates.push(series[i]!.date);
          }
        }
        pts = yoy;
        dates = yoyDates;
      }
      if (pts.length === 0) return base;

      const value = pts[pts.length - 1]!;
      const prev = pts[pts.length - 2] ?? value;
      const change = value - prev;
      return {
        ...base,
        value,
        prev,
        change,
        display: fmtIndicator(value, spec.unit, spec.digits),
        changeDisplay:
          spec.unit === "k"
            ? `${change >= 0 ? "+" : ""}${Math.round(change)}`
            : `${change >= 0 ? "+" : ""}${change.toFixed(spec.digits)}`,
        date: dates[dates.length - 1] ?? "",
        spark: downsample(pts.slice(-90)),
      };
    }),
  );
  return out;
}

// --- yield curve ------------------------------------------------------------

export interface CurvePoint {
  tenor: string;
  months: number;
  value: number | null;
  prev: number | null;
}

const CURVE_TENORS: Array<{ tenor: string; months: number; fred: string }> = [
  { tenor: "1M", months: 1, fred: "DGS1MO" },
  { tenor: "3M", months: 3, fred: "DGS3MO" },
  { tenor: "6M", months: 6, fred: "DGS6MO" },
  { tenor: "1Y", months: 12, fred: "DGS1" },
  { tenor: "2Y", months: 24, fred: "DGS2" },
  { tenor: "5Y", months: 60, fred: "DGS5" },
  { tenor: "10Y", months: 120, fred: "DGS10" },
  { tenor: "30Y", months: 360, fred: "DGS30" },
];

export interface YieldCurve {
  points: CurvePoint[];
  spread2s10s: number | null;
  date: string;
}

export async function getYieldCurve(): Promise<YieldCurve> {
  const series = await Promise.all(
    CURVE_TENORS.map((t) => getFredSeries(t.fred)),
  );
  let date = "";
  const points: CurvePoint[] = CURVE_TENORS.map((t, i) => {
    const s = series[i]!;
    const last = s[s.length - 1];
    const prev = s[s.length - 2];
    if (last && last.date > date) date = last.date;
    return {
      tenor: t.tenor,
      months: t.months,
      value: last?.value ?? null,
      prev: prev?.value ?? null,
    };
  });
  const twos = points.find((p) => p.tenor === "2Y")?.value ?? null;
  const tens = points.find((p) => p.tenor === "10Y")?.value ?? null;
  return {
    points,
    spread2s10s: twos != null && tens != null ? tens - twos : null,
    date,
  };
}

// --- financial stress index -------------------------------------------------

export interface FinancialStress {
  value: number | null;
  date: string;
  spark: number[];
  classification: "Low" | "Normal" | "Elevated" | "High";
}

export async function getFinancialStress(): Promise<FinancialStress> {
  // St. Louis Fed Financial Stress Index (4th rev). 0 = normal; >0 = above-avg stress.
  const series = await getFredSeries("STLFSI4");
  if (series.length === 0) {
    return { value: null, date: "", spark: [], classification: "Normal" };
  }
  const value = series[series.length - 1]!.value;
  const classification =
    value < -1 ? "Low" : value < 0.5 ? "Normal" : value < 1.5 ? "Elevated" : "High";
  return {
    value,
    date: series[series.length - 1]!.date,
    spark: downsample(series.slice(-104).map((p) => p.value)), // ~2y weekly
    classification,
  };
}
