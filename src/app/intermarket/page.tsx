import { CrossAssetHeatmap } from "~/app/_components/widgets/cross-asset-heatmap";
import { ChartPanel } from "~/app/_components/widgets/chart-panel";
import { CotPositioning } from "~/app/_components/widgets/cot-positioning";
import { PredictionMarkets } from "~/app/_components/widgets/prediction-markets";
import { Panel } from "~/app/_components/ui/panel";

const PAIRS = [
  { a: "Bonds (ZN)", b: "Equities (SPX)", note: "Risk-off → ZN ↑ / SPX ↓" },
  { a: "Bonds (ZN)", b: "Gold", note: "Real-yield driven" },
  { a: "DXY", b: "SPX", note: "USD up → tighter conditions" },
  { a: "Oil", b: "Yields", note: "Inflation channel" },
  { a: "Bund", b: "ZN", note: "Global rates beta" },
];

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

      <PredictionMarkets />

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

      <Panel title="Watch-list pairs" hint="rolling β · coming soon">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
            <tr className="border-b border-(--color-border)">
              <th className="px-3 py-2 text-left font-medium">Asset A</th>
              <th className="px-3 py-2 text-left font-medium">Asset B</th>
              <th className="px-3 py-2 text-left font-medium">Signal</th>
            </tr>
          </thead>
          <tbody>
            {PAIRS.map((p) => (
              <tr
                key={p.a + p.b}
                className="border-b border-(--color-border)/40 last:border-0"
              >
                <td className="px-3 py-2 text-(--color-fg)">{p.a}</td>
                <td className="px-3 py-2 text-(--color-fg)">{p.b}</td>
                <td className="px-3 py-2 text-(--color-fg-dim)">{p.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
