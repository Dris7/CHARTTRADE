import "server-only";

import { cfetch } from "~/server/services/http";

// Live financial news tape. Source: FinancialJuice RSS — a free, real-time
// headline feed (no key) that aggregates central-bank speak, economic data
// prints, geopolitics and market-moving headlines. We classify each headline
// into "critical" (market-moving) vs "normal" so the UI can mirror the
// FinancialJuice red/blue tape.

export type NewsImpact = "critical" | "normal";

// FinancialJuice-style topical categories. The RSS carries no category field,
// so we classify each headline ourselves (keyword match, multi-label).
export const NEWS_CATEGORIES = [
  "Bonds",
  "Commodities",
  "Crypto",
  "Equities",
  "Forex",
  "Indexes",
  "Macro",
  "Market Moving",
  "Elite",
  "Risk",
] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  ts: number; // epoch ms
  impact: NewsImpact;
  /** Coarse topic tag for the chip (CB / Geo / Data / Markets / News). */
  tag: string;
  /** FinancialJuice-style topical categories (multi-label) for filtering. */
  categories: NewsCategory[];
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

// Topical category rules (multi-label). Tuned against the live feed: with these
// ~85-90% of headlines land in at least one asset/macro category. "Market
// Moving" mirrors the critical flag and "Elite" the FinancialJuice premium tag.
const CATEGORY_RULES: Array<{ cat: NewsCategory; re: RegExp }> = [
  {
    cat: "Bonds",
    re: /\b(treasur|t-note|t-bond|t-bill|\bbills?\b|bund|gilt|jgb|btp|\boat\b|bond|yield|2s10s|coupon|debt auction|sovereign|\d+-?(year|week|month) (bond|note|bill|auction|yield)|duration)\b/i,
  },
  {
    cat: "Commodities",
    re: /\b(oil|crude|wti|brent|nymex|opec|\bgold\b|silver|copper|platinum|palladium|nat ?gas|natural gas|\blng\b|gasoline|diesel|distillate|cushing|gallon|metals?|wheat|corn|soybean|commodit|barrel|bbl)\b/i,
  },
  {
    cat: "Crypto",
    re: /\b(bitcoin|btc|ethereum|eth|crypto|stablecoin|blockchain|coinbase|binance|solana|xrp)\b/i,
  },
  {
    cat: "Equities",
    re: /(\b(stocks?|shares?|equit|earnings|ipo|dividend|buyback|guidance|merger|acquisition|listing|offering|corp|\binc\b|plc|holdings|options contracts)\b|\$[A-Za-z]{1,5}\b)/i,
  },
  {
    cat: "Forex",
    re: /\b(dollar|euro|yen|pound|sterling|franc|yuan|peso|forex|\bfx\b|currenc|dxy|eur\/usd|usd\/jpy|gbp|exchange rate|devalu)\b/i,
  },
  {
    cat: "Indexes",
    re: /(s&p|s&amp;p|nasdaq|dow jones|\bdow\b|ftse|dax|\bcac\b|nikkei|hang seng|russell|stoxx|e-mini|\bindex\b|indices|sensex|mo[oc] imbalance)/i,
  },
  {
    cat: "Macro",
    re: /\b(fed|fomc|ecb|boj|boe|pboc|snb|rba|rbnz|central bank|powell|lagarde|cpi|ppi|pce|inflation|gdp|payroll|unemploy|jobless|retail sales|redbook|building permits|pmi|rate (decision|hike|cut)|interest rate|fiscal|budget|tariff|\btrade\b|sentiment|survey|economic|home price|housing|mortgage|minister|chancellor|government|parliament|white house|kremlin|sanction|\bwar\b|nuclear|missile|rocket|military|\bidf\b|hezbollah|hamas|israel|iran|ukrain|russia|gaza|hormuz|troops|election|diplomat|treaty|summit|trump|commerce secretary|official)\b/i,
  },
  {
    cat: "Risk",
    re: /\b(risk-?on|risk-?off|risk appetite|safe ?haven|flight to|volatilit|\bvix\b|\bhaven\b|fear ?&? ?greed|panic|sell-?off|rout|plunge|surge|rally|crash|melt-?up|melt-?down)\b/i,
  },
];

function categorize(
  title: string,
  opts: { critical: boolean; elite: boolean },
): NewsCategory[] {
  const cats: NewsCategory[] = [];
  for (const { cat, re } of CATEGORY_RULES) if (re.test(title)) cats.push(cat);
  if (opts.critical) cats.push("Market Moving");
  if (opts.elite) cats.push("Elite");
  return cats;
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
      // The "- FJElite" suffix marks FinancialJuice premium items: record it for
      // the Elite filter, then drop the promotional tag from the display title.
      const elite = /-\s*FJElite\s*$/i.test(title);
      title = title.replace(/\s*-\s*FJ(Elite)?\s*$/i, "").trim();
      const url = field(b, "link") || field(b, "guid");
      if (!title || !url) continue;
      const pub = field(b, "pubDate") || field(b, "dc:date");
      const ts = pub ? new Date(pub).getTime() : Date.now();
      const impact = classify(title);
      out.push({
        id: `${feed.source}-${field(b, "guid") || url}`,
        title,
        url,
        source: feed.source,
        ts: Number.isFinite(ts) ? ts : Date.now(),
        impact,
        tag: tagOf(title),
        categories: categorize(title, { critical: impact === "critical", elite }),
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
