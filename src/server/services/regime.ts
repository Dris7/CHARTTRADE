import "server-only";

// Macro-style risk regime, modeled on macrostaq's σ-pillar approach.
// Each pillar contributes a z-score (today vs. a 21-day rolling baseline);
// pillars are signed so positive z always means "risk-on".
// The headline score is the weighted-average z across pillars in σ.

import {
  getCurve2s10sSeries,
  getDxySeries,
  getHyOasSeries,
  getNetLiquiditySeries,
  getSpxSeries,
  getVixSeries,
  type YieldPoint,
} from "~/server/services/fred";

export type Bias = "risk-on" | "risk-off" | "neutral";
export type RegimeLabel = "Risk-On" | "Risk-Off" | "Neutral" | "Mixed";
export type MetaRegime = "STABLE" | "MIXED" | "TRANSITION";
export type Sector =
  | "equities"
  | "bonds"
  | "credit"
  | "commodities"
  | "fx"
  | "vol";
export type SectorRegime =
  | "BULLISH"
  | "BEARISH"
  | "NEUTRAL"
  | "TIGHTENING"
  | "EASING"
  | "STANDARD HEDGING";

export interface Pillar {
  key: string;
  label: string;
  sector: Sector;
  current: number;
  display: string; // formatted value with unit
  z: number; // raw z vs rolling mean
  contribution: number; // z * direction (positive = risk-on)
  weight: number;
  bias: Bias;
  inverted: boolean;
  note: string;
  delta1d: number; // direction of latest move ( +1, -1, 0 )
}

export interface SectorCard {
  key: Sector;
  label: string;
  regime: SectorRegime;
  bias: Bias;
  zAvg: number;
  pillars: string[]; // pillar keys feeding this sector
}

export interface MacroSnapshot {
  hyOas: number | null; // basis points
  curve2s10s: number | null; // percentage points
  netLiquidity: number | null; // $ trillions
}

export interface RegimeReport {
  label: RegimeLabel;
  meta: MetaRegime;
  metaNote: string;
  scoreSigma: number; // weighted average σ
  pillarsRiskOn: number;
  pillarsRiskOff: number;
  pillars: Pillar[];
  sectors: SectorCard[];
  macro: MacroSnapshot;
  computedAt: number;
}

// Macrostaq-style 60-day rolling window — calmer, regime-style readings.
// 21d felt jumpy because today's moves dominated; 60d smooths to "the month".
const ROLLING_WINDOW = 60;
const PILLAR_THRESHOLD = 0.5; // |z| > 0.5σ flips a pillar

interface PillarSpec {
  key: string;
  label: string;
  sector: Sector;
  weight: number;
  direction: 1 | -1; // +1: high value = risk-on; -1: inverted (high = risk-off)
  unit: "%" | "bps" | "$T" | "";
  digits: number;
  fetch: () => Promise<YieldPoint[]>;
  note: (z: number, val: number) => string;
}

// Pillars are bucketed by macro sector so we can surface 6 sector cards.
const SPECS: PillarSpec[] = [
  {
    key: "spx",
    label: "S&P 500",
    sector: "equities",
    weight: 0.15,
    direction: +1,
    unit: "",
    digits: 0,
    fetch: getSpxSeries,
    note: (z) =>
      z > 0 ? "Equities above trend" : "Equities below recent trend",
  },
  {
    key: "vix",
    label: "Volatility (VIX)",
    sector: "vol",
    weight: 0.2,
    direction: -1,
    unit: "",
    digits: 2,
    fetch: getVixSeries,
    note: (_z, val) =>
      val > 20 ? `Vol elevated · ${val.toFixed(1)}` : `Vol contained · ${val.toFixed(1)}`,
  },
  {
    key: "credit",
    label: "HY Credit (OAS)",
    sector: "credit",
    weight: 0.25,
    direction: -1,
    unit: "bps",
    digits: 0,
    fetch: getHyOasSeries,
    note: (z, val) =>
      z > 0
        ? `Credit widening · ${(val * 100).toFixed(0)}bp`
        : `Credit tight · ${(val * 100).toFixed(0)}bp`,
  },
  {
    key: "curve",
    label: "Yield Curve (2s10s)",
    sector: "bonds",
    weight: 0.1,
    direction: +1,
    unit: "%",
    digits: 2,
    fetch: getCurve2s10sSeries,
    note: (z, val) =>
      val < 0
        ? `Inverted · ${val.toFixed(2)}%`
        : z > 0
          ? `Steepening · ${val.toFixed(2)}%`
          : `Flat · ${val.toFixed(2)}%`,
  },
  {
    key: "liquidity",
    label: "Net Liquidity",
    sector: "bonds",
    weight: 0.15,
    direction: +1,
    unit: "$T",
    digits: 2,
    fetch: getNetLiquiditySeries,
    note: (z, val) =>
      z > 0
        ? `Liquidity rising · $${val.toFixed(2)}T`
        : `Liquidity draining · $${val.toFixed(2)}T`,
  },
  {
    key: "dxy",
    label: "US Dollar (DXY)",
    sector: "fx",
    weight: 0.15,
    direction: -1,
    unit: "",
    digits: 2,
    fetch: getDxySeries,
    note: (z) =>
      z > 0
        ? "USD bid · tightening conditions"
        : "USD soft · loosening conditions",
  },
];

// Sector cards aggregate pillars in the same family.
const SECTOR_META: Array<{ key: Sector; label: string }> = [
  { key: "equities", label: "Equities" },
  { key: "bonds", label: "Gov Bonds" },
  { key: "credit", label: "Credit" },
  { key: "commodities", label: "Commodities" },
  { key: "fx", label: "FX" },
  { key: "vol", label: "Vol Hedging" },
];

function classifySector(sector: Sector, zAvg: number): SectorRegime {
  if (sector === "credit") {
    if (zAvg > 0.5) return "EASING";
    if (zAvg < -0.5) return "TIGHTENING";
    return "NEUTRAL";
  }
  if (sector === "vol") {
    if (zAvg > 0.5) return "STANDARD HEDGING"; // low vol z = calm
    if (zAvg < -0.5) return "STANDARD HEDGING"; // both calm and stressed map here in v0
    return "STANDARD HEDGING";
  }
  if (zAvg > 0.5) return "BULLISH";
  if (zAvg < -0.5) return "BEARISH";
  return "NEUTRAL";
}

function classifyMeta(pillars: Pillar[], scoreSigma: number): {
  meta: MetaRegime;
  note: string;
} {
  // STABLE: low spread between pillars, score near zero
  // TRANSITION: high spread (some screaming on, others off) regardless of score
  // MIXED: middle ground
  const contribs = pillars.map((p) => p.contribution);
  const max = Math.max(...contribs);
  const min = Math.min(...contribs);
  const spread = max - min;

  if (spread < 1.0 && Math.abs(scoreSigma) < 0.4) {
    return { meta: "STABLE", note: "Cross-asset signals aligned" };
  }
  if (spread > 2.5) {
    return { meta: "TRANSITION", note: "Pillars diverging — regime in flux" };
  }
  return { meta: "MIXED", note: "Cross-asset signals mixed" };
}

function zScore(series: number[], window = ROLLING_WINDOW): number | null {
  if (series.length < window) return null;
  const recent = series.slice(-window);
  const latest = recent[recent.length - 1]!;
  const mean = recent.reduce((s, v) => s + v, 0) / recent.length;
  const variance =
    recent.reduce((s, v) => s + (v - mean) ** 2, 0) / recent.length;
  const std = Math.sqrt(variance);
  if (std === 0 || !Number.isFinite(std)) return null;
  return (latest - mean) / std;
}

function formatDisplay(val: number, unit: string, digits: number): string {
  if (unit === "bps") return `${(val * 100).toFixed(digits)}bp`;
  if (unit === "$T") return `$${val.toFixed(digits)}T`;
  if (unit === "%") return `${val.toFixed(digits)}%`;
  return val.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export async function getRegimeReport(): Promise<RegimeReport> {
  const results = await Promise.all(
    SPECS.map(async (spec) => {
      const series = await spec.fetch();
      if (series.length === 0) return { spec, pillar: null };
      const values = series.map((p) => p.value);
      const z = zScore(values);
      const current = series[series.length - 1]!.value;
      const prev = series[series.length - 2]?.value ?? current;
      if (z === null) return { spec, pillar: null };
      const contribution = z * spec.direction;
      const bias: Bias =
        contribution > PILLAR_THRESHOLD
          ? "risk-on"
          : contribution < -PILLAR_THRESHOLD
            ? "risk-off"
            : "neutral";
      const delta1d =
        current > prev ? +1 : current < prev ? -1 : 0;
      const pillar: Pillar = {
        key: spec.key,
        label: spec.label,
        sector: spec.sector,
        current,
        display: formatDisplay(current, spec.unit, spec.digits),
        z,
        contribution,
        weight: spec.weight,
        bias,
        inverted: spec.direction === -1,
        note: spec.note(z, current),
        delta1d,
      };
      return { spec, pillar };
    }),
  );

  const pillars = results
    .map((r) => r.pillar)
    .filter((p): p is Pillar => p !== null);

  const totalWeight = pillars.reduce((s, p) => s + p.weight, 0) || 1;
  const scoreSigma =
    pillars.reduce((s, p) => s + p.contribution * p.weight, 0) / totalWeight;

  const pillarsRiskOn = pillars.filter((p) => p.bias === "risk-on").length;
  const pillarsRiskOff = pillars.filter((p) => p.bias === "risk-off").length;

  let label: RegimeLabel;
  if (scoreSigma >= 0.5) label = "Risk-On";
  else if (scoreSigma <= -0.5) label = "Risk-Off";
  else if (Math.abs(scoreSigma) <= 0.15) label = "Neutral";
  else label = "Mixed";

  const { meta, note: metaNote } = classifyMeta(pillars, scoreSigma);

  // Sector cards
  const sectors: SectorCard[] = SECTOR_META.map(({ key, label }) => {
    const inSector = pillars.filter((p) => p.sector === key);
    if (inSector.length === 0) {
      return {
        key,
        label,
        regime: "NEUTRAL",
        bias: "neutral",
        zAvg: 0,
        pillars: [],
      };
    }
    const zAvg =
      inSector.reduce((s, p) => s + p.contribution, 0) / inSector.length;
    const bias: Bias =
      zAvg > PILLAR_THRESHOLD
        ? "risk-on"
        : zAvg < -PILLAR_THRESHOLD
          ? "risk-off"
          : "neutral";
    return {
      key,
      label,
      regime: classifySector(key, zAvg),
      bias,
      zAvg,
      pillars: inSector.map((p) => p.key),
    };
  });

  const hyOasPillar = pillars.find((p) => p.key === "credit");
  const curvePillar = pillars.find((p) => p.key === "curve");
  const liqPillar = pillars.find((p) => p.key === "liquidity");

  return {
    label,
    meta,
    metaNote,
    scoreSigma,
    pillarsRiskOn,
    pillarsRiskOff,
    pillars,
    sectors,
    macro: {
      hyOas: hyOasPillar ? hyOasPillar.current * 100 : null,
      curve2s10s: curvePillar ? curvePillar.current : null,
      netLiquidity: liqPillar ? liqPillar.current : null,
    },
    computedAt: Date.now(),
  };
}
