# ChartTrade

A macro-first trading terminal for bonds and the S&P 500. ChartTrade reads the
macro regime across asset classes, monitors yields and bond/equity futures, and
surfaces the economic catalysts that move them — in a dense, terminal-style UI.

## Stack

- **Next.js 15** (App Router) + **React 19**
- **tRPC 11** + **TanStack Query** for the typed data layer
- **Tailwind CSS v4** with a custom terminal design system (`src/styles/globals.css`)
- **lightweight-charts** for price charts
- **Vitest** for unit tests

## Data sources

All free, no key required except the optional FRED key:

| Source            | Used for                                              | Caching |
| ----------------- | ----------------------------------------------------- | ------- |
| **FRED**          | Yields, macro series for the regime engine            | 30 min  |
| **Investing.com** | Eurex bond futures (Bund/Bobl/Schatz/Buxl), indices   | 2 min   |
| **Stooq**         | Quotes + EOD history for futures/indices              | 1–2 min |
| **Yahoo Finance** | Fallback quotes + intraday candles                    | 30 s    |
| **CoinGecko**     | BTC                                                   | 1 min   |
| **ForexFactory**  | Economic calendar (this week + next week)             | 30 min  |

Each market resolves through a fallback chain (`src/server/services/quotes.ts`);
if every live source fails, charts render a clearly-labelled **simulated** series
so the layout never breaks. Network fetches use the Next.js data cache
(`next: { revalidate }`) so it is shared across serverless invocations.

## The regime engine

`src/server/services/regime.ts` computes a macrostaq-style risk regime. Each
pillar (S&P, VIX, HY credit OAS, 2s10s curve, net liquidity, DXY, crude) is
z-scored against a 60-day rolling baseline, signed so positive = risk-on, and
weighted into a headline σ score plus per-sector cards. The pure math lives in
`regime-math.ts` and is unit-tested.

## Develop

```bash
npm install
cp .env.example .env   # optional: add FRED_API_KEY for the faster FRED JSON API
npm run dev            # http://localhost:3000
```

## Scripts

```bash
npm run dev          # dev server (turbo)
npm run build        # production build
npm run test         # run the vitest suite once
npm run test:watch   # watch mode
npm run typecheck    # tsc --noEmit
npm run lint         # next lint
```

## Deploy

Configured for Netlify (`netlify.toml`) with the Next.js plugin. The tRPC
function timeout is raised to cover the cold-start FRED fan-out; subsequent
requests are served from the shared data cache.
