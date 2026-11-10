import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
const URL = "http://localhost:5199/";
export const D_MAJOR = [62, 64, 66, 67, 69, 71, 73, 74, 73, 71, 69, 67, 66, 64, 62];
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
    // On the prototype, because WebKit can ignore this set directly on navigator.mediaDevices.
    MediaDevices.prototype.getUserMedia = async () => {
      await context.resume(); // Safari starts it suspended.
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
          if (current !== note || midis[note - 1] === undefined) return;
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
// The run's score, on the bar above the lanes.
export const laneScore = (page) => page.locator(".lane-score").innerText();
// Menu items only show on hover, so this clicks the piece's item directly, as a tap would.
export const pickPiece = (page, id) => page.locator(`.piece-menu button[value="${id}"]`).evaluate((item) => item.click());
// The piece Practice has open, by the menu button's label.
export const pickedPiece = (page) => page.locator(".piece-select").innerText();
// Library shows a few pieces per group, with the rest in drawers. Tests that need every card open them all.
export const openDrawers = (page) => page.locator(".more-pieces:not([open]) > summary").evaluateAll((summaries) => summaries.forEach((summary) => summary.click()));
export const nav = (page, name) => page.click(`nav button:text-is("${name}")`);
export const start = (page) => page.click('button:text-is("Start")');
// Stops a run if one is going. A finished run has already stopped by itself, and one can finish just as this clicks.
export const stop = (page) => page.locator('button:text-is("Stop")').click({ timeout: 1000 }).catch(() => {});
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  if (!ok) process.exitCode = 1;
}
// The "Or type the notes" form, which starts closed. The staff above it has a Save button of its own.
export const typeNotes = async (page, notes) => {
  if (!(await page.locator(".type-notes").evaluate((form) => form.open))) await page.locator(".type-notes summary").click();
  await page.fill(".type-notes textarea", notes);
};
export const saveTyped = (page) => page.locator('.type-notes button:text-is("Save piece")');
// Answers the question that's up, by the name of its button.
export const answer = async (page, label) => {
  await page.locator("dialog[open]").getByRole("button", { name: label, exact: true }).click();
  await sleep(100);
};
export const begin = async (page) => {
  await start(page);
  await page.waitForSelector('button:text-is("Stop")');
};
export const waitForText = (page, text, timeout = 30000) =>
  page.waitForFunction((text) => document.querySelector("section > p").textContent.includes(text), text, { timeout }).catch(async (error) => {
    // A timeout alone doesn't say how far the run got.
    error.message += ` | waiting for "${text}", showing "${await progress(page).catch(() => "nothing")}"`;
    throw error;
  });
// Practice from a fresh page load, which also ends the last run's synthetic player.
export const freshPractice = async (page, bpm) => {
  await page.reload();
  await page.waitForSelector("nav button");
  await nav(page, "Practice");
  await sleep(250);
  if (bpm) await page.locator(".bpm input").fill(String(bpm));
};
export const savedLog = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("log") ?? "[]"));
export const savedSettings = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("settings")));
export const canvasHasColor = (page, r, g, b) =>
  page.locator("canvas").evaluate((canvas, [r, g, b]) => {
    const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < data.length; i += 4) if (Math.abs(data[i] - r) < 4 && Math.abs(data[i + 1] - g) < 4 && Math.abs(data[i + 2] - b) < 4) return true;
    return false;
  }, [r, g, b]);

// What a person would notice on the current view: sideways scroll, things off the edge, cut-off labels, covered or tiny controls.
// scope limits the covered and tap checks, because an open dropdown is meant to cover what's under it.
const MIN_TOUCH_TARGET = 24; // WCAG 2.5.8
export const audit = (page, scope = "#app") =>
  page.evaluate(async ({ scope, minTarget }) => {
    const seen = (element) => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    const name = (element) => `${element.tagName.toLowerCase()}${element.className && typeof element.className === "string" ? "." + element.className.split(" ")[0] : ""}"${(element.textContent || element.title || "").trim().slice(0, 18)}"`;
    const scrolls = (element) => { for (let e = element.parentElement; e; e = e.parentElement) if (/auto|scroll|hidden/.test(getComputedStyle(e).overflowX)) return true; return false; };
    const result = { sideways: document.documentElement.scrollWidth - innerWidth, offEdge: [], cut: [], covered: [], small: [] };
    for (const element of document.querySelectorAll("#app *")) {
      if (!seen(element) || element.closest("svg") || scrolls(element)) continue;
      const box = element.getBoundingClientRect();
      if (box.width && box.height && (box.right > innerWidth + 1 || box.left < -1)) result.offEdge.push(name(element));
    }
    const controls = [...document.querySelector(scope).querySelectorAll("button, select, summary, a[download], textarea, input:not([type=checkbox]), label:has(> input[type=checkbox])")].filter(seen);
    for (const control of controls) {
      if (control.matches("button, summary") && control.scrollWidth > control.clientWidth + 1) result.cut.push(name(control));
      control.scrollIntoView({ block: "center", behavior: "instant" });
      const box = control.getBoundingClientRect();
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      if (!top || !(control === top || control.contains(top) || top.contains(control))) result.covered.push(`${name(control)} by ${top ? name(top) : "nothing"}`);
      if (Math.min(box.width, box.height) < minTarget && matchMedia("(pointer: coarse)").matches) result.small.push(`${name(control)} ${Math.round(box.width)}x${Math.round(box.height)}`);
    }
    scrollTo({ top: 0, behavior: "instant" });
    return result;
  }, { scope, minTarget: MIN_TOUCH_TARGET });
export const auditCheck = async (page, label, scope) => {
  const r = await audit(page, scope);
  const broken = r.sideways > 0 || r.offEdge.length || r.cut.length || r.covered.length;
  check(`${label}: fits, nothing cut off or covered`, !broken, broken ? JSON.stringify({ sideways: r.sideways, offEdge: r.offEdge.slice(0, 5), cut: r.cut.slice(0, 5), covered: r.covered.slice(0, 5) }) : "");
  if (r.small.length) check(`${label}: controls are big enough to tap (${MIN_TOUCH_TARGET}px)`, false, r.small.slice(0, 6).join(", "));
};
