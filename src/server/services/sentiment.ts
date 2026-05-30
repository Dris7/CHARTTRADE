import "server-only";

// Crypto Fear & Greed index from alternative.me (free, no key). A useful
// cross-asset risk-appetite proxy. Labelled as crypto sentiment in the UI.

export interface FearGreed {
  value: number; // 0..100
  classification: string;
  date: string;
  history: number[]; // recent values, oldest-first, for a sparkline
}

interface FngResp {
  data?: Array<{
    value?: string;
    value_classification?: string;
    timestamp?: string;
  }>;
}

let cache: { exp: number; v: FearGreed } | null = null;

export async function getFearGreed(): Promise<FearGreed | null> {
  if (cache && cache.exp > Date.now()) return cache.v;

  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 8000);
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=30", {
      headers: { Accept: "application/json" },
      next: { revalidate: 1800 },
      signal: c.signal,
    });
    if (!res.ok) throw new Error(`fng ${res.status}`);
    const json = (await res.json()) as FngResp;
    const data = json.data ?? [];
    if (data.length === 0) return null;
    const latest = data[0]!;
    const out: FearGreed = {
      value: parseInt(latest.value ?? "0", 10),
      classification: latest.value_classification ?? "Neutral",
      date: latest.timestamp
        ? new Date(Number(latest.timestamp) * 1000).toISOString().slice(0, 10)
        : "",
      // API returns newest-first; reverse for oldest-first sparkline.
      history: data
        .map((d) => parseInt(d.value ?? "0", 10))
        .filter((n) => Number.isFinite(n))
        .reverse(),
    };
    cache = { exp: Date.now() + 30 * 60_000, v: out };
    return out;
  } catch (e) {
    console.warn("[fng] failed:", (e as Error).message);
    return null;
  } finally {
    clearTimeout(t);
  }
}
