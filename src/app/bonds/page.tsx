import { ChartPanel } from "~/app/_components/widgets/chart-panel";
import { SpotlightTile } from "~/app/_components/widgets/spotlight-tile";
import { YieldMonitor } from "~/app/_components/widgets/yield-monitor";
import { Panel } from "~/app/_components/ui/panel";

export default function BondsPage() {
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <div className="label">Bonds Terminal</div>
        <h1 className="display text-3xl">
          Cerveau macro · <span className="text-(--color-fg-mute)">rates first</span>
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SpotlightTile symbolKey="FGBL" title="BUND · FGBL" subtitle="EU 10Y" accent="bond" />
        <SpotlightTile symbolKey="FGBM" title="BOBL · FGBM" subtitle="EU 5Y" accent="bond" />
        <SpotlightTile symbolKey="FGBS" title="SCHATZ · FGBS" subtitle="EU 2Y" accent="bond" />
        <SpotlightTile symbolKey="FGBX" title="BUXL · FGBX" subtitle="EU 30Y" accent="bond" />
        <SpotlightTile symbolKey="ZN" title="ZN · 10Y T-Note" subtitle="US 10Y" accent="bond" />
        <SpotlightTile symbolKey="ZB" title="ZB · 30Y T-Bond" subtitle="US 30Y" accent="bond" />
        <SpotlightTile symbolKey="UB" title="UB · Ultra Bond" subtitle="US LT" accent="bond" />
        <SpotlightTile symbolKey="ZF" title="ZF · 5Y T-Note" subtitle="US 5Y" accent="bond" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <ChartPanel
          symbolKey="FGBL"
          title="Bund · FGBL"
          subtitle="EU 10Y future"
          defaultRange="3mo"
          defaultStyle="candles"
          height={420}
        />
        <div className="flex flex-col gap-4">
          <YieldMonitor />
          <Panel title="Bond Sentiment" hint="placeholder · ML coming">
            <ul className="space-y-2 text-xs">
              <li className="flex items-center justify-between">
                <span className="text-(--color-fg-dim)">Curve 2s10s</span>
                <span className="tabular text-(--color-fg)">inverted</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-(--color-fg-dim)">10Y real (TIPS proxy)</span>
                <span className="tabular text-(--color-fg)">elevated</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-(--color-fg-dim)">Bund / BTP spread</span>
                <span className="tabular text-(--color-fg)">stable</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-(--color-fg-dim)">MOVE Index</span>
                <span className="tabular text-(--color-fg-mute)">feed pending</span>
              </li>
            </ul>
          </Panel>
        </div>
      </div>

      <ChartPanel
        symbolKey="ZN"
        title="ZN · 10Y T-Note"
        subtitle="US 10Y future"
        defaultRange="3mo"
        defaultStyle="candles"
        height={380}
      />
    </div>
  );
}
