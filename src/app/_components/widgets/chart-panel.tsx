"use client";

import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui/panel";
import { Delta } from "~/app/_components/ui/delta";
import { type SymbolKey } from "~/server/services/symbols";

type Range = "5d" | "1mo" | "3mo" | "6mo" | "1y";
type Interval = "1h" | "1d";
type Style = "area" | "candles";

const RANGES: Array<{ label: string; range: Range; interval: Interval }> = [
  { label: "5D", range: "5d", interval: "1h" },
  { label: "1M", range: "1mo", interval: "1d" },
  { label: "3M", range: "3mo", interval: "1d" },
  { label: "6M", range: "6mo", interval: "1d" },
  { label: "1Y", range: "1y", interval: "1d" },
];

export function ChartPanel({
  symbolKey,
  title,
  subtitle,
  defaultRange = "3mo",
  defaultStyle = "area",
  height = 360,
}: {
  symbolKey: SymbolKey;
  title: string;
  subtitle?: string;
  defaultRange?: Range;
  defaultStyle?: Style;
  height?: number;
}) {
  const [range, setRange] = useState<Range>(defaultRange);
  const [style, setStyle] = useState<Style>(defaultStyle);
  const cfg = RANGES.find((r) => r.range === range) ?? RANGES[2]!;

  const quote = api.market.quotes.useQuery(
    { keys: [symbolKey] },
    { refetchInterval: 30_000 },
  );
  const candles = api.market.candles.useQuery(
    { key: symbolKey, range, interval: cfg.interval },
    { staleTime: 60_000 },
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<
    ISeriesApi<"Candlestick" | "Area"> | null
  >(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#98a3b3",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1a223040" },
        horzLines: { color: "#1a223080" },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: "#2a3445", width: 1, style: 3 },
        horzLine: { color: "#2a3445", width: 1, style: 3 },
      },
      rightPriceScale: {
        borderColor: "#1a2230",
      },
      timeScale: {
        borderColor: "#1a2230",
        timeVisible: cfg.interval === "1h",
        secondsVisible: false,
      },
      autoSize: true,
    });
    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({});
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volRef.current = null;
    };
  }, [cfg.interval]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    // tear down existing series when style changes
    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }
    if (volRef.current) {
      chart.removeSeries(volRef.current);
      volRef.current = null;
    }
    if (style === "candles") {
      seriesRef.current = chart.addSeries(CandlestickSeries, {
        upColor: "#21c97b",
        downColor: "#ec4d52",
        borderUpColor: "#21c97b",
        borderDownColor: "#ec4d52",
        wickUpColor: "#21c97b",
        wickDownColor: "#ec4d52",
      });
    } else {
      seriesRef.current = chart.addSeries(AreaSeries, {
        lineColor: "#f5a524",
        topColor: "rgba(245,165,36,0.30)",
        bottomColor: "rgba(245,165,36,0.00)",
        lineWidth: 2,
        priceLineColor: "#f5a52480",
      });
    }
    volRef.current = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      color: "#1a2230",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
  }, [style]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const vol = volRef.current;
    if (!chart || !series || !vol) return;
    const data = candles.data?.candles ?? [];
    if (data.length === 0) return;
    if (style === "candles") {
      (series as ISeriesApi<"Candlestick">).setData(
        data.map((d) => ({
          time: d.t as Time,
          open: d.o,
          high: d.h,
          low: d.l,
          close: d.c,
        })),
      );
    } else {
      (series as ISeriesApi<"Area">).setData(
        data.map((d) => ({ time: d.t as Time, value: d.c })),
      );
    }
    vol.setData(
      data.map((d) => ({
        time: d.t as Time,
        value: d.v,
        color: d.c >= d.o ? "rgba(33,201,123,0.35)" : "rgba(236,77,82,0.35)",
      })),
    );
    chart.timeScale().fitContent();
  }, [candles.data, style]);

  const q = quote.data?.[0];

  const sourceLabel = sourceLabelFor(candles.data?.source);

  return (
    <Panel
      title={title}
      hint={subtitle ? `${subtitle} · ${sourceLabel}` : sourceLabel}
      right={
        <div className="flex items-center gap-2">
          <ToggleGroup
            value={style}
            onChange={setStyle}
            options={[
              { v: "area", l: "Area" },
              { v: "candles", l: "Candles" },
            ]}
          />
          <ToggleGroup
            value={range}
            onChange={setRange}
            options={RANGES.map((r) => ({ v: r.range, l: r.label }))}
          />
        </div>
      }
    >
      <div className="flex items-baseline gap-4 pb-2">
        <div className="tabular text-2xl font-semibold">
          {q?.price == null
            ? "—"
            : q.price >= 1000
              ? q.price.toFixed(0)
              : q.price.toFixed(2)}
        </div>
        <Delta value={q?.changePct} />
        <span className="tabular text-xs text-(--color-fg-mute)">
          {q?.change != null
            ? `${q.change >= 0 ? "+" : ""}${q.change.toFixed(2)}`
            : ""}
        </span>
      </div>
      <div ref={containerRef} style={{ width: "100%", height }} />
    </Panel>
  );
}

function sourceLabelFor(source: string | undefined): string {
  switch (source) {
    case "investing":
      return "Investing.com · delayed";
    case "coingecko":
      return "CoinGecko · 24h";
    case "stooq":
      return "Stooq · EOD";
    case "yahoo":
      return "Yahoo · delayed";
    case "none":
      return "feed throttled · synthetic";
    default:
      return "";
  }
}

function ToggleGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ v: T; l: string }>;
}) {
  return (
    <div className="flex overflow-hidden rounded-sm border border-(--color-border) text-[10px]">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`px-2 py-1 transition ${
            value === o.v
              ? "bg-(--color-panel-2) text-(--color-fg)"
              : "text-(--color-fg-dim) hover:text-(--color-fg)"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
