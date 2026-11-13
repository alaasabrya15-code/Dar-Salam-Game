import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGE " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("CON " + m.text().slice(0, 500));
});
await page.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.__tukReady && window.__streetReady && (window.__controlsTest?.getGait?.() ?? []).length > 0, null, { timeout: 45000 });
await page.waitForTimeout(1200);
const a = await page.evaluate(() => window.__controlsTest?.getGait?.());
await page.waitForTimeout(400);
const b = await page.evaluate(() => window.__controlsTest?.getGait?.());
await page.screenshot({ path: "/workspace/screenshots/traffic-gait.png" });
console.log(JSON.stringify({ a, b, errors: errors.slice(0, 12) }, null, 2));
await browser.close();
