import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { getMacroRegime, getRegime } from "~/server/services/macro";
import {
  getFinancialStress,
  getLatestYields,
  getMacroIndicators,
  getYieldCurve,
} from "~/server/services/fred";
import { getRegimeReport } from "~/server/services/regime";
import { getCotPositioning } from "~/server/services/cftc";
import { getFearGreed } from "~/server/services/sentiment";

export const macroRouter = createTRPCRouter({
  riskRegime: publicProcedure.query(() => getRegime()),
  macroRegime: publicProcedure.query(() => getMacroRegime()),
  yields: publicProcedure.query(() => getLatestYields()),
  // Z-score pillar engine (macrostaq-style)
  regime: publicProcedure.query(() => getRegimeReport()),
  // CFTC Commitments of Traders positioning
  cotPositioning: publicProcedure.query(() => getCotPositioning()),
  // FRED macro indicator tiles
  indicators: publicProcedure.query(() => getMacroIndicators()),
  // FRED treasury yield curve
  yieldCurve: publicProcedure.query(() => getYieldCurve()),
  // FRED financial stress index
  financialStress: publicProcedure.query(() => getFinancialStress()),
  // Crypto Fear & Greed (risk-appetite proxy)
  fearGreed: publicProcedure.query(() => getFearGreed()),
});
