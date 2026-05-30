import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { candles, quotes } from "~/server/services/quotes";
import { getSectorBoard } from "~/server/services/sectors";
import { SYMBOLS, type SymbolKey } from "~/server/services/symbols";

const symbolKey = z.custom<SymbolKey>(
  (v) => typeof v === "string" && v in SYMBOLS,
  "Unknown symbol key",
);

export const marketRouter = createTRPCRouter({
  quotes: publicProcedure
    .input(z.object({ keys: z.array(symbolKey).min(1).max(40) }))
    .query(({ input }) => quotes(input.keys)),

  candles: publicProcedure
    .input(
      z.object({
        key: symbolKey,
        range: z
          .enum(["1d", "5d", "1mo", "3mo", "6mo", "1y", "5y", "max"])
          .default("3mo"),
        interval: z
          .enum(["1m", "5m", "15m", "30m", "1h", "1d", "1wk", "1mo"])
          .default("1d"),
      }),
    )
    .query(({ input }) => candles(input.key, input.range, input.interval)),

  // S&P sector ETF heatmap + SMA breadth proxy
  sectors: publicProcedure.query(() => getSectorBoard()),
});
