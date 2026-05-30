import "server-only";

// S&P 500 sector ETFs — used for the Sector Heatmap and an SMA-based breadth
// proxy. Data from Yahoo (the existing candles layer); ETFs aren't in the macro
// SYMBOLS map so we query Yahoo tickers directly here.

import { getCandles } from "~/server/services/yahoo";
import { cfetch } from "~/server/services/http";

const NASDAQ_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

interface SectorDef {
  ticker: string;
  name: string;
}

const SECTOR_ETFS: SectorDef[] = [
  { ticker: "XLK", name: "Technology" },
  { ticker: "XLF", name: "Financials" },
  { ticker: "XLE", name: "Energy" },
  { ticker: "XLV", name: "Health Care" },
  { ticker: "XLY", name: "Cons. Disc." },
  { ticker: "XLP", name: "Cons. Staples" },
  { ticker: "XLI", name: "Industrials" },
  { ticker: "XLU", name: "Utilities" },
  { ticker: "XLB", name: "Materials" },
  { ticker: "XLRE", name: "Real Estate" },
  { ticker: "XLC", name: "Comm. Svcs" },
  { ticker: "SMH", name: "Semiconductors" },
];

export interface SectorCell {
  ticker: string;
  name: string;
  price: number | null;
  changePct: number | null;
  above50: boolean | null;
  above200: boolean | null;
}

export interface SectorBreadth {
  above50Pct: number;
  above200Pct: number;
  total: number;
  counted: number;
}

export interface SectorBoard {
  sectors: SectorCell[];
  breadth: SectorBreadth;
  asOf: number;
}

let cache: { exp: number; board: SectorBoard } | null = null;

function sma(values: number[], window: number): number | null {
  if (values.length < window) return null;
  const slice = values.slice(-window);
  return slice.reduce((s, v) => s + v, 0) / window;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface NasdaqHist {
  data?: { tradesTable?: { rows?: Array<{ close?: string }> } };
}

/** Primary source: Nasdaq's keyless historical API (fresh host, ~1y OHLC). */
async function fetchNasdaqCloses(ticker: string): Promise<number[]> {
  const to = new Date();
  const from = new Date(Date.now() - 400 * 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url =
    `https://api.nasdaq.com/api/quote/${ticker}/historical` +
    `?assetclass=etf&fromdate=${fmt(from)}&todate=${fmt(to)}&limit=400`;
  try {
    const res = await cfetch(url, {
      headers: { "User-Agent": NASDAQ_UA, Accept: "application/json" },
      revalidate: 300,
      timeoutMs: 9000,
    });
    if (!res.ok) throw new Error(`nasdaq ${res.status}`);
    const json = (await res.json()) as NasdaqHist;
    const rows = json.data?.tradesTable?.rows ?? [];
    // Newest-first → parse close, reverse to oldest-first.
    const closes = rows
      .map((r) => parseFloat((r.close ?? "").replace(/[$,]/g, "")))
      .filter((n) => Number.isFinite(n))
      .reverse();
    return closes;
  } catch (e) {
    console.warn(`[sectors] nasdaq ${ticker} failed:`, (e as Error).message);
    return [];
  }
}

/** Fetch one sector's closes: Nasdaq primary, Yahoo fallback (with 429 retry). */
async function fetchCloses(ticker: string): Promise<number[]> {
  const nd = await fetchNasdaqCloses(ticker);
  if (nd.length >= 60) return nd;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { candles } = await getCandles(ticker, "1y", "1d");
    const closes = candles.map((c) => c.c).filter((c) => Number.isFinite(c));
    if (closes.length >= 60) return closes;
    if (attempt < 2) await sleep(1000 * (attempt + 1));
  }
  return nd; // may be short, better than nothing
}

export async function getSectorBoard(): Promise<SectorBoard> {
  if (cache && cache.exp > Date.now()) return cache.board;

  // Sequential (not Promise.all): firing 12 Yahoo calls at once during a page's
  // existing Yahoo storm triggers a hard 429. One-at-a-time + retry recovers,
  // and the 5-min cache means this cost is paid only once.
  const cells: SectorCell[] = [];
  for (const s of SECTOR_ETFS) {
    try {
      const closes = await fetchCloses(s.ticker);
      if (closes.length < 2) {
        cells.push({ ...s, price: null, changePct: null, above50: null, above200: null });
        continue;
      }
      const last = closes[closes.length - 1]!;
      const prev = closes[closes.length - 2]!;
      const sma50 = sma(closes, 50);
      const sma200 = sma(closes, 200);
      cells.push({
        ticker: s.ticker,
        name: s.name,
        price: last,
        changePct: prev ? ((last - prev) / prev) * 100 : 0,
        above50: sma50 != null ? last > sma50 : null,
        above200: sma200 != null ? last > sma200 : null,
      });
    } catch {
      cells.push({ ...s, price: null, changePct: null, above50: null, above200: null });
    }
  }

  const with50 = cells.filter((c) => c.above50 != null);
  const with200 = cells.filter((c) => c.above200 != null);
  const board: SectorBoard = {
    sectors: cells.sort((a, b) => (b.changePct ?? -99) - (a.changePct ?? -99)),
    breadth: {
      above50Pct: with50.length
        ? (with50.filter((c) => c.above50).length / with50.length) * 100
        : 0,
      above200Pct: with200.length
        ? (with200.filter((c) => c.above200).length / with200.length) * 100
        : 0,
      total: SECTOR_ETFS.length,
      counted: with50.length,
    },
    asOf: Date.now(),
  };

  if (with50.length > 0) cache = { exp: Date.now() + 5 * 60_000, board };
  return board;
}
