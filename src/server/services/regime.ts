import "server-only";

// Macro-style risk regime, modeled on macrostaq's σ-pillar approach.
// Each pillar contributes a z-score (today vs. a 21-day rolling baseline);
// pillars are signed so positive z always means "risk-on".
// The headline score is the weighted-average z across pillars in σ.

import {
  getCrudeSeries,
  getCurve2s10sSeries,
  getDxySeries,
  getHyOasSeries,
  getNetLiquiditySeries,
  getSpxSeries,
  getVixSeries,
  type YieldPoint,
} from "~/server/services/fred";
import {
  PILLAR_THRESHOLD,
  classifyMeta,
  classifySector,
  formatDisplay,
  zScore,
  type MetaRegime,
  type Sector,
  type SectorRegime,
} from "~/server/services/regime-math";

export type Bias = "risk-on" | "risk-off" | "neutral";
export type RegimeLabel = "Risk-On" | "Risk-Off" | "Neutral" | "Mixed";
export type { MetaRegime, Sector, SectorRegime };

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

interface PillarSpec {
  key: string;
  label: string;
  sector: Sector;
  weight: number;
  direction: 1 | -1; // +1: high value = risk-on; -1: inverted (high = risk-off)
  unit: "%" | "bps" | "$T" | "$" | "";
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
  {
    key: "crude",
    label: "Crude Oil (WTI)",
    sector: "commodities",
    weight: 0.05,
    direction: +1, // firmer crude = pro-cyclical growth impulse
    unit: "$",
    digits: 2,
    fetch: getCrudeSeries,
    note: (z, val) =>
      z > 0
        ? `Crude firm · $${val.toFixed(0)}`
        : `Crude soft · $${val.toFixed(0)}`,
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
