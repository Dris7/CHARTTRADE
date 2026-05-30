"use client";

import { ArrowDown, ArrowUp, CalendarClock } from "lucide-react";

import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui/panel";

export function MacroBrief() {
  const { data, isLoading } = api.macro.brief.useQuery(undefined, {
    staleTime: 30 * 60_000,
  });

  return (
    <Panel
      tone="accent"
      title="Daily Macro Brief"
      hint={
        isLoading
          ? "synthèse…"
          : data
            ? data.source === "gemini"
              ? "Synthèse IA"
              : "Synthèse auto"
            : "indisponible"
      }
      right={
        data ? (
          <span className="text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
            {new Date(data.generatedAt).toUTCString().slice(5, 16)}
          </span>
        ) : null
      }
    >
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-(--color-panel-2)" />
          ))}
        </div>
      ) : !data ? (
        <div className="py-6 text-center text-sm text-(--color-fg-mute)">
          Synthèse indisponible.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-(--color-fg)">{data.summary}</p>

          {(data.drivers.riskOn.length > 0 || data.drivers.riskOff.length > 0) && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data.drivers.riskOn.length > 0 && (
                <DriverList tone="on" items={data.drivers.riskOn} />
              )}
              {data.drivers.riskOff.length > 0 && (
                <DriverList tone="off" items={data.drivers.riskOff} />
              )}
            </div>
          )}

          <div className="flex flex-col gap-1 border-t border-(--color-border) pt-2 text-[11px]">
            <p className="text-(--color-fg-dim)">
              <span className="text-(--color-fg-mute)">Δ semaine · </span>
              {data.changed}
            </p>
            <p className="text-(--color-fg-dim)">
              <span className="text-(--color-fg-mute)">Analog · </span>
              {data.analog}
            </p>
          </div>

          {data.ahead.length > 0 && (
            <div className="border-t border-(--color-border) pt-2">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
                <CalendarClock size={11} /> À surveiller
              </div>
              <ul className="flex flex-col gap-0.5">
                {data.ahead.map((e) => (
                  <li key={e} className="tabular text-[11px] text-(--color-fg-dim)">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function DriverList({ tone, items }: { tone: "on" | "off"; items: string[] }) {
  const isOn = tone === "on";
  return (
    <div
      className={`rounded-sm border px-2.5 py-2 ${
        isOn
          ? "border-(--color-up)/30 bg-(--color-up)/8"
          : "border-(--color-down)/30 bg-(--color-down)/8"
      }`}
    >
      <div
        className={`mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest ${
          isOn ? "text-(--color-up)" : "text-(--color-down)"
        }`}
      >
        {isOn ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
        Facteurs {isOn ? "Risk-on" : "Risk-off"}
      </div>
      <ul className="flex flex-col gap-0.5">
        {items.map((it) => (
          <li key={it} className="text-[11px] text-(--color-fg-dim)">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
