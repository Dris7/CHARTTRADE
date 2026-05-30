import { CrossAssetHeatmap } from "~/app/_components/widgets/cross-asset-heatmap";
import { EventStrip } from "~/app/_components/widgets/event-strip";
import { FinancialStress } from "~/app/_components/widgets/financial-stress";
import { MacroBrief } from "~/app/_components/widgets/macro-brief";
import { MacroStress } from "~/app/_components/widgets/macro-stress";
import { RegimeHero } from "~/app/_components/widgets/regime-hero";
import { RegimeTrajectory } from "~/app/_components/widgets/regime-trajectory";
import { SpotlightTile } from "~/app/_components/widgets/spotlight-tile";
import { YieldMonitor } from "~/app/_components/widgets/yield-monitor";

export default function Home() {
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4">
      <RegimeHero />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
        <MacroBrief />
        <RegimeTrajectory />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SpotlightTile
              symbolKey="FGBL"
              title="Bund · FGBL"
              subtitle="EU 10Y Future"
              href="/bonds"
              accent="bond"
            />
            <SpotlightTile
              symbolKey="SPX"
              title="S&P 500 · SPX"
              subtitle="Cash Index"
              href="/sp500"
              accent="equity"
            />
            <SpotlightTile
              symbolKey="ZN"
              title="ZN · 10Y T-Note"
              subtitle="CBOT Future"
              href="/bonds"
              accent="bond"
            />
            <SpotlightTile
              symbolKey="VIX"
              title="VIX"
              subtitle="Equity Vol"
              accent="equity"
            />
          </div>
          <CrossAssetHeatmap />
          <MacroStress />
        </div>

        <div className="flex flex-col gap-4">
          <YieldMonitor />
          <FinancialStress />
          <EventStrip />
        </div>
      </div>
    </div>
  );
}
