"use client";

import { api } from "~/trpc/react";
import { RiskGauge } from "~/app/_components/ui/gauge";

const REGIME_COPY: Record<string, { tag: string; tone: string }> = {
  Goldilocks: { tag: "Equity-friendly · Yields easing", tone: "text-(--color-up)" },
  Reflation: { tag: "Cyclicals lead · Yields up", tone: "text-(--color-warn)" },
  Stagflation: {
    tag: "Yields up · Growth wobbles",
    tone: "text-(--color-down)",
  },
  Deflation: { tag: "Bonds + USD bid · Growth fears", tone: "text-(--color-accent-2)" },
  "Tightening Shock": {
    tag: "Yields & USD surge · Equities crack",
    tone: "text-(--color-down)",
  },
  "Easing Rally": {
    tag: "Liquidity-led · Drift higher",
    tone: "text-(--color-up)",
  },
};

export function RegimeHero() {
  const macro = api.macro.macroRegime.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const risk = api.macro.riskRegime.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const m = macro.data;
  const r = risk.data;
  const tone = m ? (REGIME_COPY[m.label]?.tone ?? "text-(--color-fg)") : "text-(--color-fg)";

  return (
    <div className="grain relative overflow-hidden rounded-md border border-(--color-border-strong) bg-gradient-to-br from-[#10171f] via-[#0a0f17] to-[#070a10]">
      {/* corner accent */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-(--color-accent)/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-(--color-accent-2)/10 blur-3xl" />

      <div className="relative grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 pb-3">
              <span className="pulse" />
              <span className="label">Macro Regime · Live</span>
              <span className="ml-2 text-[10px] text-(--color-fg-mute)">
                {m
                  ? new Date(m.computedAt).toUTCString().slice(17, 25) + " UTC"
                  : "…"}
              </span>
            </div>
            <h1
              className={`display text-5xl leading-none sm:text-6xl ${tone}`}
            >
              {m?.label ?? "—"}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-(--color-fg-dim)">
              {m?.description ?? "Sampling cross-asset prints…"}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-(--color-border) bg-(--color-border) sm:grid-cols-6">
            {(m?.signals ?? []).map((s) => (
              <div
                key={s.label}
                className="bg-(--color-panel) px-3 py-2 text-[11px]"
              >
                <div className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
                  {s.label}
                </div>
                <div
                  className={`tabular pt-0.5 text-sm ${
                    s.bias === "up"
                      ? "text-(--color-up)"
                      : s.bias === "down"
                        ? "text-(--color-down)"
                        : "text-(--color-fg-dim)"
                  }`}
                >
                  {s.value}
                </div>
              </div>
            ))}
            {!m &&
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-(--color-panel) px-3 py-2">
                  <div className="h-3 w-12 rounded bg-(--color-panel-2)" />
                  <div className="mt-2 h-3 w-16 rounded bg-(--color-panel-2)" />
                </div>
              ))}
          </div>
        </div>

        <div className="flex flex-col items-center justify-center rounded-md border border-(--color-border) bg-(--color-panel)/60 p-4">
          <div className="label pb-1">Risk-On / Risk-Off</div>
          <RiskGauge score={r?.score ?? 0} />
          <div className="-mt-4 flex items-baseline gap-2">
            <span
              className={`tabular text-4xl font-bold ${
                (r?.score ?? 0) > 0
                  ? "text-(--color-up)"
                  : (r?.score ?? 0) < 0
                    ? "text-(--color-down)"
                    : "text-(--color-fg-dim)"
              }`}
            >
              {r ? (r.score > 0 ? "+" : "") + r.score : "—"}
            </span>
            <span className="text-xs text-(--color-fg-mute)">/ 100</span>
          </div>
          <div className="pt-1 text-[11px] uppercase tracking-widest text-(--color-fg-mute)">
            {r?.label ?? "computing…"}
          </div>

          <ul className="mt-3 w-full divide-y divide-(--color-border) text-[11px]">
            {(r?.drivers ?? []).slice(0, 4).map((d) => (
              <li
                key={d.label}
                className="flex items-center justify-between py-1"
              >
                <span className="text-(--color-fg-dim)">{d.label}</span>
                <span className="tabular text-(--color-fg)">{d.note}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
