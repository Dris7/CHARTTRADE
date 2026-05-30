// Pure, IO-free core of the regime engine. Kept separate from regime.ts (which
// imports `server-only` + the FRED service) so this math can be unit-tested in
// plain Node. No imports on purpose.

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
  | "CALM"
  | "STRESSED"
  | "STANDARD HEDGING";

export type MetaRegime = "STABLE" | "MIXED" | "TRANSITION";

// Macrostaq-style 60-day rolling window — calmer, regime-style readings.
// 21d felt jumpy because today's moves dominated; 60d smooths to "the month".
export const ROLLING_WINDOW = 60;
export const PILLAR_THRESHOLD = 0.5; // |z| > 0.5σ flips a pillar

/** z-score of the latest value vs. a rolling window. null if undefined. */
export function zScore(series: number[], window = ROLLING_WINDOW): number | null {
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

export function classifySector(sector: Sector, zAvg: number): SectorRegime {
  if (sector === "credit") {
    if (zAvg > 0.5) return "EASING";
    if (zAvg < -0.5) return "TIGHTENING";
    return "NEUTRAL";
  }
  if (sector === "vol") {
    // contribution is signed risk-on (vix direction is -1), so a positive
    // zAvg means vol is *below* its baseline → calm; negative → stressed.
    if (zAvg > 0.5) return "CALM";
    if (zAvg < -0.5) return "STRESSED";
    return "STANDARD HEDGING";
  }
  if (zAvg > 0.5) return "BULLISH";
  if (zAvg < -0.5) return "BEARISH";
  return "NEUTRAL";
}

export function classifyMeta(
  pillars: Array<{ contribution: number }>,
  scoreSigma: number,
): { meta: MetaRegime; note: string } {
  // STABLE: low spread between pillars, score near zero
  // TRANSITION: high spread (some screaming on, others off) regardless of score
  // MIXED: middle ground
  const contribs = pillars.map((p) => p.contribution);
  const max = Math.max(...contribs);
  const min = Math.min(...contribs);
  const spread = max - min;

  if (spread < 1.0 && Math.abs(scoreSigma) < 0.4) {
    return { meta: "STABLE", note: "Signaux cross-asset alignés" };
  }
  if (spread > 2.5) {
    return { meta: "TRANSITION", note: "Piliers divergents — régime en flux" };
  }
  return { meta: "MIXED", note: "Signaux cross-asset mitigés" };
}

export function formatDisplay(
  val: number,
  unit: string,
  digits: number,
): string {
  if (unit === "bps") return `${(val * 100).toFixed(digits)}bp`;
  if (unit === "$T") return `$${val.toFixed(digits)}T`;
  if (unit === "$") return `$${val.toFixed(digits)}`;
  if (unit === "%") return `${val.toFixed(digits)}%`;
  return val.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
