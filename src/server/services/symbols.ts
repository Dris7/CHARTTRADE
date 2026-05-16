// Canonical symbol map. Each market gets a Stooq ticker (primary) and a Yahoo
// fallback. Stooq is the most reliable free source; Yahoo fills the gaps.

export interface SymbolDef {
  stooq: string | null;
  yahoo: string;
  label: string;
  sub: string;
  group: "equity" | "bond" | "fx" | "commodity" | "crypto" | "vol";
}

export const SYMBOLS = {
  // Equity indices / futures
  SPX: { stooq: "^spx", yahoo: "^GSPC", label: "S&P 500", sub: "Cash Index", group: "equity" },
  ES: { stooq: "es.f", yahoo: "ES=F", label: "ES", sub: "E-mini SP", group: "equity" },
  NQ: { stooq: "nq.f", yahoo: "NQ=F", label: "NQ", sub: "E-mini Nasdaq", group: "equity" },
  DAX: { stooq: "^dax", yahoo: "^GDAXI", label: "DAX", sub: "DE 40 Index", group: "equity" },
  VIX: { stooq: "^vix", yahoo: "^VIX", label: "VIX", sub: "Equity Vol", group: "vol" },

  // US bond futures
  ZT: { stooq: "zt.f", yahoo: "ZT=F", label: "ZT", sub: "US 2Y Fut", group: "bond" },
  ZF: { stooq: "zf.f", yahoo: "ZF=F", label: "ZF", sub: "US 5Y Fut", group: "bond" },
  ZN: { stooq: "zn.f", yahoo: "ZN=F", label: "ZN", sub: "US 10Y Fut", group: "bond" },
  ZB: { stooq: "zb.f", yahoo: "ZB=F", label: "ZB", sub: "US 30Y Fut", group: "bond" },
  UB: { stooq: "ub.f", yahoo: "UB=F", label: "UB", sub: "Ultra Bond", group: "bond" },

  // EU bond futures (Eurex)
  FGBS: { stooq: "fgbs.f", yahoo: "FGBS=F", label: "SCHATZ", sub: "DE 2Y Fut", group: "bond" },
  FGBM: { stooq: "fgbm.f", yahoo: "FGBM=F", label: "BOBL", sub: "DE 5Y Fut", group: "bond" },
  FGBL: { stooq: "fgbl.f", yahoo: "FGBL=F", label: "BUND", sub: "DE 10Y Fut", group: "bond" },
  FGBX: { stooq: "fgbx.f", yahoo: "FGBX=F", label: "BUXL", sub: "DE 30Y Fut", group: "bond" },

  // FX / commodities
  DXY: { stooq: "^dxy", yahoo: "DX-Y.NYB", label: "DXY", sub: "USD Index", group: "fx" },
  GOLD: { stooq: "gc.f", yahoo: "GC=F", label: "GOLD", sub: "Spot", group: "commodity" },
  OIL: { stooq: "cl.f", yahoo: "CL=F", label: "WTI", sub: "Crude", group: "commodity" },

  // Crypto
  BTC: { stooq: "btcusd", yahoo: "BTC-USD", label: "BTC", sub: "Crypto", group: "crypto" },
} as const satisfies Record<string, SymbolDef>;

export type SymbolKey = keyof typeof SYMBOLS;

export const TICKER_BAR: SymbolKey[] = [
  "SPX",
  "ES",
  "NQ",
  "DAX",
  "VIX",
  "ZN",
  "FGBL",
  "DXY",
  "GOLD",
  "OIL",
  "BTC",
];

export const BOND_FUTURES: SymbolKey[] = [
  "FGBL",
  "FGBM",
  "FGBS",
  "FGBX",
  "ZN",
  "ZB",
  "UB",
  "ZF",
];

export const RISK_ASSETS: SymbolKey[] = ["SPX", "NQ", "BTC"];
export const SAFE_HAVENS: SymbolKey[] = ["VIX", "GOLD", "ZN", "DXY"];

// TradingView symbol for embedded widgets (separate namespace from data feed).
export const TV_SYMBOL: Record<SymbolKey, string> = {
  SPX: "SP:SPX",
  ES: "CME_MINI:ES1!",
  NQ: "CME_MINI:NQ1!",
  DAX: "XETR:DAX",
  VIX: "CBOE:VIX",
  ZT: "CBOT:ZT1!",
  ZF: "CBOT:ZF1!",
  ZN: "CBOT:ZN1!",
  ZB: "CBOT:ZB1!",
  UB: "CBOT:UB1!",
  FGBS: "EUREX:FGBS1!",
  FGBM: "EUREX:FGBM1!",
  FGBL: "EUREX:FGBL1!",
  FGBX: "EUREX:FGBX1!",
  DXY: "TVC:DXY",
  GOLD: "COMEX:GC1!",
  OIL: "NYMEX:CL1!",
  BTC: "BINANCE:BTCUSDT",
};
