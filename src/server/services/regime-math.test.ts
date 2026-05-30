import { describe, expect, it } from "vitest";

import {
  ROLLING_WINDOW,
  classifyMeta,
  classifySector,
  formatDisplay,
  zScore,
} from "./regime-math";

describe("zScore", () => {
  it("returns null below the rolling window", () => {
    expect(zScore([1, 2, 3])).toBeNull();
  });

  it("returns 0 when the latest value equals the mean", () => {
    // Build a window whose values average exactly L (with nonzero variance)
    // and whose final value is also L → z must be 0.
    const L = 10;
    const series: number[] = [];
    for (let i = 0; i < (ROLLING_WINDOW - 2) / 2; i++) series.push(L - 1, L + 1);
    series.push(L); // pads the earlier values back to mean L
    series.push(L); // latest value sits on the mean
    expect(series).toHaveLength(ROLLING_WINDOW);
    expect(zScore(series)!).toBeCloseTo(0, 6);
  });

  it("is positive when the latest value is above the mean", () => {
    const series = new Array(ROLLING_WINDOW).fill(10) as number[];
    series[series.length - 1] = 20;
    expect(zScore(series)!).toBeGreaterThan(0);
  });

  it("returns null for a zero-variance window", () => {
    expect(zScore(new Array(ROLLING_WINDOW).fill(5) as number[])).toBeNull();
  });

  it("respects a custom window length", () => {
    expect(zScore([1, 2, 3, 4], 4)).not.toBeNull();
    expect(zScore([1, 2, 3, 4], 5)).toBeNull();
  });
});

describe("classifySector", () => {
  it("maps credit by easing/tightening, not bullish/bearish", () => {
    expect(classifySector("credit", 1)).toBe("EASING");
    expect(classifySector("credit", -1)).toBe("TIGHTENING");
    expect(classifySector("credit", 0)).toBe("NEUTRAL");
  });

  it("maps vol to calm when risk-on z is high, stressed when low", () => {
    expect(classifySector("vol", 1)).toBe("CALM");
    expect(classifySector("vol", -1)).toBe("STRESSED");
    expect(classifySector("vol", 0)).toBe("STANDARD HEDGING");
  });

  it("maps growth sectors bullish/bearish around ±0.5σ", () => {
    expect(classifySector("equities", 0.6)).toBe("BULLISH");
    expect(classifySector("equities", -0.6)).toBe("BEARISH");
    expect(classifySector("equities", 0.4)).toBe("NEUTRAL");
    expect(classifySector("commodities", 0.6)).toBe("BULLISH");
  });
});

describe("classifyMeta", () => {
  it("is STABLE when pillars agree and score is near zero", () => {
    const pillars = [{ contribution: 0.1 }, { contribution: 0.2 }];
    expect(classifyMeta(pillars, 0.1).meta).toBe("STABLE");
  });

  it("is TRANSITION when pillars diverge sharply", () => {
    const pillars = [{ contribution: 2 }, { contribution: -1.5 }];
    expect(classifyMeta(pillars, 0.2).meta).toBe("TRANSITION");
  });

  it("is MIXED in the middle ground", () => {
    const pillars = [{ contribution: 1 }, { contribution: -0.5 }];
    expect(classifyMeta(pillars, 0.3).meta).toBe("MIXED");
  });
});

describe("formatDisplay", () => {
  it("renders bps by scaling ×100 (FRED OAS is in %)", () => {
    expect(formatDisplay(3.25, "bps", 0)).toBe("325bp");
  });

  it("renders $T and $ units", () => {
    expect(formatDisplay(6.1, "$T", 2)).toBe("$6.10T");
    expect(formatDisplay(78.4, "$", 2)).toBe("$78.40");
  });

  it("renders percentages", () => {
    expect(formatDisplay(-0.42, "%", 2)).toBe("-0.42%");
  });

  it("falls back to a localized number", () => {
    expect(formatDisplay(5234, "", 0)).toBe("5,234");
  });
});
