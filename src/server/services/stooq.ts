import "server-only";

// Stooq is the most reliable free market data provider. It serves CSV
// (effectively scraped from its own site) with no auth, very high uptime, and
// covers futures, yields, indices and FX.
//
// Quote endpoint:  https://stooq.com/q/l/?s=SYMBOL&f=sd2t2ohlcv&h&e=csv
// History (daily): https://stooq.com/q/d/l/?s=SYMBOL&i=d
//
// Symbols below are the canonical Stooq tickers. The full list is browsable
// at https://stooq.com/q/?s=SYMBOL.

const HOST = "https://stooq.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface StooqQuote {
  symbol: string;
  date: string;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StooqCandle {
  t: number; // unix seconds
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

// --- caching + concurrency ---------------------------------------------------

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

let inflight = 0;
const queue: Array<() => void> = [];
async function acquire() {
  if (inflight < 6) {
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

async function fetchCsv(path: string, ttlMs: number): Promise<string> {
  const key = `stq:${path}`;
  const hit = cacheGet<string>(key);
  if (hit) return hit;
  await acquire();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${HOST}${path}`, {
      headers: { "User-Agent": UA, Accept: "text/csv, text/plain,*/*" },
      // Shared Next.js data cache across serverless invocations; mirror the
      // L1 memCache TTL so both layers expire together.
      next: { revalidate: Math.max(30, Math.round(ttlMs / 1000)) },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Stooq ${res.status}`);
    const text = await res.text();
    if (text.includes("No data") || text.trim() === "") {
      throw new Error("Stooq: empty");
    }
    cacheSet(key, text, ttlMs);
    return text;
  } finally {
    clearTimeout(timer);
    release();
  }
}

// --- parsing -----------------------------------------------------------------

function parseCsv(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(","));
}

export async function getStooqQuote(symbol: string): Promise<StooqQuote | null> {
  try {
    const text = await fetchCsv(
      `/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`,
      20_000,
    );
    const rows = parseCsv(text);
    if (rows.length < 2 || !rows[1]) return null;
    const [s, d, t, o, h, l, c, v] = rows[1];
    if (!c || c === "N/D") return null;
    return {
      symbol: s ?? symbol,
      date: d ?? "",
      time: t ?? "",
      open: parseFloat(o ?? "0"),
      high: parseFloat(h ?? "0"),
      low: parseFloat(l ?? "0"),
      close: parseFloat(c ?? "0"),
      volume: parseFloat(v ?? "0"),
    };
  } catch {
    return null;
  }
}

export async function getStooqDaily(
  symbol: string,
  limit = 200,
): Promise<StooqCandle[]> {
  try {
    const text = await fetchCsv(
      `/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`,
      120_000,
    );
    const rows = parseCsv(text);
    rows.shift(); // header
    const out: StooqCandle[] = [];
    for (const r of rows) {
      const [date, o, h, l, c, v] = r;
      if (!date || !c) continue;
      const t = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
      const candle: StooqCandle = {
        t,
        o: parseFloat(o ?? "0"),
        h: parseFloat(h ?? "0"),
        l: parseFloat(l ?? "0"),
        c: parseFloat(c ?? "0"),
        v: parseFloat(v ?? "0"),
      };
      if (Number.isFinite(candle.c)) out.push(candle);
    }
    return out.slice(-limit);
  } catch {
    return [];
  }
}

// Pull the last N intraday 5-minute prints (Stooq exposes /q/?s=SYM&d=&t=&i=5).
// This endpoint is HTML, but it returns a table; for the MVP we stick with EOD
// + a "live last" from the quote endpoint. Easy to extend later.
