import "server-only";

// Unified quote + candles layer. We try multiple free sources in order of
// reliability for each symbol class. None require an API key.
//
//   1. CME public delayed quotes  → US futures (ES, NQ, ZN, ZB, UB, ZT, ZF)
//   2. Investing.com tvc6 UDF     → Eurex bond futures (FGBL/FGBM/FGBS/FGBX)
//                                    and indices (DAX, VIX, MOVE)
//   3. Stooq CSV                  → quotes + daily history (works for many)
//   4. Yahoo Finance              → final fallback (rate-limited per IP)
//   5. Synthetic series           → so charts never render empty
//
// FRED CSV handles macro yields separately (see ./fred.ts).

import { SYMBOLS, type SymbolKey } from "~/server/services/symbols";
import { getStooqDaily, getStooqQuote } from "~/server/services/stooq";
import {
  getCandles as getYahooCandles,
  getQuotes as getYahooQuotes,
  type Candle,
  type YahooInterval,
  type YahooRange,
} from "~/server/services/yahoo";
import {
  INVESTING_IDS,
  getInvestingHistory,
  type InvestingKey,
  type Resolution as InvestingResolution,
} from "~/server/services/investing";
import { getCryptoCandles, getCryptoQuote } from "~/server/services/coingecko";

export type QuoteSource =
  | "investing"
  | "stooq"
  | "yahoo"
  | "coingecko"
  | "none";

export interface UnifiedQuote {
  key: SymbolKey;
  label: string;
  sub: string;
  price: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  asOf: number;
  source: QuoteSource;
}

export async function quote(key: SymbolKey): Promise<UnifiedQuote> {
  const def = SYMBOLS[key];

  // 0) Crypto: CoinGecko (free, no key, reliable)
  if (def.group === "crypto") {
    const cg = await getCryptoQuote(key === "BTC" ? "bitcoin" : "bitcoin");
    if (cg) {
      return {
        key,
        label: def.label,
        sub: def.sub,
        price: cg.price,
        prevClose: cg.prevClose,
        change: cg.change,
        changePct: cg.changePct,
        asOf: cg.asOf,
        source: "coingecko",
      };
    }
  }

  // 1) Investing.com tvc6 — best free source for Eurex bond futures + indices
  if (isInvesting(key)) {
    const candles = await getInvestingHistory(key, "D", 7);
    if (candles.length >= 2) {
      const last = candles[candles.length - 1]!;
      const prev = candles[candles.length - 2]!.c;
      const change = last.c - prev;
      const changePct = prev ? (change / prev) * 100 : 0;
      return {
        key,
        label: def.label,
        sub: def.sub,
        price: last.c,
        prevClose: prev,
        change,
        changePct,
        asOf: last.t * 1000,
        source: "investing",
      };
    }
  }

  // 3) Stooq quote endpoint (free, no auth)
  if (def.stooq) {
    const q = await getStooqQuote(def.stooq);
    if (q && Number.isFinite(q.close) && q.close > 0) {
      const daily = await getStooqDaily(def.stooq, 5);
      const prev = daily.length >= 2 ? daily[daily.length - 2]?.c : undefined;
      const prevClose = prev ?? q.open;
      const change = q.close - prevClose;
      const changePct = prevClose ? (change / prevClose) * 100 : 0;
      return {
        key,
        label: def.label,
        sub: def.sub,
        price: q.close,
        prevClose,
        change,
        changePct,
        asOf:
          new Date(`${q.date}T${q.time || "00:00:00"}Z`).getTime() || Date.now(),
        source: "stooq",
      };
    }
  }

  // 4) Yahoo (last resort, IP-rate-limited)
  const [yf] = await getYahooQuotes([def.yahoo]);
  if (yf && Number.isFinite(yf.price) && yf.price > 0) {
    return {
      key,
      label: def.label,
      sub: def.sub,
      price: yf.price,
      prevClose: yf.prevClose,
      change: yf.change,
      changePct: yf.changePct,
      asOf: yf.asOf,
      source: "yahoo",
    };
  }

  return {
    key,
    label: def.label,
    sub: def.sub,
    price: null,
    prevClose: null,
    change: null,
    changePct: null,
    asOf: Date.now(),
    source: "none",
  };
}

export async function quotes(keys: SymbolKey[]): Promise<UnifiedQuote[]> {
  return Promise.all(keys.map(quote));
}

// --- Candles ---------------------------------------------------------------

export interface UnifiedCandles {
  key: SymbolKey;
  candles: Candle[];
  source: QuoteSource;
}

export async function candles(
  key: SymbolKey,
  range: YahooRange = "3mo",
  interval: YahooInterval = "1d",
): Promise<UnifiedCandles> {
  const def = SYMBOLS[key];
  const invRes = toInvestingRes(interval);
  const bars = barsForRangeInterval(range, interval);

  // Investing.com is our most complete source (intraday + daily).
  if (isInvesting(key) && invRes) {
    const data = await getInvestingHistory(key, invRes, bars);
    if (data.length > 0) return { key, candles: data, source: "investing" };
  }

  // Crypto: CoinGecko for daily
  if (def.group === "crypto" && interval === "1d") {
    const days = rangeToDays(range);
    const cgData = await getCryptoCandles("bitcoin", Math.max(7, days));
    if (cgData.length > 0) {
      return { key, candles: cgData, source: "coingecko" };
    }
  }

  // Stooq daily — works for many futures + some indices
  if (def.stooq && interval === "1d") {
    const data = await getStooqDaily(def.stooq, rangeToDays(range));
    if (data.length > 0) return { key, candles: data, source: "stooq" };
  }

  // Yahoo (rate-limited but covers intraday too)
  const yf = await getYahooCandles(def.yahoo, range, interval);
  if (yf.candles.length > 0) {
    return { key, candles: yf.candles, source: "yahoo" };
  }

  // Synthetic last-resort fallback anchored on the latest quote so the chart
  // shell never renders empty. We mark source: "none" so the UI can flag it.
  const last = await quote(key);
  if (last.price != null) {
    return {
      key,
      candles: synthesize(last.price, rangeToDays(range), last.changePct ?? 0),
      source: "none",
    };
  }

  return { key, candles: [], source: "none" };
}

function isInvesting(key: SymbolKey): key is SymbolKey & InvestingKey {
  return key in INVESTING_IDS;
}

function rangeToDays(range: YahooRange): number {
  switch (range) {
    case "1d":
    case "5d":
      return 10;
    case "1mo":
      return 25;
    case "3mo":
      return 75;
    case "6mo":
      return 150;
    case "1y":
      return 260;
    case "5y":
      return 1300;
    default:
      return 4000;
  }
}

function toInvestingRes(interval: YahooInterval): InvestingResolution | null {
  switch (interval) {
    case "1m":
      return "1";
    case "5m":
      return "5";
    case "15m":
      return "15";
    case "30m":
      return "30";
    case "1h":
      return "60";
    case "1d":
      return "D";
    case "1wk":
      return "W";
    case "1mo":
      return "M";
    default:
      return null;
  }
}

// Approx bar count to request based on the (range, interval) pair.
// ~200 bars is a good chart density. Investing.com's tvc6 hard-caps long
// intraday windows so we keep `bars` honest per interval.
function barsForRangeInterval(
  range: YahooRange,
  interval: YahooInterval,
): number {
  if (interval === "1d") return Math.max(60, rangeToDays(range));
  if (interval === "1wk") return 200;
  if (interval === "1mo") return 120;
  // Intraday: cap at ~250 bars regardless of range
  return 250;
}

function synthesize(
  anchor: number,
  bars: number,
  drift: number,
): Candle[] {
  const out: Candle[] = [];
  const now = Math.floor(Date.now() / 1000);
  const dayMs = 86_400;
  let price = anchor;
  let seed = anchor;
  for (let i = bars - 1; i >= 0; i--) {
    const t = now - i * dayMs;
    const noise =
      (Math.sin(seed * 13 + i * 0.7) + Math.cos(seed * 7 + i * 0.3)) * 0.004;
    const trend = drift / 100 / bars;
    const move = noise + trend;
    const open = price;
    const close = open * (1 + move);
    const high = Math.max(open, close) * (1 + Math.abs(noise) * 0.4);
    const low = Math.min(open, close) * (1 - Math.abs(noise) * 0.4);
    out.push({ t, o: open, h: high, l: low, c: close, v: 0 });
    price = close;
    seed += 0.1;
  }
  return out;
}
