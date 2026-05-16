import "server-only";

// CoinGecko free public API — no key, 10-50 calls/min.
// We use it for BTC since the futures-oriented feeds don't cover crypto well.

export interface CgQuote {
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  asOf: number;
}

export interface CgCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

const cache = new Map<string, { exp: number; v: unknown }>();

type CgSimpleResp = Record<
  string,
  {
    usd?: number;
    usd_24h_change?: number;
    last_updated_at?: number;
  }
>;

interface CgMarketChartResp {
  prices?: Array<[number, number]>;
  total_volumes?: Array<[number, number]>;
}

async function fetchCg<T>(path: string, ttlMs: number): Promise<T | null> {
  const key = `cg:${path}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.v as T;

  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 8000);
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3${path}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
      signal: c.signal,
    });
    if (!res.ok) throw new Error(`coingecko ${res.status}`);
    const v = (await res.json()) as T;
    cache.set(key, { exp: Date.now() + ttlMs, v });
    return v;
  } catch (e) {
    console.warn(`[coingecko] ${path} failed:`, (e as Error).message);
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function getCryptoQuote(coinId = "bitcoin"): Promise<CgQuote | null> {
  const data = await fetchCg<CgSimpleResp>(
    `/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`,
    60_000,
  );
  const row = data?.[coinId];
  if (!row?.usd) return null;
  const changePct = row.usd_24h_change ?? 0;
  // 24h change percentage → derive prev close
  const prevClose = row.usd / (1 + changePct / 100);
  const change = row.usd - prevClose;
  return {
    price: row.usd,
    prevClose,
    change,
    changePct,
    asOf: (row.last_updated_at ?? Math.floor(Date.now() / 1000)) * 1000,
  };
}

export async function getCryptoCandles(
  coinId = "bitcoin",
  days = 90,
): Promise<CgCandle[]> {
  const data = await fetchCg<CgMarketChartResp>(
    `/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=daily`,
    300_000,
  );
  if (!data?.prices) return [];
  const vols = new Map<number, number>(
    (data.total_volumes ?? []).map(([ts, v]) => [ts, v]),
  );
  // CoinGecko returns one price/day at UTC 00:00. We synthesize OHLC from the
  // single close — fine for a sparkline / area chart.
  return data.prices.map(([ts, p]) => ({
    t: Math.floor(ts / 1000),
    o: p,
    h: p,
    l: p,
    c: p,
    v: vols.get(ts) ?? 0,
  }));
}
