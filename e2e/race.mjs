// Leaving right after Stop, while the recording is still being saved, mustn't lose it.
import { rmSync } from "node:fs";
import { wav, note } from "./wav.mjs";
import { open, nav, start, stop, sleep, check, setRecord, OUT } from "./lib.mjs";
wav(OUT + "race.wav", [note(62, 3)]);
for (const [label, leaveHow] of [["Stop then Calendar at once", "calendar"], ["Stop then reload at once", "reload"]]) {
  const profile = OUT + "profile-race";
  rmSync(profile, { recursive: true, force: true });
  const s = await open(OUT + "race.wav", profile);
  await nav(s.page, "Practice");
  await setRecord(s.page, true);
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  await sleep(15000);
  if (leaveHow === "calendar") {
    await s.page.evaluate(() => {
      [...document.querySelectorAll("button")].find((b) => b.textContent === "Stop").click();
      [...document.querySelectorAll("nav button")].find((b) => b.textContent === "Calendar").click();
    });
    await s.page.waitForSelector(".calendar-grid");
    await sleep(1000);
    check(label + ": player appears", (await s.page.locator(".recording-note").count()) === 1);
  } else {
    await stop(s.page);
    await s.page.waitForSelector('button:text-is("Start"):not([disabled])', { timeout: 5000 });
    await s.page.reload();
    await s.page.waitForSelector("nav button");
    await nav(s.page, "Calendar");
    await sleep(1000);
    check(label + " (after the button is usable again): player appears", (await s.page.locator(".recording-note").count()) === 1);
  }
  await s.close();
}

{
  const s = await open(OUT + "race.wav");
  await nav(s.page, "Practice");
  await s.page.evaluate(() => { IDBObjectStore.prototype.put = () => { throw new Error("no room"); }; });
  await setRecord(s.page, true);
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  await sleep(1500);
  await stop(s.page);
  await s.page.waitForSelector('button:text-is("Start"):not([disabled])', { timeout: 5000 });
  check("a recording that can't be saved says so, and Start works again", (await s.page.locator(".warning").first().innerText()).includes("couldn't be saved"), await s.page.locator(".warning").first().innerText());
  await nav(s.page, "Calendar");
  await s.page.waitForSelector(".calendar-grid");
  check("the screen can still be left, with the session in the Calendar", (await s.page.locator(".day-piece li").count()) === 1 && (await s.page.locator(".recording-note").count()) === 0);
  await s.close();
}
