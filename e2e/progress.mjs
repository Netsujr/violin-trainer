// Progress: a Library group's Progress button opens how each of its pieces is coming along: score and tempo over time,
// and the notes played out of tune.
import { wav, rest } from "./wav.mjs";
import { open, nav, sleep, check, seed, OUT, showGroup } from "./lib.mjs";

wav(OUT + "progress-silent.wav", [rest(2)]);
const s = await open(OUT + "progress-silent.wav");
const { page } = s;
const day = (n) => new Date(2026, 10, n, 10).toISOString();
const run = (pieceId, n, extra = {}) => ({ id: `${pieceId}-${n}`, startedAt: day(n), pieceId, pieceTitle: pieceId, minutes: 3, passes: 0, notesHit: 8, notesSkipped: 2, averageCents: 6, averagePassSeconds: null, slowest: [], ...extra });
const tuning = { "F#4": [16, 80], E4: [-11, 90], D4: [2, 200] };
await seed(page, {
  log: [
    run("hot-cross-buns", 1, { score: 60, notesHit: 6, notesSkipped: 4, bpm: 60, tuning }),
    run("hot-cross-buns", 3, { score: 90, notesHit: 9, notesSkipped: 1, bpm: 72, tuning }),
    run("hot-cross-buns", 4), // waited: minutes, but no score
    run("twinkle-twinkle", 2),
  ],
});
await nav(page, "Library"); await showGroup(page, "Classic tunes"); await sleep(200);
const chart = page.locator('.library .title-tools button:text-is("Progress")');
check("the group shown has a Progress button, with its word", (await chart.count()) === 1);
await chart.click(); await sleep(300);
check("it opens Progress, with Library still marked in the menu", (await page.locator(".progress h1").innerText()) === "Classic tunes: progress" && (await page.locator('nav button[aria-current="page"]').innerText()) === "Library");
const pieces = page.locator(".progress-piece");
check("practised pieces, the most recent first", (await pieces.locator("header strong").allInnerTexts()).join() === "Hot Cross Buns,Twinkle Twinkle Little Star", (await pieces.locator("header strong").allInnerTexts()).join());
const buns = pieces.first();
check("days, minutes and the last day", (await buns.locator("header .info-chip").allInnerTexts()).join(" · ") === "3 days · 9.0 min · Last: Nov 4", (await buns.locator("header .info-chip").allInnerTexts()).join(" · "));
check("a score chart and a tempo chart, a dot a scored day, ending on the latest", (await buns.locator("figcaption").allInnerTexts()).join() === "Score,Tempo (bpm)" && (await buns.locator(".progress-chart").first().locator(".chart-dot").count()) === 2 && (await buns.locator(".chart-value").allTextContents()).join() === "90%,72", (await buns.locator(".chart-value").allTextContents()).join());
check("each dot names its day and value", (await buns.locator(".chart-hit title").first().textContent()) === "Nov 1: 60%");
check("the out-of-tune notes, furthest first, with where they're played", (await buns.locator(".progress-about > .chip-row .info-chip").allInnerTexts()).join(" | ") === "F♯ (Fa♯) · D string, finger 2 · 16 cents sharp | E (Mi) · D string, finger 1 · 11 cents flat", (await buns.locator(".chip-row .info-chip").allInnerTexts()).join(" | "));
check("a piece with no Keep moving runs says how to get a score", (await pieces.nth(1).innerText()).includes("Play it with Keep moving"));
check("the group stays marked in the sidebar", (await page.locator('.nav-sub .sub-item[aria-pressed="true"] .sub-name').innerText()) === "Classic tunes");
check("the rest are named as not practised yet, a chip each", (await page.locator(".progress-not-yet .info-chip").first().innerText()) === "Mary Had a Little Lamb");
await page.setViewportSize({ width: 360, height: 740 }); await sleep(300);
check("the charts fit a phone", await page.evaluate(() => [...document.querySelectorAll(".progress-chart svg")].every((svg) => svg.getBoundingClientRect().right <= innerWidth)));
const back = page.locator(".progress-back");
check("its back button is named for the group", (await back.getAttribute("aria-label")) === "Back to Classic tunes");
await back.click(); await sleep(200);
check("and goes back to it", (await page.locator(".library h1").innerText()) === "Classic tunes");
check("no page errors", s.problems.length === 0, s.problems.join(" | "));
await s.close();
