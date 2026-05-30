// Headless E2E check for the new macro panels.
// Boots against an already-running dev server (BASE env, default :3000),
// navigates each page, waits for panels to render DATA (not skeleton/empty),
// asserts key text, and screenshots. Exits non-zero on any failure.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = "/tmp/ct-e2e";
mkdirSync(OUT, { recursive: true });

const checks = [
  {
    page: "/",
    name: "dashboard",
    panels: [
      { title: "Macro Stress", mustInclude: ["VIX", "VIXCLS"] },
      { title: "Financial Stress", mustInclude: ["STLFSI4"] },
    ],
  },
  {
    page: "/bonds",
    name: "bonds",
    panels: [
      { title: "Yield Curve", mustInclude: ["2s10s"] },
      { title: "Central Bank Watch", mustInclude: ["Fed"] },
    ],
  },
  {
    page: "/sp500",
    name: "sp500",
    panels: [
      { title: "Sector Heatmap", mustInclude: ["XLK"] },
      { title: "Fear & Greed", mustInclude: [] },
    ],
  },
  {
    page: "/intermarket",
    name: "intermarket",
    panels: [
      { title: "CFTC Positioning", mustInclude: ["10-Year"] },
      { title: "Prediction Markets", mustInclude: [] },
    ],
  },
];

const FAIL_TEXT = ["unavailable", "feed pending", "feed unavailable"];

let failures = 0;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1800 } });
const page = await ctx.newPage();

for (const c of checks) {
  const url = `${BASE}${c.page}`;
  process.stdout.write(`\n▶ ${c.page}\n`);
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  } catch (e) {
    console.log(`  ✗ navigation failed: ${e.message}`);
    failures++;
    continue;
  }
  // Give tRPC queries time to resolve and skeletons to swap for data.
  await page.waitForTimeout(6000);

  for (const p of c.panels) {
    // Locate the panel by its header label text, then read its section.
    const section = page
      .locator("section", { has: page.getByText(p.title, { exact: false }) })
      .first();
    const exists = (await section.count()) > 0;
    if (!exists) {
      console.log(`  ✗ panel "${p.title}" not found`);
      failures++;
      continue;
    }
    const text = (await section.innerText()).replace(/\s+/g, " ").trim();
    const lower = text.toLowerCase();

    const hardFail = FAIL_TEXT.find((f) => lower.includes(f));
    // Case-insensitive: panels CSS-uppercase headers/labels (e.g. "2S10S").
    const missing = p.mustInclude.filter((m) => !lower.includes(m.toLowerCase()));

    if (hardFail) {
      console.log(`  ✗ "${p.title}" shows failure state ("${hardFail}")`);
      failures++;
    } else if (missing.length) {
      console.log(`  ✗ "${p.title}" missing expected text: ${missing.join(", ")}`);
      console.log(`      got: ${text.slice(0, 140)}…`);
      failures++;
    } else {
      console.log(`  ✓ "${p.title}" rendered with data`);
    }
  }

  const shot = `${OUT}/${c.name}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`  📸 ${shot}`);
}

await browser.close();
console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
