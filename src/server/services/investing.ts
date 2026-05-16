import "server-only";

// Investing.com's TVC (TradingView chart) backend at tvc6.investing.com.
// This is the single most complete free source for Eurex bond futures
// (Bund/Bobl/Schatz/Buxl) and many other delayed feeds. The endpoint is
// Cloudflare-protected — we send the same headers Investing.com's own
// front-end uses. If Cloudflare challenges us, we gracefully fail and let
// the caller fall back to another source.
//
// Reference: investiny (alvarobartt/investiny) — investiny/historical.py
// Symbol IDs are Investing.com's internal numeric pair IDs (stable, can be
// hard-coded).

export interface InvestingCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

// Confirmed Investing.com pair IDs (from research + investiny tests).
// Bund family is the headline win — these are otherwise paywalled everywhere.
export const INVESTING_IDS = {
  // Eurex bond futures (verified front-month continuous IDs)
  FGBL: 8907, // Bund 10Y
  FGBM: 40737, // Bobl 5Y
  FGBS: 40740, // Schatz 2Y
  FGBX: 1061755, // Buxl 30Y
  // US bond futures
  ZN: 1179501, // 10Y T-Note (continuous)
  ZB: 1179503, // 30Y T-Bond (continuous)
  // Equity futures + indices
  ES: 8839,
  NQ: 8874,
  SPX: 40826, // S&P 500 cash index
  DAX: 172,
  VIX: 44336,
  MOVE: 1175152,
  // FX / commodities
  DXY: 1224074, // US Dollar Index
  GOLD: 1178341, // Gold front-month future
  OIL: 1178037, // WTI Crude front-month future
} as const;

export type InvestingKey = keyof typeof INVESTING_IDS;

type Resolution = "1" | "5" | "15" | "30" | "60" | "300" | "D" | "W" | "M";

interface UdfResp {
  s?: "ok" | "no_data" | "error";
  t?: number[];
  o?: number[];
  h?: number[];
  l?: number[];
  c?: number[];
  v?: number[];
  errmsg?: string;
}

const cache = new Map<string, { exp: number; v: InvestingCandle[] }>();

export async function getInvestingHistory(
  key: InvestingKey,
  resolution: Resolution = "D",
  daysBack = 90,
): Promise<InvestingCandle[]> {
  const id = INVESTING_IDS[key];
  const now = Math.floor(Date.now() / 1000);
  const from = now - daysBack * 86_400;
  const cacheKey = `${id}:${resolution}:${daysBack}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.exp > Date.now()) return hit.v;

  // Token segment of the URL — any 32-hex value works per investiny tests.
  const token = "3f17a72b0e0f6d23a8f8b9e6ad3b0e5c";
  const url = `https://tvc6.investing.com/${token}/${now}/56/56/23/history?symbol=${id}&resolution=${resolution}&from=${from}&to=${now}`;

  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 12000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        Origin: "https://tvc-invdn-com.investing.com",
        Referer: "https://tvc-invdn-com.investing.com/",
        "Content-Type": "text/plain",
      },
      cache: "no-store",
      signal: c.signal,
    });
    if (!res.ok) throw new Error(`investing ${res.status}`);
    const text = await res.text();
    // Cloudflare challenge page is HTML, not JSON
    if (!text.startsWith("{")) throw new Error("investing cloudflare");
    const data = JSON.parse(text) as UdfResp;
    if (data.s !== "ok" || !data.t || !data.c) return [];
    const out: InvestingCandle[] = data.t.map((time, i) => ({
      t: time,
      o: data.o?.[i] ?? data.c![i]!,
      h: data.h?.[i] ?? data.c![i]!,
      l: data.l?.[i] ?? data.c![i]!,
      c: data.c![i]!,
      v: data.v?.[i] ?? 0,
    }));
    cache.set(cacheKey, { exp: Date.now() + 90_000, v: out });
    return out;
  } catch (e) {
    console.warn(`[investing] ${key} failed:`, (e as Error).message);
    return [];
  } finally {
    clearTimeout(t);
  }
}
