import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

// MVP calendar: hand-curated seed of upcoming high-impact events.
// Easy to swap for a feed later (TE, FX Empire, Financial Juice).

export type Impact = "high" | "medium" | "low";

export interface EconEvent {
  id: string;
  date: string; // ISO date
  time: string; // HH:mm UTC (or "" for all-day)
  country: "US" | "EU" | "DE" | "UK" | "JP" | "GLOBAL";
  title: string;
  impact: Impact;
  category: "CPI" | "NFP" | "FOMC" | "ECB" | "PMI" | "GDP" | "Retail" | "Other";
  forecast?: string;
  previous?: string;
  notes?: string;
}

// Seed data — illustrative for the MVP. Replace with API feed once wired.
const SEED: EconEvent[] = [
  {
    id: "us-cpi-may26",
    date: nextMonthly(0, 10),
    time: "12:30",
    country: "US",
    title: "US CPI YoY",
    impact: "high",
    category: "CPI",
    forecast: "3.1%",
    previous: "3.2%",
    notes:
      "Hotter print pressures front-end yields, supports DXY, weighs on SPX.",
  },
  {
    id: "us-nfp",
    date: nextFirstFriday(),
    time: "12:30",
    country: "US",
    title: "Non-Farm Payrolls",
    impact: "high",
    category: "NFP",
    forecast: "+180k",
    previous: "+175k",
    notes:
      "Strong print → yields up, SPX dip-then-recover; weak print → bonds bid.",
  },
  {
    id: "fomc",
    date: nextMonthly(1, 19),
    time: "18:00",
    country: "US",
    title: "FOMC Rate Decision + SEP",
    impact: "high",
    category: "FOMC",
    forecast: "Hold",
    previous: "Hold",
    notes: "Watch dot plot + Powell tone. Vol crush typical post-presser.",
  },
  {
    id: "ecb",
    date: nextMonthly(0, 26),
    time: "12:15",
    country: "EU",
    title: "ECB Rate Decision",
    impact: "high",
    category: "ECB",
    forecast: "Hold",
    previous: "Hold",
    notes: "Lagarde presser drives Bund + EURUSD.",
  },
  {
    id: "eu-cpi-flash",
    date: nextMonthly(0, 31),
    time: "10:00",
    country: "EU",
    title: "Eurozone CPI Flash",
    impact: "high",
    category: "CPI",
    forecast: "2.4%",
    previous: "2.5%",
  },
  {
    id: "us-pmi",
    date: nextMonthly(0, 22),
    time: "13:45",
    country: "US",
    title: "US S&P Global PMI Flash",
    impact: "medium",
    category: "PMI",
    forecast: "52.0",
    previous: "51.8",
  },
  {
    id: "de-ifo",
    date: nextMonthly(0, 24),
    time: "09:00",
    country: "DE",
    title: "Germany IFO Business Climate",
    impact: "medium",
    category: "Other",
  },
  {
    id: "us-gdp",
    date: nextMonthly(1, 28),
    time: "12:30",
    country: "US",
    title: "US GDP QoQ (Advance)",
    impact: "high",
    category: "GDP",
    forecast: "2.0%",
    previous: "1.6%",
  },
  {
    id: "us-retail",
    date: nextMonthly(0, 15),
    time: "12:30",
    country: "US",
    title: "US Retail Sales MoM",
    impact: "medium",
    category: "Retail",
    forecast: "0.3%",
    previous: "0.4%",
  },
];

function nextMonthly(offsetMonths: number, day: number): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, day),
  );
  if (d.getTime() < Date.now()) {
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

function nextFirstFriday(): string {
  const now = new Date();
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth();
  for (let i = 0; i < 3; i++) {
    const first = new Date(Date.UTC(y, m, 1));
    const dow = first.getUTCDay(); // 0 = Sun
    const offset = (5 - dow + 7) % 7; // 5 = Friday
    const fri = new Date(Date.UTC(y, m, 1 + offset));
    if (fri.getTime() >= Date.now() - 86_400_000) {
      return fri.toISOString().slice(0, 10);
    }
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return new Date().toISOString().slice(0, 10);
}

export const calendarRouter = createTRPCRouter({
  upcoming: publicProcedure
    .input(
      z
        .object({
          impact: z.array(z.enum(["high", "medium", "low"])).optional(),
          days: z.number().int().min(1).max(120).default(45),
        })
        .optional(),
    )
    .query(({ input }) => {
      const cutoff = Date.now() + (input?.days ?? 45) * 86_400_000;
      const impactFilter = input?.impact;
      const events = SEED.filter((e) => {
        if (impactFilter && !impactFilter.includes(e.impact)) return false;
        const ts = new Date(`${e.date}T${e.time || "00:00"}:00Z`).getTime();
        return ts >= Date.now() - 86_400_000 && ts <= cutoff;
      }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      return events;
    }),
});
