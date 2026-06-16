import { CrossAssetHeatmap } from "~/app/_components/widgets/cross-asset-heatmap";
import { CrossAssetCorr } from "~/app/_components/widgets/cross-asset-corr";
import { ChartPanel } from "~/app/_components/widgets/chart-panel";
import { CotPositioning } from "~/app/_components/widgets/cot-positioning";

export default function IntermarketPage() {
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <div className="label">Intermarket Engine</div>
        <h1 className="display text-3xl">
          Le marché parle ·{" "}
          <span className="text-(--color-fg-mute)">les corrélations vous le disent</span>
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.1fr]">
        <CrossAssetHeatmap />
        <CotPositioning />
      </div>

      <CrossAssetCorr />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartPanel
          symbolKey="DXY"
          title="DXY · USD Index"
          defaultRange="6mo"
          height={300}
        />
        <ChartPanel
          symbolKey="GOLD"
          title="Gold · GC"
          defaultRange="6mo"
          height={300}
        />
        <ChartPanel
          symbolKey="OIL"
          title="WTI Crude · CL"
          defaultRange="6mo"
          height={300}
        />
        <ChartPanel
          symbolKey="BTC"
          title="BTC · BTC-USD"
          defaultRange="6mo"
          height={300}
        />
      </div>
    </div>
  );
}
