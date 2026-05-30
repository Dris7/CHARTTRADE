import "server-only";

// Regime history + analog engine — the differentiator.
//
//  • Timeline: recompute the weighted-σ regime score back through time so the
//    UI can show the *trajectory* and where it flipped, not just today.
//  • Analogs: find the historical days whose cross-asset pillar configuration
//    most resembles today, then report what SPX / 10Y / DXY / crude did over the
//    following 5/20/60 trading days. "What happened last time we were here."
//
// Pure computation over the same FRED series the live regime uses — no new data.

import {
  getCurve2s10sSeries,
  getDxySeries,
  getFredSeries,
  getHyOasSeries,
  getNetLiquiditySeries,
  getSpxSeries,
  getVixSeries,
  getCrudeSeries,
  type YieldPoint,
} from "~/server/services/fred";
import { ROLLING_WINDOW } from "~/server/services/regime-math";

interface PillarCfg {
  key: string;
  weight: number;
  direction: 1 | -1;
  fetch: () => Promise<YieldPoint[]>;
}

const PILLARS: PillarCfg[] = [
  { key: "spx", weight: 0.15, direction: +1, fetch: getSpxSeries },
  { key: "vix", weight: 0.2, direction: -1, fetch: getVixSeries },
  { key: "credit", weight: 0.25, direction: -1, fetch: getHyOasSeries },
  { key: "curve", weight: 0.1, direction: +1, fetch: getCurve2s10sSeries },
  { key: "liquidity", weight: 0.15, direction: +1, fetch: getNetLiquiditySeries },
  { key: "dxy", weight: 0.15, direction: -1, fetch: getDxySeries },
  { key: "crude", weight: 0.05, direction: +1, fetch: getCrudeSeries },
];

export type RegimeLabel = "Risk-On" | "Risk-Off" | "Neutral" | "Mixed";

export interface RegimePoint {
  date: string;
  score: number;
  label: RegimeLabel;
}

export interface Analog {
  date: string;
  distance: number;
  spx20: number | null; // % over +20 trading days
  tnx20: number | null; // 10Y yield change, bp, +20d
  dxy20: number | null; // % +20d
}

export interface AnalogSummary {
  count: number;
  spx5: number | null;
  spx20: number | null;
  spx60: number | null;
  spxHitRate: number | null; // % of analogs with positive 20d SPX
  tnx20: number | null;
  dxy20: number | null;
}

export interface RegimeHistory {
  timeline: RegimePoint[];
  current: { score: number; label: RegimeLabel; date: string };
  analogs: Analog[];
  summary: AnalogSummary;
}

function labelOf(score: number): RegimeLabel {
  if (score >= 0.5) return "Risk-On";
  if (score <= -0.5) return "Risk-Off";
  if (Math.abs(score) <= 0.15) return "Neutral";
  return "Mixed";
}

/** Rolling z-score series: z[i] = (v[i] − mean) / std over trailing `window`. */
function rollingZ(points: YieldPoint[], window = ROLLING_WINDOW): YieldPoint[] {
  const out: YieldPoint[] = [];
  for (let i = window - 1; i < points.length; i++) {
    const win = points.slice(i - window + 1, i + 1).map((p) => p.value);
    const mean = win.reduce((s, v) => s + v, 0) / win.length;
    const variance = win.reduce((s, v) => s + (v - mean) ** 2, 0) / win.length;
    const std = Math.sqrt(variance);
    if (std > 0 && Number.isFinite(std)) {
      out.push({ date: points[i]!.date, value: (points[i]!.value - mean) / std });
    }
  }
  return out;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

let cache: { exp: number; v: RegimeHistory } | null = null;

export async function getRegimeHistory(): Promise<RegimeHistory> {
  if (cache && cache.exp > Date.now()) return cache.v;

  // Fetch pillar series + the price series used for forward returns.
  const [pillarSeries, dgs10] = await Promise.all([
    Promise.all(PILLARS.map((p) => p.fetch())),
    getFredSeries("DGS10"),
  ]);

  // Per-pillar rolling-z, as date→z maps + a forward-fillable sorted list.
  const zMaps = pillarSeries.map((s) => {
    const z = rollingZ(s);
    return { dates: z.map((p) => p.date), map: new Map(z.map((p) => [p.date, p.value])) };
  });

  // Daily axis = SPX z dates (densest daily series among pillars).
  const axis = zMaps[0]!.dates;

  // Forward-fill helper: latest z at or before a given date.
  function ffZ(pillarIdx: number, date: string): number | null {
    const { dates, map } = zMaps[pillarIdx]!;
    const exact = map.get(date);
    if (exact !== undefined) return exact;
    // binary search for last date <= target
    let lo = 0,
      hi = dates.length - 1,
      best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (dates[mid]! <= date) {
        best = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return best >= 0 ? map.get(dates[best]!)! : null;
  }

  const totalWeight = PILLARS.reduce((s, p) => s + p.weight, 0);

  // Build timeline + per-date contribution vectors (for analog distance).
  const timeline: RegimePoint[] = [];
  const vectors: Array<{ date: string; vec: number[] }> = [];
  for (const date of axis) {
    const contribs: number[] = [];
    let ok = true;
    let scoreW = 0;
    for (let i = 0; i < PILLARS.length; i++) {
      const z = ffZ(i, date);
      if (z == null) {
        ok = false;
        break;
      }
      const c = z * PILLARS[i]!.direction;
      contribs.push(c);
      scoreW += c * PILLARS[i]!.weight;
    }
    if (!ok) continue;
    const score = scoreW / totalWeight;
    timeline.push({ date, score, label: labelOf(score) });
    vectors.push({ date, vec: contribs });
  }

  const current = timeline[timeline.length - 1] ?? {
    date: "",
    score: 0,
    label: "Neutral" as RegimeLabel,
  };

  // --- analogs ---
  const todayVec = vectors[vectors.length - 1]?.vec ?? [];
  // SPX/DXY/crude price series indexed by date for forward returns.
  const priceIndex = (s: YieldPoint[]) => ({
    dates: s.map((p) => p.date),
    vals: s.map((p) => p.value),
  });
  const spxP = priceIndex(pillarSeries[0]!); // SP500
  const dxyP = priceIndex(pillarSeries[5]!); // DTWEXBGS
  const tnxP = priceIndex(dgs10);

  function fwd(p: { dates: string[]; vals: number[] }, date: string, n: number) {
    // index of last date <= target
    let lo = 0,
      hi = p.dates.length - 1,
      idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (p.dates[mid]! <= date) {
        idx = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (idx < 0 || idx + n >= p.vals.length) return null;
    return { now: p.vals[idx]!, later: p.vals[idx + n]! };
  }
  const pct = (a: { now: number; later: number } | null) =>
    a?.now ? ((a.later - a.now) / a.now) * 100 : null;
  const bp = (a: { now: number; later: number } | null) =>
    a ? (a.later - a.now) * 100 : null;

  const dist = (v: number[]) =>
    Math.sqrt(v.reduce((s, x, i) => s + (x - (todayVec[i] ?? 0)) ** 2, 0));

  // Candidate pool: all but the most recent 65 days (need 60d forward window),
  // spaced ≥ 10 trading days apart to avoid picking a single cluster.
  const pool = vectors.slice(0, Math.max(0, vectors.length - 65));
  const ranked = pool
    .map((p) => ({ date: p.date, d: dist(p.vec) }))
    .sort((a, b) => a.d - b.d);

  const analogs: Analog[] = [];
  const chosen: string[] = [];
  for (const r of ranked) {
    if (
      chosen.some(
        (c) => Math.abs(new Date(c).getTime() - new Date(r.date).getTime()) < 10 * 86_400_000,
      )
    )
      continue;
    chosen.push(r.date);
    analogs.push({
      date: r.date,
      distance: r.d,
      spx20: pct(fwd(spxP, r.date, 20)),
      tnx20: bp(fwd(tnxP, r.date, 20)),
      dxy20: pct(fwd(dxyP, r.date, 20)),
    });
    if (analogs.length >= 8) break;
  }

  const spx5s = chosen.map((d) => pct(fwd(spxP, d, 5))).filter((x): x is number => x != null);
  const spx20s = analogs.map((a) => a.spx20).filter((x): x is number => x != null);
  const spx60s = chosen.map((d) => pct(fwd(spxP, d, 60))).filter((x): x is number => x != null);
  const tnx20s = analogs.map((a) => a.tnx20).filter((x): x is number => x != null);
  const dxy20s = analogs.map((a) => a.dxy20).filter((x): x is number => x != null);

  const summary: AnalogSummary = {
    count: analogs.length,
    spx5: median(spx5s),
    spx20: median(spx20s),
    spx60: median(spx60s),
    spxHitRate: spx20s.length
      ? (spx20s.filter((x) => x > 0).length / spx20s.length) * 100
      : null,
    tnx20: median(tnx20s),
    dxy20: median(dxy20s),
  };

  const v: RegimeHistory = {
    // cap the chart series so it stays light
    timeline: timeline.slice(-260),
    current,
    analogs,
    summary,
  };
  if (timeline.length > 0) cache = { exp: Date.now() + 30 * 60_000, v };
  return v;
}
