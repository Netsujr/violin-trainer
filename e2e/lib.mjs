import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
export const URL = "http://localhost:5199/";
// Generated WAVs, screenshots and Chrome profiles. Vite's watcher skips this folder name.
export const OUT = new global.URL("test-results/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
// The count-in is on by default. Most checks are about what comes after it, so they start without one.
export const skipCountIn = (context) =>
  context.addInitScript(() => {
    try {
      const settings = JSON.parse(localStorage.getItem("settings") ?? "{}");
      if (settings.countInOn === undefined) localStorage.setItem("settings", JSON.stringify({ ...settings, countInOn: false }));
    } catch {}
  });
export async function open(wavPath, userDataDir, { keepCountIn = false, ...contextOptions } = {}) {
  const args = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wavPath}`, "--autoplay-policy=no-user-gesture-required"];
  const browser = userDataDir ? null : await chromium.launch({ channel: "chrome", headless: true, args });
  const context = userDataDir
    ? await chromium.launchPersistentContext(userDataDir, { channel: "chrome", headless: true, args, viewport: { width: 1100, height: 950 } })
    : await browser.newContext({ viewport: { width: 1100, height: 950 }, ...contextOptions });
  if (!keepCountIn) await skipCountIn(context);
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
// A synthetic violinist standing in for the microphone. It watches the current note and plays it, as a
// person would, so a timing check doesn't depend on when the mic starts relative to a fixed audio file.
// delayMs is how long it takes to come in on each new note, and delays overrides that for a note number.
export const followNotes = (page, { midis, delayMs = 0, delays = {} }) =>
  page.evaluate(({ midis, delayMs, delays }) => {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sawtooth";
    gain.gain.value = 0;
    oscillator.connect(gain);
    oscillator.start();
    // A fresh stream each time, because stopping a session ends the one it was using.
    navigator.mediaDevices.getUserMedia = async () => {
      const output = context.createMediaStreamDestination();
      gain.connect(output);
      return output.stream;
    };
    let current = 0;
    const tick = () => {
      const note = Number(document.querySelector("section > p")?.textContent.match(/^Note (\d+) of/)?.[1] ?? 0);
      if (note !== current) {
        current = note;
        const wait = delays[note] ?? delayMs;
        const play = () => {
          if (current !== note) return;
          oscillator.frequency.value = 440 * 2 ** ((midis[note - 1] - 69) / 12);
          gain.gain.value = 0.3;
        };
        if (note === 0) gain.gain.value = 0;
        else if (wait > 0) {
          gain.gain.value = 0;
          setTimeout(play, wait);
        } else play();
      }
      requestAnimationFrame(tick);
    };
    tick();
  }, { midis, delayMs, delays });
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
