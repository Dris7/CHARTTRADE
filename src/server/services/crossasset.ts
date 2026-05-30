import "server-only";

// Cross-asset intelligence: rolling correlations + ratios that macro traders
// watch for regime shifts. All from FRED daily series + Nasdaq ETF history.

import { getFredSeries, type YieldPoint } from "~/server/services/fred";
import { cfetch } from "~/server/services/http";

const NASDAQ_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// --- math helpers -----------------------------------------------------------

function pearson(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 5) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]!;
    sy += y[i]!;
    sxx += x[i]! * x[i]!;
    syy += y[i]! * y[i]!;
    sxy += x[i]! * y[i]!;
  }
  const cov = sxy / n - (sx / n) * (sy / n);
  const vx = sxx / n - (sx / n) ** 2;
  const vy = syy / n - (sy / n) ** 2;
  const denom = Math.sqrt(vx * vy);
  return denom > 0 ? cov / denom : null;
}

/** Align two date-indexed series, returning per-step changes.
 *  kind: "ret" = pct change, "diff" = level difference. */
function alignChanges(
  a: YieldPoint[],
  b: YieldPoint[],
  aKind: "ret" | "diff",
  bKind: "ret" | "diff",
): { dates: string[]; ax: number[]; bx: number[] } {
  const mb = new Map(b.map((p) => [p.date, p.value]));
  const dates: string[] = [];
  const av: number[] = [];
  const bv: number[] = [];
  for (const p of a) {
    const bvVal = mb.get(p.date);
    if (bvVal !== undefined) {
      dates.push(p.date);
      av.push(p.value);
      bv.push(bvVal);
    }
  }
  const ax: number[] = [];
  const bx: number[] = [];
  const outDates: string[] = [];
  for (let i = 1; i < dates.length; i++) {
    const a0 = av[i - 1]!, a1 = av[i]!;
    const b0 = bv[i - 1]!, b1 = bv[i]!;
    ax.push(aKind === "ret" ? (a0 ? (a1 - a0) / a0 : 0) : a1 - a0);
    bx.push(bKind === "ret" ? (b0 ? (b1 - b0) / b0 : 0) : b1 - b0);
    outDates.push(dates[i]!);
  }
  return { dates: outDates, ax, bx };
}

function rollingCorr(
  ax: number[],
  bx: number[],
  dates: string[],
  window = 60,
): Array<{ date: string; value: number }> {
  const out: Array<{ date: string; value: number }> = [];
  for (let i = window - 1; i < ax.length; i++) {
    const c = pearson(ax.slice(i - window + 1, i + 1), bx.slice(i - window + 1, i + 1));
    if (c != null) out.push({ date: dates[i]!, value: c });
  }
  return out;
}

function downsample(values: number[], target = 60): number[] {
  if (values.length <= target) return values;
  const step = (values.length - 1) / (target - 1);
  const out: number[] = [];
  for (let i = 0; i < target; i++) out.push(values[Math.round(i * step)]!);
  return out;
}

// --- Nasdaq ETF closes (keyless, for copper/gold) ---------------------------

async function nasdaqCloses(ticker: string): Promise<YieldPoint[]> {
  const to = new Date();
  const from = new Date(Date.now() - 400 * 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url =
    `https://api.nasdaq.com/api/quote/${ticker}/historical` +
    `?assetclass=etf&fromdate=${fmt(from)}&todate=${fmt(to)}&limit=400`;
  try {
    const res = await cfetch(url, {
      headers: { "User-Agent": NASDAQ_UA, Accept: "application/json" },
      revalidate: 1800,
      timeoutMs: 9000,
    });
    if (!res.ok) throw new Error(`nasdaq ${res.status}`);
    const json = (await res.json()) as {
      data?: { tradesTable?: { rows?: Array<{ date?: string; close?: string }> } };
    };
    const rows = json.data?.tradesTable?.rows ?? [];
    // MM/DD/YYYY → ISO; newest-first → reverse.
    return rows
      .map((r) => {
        const v = parseFloat((r.close ?? "").replace(/[$,]/g, ""));
        const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(r.date ?? "");
        const date = m ? `${m[3]}-${m[1]}-${m[2]}` : "";
        return { date, value: v };
      })
      .filter((p) => p.date && Number.isFinite(p.value))
      .reverse();
  } catch (e) {
    console.warn(`[crossasset] nasdaq ${ticker} failed:`, (e as Error).message);
    return [];
  }
}

// --- public shapes ----------------------------------------------------------

export interface CorrTimeline {
  current: number | null;
  series: number[];
  date: string;
  note: string;
}

export interface RatioTimeline {
  current: number | null;
  change1m: number | null; // %
  series: number[];
  date: string;
}

export interface PairCorr {
  label: string;
  sub: string;
  corr: number | null;
  spark: number[];
}

export interface CrossAsset {
  stockBond: CorrTimeline;
  copperGold: RatioTimeline;
  pairs: PairCorr[];
}

let cache: { exp: number; v: CrossAsset } | null = null;

async function pairCorr(
  label: string,
  sub: string,
  a: YieldPoint[],
  b: YieldPoint[],
  aKind: "ret" | "diff",
  bKind: "ret" | "diff",
  flipB = false,
): Promise<PairCorr> {
  const { ax, bx, dates } = alignChanges(a, b, aKind, bKind);
  const bx2 = flipB ? bx.map((v) => -v) : bx;
  const roll = rollingCorr(ax, bx2, dates);
  return {
    label,
    sub,
    corr: roll.length ? roll[roll.length - 1]!.value : null,
    spark: downsample(roll.map((p) => p.value).slice(-120)),
  };
}

export async function getCrossAsset(): Promise<CrossAsset> {
  if (cache && cache.exp > Date.now()) return cache.v;

  const [spx, dgs10, dxy, oil, be10, hy, dfii10, cper, gld] = await Promise.all([
    getFredSeries("SP500"),
    getFredSeries("DGS10"),
    getFredSeries("DTWEXBGS"),
    getFredSeries("DCOILWTICO"),
    getFredSeries("T10YIE"),
    getFredSeries("BAMLH0A0HYM2"),
    getFredSeries("DFII10"),
    nasdaqCloses("CPER"),
    nasdaqCloses("GLD"),
  ]);

  // Stock–bond: corr(SPX return, bond return). Bond return ≈ −Δyield.
  const sb = alignChanges(spx, dgs10, "ret", "diff");
  const sbRoll = rollingCorr(sb.ax, sb.bx.map((v) => -v), sb.dates);
  const sbCur = sbRoll.length ? sbRoll[sbRoll.length - 1]!.value : null;
  const stockBond: CorrTimeline = {
    current: sbCur,
    series: downsample(sbRoll.map((p) => p.value).slice(-180)),
    date: sbRoll.length ? sbRoll[sbRoll.length - 1]!.date : "",
    note:
      sbCur == null
        ? ""
        : sbCur > 0.2
          ? "Positive — bonds not hedging equities"
          : sbCur < -0.2
            ? "Negative — classic hedge intact"
            : "Decoupled",
  };

  // Copper/Gold ratio
  const gldMap = new Map(gld.map((p) => [p.date, p.value]));
  const ratio: YieldPoint[] = [];
  for (const c of cper) {
    const g = gldMap.get(c.date);
    if (g) ratio.push({ date: c.date, value: (c.value / g) * 100 });
  }
  const copperGold: RatioTimeline = {
    current: ratio.length ? ratio[ratio.length - 1]!.value : null,
    change1m:
      ratio.length > 21
        ? ((ratio[ratio.length - 1]!.value - ratio[ratio.length - 22]!.value) /
            ratio[ratio.length - 22]!.value) *
          100
        : null,
    series: downsample(ratio.map((p) => p.value).slice(-180)),
    date: ratio.length ? ratio[ratio.length - 1]!.date : "",
  };

  // Live macro pairs (rolling 60d corr)
  const pairs = await Promise.all([
    pairCorr("Stocks ↔ Bonds", "SPX vs −Δ10Y", spx, dgs10, "ret", "diff", true),
    pairCorr("Stocks ↔ Dollar", "SPX vs DXY", spx, dxy, "ret", "ret"),
    pairCorr("Stocks ↔ Credit", "SPX vs HY OAS", spx, hy, "ret", "diff"),
    pairCorr("Oil ↔ Inflation", "WTI vs breakeven", oil, be10, "ret", "diff"),
    pairCorr("Dollar ↔ Real Yld", "DXY vs 10Y real", dxy, dfii10, "ret", "diff"),
  ]);

  const v: CrossAsset = { stockBond, copperGold, pairs };
  if (sbRoll.length > 0) cache = { exp: Date.now() + 30 * 60_000, v };
  return v;
}
