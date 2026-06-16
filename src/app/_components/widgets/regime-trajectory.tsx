"use client";

import { useMemo } from "react";

import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui/panel";

const LABEL_TONE: Record<string, string> = {
  "Risk-On": "text-(--color-up)",
  "Risk-Off": "text-(--color-down)",
  Neutral: "text-(--color-fg-dim)",
  Mixed: "text-(--color-warn)",
};

export function RegimeTrajectory() {
  const { data, isLoading } = api.macro.regimeHistory.useQuery(undefined, {
    staleTime: 30 * 60_000,
  });

  const tl = useMemo(() => data?.timeline ?? [], [data]);

  // SVG geometry for the σ line
  const W = 520;
  const H = 130;
  const padL = 28;
  const padR = 8;
  const padT = 8;
  const padB = 16;
  const iW = W - padL - padR;
  const iH = H - padT - padB;

  const { path, zeroY, band05Top, band05Bot, area } = useMemo(() => {
    if (tl.length < 2)
      return { path: "", zeroY: 0, band05Top: 0, band05Bot: 0, area: "" };
    const scores = tl.map((p) => p.score);
    const lim = Math.max(1, Math.ceil(Math.max(...scores.map(Math.abs)) * 10) / 10);
    const y = (s: number) => padT + (1 - (s + lim) / (2 * lim)) * iH;
    const x = (i: number) => padL + (i / (tl.length - 1)) * iW;
    const path = tl.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
    const area = `${path} L${x(tl.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
    return { path, zeroY: y(0), band05Top: y(0.5), band05Bot: y(-0.5), area };
  }, [tl, iW, iH]);

  // Evenly-spaced date ticks for the x-axis (like the lightweight-charts panels).
  const ticks = useMemo(() => {
    if (tl.length < 2) return [];
    const x = (i: number) => padL + (i / (tl.length - 1)) * iW;
    const N = Math.min(5, tl.length);
    return Array.from({ length: N }, (_, k) => {
      const i = Math.round((k * (tl.length - 1)) / (N - 1));
      return {
        x: x(i),
        date: tl[i]!.date,
        anchor:
          k === 0
            ? ("start" as const)
            : k === N - 1
              ? ("end" as const)
              : ("middle" as const),
      };
    });
  }, [tl, iW]);

  const cur = data?.current;
  const sum = data?.summary;

  return (
    <Panel
      title="Regime Trajectory"
      hint={isLoading ? "chargement…" : cur?.date ? `σ pondéré · 60j · ${cur.date}` : "flux indisponible"}
      right={
        cur ? (
          <span className={`tabular text-xs font-semibold ${LABEL_TONE[cur.label]}`}>
            {cur.label} {cur.score >= 0 ? "+" : ""}
            {cur.score.toFixed(2)}σ
          </span>
        ) : null
      }
    >
      {isLoading ? (
        <div className="h-[130px] animate-pulse rounded-sm bg-(--color-panel-2)/60" />
      ) : tl.length < 2 ? (
        <div className="py-8 text-center text-sm text-(--color-fg-mute)">
          Historique des régimes indisponible.
        </div>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block">
            {/* risk-on / risk-off bands */}
            <rect x={padL} y={padT} width={iW} height={band05Top - padT} fill="var(--color-up)" opacity={0.05} />
            <rect x={padL} y={band05Bot} width={iW} height={H - padB - band05Bot} fill="var(--color-down)" opacity={0.05} />
            <line x1={padL} y1={band05Top} x2={W - padR} y2={band05Top} stroke="var(--color-up)" strokeWidth={0.5} strokeDasharray="3 3" opacity={0.5} />
            <line x1={padL} y1={band05Bot} x2={W - padR} y2={band05Bot} stroke="var(--color-down)" strokeWidth={0.5} strokeDasharray="3 3" opacity={0.5} />
            <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="var(--color-border-strong)" strokeWidth={1} />
            <text x={padL - 3} y={band05Top} textAnchor="end" dominantBaseline="middle" fontSize={7} fill="var(--color-up)">+0.5</text>
            <text x={padL - 3} y={zeroY} textAnchor="end" dominantBaseline="middle" fontSize={7} fill="var(--color-fg-mute)">0</text>
            <text x={padL - 3} y={band05Bot} textAnchor="end" dominantBaseline="middle" fontSize={7} fill="var(--color-down)">-0.5</text>
            <path d={area} fill="var(--color-accent)" opacity={0.06} />
            <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} strokeLinejoin="round" />

            {/* x-axis date ticks */}
            {ticks.map((t, k) => (
              <g key={k}>
                <line x1={t.x} y1={H - padB} x2={t.x} y2={H - padB + 3} stroke="var(--color-border-strong)" strokeWidth={0.5} />
                <text x={t.x} y={H - 3} textAnchor={t.anchor} fontSize={7} fill="var(--color-fg-mute)">
                  {fmtTick(t.date)}
                </text>
              </g>
            ))}
          </svg>

          {/* analog engine summary */}
          {sum && sum.count > 0 && (
            <div className="mt-2 border-t border-(--color-border) pt-2">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
                  Analog engine
                </span>
                <span className="text-[9px] text-(--color-fg-mute)">
                  {sum.count} régimes similaires · médiane à venir
                </span>
              </div>
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-(--color-border) bg-(--color-border) sm:grid-cols-6">
                <Stat label="SPX 5j" v={sum.spx5} unit="%" />
                <Stat label="SPX 20j" v={sum.spx20} unit="%" />
                <Stat label="SPX 60j" v={sum.spx60} unit="%" />
                <Stat label="SPX réussite" v={sum.spxHitRate} unit="%" neutral />
                <Stat label="10Y 20j" v={sum.tnx20} unit="bp" invert />
                <Stat label="DXY 20j" v={sum.dxy20} unit="%" invert />
              </div>
              <p className="mt-1.5 text-[9px] text-(--color-fg-mute)">
                Mouvements à venir après les {sum.count} semaines historiques les plus similaires à la
                configuration cross-asset actuelle. Pas une prévision.
              </p>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

function fmtTick(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function Stat({
  label,
  v,
  unit,
  invert = false,
  neutral = false,
}: {
  label: string;
  v: number | null;
  unit: string;
  invert?: boolean;
  neutral?: boolean;
}) {
  const tone = neutral
    ? "text-(--color-fg)"
    : v == null || v === 0
      ? "text-(--color-fg-mute)"
      : (invert ? v < 0 : v > 0)
        ? "text-(--color-up)"
        : "text-(--color-down)";
  return (
    <div className="bg-(--color-panel) px-2 py-1.5 text-center">
      <div className="text-[9px] uppercase tracking-widest text-(--color-fg-mute)">{label}</div>
      <div className={`tabular text-[11px] font-semibold ${tone}`}>
        {v == null ? "—" : `${v >= 0 && !neutral ? "+" : ""}${unit === "bp" ? v.toFixed(0) : v.toFixed(unit === "%" ? 1 : 2)}${unit}`}
      </div>
    </div>
  );
}
