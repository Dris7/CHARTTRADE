import "server-only";

import { cfetch } from "~/server/services/http";

// Live financial news tape. Source: FinancialJuice RSS — a free, real-time
// headline feed (no key) that aggregates central-bank speak, economic data
// prints, geopolitics and market-moving headlines. We classify each headline
// into "critical" (market-moving) vs "normal" so the UI can mirror the
// FinancialJuice red/blue tape.

export type NewsImpact = "critical" | "normal";

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  ts: number; // epoch ms
  impact: NewsImpact;
  /** Coarse topic tag for the chip (CB / Geo / Data / Markets / News). */
  tag: string;
}

const FEEDS: Array<{ url: string; source: string; prefix?: RegExp }> = [
  {
    url: "https://www.financialjuice.com/feed.ashx?xy=rss",
    source: "FinancialJuice",
    prefix: /^FinancialJuice:\s*/i,
  },
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// --- impact classification ---------------------------------------------------
//
// "Critical" = the kind of headline FinancialJuice flags red: central-bank
// policy, top-tier data surprises, geopolitics/conflict, and market shocks.
// Everything else (routine data prints, corporate snippets) stays "normal".

const CRITICAL = [
  // Central banks & monetary policy
  /\b(fed|fomc|powell|ecb|lagarde|boj|ueda|boe|bailey|pboc|snb|rba|rbnz|riksbank|central bank)\b/i,
  /\b(rate (decision|hike|cut|hold)|interest rate|basis points|\d+\s?bps?|hawkish|dovish|monetary policy|quantitative (easing|tightening)|rate path)\b/i,
  // Top-tier macro data
  /\b(cpi|core pce|\bpce\b|inflation|nonfarm|non-farm|payrolls|\bnfp\b|unemployment rate|jobless claims|\bgdp\b|ppi\b|retail sales)\b/i,
  // Geopolitics / conflict
  /\b(war|missile|airstrike|air strike|drone strike|attack|nuclear|sanction|invasion|ceasefire|military|troops|tariff|trade war|embargo|coup|terror)\b/i,
  /\b(iran|israel|russia|ukraine|gaza|houthi|taiwan|north korea|opec)\b/i,
  // Market shocks & officials
  /\b(crash|plunge|plunges|tumble|slump|sell-?off|halt(ed|s)?|circuit breaker|emergency|default|bankruptcy|collapse|crisis|downgrade|recession|bailout)\b/i,
  /\b(trump|white house|treasury secretary|breaking)\b/i,
];

function classify(title: string): NewsImpact {
  return CRITICAL.some((re) => re.test(title)) ? "critical" : "normal";
}

function tagOf(title: string): string {
  const t = title.toLowerCase();
  if (
    /\b(fed|fomc|powell|ecb|lagarde|boj|boe|pboc|snb|rba|central bank|rate (decision|hike|cut)|monetary policy)\b/.test(
      t,
    )
  )
    return "CB";
  if (
    /\b(war|missile|strike|attack|nuclear|sanction|invasion|tariff|iran|israel|russia|ukraine|opec|geopolit)/.test(
      t,
    )
  )
    return "Geo";
  if (/forecast|previous|actual|\bcpi\b|\bgdp\b|payrolls|inflation|\bppi\b/.test(t))
    return "Data";
  if (/\b(stocks?|shares?|yields?|dollar|oil|gold|bitcoin|crash|plunge|surge|rally)\b/.test(t))
    return "Markets";
  return "News";
}

// --- parsing -----------------------------------------------------------------

function stripCdata(s: string): string {
  return s
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function field(block: string, tag: string): string {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  return m ? stripCdata(m[1] ?? "") : "";
}

let cache: { exp: number; items: NewsItem[] } | null = null;

async function fetchFeed(feed: (typeof FEEDS)[number]): Promise<NewsItem[]> {
  try {
    const res = await cfetch(feed.url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml,text/xml,*/*" },
      // Live tape — short cache so it stays fresh, but still shared/durable.
      revalidate: 120,
      timeoutMs: 9000,
    });
    if (!res.ok) throw new Error(`${feed.source} ${res.status}`);
    const xml = await res.text();
    const blocks = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
    const out: NewsItem[] = [];
    for (const b of blocks) {
      let title = field(b, "title");
      if (feed.prefix) title = title.replace(feed.prefix, "").trim();
      // Drop FinancialJuice's promotional source tags ("- FJElite", "- FJ").
      title = title.replace(/\s*-\s*FJ(Elite)?\s*$/i, "").trim();
      const url = field(b, "link") || field(b, "guid");
      if (!title || !url) continue;
      const pub = field(b, "pubDate") || field(b, "dc:date");
      const ts = pub ? new Date(pub).getTime() : Date.now();
      out.push({
        id: `${feed.source}-${field(b, "guid") || url}`,
        title,
        url,
        source: feed.source,
        ts: Number.isFinite(ts) ? ts : Date.now(),
        impact: classify(title),
        tag: tagOf(title),
      });
    }
    return out;
  } catch (e) {
    console.warn(`[news] ${feed.source} failed:`, (e as Error).message);
    return [];
  }
}

export async function getNews(): Promise<NewsItem[]> {
  if (cache && cache.exp > Date.now()) return cache.items;

  const batches = await Promise.all(FEEDS.map(fetchFeed));
  // Dedupe by title, newest-first, cap the tape length.
  const seen = new Set<string>();
  const items = batches
    .flat()
    .sort((a, b) => b.ts - a.ts)
    .filter((it) => {
      const k = it.title.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 120);

  if (items.length > 0) cache = { exp: Date.now() + 2 * 60_000, items };
  return items;
}
