import { ChartPanel } from "~/app/_components/widgets/chart-panel";
import { FearGreed } from "~/app/_components/widgets/fear-greed";
import { SectorBoard } from "~/app/_components/widgets/sector-board";
import { SpotlightTile } from "~/app/_components/widgets/spotlight-tile";

export default function SP500Page() {
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <div className="label">SP500 Terminal</div>
        <h1 className="display text-3xl">
          Appétit au risque ·{" "}
          <span className="text-(--color-fg-mute)">equity flow</span>
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SpotlightTile symbolKey="SPX" title="SPX" subtitle="Cash Index" accent="equity" />
        <SpotlightTile symbolKey="ES" title="ES · S&P Fut" subtitle="E-mini" accent="equity" />
        <SpotlightTile symbolKey="NQ" title="NQ · Nasdaq Fut" subtitle="E-mini" accent="equity" />
        <SpotlightTile symbolKey="VIX" title="VIX" subtitle="30D Vol" accent="equity" />
      </div>

      <ChartPanel
        symbolKey="ES"
        title="ES · S&P 500 future"
        subtitle="E-mini continuous"
        defaultRange="3mo"
        defaultStyle="candles"
        height={460}
      />

      <SectorBoard />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <ChartPanel
          symbolKey="VIX"
          title="VIX · Equity Vol"
          subtitle="30-day implied"
          defaultRange="3mo"
          defaultStyle="area"
          height={300}
        />
        <FearGreed />
      </div>
    </div>
  );
}
