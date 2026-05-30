import "server-only";

// CME Group's public web service for delayed (≈10 min) futures quotes.
// Endpoint pattern: https://www.cmegroup.com/CmeWS/mvc/Quotes/Future/{productId}/G
// Returns JSON: { quotes: [{ last, change, percentageChange, high, low, ... }] }
// No auth, no key. Used unofficially by many open-source tools.

import { cfetch } from "~/server/services/http";

export interface CmeQuote {
  productId: number;
  symbol: string;
  last: number;
  prev: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  open: number;
  volume: number;
  expirationDate: string;
  asOf: number;
}

interface CmeResp {
  quotes?: Array<{
    last?: string;
    change?: string;
    percentageChange?: string;
    priorSettle?: string;
    high?: string;
    low?: string;
    open?: string;
    volume?: string;
    expirationDate?: string;
    productCode?: string;
    code?: string;
    updated?: string;
  }>;
}

// productId → CME contract page slug numeric id
export const CME_PRODUCT_IDS: Record<string, number> = {
  ES: 133, // E-mini S&P 500
  NQ: 135, // E-mini Nasdaq
  ZN: 820, // 10Y T-Note
  ZB: 818, // 30Y T-Bond
  UB: 8479, // Ultra Bond
  ZT: 821, // 2Y
  ZF: 819, // 5Y
};

const cache = new Map<string, { exp: number; q: CmeQuote }>();

async function fetchCme(productId: number): Promise<CmeQuote | null> {
  const cached = cache.get(String(productId));
  if (cached && cached.exp > Date.now()) return cached.q;

  const url = `https://www.cmegroup.com/CmeWS/mvc/Quotes/Future/${productId}/G`;
  try {
    // Shared Next.js data cache across serverless invocations (delayed feed).
    const res = await cfetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/json,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: `https://www.cmegroup.com/markets/`,
      },
      revalidate: 60,
      timeoutMs: 12000,
    });
    if (!res.ok) throw new Error(`CME ${res.status}`);
    const data = (await res.json()) as CmeResp;
    const front = data.quotes?.[0];
    if (!front?.last) return null;
    const last = num(front.last);
    const prev = num(front.priorSettle) || last;
    const change = num(front.change) || last - prev;
    const changePct = num(front.percentageChange) || (prev ? (change / prev) * 100 : 0);
    const q: CmeQuote = {
      productId,
      symbol: front.code ?? String(productId),
      last,
      prev,
      change,
      changePct,
      high: num(front.high),
      low: num(front.low),
      open: num(front.open),
      volume: num(front.volume),
      expirationDate: front.expirationDate ?? "",
      asOf: Date.now(),
    };
    cache.set(String(productId), { exp: Date.now() + 60_000, q });
    return q;
  } catch (e) {
    console.warn(`[cme] ${productId} failed:`, (e as Error).message);
    return null;
  }
}

function num(s?: string): number {
  if (!s) return 0;
  // CME sometimes returns prices like "5,432'25" (32nds notation) or "5432.50".
  // For the dashboard's MVP we only handle the simple decimal form. Bond
  // futures arrive in "112'105" notation (32nds + halves) — that needs a real
  // parser; for now we strip commas and parse what we can.
  const stripped = s.replace(/,/g, "");
  // Bond fut notation "109'205" → 109 + 20.5/32 = 109.6406
  const m = /^(-?\d+)'(\d+)$/.exec(stripped);
  if (m) {
    const whole = parseInt(m[1]!, 10);
    const frac = m[2]!;
    const thirty2s = parseInt(frac.slice(0, 2), 10);
    const half = frac.length >= 3 ? parseInt(frac.slice(2), 10) : 0;
    const sign = whole < 0 ? -1 : 1;
    return sign * (Math.abs(whole) + (thirty2s + half / 10) / 32);
  }
  const v = parseFloat(stripped);
  return Number.isFinite(v) ? v : 0;
}

export async function getCmeQuote(key: string): Promise<CmeQuote | null> {
  const id = CME_PRODUCT_IDS[key];
  if (!id) return null;
  return fetchCme(id);
}
