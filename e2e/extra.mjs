import { wav, note, rest } from "./wav.mjs";
import { open, nav, start, stop, sleep, check, OUT } from "./lib.mjs";
const progress = (page) => page.locator("section > p").first().innerText();

// The mic hears the target the whole time, which mustn't count while the reference sounds.
wav(OUT + "e4.wav", [note(64, 5)]);
{
  const s = await open(OUT + "e4.wav");
  await nav(s.page, "Practice");
  const box = await s.page.locator("canvas").boundingBox();
  await s.page.mouse.click(box.x + 130 + 120 + 40, box.y + 2.5 * 84);
  await sleep(600);
  await s.page.click('button:text-is("Play reference")');
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  await sleep(1500);
  const during = await progress(s.page);
  check("the target doesn't count while the reference sounds", during.startsWith("Note 2 of"), during);
  await s.page.click('button:text-is("Stop reference")');
  await sleep(800);
  const after = await progress(s.page);
  check("it counts once the reference stops", after.startsWith("Note 3 of"), after);
  await s.close();
}
// Hold ring and low-finger colour
wav(OUT + "c4.wav", [note(60, 6)]);
{
  const s = await open(OUT + "c4.wav");
  await s.page.evaluate(() => localStorage.setItem("settings", JSON.stringify({ holdMs: 500 })));
  await s.page.reload();
  await s.page.waitForSelector("nav button");
  await nav(s.page, "Practice");
  await s.page.locator("select").selectOption("c-major-1oct");
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  await sleep(320);
  await s.page.screenshot({ path: OUT + "practice-ring.png" });
  await s.close();
}
// Recording from Listen
wav(OUT + "a4.wav", [note(69, 3)]);
{
  const s = await open(OUT + "a4.wav");
  await s.page.locator('label:has-text("Record") input').check();
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  await sleep(1500);
  await nav(s.page, "Log");
  await s.page.waitForSelector("audio");
  check("Listen can record too", (await s.page.locator("audio").count()) === 1);
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}
