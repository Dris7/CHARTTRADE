import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { getMacroRegime, getRegime } from "~/server/services/macro";
import {
  getFinancialStress,
  getLatestYields,
  getMacroIndicators,
  getNetLiquidity,
  getRateVol,
  getRealRates,
  getYieldCurve,
} from "~/server/services/fred";
import { getRegimeReport } from "~/server/services/regime";
import { getRegimeHistory } from "~/server/services/regime-history";
import { getCotPositioning } from "~/server/services/cftc";
import { getFearGreed } from "~/server/services/sentiment";
import { getMacroBrief } from "~/server/services/brief";

export const macroRouter = createTRPCRouter({
  riskRegime: publicProcedure.query(() => getRegime()),
  macroRegime: publicProcedure.query(() => getMacroRegime()),
  yields: publicProcedure.query(() => getLatestYields()),
  // Z-score pillar engine (macrostaq-style)
  regime: publicProcedure.query(() => getRegimeReport()),
  // Regime σ timeline + historical analog forward returns
  regimeHistory: publicProcedure.query(() => getRegimeHistory()),
  // CFTC Commitments of Traders positioning
  cotPositioning: publicProcedure.query(() => getCotPositioning()),
  // FRED macro indicator tiles
  indicators: publicProcedure.query(() => getMacroIndicators()),
  // FRED treasury yield curve
  yieldCurve: publicProcedure.query(() => getYieldCurve()),
  // FRED financial stress index
  financialStress: publicProcedure.query(() => getFinancialStress()),
  // Fed net liquidity (WALCL − TGA − RRP)
  netLiquidity: publicProcedure.query(() => getNetLiquidity()),
  // Real yields + inflation breakevens
  realRates: publicProcedure.query(() => getRealRates()),
  // Realized 10Y rate volatility (MOVE proxy)
  rateVol: publicProcedure.query(() => getRateVol()),
  // Crypto Fear & Greed (risk-appetite proxy)
  fearGreed: publicProcedure.query(() => getFearGreed()),
  // Daily macro brief (synthesis)
  brief: publicProcedure.query(() => getMacroBrief()),
});
