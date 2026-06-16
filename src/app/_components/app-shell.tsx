"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  CalendarDays,
  Gauge,
  LineChart,
  Network,
  Newspaper,
  Notebook,
  Radio,
  Settings,
  TrendingUp,
} from "lucide-react";

import { TickerBar } from "~/app/_components/ticker-bar";

const NAV: Array<{
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  group: "core" | "terminal" | "tools";
}> = [
  { href: "/", label: "Tableau macro", icon: Gauge, group: "core" },
  { href: "/news", label: "Actualités", icon: Newspaper, group: "core" },
  { href: "/bonds", label: "Terminal Bonds", icon: Activity, group: "terminal" },
  { href: "/sp500", label: "Terminal SP500", icon: TrendingUp, group: "terminal" },
  { href: "/intermarket", label: "Intermarket", icon: Network, group: "terminal" },
  { href: "/calendar", label: "Calendrier", icon: CalendarDays, group: "tools" },
  { href: "/journal", label: "Journal", icon: Notebook, group: "tools" },
];

const GROUPS: Array<{ key: "core" | "terminal" | "tools"; label: string }> = [
  { key: "core", label: "Aperçu" },
  { key: "terminal", label: "Terminaux" },
  { key: "tools", label: "Outils" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen w-full bg-(--color-bg) text-(--color-fg)">
      <aside className="hidden w-60 shrink-0 border-r border-(--color-border) bg-(--color-panel) md:flex md:flex-col">
        <div className="flex h-14 items-center gap-2 border-b border-(--color-border) px-4">
          <LineChart className="text-(--color-accent)" size={18} />
          <span className="font-semibold tracking-wide">
            CHART<span className="text-(--color-accent)">TRADE</span>
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3 text-sm">
          {GROUPS.map((group) => (
            <div key={group.key} className="flex flex-col gap-1">
              <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-widest text-(--color-fg-mute)">
                {group.label}
              </div>
              {NAV.filter((n) => n.group === group.key).map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname?.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition ${
                      active
                        ? "bg-(--color-panel-2) text-(--color-fg)"
                        : "text-(--color-fg-dim) hover:bg-(--color-panel-2) hover:text-(--color-fg)"
                    }`}
                  >
                    <Icon size={15} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-(--color-border) p-3 text-xs text-(--color-fg-mute)">
          <Link
            href="/settings"
            className="flex items-center gap-2 hover:text-(--color-fg)"
          >
            <Settings size={14} /> Paramètres
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-(--color-border) bg-(--color-panel) px-4">
          <div className="flex items-center gap-3">
            <span className="hidden text-xs uppercase tracking-widest text-(--color-fg-mute) md:inline">
              Terminal
            </span>
            <span className="text-sm font-medium text-(--color-fg-dim)">
              {pageTitle(pathname)}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-(--color-fg-dim)">
              <Radio size={12} className="text-(--color-up)" />
              <span className="tabular">LIVE</span>
            </div>
            <div className="hidden tabular text-(--color-fg-mute) sm:block">
              <LiveClock />
            </div>
          </div>
        </header>
        <TickerBar />
        <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

/**
 * Client-only clock to avoid SSR/CSR hydration mismatches.
 * Renders nothing on the server (and on first render), then updates each
 * second after mount.
 */
function LiveClock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date().toUTCString().slice(17, 25) + " UTC");
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span suppressHydrationWarning>{now ?? ""}</span>;
}

function pageTitle(pathname: string | null): string {
  switch (true) {
    case pathname === "/":
      return "Tableau de bord macro global";
    case pathname?.startsWith("/news") ?? false:
      return "Fil d’actualité en direct";
    case pathname?.startsWith("/bonds") ?? false:
      return "Terminal Bonds";
    case pathname?.startsWith("/sp500") ?? false:
      return "Terminal SP500";
    case pathname?.startsWith("/intermarket") ?? false:
      return "Moteur Intermarket";
    case pathname?.startsWith("/calendar") ?? false:
      return "Calendrier intelligent";
    case pathname?.startsWith("/journal") ?? false:
      return "Journal & Playbook";
    default:
      return "";
  }
}
