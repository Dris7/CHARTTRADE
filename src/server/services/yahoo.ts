import "server-only";

const YF_HOSTS = [
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com",
];
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type YahooRange =
  | "1d"
  | "5d"
  | "1mo"
  | "3mo"
  | "6mo"
  | "1y"
  | "5y"
  | "max";
export type YahooInterval =
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "1d"
  | "1wk"
  | "1mo";

export interface Quote {
  symbol: string;
  shortName: string;
  price: number;
  change: number;
  changePct: number;
  prevClose: number;
  currency?: string;
  marketState?: string;
  asOf: number;
}

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface YfChartResp {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        regularMarketTime?: number;
        currency?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: { description?: string } | null;
  };
}

// --- caching + concurrency control ------------------------------------------

interface CacheEntry<T> {
  expires: number;
  value: T;
}
const memCache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | undefined {
  const e = memCache.get(key);
  if (!e) return undefined;
  if (e.expires < Date.now()) {
    memCache.delete(key);
    return undefined;
  }
  return e.value as T;
}

function cacheSet<T>(key: string, value: T, ttlMs: number) {
  memCache.set(key, { expires: Date.now() + ttlMs, value });
}

// Limit Yahoo concurrency to 3; serialize bursts to avoid 429.
let inflight = 0;
const queue: Array<() => void> = [];
async function acquire() {
  if (inflight < 3) {
    inflight++;
    return;
  }
  await new Promise<void>((resolve) => queue.push(resolve));
  inflight++;
}
function release() {
  inflight--;
  const next = queue.shift();
  if (next) next();
}

let hostIdx = 0;
async function yfFetch<T>(path: string, ttlMs: number): Promise<T> {
  const key = `yf:${path}`;
  const hit = cacheGet<T>(key);
  if (hit) return hit;

  await acquire();
  try {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const host = YF_HOSTS[hostIdx++ % YF_HOSTS.length]!;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch(`${host}${path}`, {
          headers: {
            "User-Agent": UA,
            Accept: "application/json,text/plain,*/*",
            "Accept-Language": "en-US,en;q=0.9",
          },
          cache: "no-store",
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, 500 + attempt * 800));
          lastErr = new Error("yahoo 429");
          continue;
        }
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`yahoo ${res.status} ${body.slice(0, 80)}`);
        }
        const json = (await res.json()) as T;
        cacheSet(key, json, ttlMs);
        return json;
      } catch (e) {
        clearTimeout(timer);
        lastErr = e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("yf fetch failed");
  } finally {
    release();
  }
}

// --- public API --------------------------------------------------------------

async function getQuoteFromChart(symbol: string): Promise<Quote | null> {
  try {
    const data = await yfFetch<YfChartResp>(
      `/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`,
      30_000,
    );
    void 0; // placeholder so the diff stays minimal
    const r = data.chart?.result?.[0];
    if (!r) return null;
    const closes = (r.indicators?.quote?.[0]?.close ?? []).filter(
      (v): v is number => typeof v === "number",
    );
    const price = r.meta?.regularMarketPrice ?? closes[closes.length - 1] ?? 0;
    const prev = r.meta?.chartPreviousClose ?? closes[closes.length - 2] ?? price;
    const change = price - prev;
    const changePct = prev ? (change / prev) * 100 : 0;
    return {
      symbol,
      shortName: symbol,
      price,
      change,
      changePct,
      prevClose: prev,
      currency: r.meta?.currency,
      asOf: (r.meta?.regularMarketTime ?? Math.floor(Date.now() / 1000)) * 1000,
    };
  } catch (e) {
    console.warn(`[yahoo] quote ${symbol} failed:`, (e as Error).message);
    return null;
  }
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  if (symbols.length === 0) return [];
  const results = await Promise.all(symbols.map((s) => getQuoteFromChart(s)));
  return results
    .map((q, i) => q ?? emptyQuote(symbols[i]!))
    .filter((q): q is Quote => q !== null);
}

function emptyQuote(symbol: string): Quote {
  return {
    symbol,
    shortName: symbol,
    price: Number.NaN,
    change: Number.NaN,
    changePct: Number.NaN,
    prevClose: Number.NaN,
    asOf: Date.now(),
  };
}

export async function getCandles(
  symbol: string,
  range: YahooRange = "3mo",
  interval: YahooInterval = "1d",
): Promise<{ symbol: string; candles: Candle[]; meta?: { prevClose?: number } }> {
  try {
    const data = await yfFetch<YfChartResp>(
      `/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`,
      60_000,
    );
    const r = data.chart?.result?.[0];
    if (!r) return { symbol, candles: [] };
    const ts = r.timestamp ?? [];
    const q = r.indicators?.quote?.[0];
    const candles: Candle[] = ts
      .map((t, i) => ({
        t,
        o: q?.open?.[i] ?? Number.NaN,
        h: q?.high?.[i] ?? Number.NaN,
        l: q?.low?.[i] ?? Number.NaN,
        c: q?.close?.[i] ?? Number.NaN,
        v: q?.volume?.[i] ?? 0,
      }))
      .filter(
        (c) =>
          Number.isFinite(c.o) &&
          Number.isFinite(c.h) &&
          Number.isFinite(c.l) &&
          Number.isFinite(c.c),
      );
    return {
      symbol,
      candles,
      meta: { prevClose: r.meta?.chartPreviousClose },
    };
  } catch (e) {
    console.warn(`[yahoo] candles ${symbol} ${range}/${interval} failed:`, (e as Error).message);
    return { symbol, candles: [] };
  }
}
