import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { getCentralBankItems } from "~/server/services/centralbanks";
import { getNews } from "~/server/services/news";

export const feedsRouter = createTRPCRouter({
  // Fed + ECB press-release RSS
  centralBanks: publicProcedure.query(() => getCentralBankItems()),
  // Live financial news tape (FinancialJuice), classified critical/normal
  news: publicProcedure.query(() => getNews()),
});
