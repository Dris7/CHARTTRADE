import { type ReactNode } from "react";

type Tone = "default" | "accent" | "warn" | "hero";

const TONE: Record<Tone, string> = {
  default:
    "border border-(--color-border) bg-(--color-panel)/85 backdrop-blur-sm",
  accent:
    "border border-(--color-border-strong) bg-(--color-panel)/85 ring-1 ring-(--color-accent)/15",
  warn: "border border-yellow-700/40 bg-(--color-panel)/85",
  hero: "border border-(--color-border-strong) bg-gradient-to-br from-[#0e131c] via-[#0b0f17] to-[#0a0d14]",
};

export function Panel({
  title,
  hint,
  right,
  tone = "default",
  className = "",
  children,
  noPad = false,
}: {
  title?: string;
  hint?: string;
  right?: ReactNode;
  tone?: Tone;
  className?: string;
  noPad?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`relative overflow-hidden rounded-md ${TONE[tone]} ${className}`}
    >
      {(title ?? right) && (
        <header className="flex items-baseline justify-between gap-3 border-b border-(--color-border) px-3 py-2">
          <div className="flex items-baseline gap-2">
            {title && <span className="label">{title}</span>}
            {hint && (
              <span className="text-[10px] text-(--color-fg-mute)">{hint}</span>
            )}
          </div>
          {right && <div className="flex items-center gap-2">{right}</div>}
        </header>
      )}
      <div className={noPad ? "" : "p-3"}>{children}</div>
    </section>
  );
}
