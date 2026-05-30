import "server-only";

// Daily Macro Brief — a synthesis layer over the regime engine, indicators,
// analog stats, and the calendar. Deterministic by default (reliable, no key,
// no hallucination); optionally polished by Google Gemini when GEMINI_API_KEY
// (from aistudio.google.com) is set.

import { getRegimeReport } from "~/server/services/regime";
import { getRegimeHistory } from "~/server/services/regime-history";
import { getCalendar } from "~/server/services/calendar";

export interface MacroBrief {
  headline: string;
  summary: string;
  drivers: { riskOn: string[]; riskOff: string[] };
  changed: string;
  analog: string;
  ahead: string[];
  source: "rule-based" | "gemini";
  generatedAt: number;
}

let cache: { exp: number; v: MacroBrief } | null = null;

function fmtSigma(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}σ`;
}

export async function getMacroBrief(): Promise<MacroBrief> {
  if (cache && cache.exp > Date.now()) return cache.v;

  const [regime, history, calendar] = await Promise.all([
    getRegimeReport(),
    getRegimeHistory().catch(() => null),
    getCalendar().catch(() => []),
  ]);

  // Drivers: strongest risk-on / risk-off pillars by |contribution|.
  const sorted = [...regime.pillars].sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution),
  );
  const riskOn = sorted
    .filter((p) => p.contribution > 0.3)
    .slice(0, 3)
    .map((p) => `${p.label} (${p.display})`);
  const riskOff = sorted
    .filter((p) => p.contribution < -0.3)
    .slice(0, 3)
    .map((p) => `${p.label} (${p.display})`);

  // What changed vs ~1 week ago.
  let changed = "Régime stable sur la semaine écoulée.";
  if (history && history.timeline.length > 6) {
    const now = history.current.score;
    const prior = history.timeline[history.timeline.length - 6]!.score;
    const d = now - prior;
    if (Math.abs(d) >= 0.15) {
      changed = `Le score de régime a ${d > 0 ? "progressé" : "reculé"} de ${Math.abs(d).toFixed(2)}σ sur la semaine écoulée (${fmtSigma(prior)} → ${fmtSigma(now)}), ${d > 0 ? "évoluant vers le risk-on" : "penchant vers le risk-off"}.`;
    } else {
      changed = `Score de régime peu changé sur la semaine, autour de ${fmtSigma(now)}.`;
    }
  }

  // Analog read.
  let analog = "Historique insuffisant pour une lecture analogique.";
  const s = history?.summary;
  const spx = s?.spx20;
  if (s && s.count > 0 && spx != null) {
    const tnx = s.tnx20;
    analog = `Sur les ${s.count} semaines historiques les plus proches d'aujourd'hui, le SPX a rendu une médiane de ${spx >= 0 ? "+" : ""}${spx.toFixed(1)}% sur le mois suivant (${s.spxHitRate?.toFixed(0)}% positifs)${tnx != null ? `, avec le 10Y ${tnx >= 0 ? "+" : ""}${tnx.toFixed(0)}bp` : ""}.`;
  }

  // Ahead: next high/medium-impact events in the coming week.
  const now = Date.now();
  const ahead = calendar
    .filter((e) => e.ts >= now && e.ts <= now + 7 * 86_400_000)
    .filter((e) => e.impact === "high" || e.impact === "medium")
    .slice(0, 4)
    .map((e) => {
      const d = new Date(e.ts).toLocaleDateString("fr-FR", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
      return `${d} — ${e.country} ${e.title}${e.forecast ? ` (prév ${e.forecast})` : ""}`;
    });

  const headline = `Régime ${regime.label} à ${fmtSigma(regime.scoreSigma)} — ${regime.metaNote.toLowerCase()}.`;

  const driverPhrase =
    riskOn.length && riskOff.length
      ? `Impulsion risk-on de ${riskOn[0]}, compensée par ${riskOff[0]}.`
      : riskOn.length
        ? `Soutenu par ${riskOn.slice(0, 2).join(" et ")}.`
        : riskOff.length
          ? `Pénalisé par ${riskOff.slice(0, 2).join(" et ")}.`
          : "Les piliers cross-asset sont globalement équilibrés.";

  const macroPhrase = `Crédit HY à ${regime.macro.hyOas != null ? `${regime.macro.hyOas.toFixed(0)}bp` : "n/d"}, 2s10s ${regime.macro.curve2s10s != null ? `${regime.macro.curve2s10s >= 0 ? "+" : ""}${regime.macro.curve2s10s.toFixed(2)}%` : "n/d"}, liquidité nette ${regime.macro.netLiquidity != null ? `${regime.macro.netLiquidity.toFixed(2)} $T` : "n/d"}.`;

  const summary = `${headline} ${driverPhrase} ${macroPhrase}`;

  let brief: MacroBrief = {
    headline,
    summary,
    drivers: { riskOn, riskOff },
    changed,
    analog,
    ahead,
    source: "rule-based",
    generatedAt: now,
  };

  // Optional Gemini polish (dormant unless GEMINI_API_KEY is configured).
  const polished = await maybePolish(brief).catch(() => null);
  if (polished) brief = { ...brief, summary: polished, source: "gemini" };

  cache = { exp: Date.now() + 60 * 60_000, v: brief };
  return brief;
}

const SYSTEM_PROMPT =
  "Tu es un stratège macro buy-side qui rédige une note matinale concise EN FRANÇAIS pour un desk obligations + S&P 500. 3 à 4 phrases, concret, sans remplissage ni précautions inutiles, sans markdown. Utilise uniquement les faits fournis ; n'invente jamais de chiffres. Garde en anglais les termes universels : Risk-On, Risk-Off, les tickers (SPX, VIX, DXY…), bps, 2s10s.";

// Google AI Studio (Gemini) — https://aistudio.google.com. `gemini-flash-latest`
// tracks the current fast model; override via GEMINI_MODEL if desired.
async function maybePolish(brief: MacroBrief): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
  const facts = [
    brief.headline,
    `Facteurs Risk-on : ${brief.drivers.riskOn.join(", ") || "aucun"}`,
    `Facteurs Risk-off : ${brief.drivers.riskOff.join(", ") || "aucun"}`,
    brief.changed,
    brief.analog,
    `Événements à venir : ${brief.ahead.join("; ") || "aucun"}`,
  ].join("\n");

  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 12000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": key,
          "content-type": "application/json",
        },
        signal: c.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            { role: "user", parts: [{ text: `Faits :\n${facts}\n\nRédige la note en français.` }] },
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 400,
            // Gemini 2.5 flash "thinks" by default and thinking tokens eat the
            // output budget — disable it; the brief is a one-shot rewrite.
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();
    return text && text.length > 20 ? text : null;
  } finally {
    clearTimeout(t);
  }
}
