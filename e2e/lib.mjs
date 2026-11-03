import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
export const URL = "http://localhost:5199/";
// Generated WAVs, screenshots and Chrome profiles. Vite's watcher skips this folder name.
export const OUT = new global.URL("test-results/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
export async function open(wavPath, userDataDir, contextOptions = {}) {
  const args = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wavPath}`, "--autoplay-policy=no-user-gesture-required"];
  const browser = userDataDir ? null : await chromium.launch({ channel: "chrome", headless: true, args });
  const context = userDataDir
    ? await chromium.launchPersistentContext(userDataDir, { channel: "chrome", headless: true, args, viewport: { width: 1100, height: 950 } })
    : await browser.newContext({ viewport: { width: 1100, height: 950 }, ...contextOptions });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text()); });
  await page.goto(URL);
  await page.waitForSelector("nav button");
  return { page, context, problems, close: async () => { await context.close(); await browser?.close(); } };
}
// Saves settings and pieces as if a person had set them earlier, then loads the app with them.
export async function seed(page, { settings, pieces, log } = {}) {
  await page.evaluate(({ settings, pieces, log }) => {
    if (settings) localStorage.setItem("settings", JSON.stringify(settings));
    if (pieces) localStorage.setItem("pieces", JSON.stringify(pieces));
    if (log) localStorage.setItem("log", JSON.stringify(log));
  }, { settings, pieces, log });
  await page.reload();
  await page.waitForSelector("nav button");
}
// Records when the progress line changes, once a frame, from inside the page.
export const trackNotes = (page) =>
  page.evaluate(() => {
    window.noteTimes = [];
    window.noteOrder = [];
    let last = document.querySelector("section > p").textContent;
    const tick = () => {
      const text = document.querySelector("section > p")?.textContent;
      if (text && text !== last) {
        window.noteTimes.push(performance.now());
        window.noteOrder.push(text);
        last = text;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
export const noteGaps = async (page) => {
  const times = await page.evaluate(() => window.noteTimes);
  return times.slice(1).map((time, index) => Math.round(time - times[index]));
};
export const near = (values, expected, tolerance = 60) => values.length > 0 && values.every((value, index) => Math.abs(value - (expected[index % expected.length])) <= tolerance);
export const progress = (page) => page.locator("section > p").first().innerText();
export const nav = (page, name) => page.click(`nav button:text-is("${name}")`);
export const start = (page) => page.click('button:text-is("Start")');
export const stop = (page) => page.click('button:text-is("Stop")');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  if (!ok) process.exitCode = 1;
}
