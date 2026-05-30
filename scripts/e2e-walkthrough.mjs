// Full end-to-end browser walkthrough of every route.
// Drives a real Chromium, waits for tRPC data, captures console/page errors,
// flags failure-state text, and screenshots each route. Exits non-zero on error.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = "/tmp/ct-walk";
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  { path: "/", name: "01-dashboard" },
  { path: "/bonds", name: "02-bonds" },
  { path: "/sp500", name: "03-sp500" },
  { path: "/intermarket", name: "04-intermarket" },
  { path: "/calendar", name: "05-calendar" },
  { path: "/journal", name: "06-journal" },
];

const FAIL_TEXT = ["unavailable", "feed pending", "application error", "client-side exception"];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 2200 } });
let totalErrors = 0;

for (const r of ROUTES) {
  const page = await ctx.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160));
  });
  page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 160)));

  process.stdout.write(`\n▶ ${r.path}\n`);
  try {
    await page.goto(`${BASE}${r.path}`, { waitUntil: "networkidle", timeout: 45000 });
  } catch (e) {
    console.log(`  ✗ navigation failed: ${e.message}`);
    totalErrors++;
    await page.close();
    continue;
  }
  await page.waitForTimeout(6500); // let tRPC queries resolve

  const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
  const lower = bodyText.toLowerCase();
  const panelCount = await page.locator("section").count();

  const fails = FAIL_TEXT.filter((f) => lower.includes(f));
  console.log(`  panels(section): ${panelCount}`);
  console.log(`  failure-text hits: ${fails.length ? fails.join(", ") : "none"}`);
  console.log(`  console errors: ${consoleErrors.length}`);
  console.log(`  page errors: ${pageErrors.length}`);
  if (consoleErrors.length) consoleErrors.slice(0, 5).forEach((e) => console.log(`     ⚠ ${e}`));
  if (pageErrors.length) pageErrors.slice(0, 5).forEach((e) => console.log(`     ✗ ${e}`));

  if (pageErrors.length) totalErrors += pageErrors.length;

  const shot = `${OUT}/${r.name}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`  📸 ${shot}`);
  await page.close();
}

await browser.close();
console.log(`\n${totalErrors === 0 ? "✅ NO PAGE ERRORS" : `❌ ${totalErrors} PAGE ERROR(S)`}`);
process.exit(totalErrors === 0 ? 0 : 1);
