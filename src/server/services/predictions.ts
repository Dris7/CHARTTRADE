import "server-only";

import { cfetch } from "~/server/services/http";

// Prediction markets — macro questions from Polymarket (free gamma API, no key).
// We search a curated set of macro topics, dedupe by event, and surface the
// implied probability + volume. Polymarket has deep, liquid macro markets
// (Fed cuts, recession, inflation, index levels) with clean Yes/No pricing.

export interface Prediction {
  id: string;
  title: string;
  /** Probability of the headline outcome, 0..100. */
  prob: number;
  /** Label for what `prob` refers to ("Yes", or a sub-outcome title). */
  outcomeLabel: string;
  volume: number;
  endDate: string;
  url: string;
  source: "Polymarket";
}

const QUERIES = [
  "fed rate cut",
  "recession 2026",
  "inflation cpi",
  "s&p 500",
  "powell",
  "us unemployment",
];

interface GammaMarket {
  question?: string;
  outcomes?: string;
  outcomePrices?: string;
  groupItemTitle?: string;
  volumeNum?: number;
}
interface GammaEvent {
  id?: string;
  title?: string;
  slug?: string;
  volume?: number | string;
  endDate?: string;
  markets?: GammaMarket[];
}

let cache: { exp: number; v: Prediction[] } | null = null;

function parseArr(s: string | undefined): string[] {
  if (!s) return [];
  try {
    return JSON.parse(s) as string[];
  } catch {
    return [];
  }
}

function eventToPrediction(e: GammaEvent): Prediction | null {
  const markets = e.markets ?? [];
  if (!e.title || !e.slug || markets.length === 0) return null;

  let best: { prob: number; label: string } | null = null;
  if (markets.length === 1) {
    // Binary market → Yes probability.
    const m = markets[0]!;
    const prices = parseArr(m.outcomePrices);
    const outs = parseArr(m.outcomes);
    const yesIdx = outs.findIndex((o) => /yes/i.test(o));
    const idx = yesIdx >= 0 ? yesIdx : 0;
    const p = parseFloat(prices[idx] ?? "");
    if (Number.isFinite(p)) best = { prob: p * 100, label: outs[idx] ?? "Yes" };
  } else {
    // Multi-outcome event → the leading sub-outcome.
    for (const m of markets) {
      const prices = parseArr(m.outcomePrices);
      const outs = parseArr(m.outcomes);
      const yesIdx = outs.findIndex((o) => /yes/i.test(o));
      const p = parseFloat(prices[yesIdx >= 0 ? yesIdx : 0] ?? "");
      if (Number.isFinite(p) && (!best || p * 100 > best.prob)) {
        best = { prob: p * 100, label: m.groupItemTitle ?? m.question ?? "" };
      }
    }
  }
  if (!best) return null;

  return {
    id: e.slug,
    title: e.title,
    prob: best.prob,
    outcomeLabel: best.label,
    volume: Number(e.volume ?? 0),
    endDate: e.endDate ? e.endDate.slice(0, 10) : "",
    url: `https://polymarket.com/event/${e.slug}`,
    source: "Polymarket",
  };
}

async function search(q: string): Promise<GammaEvent[]> {
  const url = `https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(
    q,
  )}&limit_per_type=4&events_status=active`;
  try {
    const res = await cfetch(url, {
      headers: { Accept: "application/json" },
      revalidate: 600,
      timeoutMs: 8000,
    });
    if (!res.ok) throw new Error(`polymarket ${res.status}`);
    const json = (await res.json()) as { events?: GammaEvent[] };
    return json.events ?? [];
  } catch (e) {
    console.warn(`[predictions] "${q}" failed:`, (e as Error).message);
    return [];
  }
}

export async function getPredictions(): Promise<Prediction[]> {
  if (cache && cache.exp > Date.now()) return cache.v;

  const batches = await Promise.all(QUERIES.map(search));
  const seen = new Set<string>();
  const out: Prediction[] = [];
  for (const ev of batches.flat()) {
    const p = eventToPrediction(ev);
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      out.push(p);
    }
  }
  out.sort((a, b) => b.volume - a.volume);
  const top = out.slice(0, 8);

  if (top.length > 0) cache = { exp: Date.now() + 10 * 60_000, v: top };
  return top;
}
