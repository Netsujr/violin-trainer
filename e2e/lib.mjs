import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
export const URL = "http://localhost:5199/";
// Generated WAVs, screenshots and Chrome profiles. Vite's watcher skips this folder name.
export const OUT = new global.URL("test-results/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
export async function open(wavPath, userDataDir) {
  const args = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wavPath}`, "--autoplay-policy=no-user-gesture-required"];
  const browser = userDataDir ? null : await chromium.launch({ channel: "chrome", headless: true, args });
  const context = userDataDir
    ? await chromium.launchPersistentContext(userDataDir, { channel: "chrome", headless: true, args, viewport: { width: 1100, height: 950 } })
    : await browser.newContext({ viewport: { width: 1100, height: 950 } });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text()); });
  await page.goto(URL);
  await page.waitForSelector("nav button");
  return { page, context, problems, close: async () => { await context.close(); await browser?.close(); } };
}
export const nav = (page, name) => page.click(`nav button:text-is("${name}")`);
export const start = (page) => page.click('button:text-is("Start")');
export const stop = (page) => page.click('button:text-is("Stop")');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  if (!ok) process.exitCode = 1;
}
