"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { api } from "~/trpc/react";
import { RiskGauge } from "~/app/_components/ui/gauge";

const LABEL_TONE: Record<string, string> = {
  "Risk-On": "text-(--color-up)",
  "Risk-Off": "text-(--color-down)",
  Neutral: "text-(--color-fg-dim)",
  Mixed: "text-(--color-warn)",
};

const LABEL_TAG: Record<string, string> = {
  "Risk-On": "Actions + actifs risqués recherchés",
  "Risk-Off": "Défensifs + obligations recherchés",
  Neutral: "Signaux cross-asset mitigés",
  Mixed: "Régime conflictuel",
};

const META_TONE: Record<string, string> = {
  STABLE: "bg-(--color-up)/15 text-(--color-up) border-(--color-up)/30",
  MIXED: "bg-(--color-warn)/15 text-(--color-warn) border-(--color-warn)/30",
  TRANSITION:
    "bg-(--color-accent)/15 text-(--color-accent) border-(--color-accent)/30",
};

export function RegimeHero() {
  const regime = api.macro.regime.useQuery(undefined, {
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const r = regime.data;
  const tone = r ? (LABEL_TONE[r.label] ?? "text-(--color-fg)") : "text-(--color-fg)";

  // Map σ score to the −100…+100 gauge: ±2σ → ±100
  const gaugeScore = r
    ? Math.max(-100, Math.min(100, Math.round(r.scoreSigma * 50)))
    : 0;

  return (
    <div className="grain relative overflow-hidden rounded-md border border-(--color-border-strong) bg-gradient-to-br from-[#10171f] via-[#0a0f17] to-[#070a10]">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-(--color-accent)/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-(--color-accent-2)/10 blur-3xl" />

      <div className="relative grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1.6fr_1fr]">
        {/* LEFT: regime + sector cards + macro spread bar */}
        <div className="flex flex-col gap-5">
          <div>
            <div className="flex items-center gap-2 pb-2">
              <span className="pulse" />
              <span className="label">Régime actuel</span>
              {r && (
                <span
                  className={`ml-1 rounded-sm border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest ${META_TONE[r.meta] ?? ""}`}
                >
                  {r.meta} — {r.metaNote}
                </span>
              )}
              <span className="ml-auto text-[10px] text-(--color-fg-mute)">
                {r ? new Date(r.computedAt).toUTCString().slice(17, 25) + " UTC" : "…"}
              </span>
            </div>
            <div className="flex items-baseline gap-4">
              <h1 className={`display text-5xl leading-none sm:text-6xl ${tone}`}>
                {r?.label ?? "—"}
              </h1>
              {r && (
                <div className="flex flex-col">
                  <span className={`tabular text-2xl font-semibold ${tone}`}>
                    {fmtSigma(r.scoreSigma)}σ
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
                    z pondéré · 60j
                  </span>
                </div>
              )}
            </div>
            <p className="mt-2 text-sm text-(--color-fg-dim)">
              {r ? (LABEL_TAG[r.label] ?? "") : "Échantillonnage des données cross-asset…"}
            </p>
          </div>

          {/* Sector regime cards */}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
            {(r?.sectors ?? Array.from({ length: 6 }).map(() => null)).map(
              (s, i) =>
                s ? (
                  <SectorCard key={s.key} sector={s} />
                ) : (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-sm bg-(--color-panel-2)/60"
                  />
                ),
            )}
          </div>

          {/* Pillar count badges */}
          {r && (
            <div className="flex flex-wrap items-center gap-2">
              <PillarBadge bias="risk-on" count={r.pillarsRiskOn} />
              <PillarBadge bias="risk-off" count={r.pillarsRiskOff} />
              <PillarBadge
                bias="neutral"
                count={r.pillars.length - r.pillarsRiskOn - r.pillarsRiskOff}
              />
            </div>
          )}

          {/* Macro spread bar — HY OAS · 2s10s · Net Liq */}
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-(--color-border) bg-(--color-border)">
            <MacroCell
              label="HY OAS"
              value={r?.macro.hyOas != null ? r.macro.hyOas.toFixed(0) : "—"}
              suffix="bps"
              hint="ICE BofA"
            />
            <MacroCell
              label="2s10s"
              value={
                r?.macro.curve2s10s != null
                  ? `${r.macro.curve2s10s >= 0 ? "+" : ""}${r.macro.curve2s10s.toFixed(2)}`
                  : "—"
              }
              suffix="%"
              hint={
                r?.macro.curve2s10s != null && r.macro.curve2s10s < 0
                  ? "inverted"
                  : "spread"
              }
            />
            <MacroCell
              label="Net Liq"
              value={
                r?.macro.netLiquidity != null
                  ? `$${r.macro.netLiquidity.toFixed(2)}`
                  : "—"
              }
              suffix="T"
              hint="WALCL − TGA − RRP"
            />
          </div>
        </div>

        {/* RIGHT: gauge + driver list */}
        <div className="flex flex-col items-center justify-center rounded-md border border-(--color-border) bg-(--color-panel)/60 p-4">
          <div className="label pb-1">Risk-On / Risk-Off</div>
          <RiskGauge score={gaugeScore} />
          <div className="-mt-4 flex items-baseline gap-2">
            <span
              className={`tabular text-4xl font-bold ${
                (r?.scoreSigma ?? 0) > 0
                  ? "text-(--color-up)"
                  : (r?.scoreSigma ?? 0) < 0
                    ? "text-(--color-down)"
                    : "text-(--color-fg-dim)"
              }`}
            >
              {r ? fmtSigma(r.scoreSigma) : "—"}
            </span>
            <span className="text-xs text-(--color-fg-mute)">σ</span>
          </div>
          <div className="pt-1 text-[11px] uppercase tracking-widest text-(--color-fg-mute)">
            {r?.label ?? "calcul…"}
          </div>

          {/* Pillar list */}
          <ul className="mt-3 w-full divide-y divide-(--color-border) text-[11px]">
            {(r?.pillars ?? []).map((p) => (
              <li
                key={p.key}
                className="flex items-center justify-between gap-2 py-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <BiasIcon bias={p.bias} />
                  <span className="text-(--color-fg-dim)">{p.label}</span>
                  {p.delta1d !== 0 && (
                    <span className="text-(--color-fg-mute)">
                      {p.delta1d > 0 ? "↑" : "↓"}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="tabular text-(--color-fg)">{p.display}</span>
                  <span
                    className={`tabular text-[10px] ${zTone(p.contribution)}`}
                  >
                    {fmtSigma(p.contribution)}σ
                  </span>
                </div>
              </li>
            ))}
            {!r &&
              Array.from({ length: 6 }).map((_, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between py-1.5"
                >
                  <div className="h-3 w-20 rounded bg-(--color-panel-2)" />
                  <div className="h-3 w-12 rounded bg-(--color-panel-2)" />
                </li>
              ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SectorCard({
  sector,
}: {
  sector: {
    key: string;
    label: string;
    regime: string;
    bias: string;
    zAvg: number;
    pillars: string[];
  };
}) {
  const tone =
    sector.bias === "risk-on"
      ? "border-(--color-up)/30 bg-(--color-up)/8"
      : sector.bias === "risk-off"
        ? "border-(--color-down)/30 bg-(--color-down)/8"
        : "border-(--color-border) bg-(--color-panel)";
  const regimeTone =
    sector.bias === "risk-on"
      ? "text-(--color-up)"
      : sector.bias === "risk-off"
        ? "text-(--color-down)"
        : "text-(--color-fg-dim)";

  return (
    <div
      className={`flex flex-col rounded-sm border px-2.5 py-2 ${tone}`}
      style={{ background: undefined }}
    >
      <div className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
        {sector.label}
      </div>
      <div className={`pt-1 text-[11px] font-semibold ${regimeTone}`}>
        {sector.regime}
      </div>
      <div className="tabular pt-0.5 text-[10px] text-(--color-fg-mute)">
        {fmtSigma(sector.zAvg)}σ
      </div>
    </div>
  );
}

function PillarBadge({
  bias,
  count,
}: {
  bias: "risk-on" | "risk-off" | "neutral";
  count: number;
}) {
  const tone =
    bias === "risk-on"
      ? "bg-(--color-up)/15 text-(--color-up) border-(--color-up)/30"
      : bias === "risk-off"
        ? "bg-(--color-down)/15 text-(--color-down) border-(--color-down)/30"
        : "bg-(--color-panel-2) text-(--color-fg-dim) border-(--color-border-strong)";
  const arrow =
    bias === "risk-on" ? (
      <ArrowUp size={11} />
    ) : bias === "risk-off" ? (
      <ArrowDown size={11} />
    ) : (
      <Minus size={11} />
    );
  return (
    <span
      className={`tabular inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[11px] ${tone}`}
    >
      {arrow}
      <strong className="font-semibold">{count}</strong>
      <span className="text-[10px] uppercase tracking-widest opacity-80">
        {bias === "risk-on"
          ? "Risk-On"
          : bias === "risk-off"
            ? "Risk-Off"
            : "Neutral"}
      </span>
    </span>
  );
}

function MacroCell({
  label,
  value,
  suffix,
  hint,
}: {
  label: string;
  value: string;
  suffix: string;
  hint: string;
}) {
  return (
    <div className="bg-(--color-panel) px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
        {label}
      </div>
      <div className="tabular flex items-baseline gap-1 pt-0.5">
        <span className="text-sm font-semibold text-(--color-fg)">{value}</span>
        <span className="text-[10px] text-(--color-fg-mute)">{suffix}</span>
      </div>
      <div className="text-[9px] uppercase tracking-widest text-(--color-fg-mute)">
        {hint}
      </div>
    </div>
  );
}

function BiasIcon({ bias }: { bias: "risk-on" | "risk-off" | "neutral" }) {
  if (bias === "risk-on")
    return <ArrowUp size={10} className="text-(--color-up)" />;
  if (bias === "risk-off")
    return <ArrowDown size={10} className="text-(--color-down)" />;
  return <Minus size={10} className="text-(--color-fg-mute)" />;
}

function fmtSigma(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
}

function zTone(z: number): string {
  if (z > 0.5) return "text-(--color-up)";
  if (z < -0.5) return "text-(--color-down)";
  return "text-(--color-fg-mute)";
}
