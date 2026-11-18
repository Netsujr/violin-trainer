// The pitch line: with "Don't wait" on the moving line, what's played is drawn through the staff, the ghost notehead at
// its tip. In tune, it crosses the middle of each notehead. It comes with Don't wait, with no switch of its own.
import { wav, rest } from "./wav.mjs";
import { open, nav, stop, sleep, check, followNotes, begin, freshPractice, savedSettings, waitForText, D_MAJOR, OUT } from "./lib.mjs";

wav(OUT + "pitchline-silent.wav", [rest(3)]);
const s = await open(OUT + "pitchline-silent.wav");
const { page } = s;
const button = (label) => page.locator(`button[aria-label="${label}"]`);
await nav(page, "Practice"); await sleep(250);

check("there's no pitch line button", (await button("Pitch line").count()) === 0);
await button("Don't wait").click(); await sleep(200);
check("Don't wait says it draws the line", (await button("Don't wait").getAttribute("title")).includes("middle of each note"));

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

// Only on the moving line: the bigger staff keeps it, the staff on its own doesn't.
const view = page.locator('.actions button[aria-label="Lanes and staff"], .actions button[aria-label^="Bigger staff"], .actions button[aria-label^="Staff only"]');
const lines = () => page.locator(".pitch-trace polyline").count();
await view.click(); await sleep(200);
check("the bigger staff is still the moving line, so the line stays", (await lines()) > 0);
await view.click(); await sleep(200);
check("the staff on its own is the whole sheet, so the line goes", (await lines()) === 0);
await view.click(); await sleep(200);
await button("Don't wait").click(); await sleep(200);
check("and waiting for each note draws none", (await lines()) === 0);
check("no page errors", s.problems.length === 0, s.problems.join(" | "));
await s.close();
