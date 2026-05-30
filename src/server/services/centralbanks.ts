import "server-only";

// Central Bank Watch — Fed + ECB press-release RSS, merged and tagged. No key.

export interface CbItem {
  id: string;
  title: string;
  url: string;
  source: "Fed" | "ECB";
  ts: number;
  /** Lightweight tag from the headline (Rates / Speech / Minutes / Other). */
  tag: string;
}

const FEEDS: Array<{ url: string; source: CbItem["source"] }> = [
  { url: "https://www.federalreserve.gov/feeds/press_all.xml", source: "Fed" },
  { url: "https://www.ecb.europa.eu/rss/press.html", source: "ECB" },
];

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

let cache: { exp: number; items: CbItem[] } | null = null;

function stripCdata(s: string): string {
  return s
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function field(block: string, tag: string): string {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  return m ? stripCdata(m[1] ?? "") : "";
}

function tagOf(title: string): string {
  const t = title.toLowerCase();
  if (/rate (decision|statement)|monetary policy|interest rate|key ecb/.test(t))
    return "Rates";
  if (/minutes|account of|accounts of/.test(t)) return "Minutes";
  if (/speech|remarks|testimony|speaks|statement by|interview/.test(t))
    return "Speech";
  if (/projection|forecast|economic bulletin|sep\b/.test(t)) return "Outlook";
  return "Press";
}

async function fetchFeed(
  url: string,
  source: CbItem["source"],
): Promise<CbItem[]> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 9000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml,text/xml,*/*" },
      next: { revalidate: 1800 },
      signal: c.signal,
    });
    if (!res.ok) throw new Error(`${source} ${res.status}`);
    const xml = await res.text();
    const blocks = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
    const out: CbItem[] = [];
    for (const b of blocks) {
      const title = field(b, "title");
      let url2 = field(b, "link") || field(b, "guid");
      // ECB links sometimes have a double slash after the host.
      url2 = url2.replace("ecb.europa.eu//", "ecb.europa.eu/");
      if (!title || !url2) continue;
      const pub = field(b, "pubDate") || field(b, "dc:date");
      const ts = pub ? new Date(pub).getTime() : Date.now();
      out.push({
        id: `${source}-${url2}`,
        title,
        url: url2,
        source,
        ts: Number.isFinite(ts) ? ts : Date.now(),
        tag: tagOf(title),
      });
    }
    return out;
  } catch (e) {
    console.warn(`[cb] ${source} failed:`, (e as Error).message);
    return [];
  } finally {
    clearTimeout(t);
  }
}

export async function getCentralBankItems(): Promise<CbItem[]> {
  if (cache && cache.exp > Date.now()) return cache.items;

  const batches = await Promise.all(FEEDS.map((f) => fetchFeed(f.url, f.source)));
  const items = batches.flat().sort((a, b) => b.ts - a.ts).slice(0, 18);

  if (items.length > 0) cache = { exp: Date.now() + 30 * 60_000, items };
  return items;
}
