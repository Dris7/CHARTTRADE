import { calendarRouter } from "~/server/api/routers/calendar";
import { feedsRouter } from "~/server/api/routers/feeds";
import { macroRouter } from "~/server/api/routers/macro";
import { marketRouter } from "~/server/api/routers/market";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  market: marketRouter,
  macro: macroRouter,
  calendar: calendarRouter,
  feeds: feedsRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
