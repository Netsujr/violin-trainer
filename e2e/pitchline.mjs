// The pitch line: with "Don't wait" on the moving line, what's played is drawn through the staff, the ghost notehead at
// its tip. In tune, it crosses the middle of each notehead. The switch only shows where it applies.
import { wav, rest } from "./wav.mjs";
import { open, nav, stop, sleep, check, followNotes, begin, freshPractice, savedSettings, waitForText, D_MAJOR, OUT } from "./lib.mjs";

wav(OUT + "pitchline-silent.wav", [rest(3)]);
const s = await open(OUT + "pitchline-silent.wav");
const { page } = s;
const button = (label) => page.locator(`button[aria-label="${label}"]`);
const line = button("Pitch line");
await nav(page, "Practice"); await sleep(250);

check("hidden while the lanes wait for each note", await line.isHidden());
await button("Don't wait").click(); await sleep(200);
check("shown with Don't wait on the moving line, off to start", (await line.isVisible()) && (await line.getAttribute("aria-pressed")) === "false" && (await line.getAttribute("title")).includes("middle of each note"));

// Off, Don't wait draws no line.
await freshPractice(page, 60);
await followNotes(page, { midis: D_MAJOR });
await begin(page); await sleep(2500);
check("off, there's no line", (await page.locator(".pitch-trace polyline").count()) === 0);
await stop(page); await sleep(200);

await line.click(); await sleep(100);
check("on, and saved", (await line.getAttribute("aria-pressed")) === "true" && (await savedSettings(page)).pitchLineOn === true);
await freshPractice(page, 120);
await followNotes(page, { midis: D_MAJOR });
await begin(page); await sleep(2500);
check("while playing, the ghost notehead is the line's tip", await page.evaluate(() => {
  const tip = [...document.querySelector(".pitch-trace polyline:last-child").points].at(-1);
  const ghost = document.querySelector(".played-note ellipse");
  return ghost?.isConnected && Math.abs(ghost.cx.baseVal.value - tip.x) < 0.5 && Math.abs(ghost.cy.baseVal.value - tip.y) < 0.5;
}));
await waitForText(page, "All"); await sleep(200);
const traced = await page.evaluate(() => {
  const points = [...document.querySelectorAll(".pitch-trace polyline")].flatMap((polyline) => [...polyline.points].map(({ x, y }) => ({ x, y })));
  const heads = [...document.querySelectorAll(".staff .vf-stavenote .vf-notehead")].map((head) => head.getBBox()).map(({ x, y, width, height }) => ({ x: x + width / 2, y: y + height / 2 }));
  // Points well inside notes 2 to 4, after the change of note and before the next: each note's pitch, held.
  const offsets = [1, 2, 3].flatMap((index) => {
    const from = heads[index].x, to = heads[index + 1].x;
    return points.filter(({ x }) => x > from + 0.4 * (to - from) && x < from + 0.9 * (to - from)).map(({ y }) => Math.abs(y - heads[index].y));
  });
  return { points: points.length, offsets };
});
check("on, the line is drawn as it's played", traced.points > 100, `${traced.points} points`);
check("in tune, it crosses the middle of each notehead", traced.offsets.length > 10 && Math.max(...traced.offsets) < 1.5, `${traced.offsets.length} points, furthest ${Math.max(...traced.offsets).toFixed(2)} px`);
check("it stays once the run is over, until the next", (await page.locator(".pitch-trace polyline").count()) > 0);

// Only on the moving line: the bigger staff keeps it, the staff on its own and the open sheet don't.
const view = page.locator('.actions button[aria-label="Lanes and staff"], .actions button[aria-label^="Bigger staff"], .actions button[aria-label^="Staff only"]');
await view.click(); await sleep(200);
check("the bigger staff is still the moving line", await line.isVisible());
await view.click(); await sleep(200);
check("the staff on its own is the whole sheet, so it's hidden, and the line goes", (await line.isHidden()) && (await page.locator(".pitch-trace polyline").count()) === 0);
await view.click(); await sleep(200);
check("back on the lanes, it's back", await line.isVisible());
await page.locator(".staff-toggle").click(); await sleep(200);
check("opening the full sheet hides it", await line.isHidden());
await page.locator(".staff-toggle").click(); await sleep(200);
await button("Don't wait").click(); await sleep(200);
check("and so does waiting for each note", await line.isHidden());
check("no page errors", s.problems.length === 0, s.problems.join(" | "));
await s.close();
