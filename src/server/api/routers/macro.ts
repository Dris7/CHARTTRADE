import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { getMacroRegime, getRegime } from "~/server/services/macro";
import { getLatestYields } from "~/server/services/fred";

export const macroRouter = createTRPCRouter({
  riskRegime: publicProcedure.query(() => getRegime()),
  macroRegime: publicProcedure.query(() => getMacroRegime()),
  yields: publicProcedure.query(() => getLatestYields()),
});
