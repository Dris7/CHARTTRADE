import "server-only";

import { cfetch } from "~/server/services/http";

// CNN Fear & Greed Index — the US-equity market sentiment gauge (0..100),
// derived from 7 indicators (momentum, breadth, volatility, safe-haven demand,
// junk-bond demand, put/call, market strength). Free, no key, via CNN's public
// dataviz endpoint. Needs a browser User-Agent + Referer or CNN returns a 418.

export interface FearGreed {
  value: number; // 0..100
  classification: string;
  date: string;
  history: number[]; // recent values, oldest-first, for a sparkline
}

interface CnnResp {
  fear_and_greed?: {
    score?: number;
    rating?: string;
    timestamp?: string;
  };
  fear_and_greed_historical?: {
    data?: Array<{ x?: number; y?: number; rating?: string }>;
  };
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

let cache: { exp: number; v: FearGreed } | null = null;

export async function getFearGreed(): Promise<FearGreed | null> {
  if (cache && cache.exp > Date.now()) return cache.v;

  try {
    const res = await cfetch(
      "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
      {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          Referer: "https://www.cnn.com/markets/fear-and-greed",
        },
        revalidate: 1800,
        timeoutMs: 8000,
      },
    );
    if (!res.ok) throw new Error(`cnn fng ${res.status}`);
    const json = (await res.json()) as CnnResp;
    const fg = json.fear_and_greed;
    if (!fg || typeof fg.score !== "number") return null;

    const hist = (json.fear_and_greed_historical?.data ?? [])
      .map((d) => (typeof d.y === "number" ? Math.round(d.y) : null))
      .filter((n): n is number => n != null);

    const out: FearGreed = {
      value: Math.round(fg.score),
      classification: titleCase(fg.rating ?? "Neutral"),
      date: fg.timestamp ? fg.timestamp.slice(0, 10) : "",
      history: hist.slice(-30),
    };
    cache = { exp: Date.now() + 30 * 60_000, v: out };
    return out;
  } catch (e) {
    console.warn("[fng] failed:", (e as Error).message);
    return null;
  }
}
