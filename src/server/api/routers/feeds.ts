import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { getCentralBankItems } from "~/server/services/centralbanks";
import { getPredictions } from "~/server/services/predictions";

export const feedsRouter = createTRPCRouter({
  // Fed + ECB press-release RSS
  centralBanks: publicProcedure.query(() => getCentralBankItems()),
  // Polymarket macro prediction markets
  predictions: publicProcedure.query(() => getPredictions()),
});
