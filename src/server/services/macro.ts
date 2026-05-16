import "server-only";

import { quotes, type UnifiedQuote } from "~/server/services/quotes";
import {
  RISK_ASSETS,
  SAFE_HAVENS,
  type SymbolKey,
} from "~/server/services/symbols";

export interface RegimeResult {
  label: "Risk-On" | "Risk-Off" | "Mixed" | "Neutral";
  score: number; // -100 (full risk-off) to +100 (full risk-on)
  drivers: Array<{ label: string; weight: number; note: string }>;
  computedAt: number;
}

function pctChange(q?: UnifiedQuote): number {
  return q?.changePct ?? 0;
}

export async function getRegime(): Promise<RegimeResult> {
  const keys: SymbolKey[] = [...RISK_ASSETS, ...SAFE_HAVENS];
  const data = await quotes(keys);
  const byKey = new Map(data.map((q) => [q.key, q]));
  const q = (k: SymbolKey) => byKey.get(k);

  const spx = pctChange(q("SPX"));
  const nq = pctChange(q("NQ"));
  const btc = pctChange(q("BTC"));
  const vix = pctChange(q("VIX"));
  const gold = pctChange(q("GOLD"));
  const zn = pctChange(q("ZN"));
  const dxy = pctChange(q("DXY"));

  // Each driver returns a contribution in [-1, +1]
  const drivers = [
    { label: "S&P 500", weight: 0.25, raw: clamp(spx / 1.0, -1, 1), value: spx },
    { label: "Nasdaq", weight: 0.15, raw: clamp(nq / 1.2, -1, 1), value: nq },
    { label: "BTC", weight: 0.05, raw: clamp(btc / 3.0, -1, 1), value: btc },
    // Safe-havens invert: rising VIX → risk-off
    { label: "VIX", weight: 0.25, raw: clamp(-vix / 5.0, -1, 1), value: vix },
    { label: "Gold", weight: 0.1, raw: clamp(-gold / 1.5, -1, 1), value: gold },
    { label: "10Y futures (ZN)", weight: 0.1, raw: clamp(-zn / 0.5, -1, 1), value: zn },
    { label: "DXY", weight: 0.1, raw: clamp(-dxy / 0.7, -1, 1), value: dxy },
  ];

  const score = Math.round(
    drivers.reduce((acc, d) => acc + d.raw * d.weight, 0) * 100,
  );

  let label: RegimeResult["label"];
  if (score >= 35) label = "Risk-On";
  else if (score <= -35) label = "Risk-Off";
  else if (Math.abs(score) <= 10) label = "Neutral";
  else label = "Mixed";

  return {
    label,
    score,
    drivers: drivers.map((d) => ({
      label: d.label,
      weight: d.weight,
      note: `${d.value >= 0 ? "+" : ""}${d.value.toFixed(2)}%`,
    })),
    computedAt: Date.now(),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Simple regime classifier for the "Macro Regime Engine" tile.
export interface MacroRegime {
  label:
    | "Goldilocks"
    | "Reflation"
    | "Stagflation"
    | "Deflation"
    | "Tightening Shock"
    | "Easing Rally";
  description: string;
  signals: Array<{ label: string; value: string; bias: "up" | "down" | "flat" }>;
  computedAt: number;
}

export async function getMacroRegime(): Promise<MacroRegime> {
  const keys: SymbolKey[] = ["SPX", "VIX", "ZN", "DXY", "GOLD", "OIL"];
  const data = await quotes(keys);
  const byKey = new Map(data.map((q) => [q.key, q]));
  const q = (k: SymbolKey) => byKey.get(k);

  const spx = pctChange(q("SPX"));
  const zn = pctChange(q("ZN")); // up = yields down = easing
  const dxy = pctChange(q("DXY"));
  const gold = pctChange(q("GOLD"));
  const oil = pctChange(q("OIL"));
  const vix = pctChange(q("VIX"));

  let label: MacroRegime["label"];
  let description: string;

  const risingYields = zn < -0.05;
  const fallingYields = zn > 0.05;
  const riskOn = spx > 0.2 && vix < 0;
  const riskOff = spx < -0.4 || vix > 4;
  const dollarUp = dxy > 0.1;
  const inflationary = oil > 0.5 || gold > 0.5;

  if (riskOn && fallingYields && !inflationary) {
    label = "Goldilocks";
    description =
      "Equities up, yields softening, inflation contained. Classic risk-on regime.";
  } else if (riskOn && risingYields && inflationary) {
    label = "Reflation";
    description =
      "Yields rising on growth, commodities firm, equities holding. Cyclicals/value lead.";
  } else if (riskOff && risingYields && inflationary) {
    label = "Stagflation";
    description =
      "Yields up, growth wobbles, commodities sticky. Gold + energy outperform.";
  } else if (riskOff && fallingYields && !inflationary) {
    label = "Deflation";
    description =
      "Yields collapsing, growth fears dominant, dollar bid. Bonds + USD bid.";
  } else if (risingYields && dollarUp && riskOff) {
    label = "Tightening Shock";
    description =
      "Yields and dollar surge, equities crack — financial conditions tightening.";
  } else {
    label = "Easing Rally";
    description =
      "Yields drifting lower, equities grinding higher. Liquidity-led tape.";
  }

  return {
    label,
    description,
    signals: [
      { label: "SPX", value: fmtPct(spx), bias: bias(spx) },
      { label: "ZN (10Y fut)", value: fmtPct(zn), bias: bias(zn) },
      { label: "DXY", value: fmtPct(dxy), bias: bias(dxy) },
      { label: "Gold", value: fmtPct(gold), bias: bias(gold) },
      { label: "Oil", value: fmtPct(oil), bias: bias(oil) },
      { label: "VIX", value: fmtPct(vix), bias: bias(vix) },
    ],
    computedAt: Date.now(),
  };
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function bias(v: number): "up" | "down" | "flat" {
  if (v > 0.1) return "up";
  if (v < -0.1) return "down";
  return "flat";
}
