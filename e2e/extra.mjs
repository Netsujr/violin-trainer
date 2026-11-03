import { wav, note, rest } from "./wav.mjs";
import { open, nav, start, stop, sleep, check, OUT } from "./lib.mjs";
const progress = (page) => page.locator("section > p").first().innerText();

wav(OUT + "d4.wav", [note(62, 5)]);
// Reference mute: mic hears the target the whole time
{
  const s = await open(OUT + "d4.wav");
  await nav(s.page, "Practice");
  await s.page.evaluate(() => {
    const original = HTMLButtonElement.prototype.click;
  });
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  await s.page.click('button:text-is("Skip")');
  await s.page.click('button:text-is("Play reference")');
  await sleep(700);
  const during = await progress(s.page);
  check("reference tone is ignored by the judge", during.startsWith("Note 2 of"), during);
  await s.close();
}
wav(OUT + "e4.wav", [note(64, 5)]);
{
  const s = await open(OUT + "e4.wav");
  await nav(s.page, "Practice");
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  await s.page.click('button:text-is("Skip")');
  await s.page.click('button:text-is("Play reference")');
  await sleep(600);
  const during = await progress(s.page);
  check("target heard during the reference does not count", during.startsWith("Note 2 of"), during);
  await sleep(1200);
  const after = await progress(s.page);
  check("target counts once the reference ends", after.startsWith("Note 3 of"), after);
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
