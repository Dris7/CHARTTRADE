"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { api } from "~/trpc/react";
import { Sparkline } from "~/app/_components/ui/sparkline";
import { Delta } from "~/app/_components/ui/delta";
import { type SymbolKey } from "~/server/services/symbols";

export function SpotlightTile({
  symbolKey,
  title,
  subtitle,
  href,
  accent,
}: {
  symbolKey: SymbolKey;
  title: string;
  subtitle?: string;
  href?: string;
  accent?: "bond" | "equity";
}) {
  const quote = api.market.quotes.useQuery(
    { keys: [symbolKey] },
    { refetchInterval: 30_000 },
  );
  const candles = api.market.candles.useQuery(
    { key: symbolKey, range: "1mo", interval: "1d" },
    { staleTime: 5 * 60_000 },
  );

  const q = quote.data?.[0];
  const series = (candles.data?.candles ?? []).map((c) => c.c);
  const accentColor =
    accent === "bond" ? "var(--color-accent-2)" : "var(--color-accent)";

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-md border border-(--color-border) bg-(--color-panel)/85 transition hover:border-(--color-border-strong)">
      <div
        className="absolute left-0 top-0 h-full w-[3px]"
        style={{ background: accentColor }}
      />
      <div className="flex items-start justify-between px-4 pb-2 pt-4">
        <div>
          <div className="label">{title}</div>
          {subtitle && (
            <div className="text-[11px] text-(--color-fg-mute)">{subtitle}</div>
          )}
        </div>
        {href && (
          <Link
            href={href}
            className="flex items-center gap-1 rounded-sm border border-(--color-border) px-2 py-1 text-[10px] text-(--color-fg-dim) opacity-0 transition group-hover:opacity-100 hover:text-(--color-fg)"
          >
            Ouvrir <ArrowUpRight size={10} />
          </Link>
        )}
      </div>
      <div className="flex items-end justify-between gap-4 px-4">
        <div>
          <div className="tabular text-3xl font-semibold">
            {q?.price == null ? "—" : fmtPrice(q.price)}
          </div>
          <div className="pt-0.5 text-xs">
            <Delta value={q?.changePct} />{" "}
            <span className="tabular text-(--color-fg-mute)">
              {q?.change != null
                ? `(${q.change >= 0 ? "+" : ""}${q.change.toFixed(2)})`
                : ""}
            </span>
          </div>
        </div>
        <Sparkline data={series} width={140} height={48} />
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-(--color-border) px-4 py-2 text-[10px] uppercase tracking-widest text-(--color-fg-mute)">
        <span>1M</span>
        <span>séance</span>
      </div>
    </div>
  );
}

function fmtPrice(p: number) {
  if (p >= 1000) return p.toFixed(0);
  if (p >= 100) return p.toFixed(2);
  if (p >= 10) return p.toFixed(2);
  return p.toFixed(3);
}
