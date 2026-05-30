import "server-only";

// Centralized server-side HTTP for upstream data providers. Two jobs:
//
//   1. Per-host concurrency cap. On serverless (Netlify) every outbound call
//      shares ONE datacenter IP, so a cold dashboard firing 20+ requests at once
//      gets rate-limited (429) or edge-blocked (403) by FRED / Yahoo / investing.
//      Capping concurrency per host lets the first calls succeed — which is what
//      lets the durable cache populate in the first place.
//
//   2. Cacheable by default. We set `next.revalidate` and DELIBERATELY DO NOT
//      attach an AbortSignal: a signal opts the request out of Next's Data Cache,
//      which Netlify persists durably across cold starts. Once a response is
//      cached, every later invocation is served from cache and the upstream is
//      hit at most once per TTL — and if a background refresh is blocked, the
//      last good value keeps being served (stale-on-error). Latency is bounded
//      with a timeout race instead of an abort.
//
// Local dev is unaffected: the concurrency caps are generous and Next's cache
// behaves the same.

const HOST_LIMIT: Record<string, number> = {
  "api.stlouisfed.org": 3,
  "fred.stlouisfed.org": 3,
  "query1.finance.yahoo.com": 2,
  "query2.finance.yahoo.com": 2,
  "tvc6.investing.com": 2,
  "api.nasdaq.com": 3,
  "stooq.com": 4,
  "stooq.pl": 4,
};
const DEFAULT_LIMIT = 6;

const active = new Map<string, number>();
const waiters = new Map<string, Array<() => void>>();

async function withSlot<T>(host: string, fn: () => Promise<T>): Promise<T> {
  const limit = HOST_LIMIT[host] ?? DEFAULT_LIMIT;
  while ((active.get(host) ?? 0) >= limit) {
    await new Promise<void>((resolve) => {
      const q = waiters.get(host) ?? [];
      q.push(resolve);
      waiters.set(host, q);
    });
  }
  active.set(host, (active.get(host) ?? 0) + 1);
  try {
    return await fn();
  } finally {
    active.set(host, Math.max(0, (active.get(host) ?? 1) - 1));
    waiters.get(host)?.shift()?.();
  }
}

// In-flight request coalescing. When several panels ask for the same upstream
// resource at once on a cold start (e.g. 3 procedures each needing FRED series
// VIXCLS before any has cached it), this collapses them to ONE fetch — the rest
// await the same promise. Keyed by the caller (typically the cache key / URL).
const inflight = new Map<string, Promise<unknown>>();

export function coalesce<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

class TimeoutError extends Error {}

export interface CFetchOpts {
  /** Next Data Cache TTL in seconds (durable on Netlify across cold starts). */
  revalidate?: number;
  /** Bound latency without an AbortSignal (which would disable caching). */
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: BodyInit;
}

/**
 * Cacheable, concurrency-capped fetch for upstream providers.
 * Returns a normal Response — read `.json()` / `.text()` as usual.
 * Throws on network error or timeout (callers already handle that).
 */
export async function cfetch(url: string, opts: CFetchOpts = {}): Promise<Response> {
  const {
    revalidate = 300,
    timeoutMs = 9000,
    headers,
    method = "GET",
    body,
  } = opts;

  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    /* relative/invalid URL — fall through with empty host (default limit) */
  }

  return withSlot(host, () => {
    const req = fetch(url, { method, headers, body, next: { revalidate } });
    // If the timeout wins, the fetch keeps running un-awaited; swallow any later
    // rejection so it doesn't surface as an unhandledRejection.
    req.catch(() => undefined);
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new TimeoutError(`timeout after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
    return Promise.race([req, timeout]).finally(() => clearTimeout(timer));
  });
}
