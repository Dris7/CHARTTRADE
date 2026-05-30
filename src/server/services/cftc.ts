import "server-only";

// CFTC Commitments of Traders (COT) — weekly futures positioning.
// Two public Socrata datasets, no key required:
//   • Traders in Financial Futures (TFF) — gpe5-46if — treasuries, equity index,
//     FX. We track Asset Managers (real money) + Leveraged Funds (fast money).
//   • Disaggregated (commodities)        — 72hh-3qpy — gold/silver/crude/copper.
//     We track Managed Money (the speculative cohort).
//
// Net positioning % = (long − short) / (long + short) × 100, signed so positive
// = net long. We also surface the week-over-week change in net contracts.
//
// Released Fridays ~15:30 ET for the prior Tuesday. Data is weekly, so a long
// cache (6h) is plenty.

const TFF = "https://publicreporting.cftc.gov/resource/gpe5-46if.json";
const DISAGG = "https://publicreporting.cftc.gov/resource/72hh-3qpy.json";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type CotCohort = "asset_mgr" | "lev_money" | "managed_money";

export interface CotContract {
  code: string;
  label: string;
  symbol: string;
  group: "rates" | "equity" | "fx" | "metals" | "energy";
}

// Stable CFTC contract codes (names drift, codes don't).
const TFF_CONTRACTS: CotContract[] = [
  { code: "042601", label: "2-Year T-Note", symbol: "ZT", group: "rates" },
  { code: "044601", label: "5-Year T-Note", symbol: "ZF", group: "rates" },
  { code: "043602", label: "10-Year T-Note", symbol: "ZN", group: "rates" },
  { code: "020601", label: "T-Bond", symbol: "ZB", group: "rates" },
  { code: "13874A", label: "S&P 500 E-Mini", symbol: "ES", group: "equity" },
  { code: "209742", label: "Nasdaq 100 E-Mini", symbol: "NQ", group: "equity" },
  { code: "239742", label: "Russell 2000 E-Mini", symbol: "RTY", group: "equity" },
  { code: "099741", label: "Euro FX", symbol: "EUR", group: "fx" },
  { code: "097741", label: "Japanese Yen", symbol: "JPY", group: "fx" },
  { code: "096742", label: "British Pound", symbol: "GBP", group: "fx" },
];

const DISAGG_CONTRACTS: CotContract[] = [
  { code: "088691", label: "Gold", symbol: "GC", group: "metals" },
  { code: "084691", label: "Silver", symbol: "SI", group: "metals" },
  { code: "085692", label: "Copper", symbol: "HG", group: "metals" },
  { code: "067651", label: "WTI Crude", symbol: "CL", group: "energy" },
];

export interface CotRow {
  code: string;
  label: string;
  symbol: string;
  group: CotContract["group"];
  reportDate: string; // YYYY-MM-DD
  /** Primary speculative cohort (asset managers for financials, managed money for commodities). */
  assetMgrNetPct: number; // -100..100
  assetMgrLong: number;
  assetMgrShort: number;
  /** Leveraged-fund net (financials only; null for commodities). */
  levMoneyNetPct: number | null;
  openInterest: number;
  /** Week-over-week change in net contracts for the primary cohort. */
  netChange1w: number | null;
}

// --- cache -----------------------------------------------------------------
let cache: { exp: number; rows: CotRow[] } | null = null;

async function fetchSocrata(
  base: string,
  codes: string[],
  select: string,
): Promise<Record<string, string>[]> {
  const where = `cftc_contract_market_code in(${codes.map((c) => `'${c}'`).join(",")})`;
  const url =
    `${base}?$where=${encodeURIComponent(where)}` +
    `&$order=${encodeURIComponent("report_date_as_yyyy_mm_dd DESC")}` +
    // 3 weeks × N contracts is plenty to grab latest + prior per contract.
    `&$limit=${codes.length * 4}` +
    `&$select=${encodeURIComponent(select)}`;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 9000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      // Weekly data — share across serverless invocations for 6h.
      next: { revalidate: 21600 },
      signal: c.signal,
    });
    if (!res.ok) throw new Error(`cftc ${res.status}`);
    return (await res.json()) as Record<string, string>[];
  } finally {
    clearTimeout(t);
  }
}

function num(v: string | undefined): number {
  const n = parseFloat(v ?? "");
  return Number.isFinite(n) ? n : 0;
}

function netPct(long: number, short: number): number {
  const denom = long + short;
  return denom ? ((long - short) / denom) * 100 : 0;
}

/** Group rows by contract code, newest first, returning [latest, prior]. */
function latestTwo<T extends { code: string; reportDate: string }>(
  rows: T[],
): Map<string, [T, T?]> {
  const byCode = new Map<string, T[]>();
  for (const r of rows) {
    const arr = byCode.get(r.code) ?? [];
    arr.push(r);
    byCode.set(r.code, arr);
  }
  const out = new Map<string, [T, T?]>();
  for (const [code, arr] of byCode) {
    arr.sort((a, b) => (a.reportDate < b.reportDate ? 1 : -1));
    if (arr[0]) out.set(code, [arr[0], arr[1]]);
  }
  return out;
}

export async function getCotPositioning(): Promise<CotRow[]> {
  if (cache && cache.exp > Date.now()) return cache.rows;

  const [tffRaw, disRaw] = await Promise.all([
    fetchSocrata(
      TFF,
      TFF_CONTRACTS.map((c) => c.code),
      "cftc_contract_market_code,report_date_as_yyyy_mm_dd,open_interest_all," +
        "asset_mgr_positions_long,asset_mgr_positions_short," +
        "lev_money_positions_long,lev_money_positions_short",
    ).catch((e) => {
      console.warn("[cftc] TFF failed:", (e as Error).message);
      return [] as Record<string, string>[];
    }),
    fetchSocrata(
      DISAGG,
      DISAGG_CONTRACTS.map((c) => c.code),
      "cftc_contract_market_code,report_date_as_yyyy_mm_dd,open_interest_all," +
        "m_money_positions_long_all,m_money_positions_short_all",
    ).catch((e) => {
      console.warn("[cftc] disagg failed:", (e as Error).message);
      return [] as Record<string, string>[];
    }),
  ]);

  const rows: CotRow[] = [];

  // Financials (asset managers + leveraged funds)
  const tffParsed = tffRaw.map((r) => ({
    code: r.cftc_contract_market_code ?? "",
    reportDate: (r.report_date_as_yyyy_mm_dd ?? "").slice(0, 10),
    amLong: num(r.asset_mgr_positions_long),
    amShort: num(r.asset_mgr_positions_short),
    levLong: num(r.lev_money_positions_long),
    levShort: num(r.lev_money_positions_short),
    oi: num(r.open_interest_all),
  }));
  for (const [code, [cur, prev]] of latestTwo(tffParsed)) {
    const def = TFF_CONTRACTS.find((c) => c.code === code);
    if (!def) continue;
    const curNet = cur.amLong - cur.amShort;
    rows.push({
      ...def,
      reportDate: cur.reportDate,
      assetMgrNetPct: netPct(cur.amLong, cur.amShort),
      assetMgrLong: cur.amLong,
      assetMgrShort: cur.amShort,
      levMoneyNetPct: netPct(cur.levLong, cur.levShort),
      openInterest: cur.oi,
      netChange1w: prev ? curNet - (prev.amLong - prev.amShort) : null,
    });
  }

  // Commodities (managed money)
  const disParsed = disRaw.map((r) => ({
    code: r.cftc_contract_market_code ?? "",
    reportDate: (r.report_date_as_yyyy_mm_dd ?? "").slice(0, 10),
    mmLong: num(r.m_money_positions_long_all),
    mmShort: num(r.m_money_positions_short_all),
    oi: num(r.open_interest_all),
  }));
  for (const [code, [cur, prev]] of latestTwo(disParsed)) {
    const def = DISAGG_CONTRACTS.find((c) => c.code === code);
    if (!def) continue;
    const curNet = cur.mmLong - cur.mmShort;
    rows.push({
      ...def,
      reportDate: cur.reportDate,
      assetMgrNetPct: netPct(cur.mmLong, cur.mmShort),
      assetMgrLong: cur.mmLong,
      assetMgrShort: cur.mmShort,
      levMoneyNetPct: null,
      openInterest: cur.oi,
      netChange1w: prev ? curNet - (prev.mmLong - prev.mmShort) : null,
    });
  }

  // Keep the curated order (rates → equity → fx → metals → energy).
  const order = [...TFF_CONTRACTS, ...DISAGG_CONTRACTS].map((c) => c.code);
  rows.sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));

  if (rows.length > 0) cache = { exp: Date.now() + 6 * 3600_000, rows };
  return rows;
}
