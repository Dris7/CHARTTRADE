import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { getCalendar, type EconEvent, type Impact } from "~/server/services/calendar";

export type { EconEvent, Impact };

const IMPACT = z.enum(["high", "medium", "low", "holiday"]);

export const calendarRouter = createTRPCRouter({
  upcoming: publicProcedure
    .input(
      z
        .object({
          impact: z.array(IMPACT).optional(),
          countries: z.array(z.string()).optional(),
          q: z.string().optional(),
          days: z.number().int().min(1).max(60).default(14),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const all = await getCalendar();

      // Window: from the start of today (UTC) so the current day shows in full,
      // through `days` ahead.
      const now = new Date();
      const from = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
      );
      const to = Date.now() + (input?.days ?? 14) * 86_400_000;

      const impactSet = input?.impact ? new Set(input.impact) : null;
      const countrySet = input?.countries?.length
        ? new Set(input.countries)
        : null;
      const q = input?.q?.trim().toLowerCase();

      return all.filter((e) => {
        if (e.ts < from || e.ts > to) return false;
        if (impactSet && !impactSet.has(e.impact)) return false;
        if (countrySet && !countrySet.has(e.country)) return false;
        if (q && !e.title.toLowerCase().includes(q)) return false;
        return true;
      });
    }),
});
