// Leaving right after Stop, while the recording is still being saved, mustn't lose it.
import { rmSync } from "node:fs";
import { wav, note } from "./wav.mjs";
import { open, nav, start, stop, sleep, check, OUT } from "./lib.mjs";
wav(OUT + "race.wav", [note(62, 3)]);
for (const [label, leaveHow] of [["Stop then Log at once", "log"], ["Stop then reload at once", "reload"]]) {
  const profile = OUT + "profile-race";
  rmSync(profile, { recursive: true, force: true });
  const s = await open(OUT + "race.wav", profile);
  await nav(s.page, "Practice");
  await s.page.locator('label:has-text("Record") input').check();
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  await sleep(15000);
  if (leaveHow === "log") {
    await s.page.evaluate(() => {
      [...document.querySelectorAll("button")].find((b) => b.textContent === "Stop").click();
      [...document.querySelectorAll("nav button")].find((b) => b.textContent === "Log").click();
    });
    await s.page.waitForSelector("h2:text-is('This week')");
    await sleep(1000);
    check(label + ": player appears", (await s.page.locator("audio").count()) === 1);
  } else {
    await stop(s.page);
    await s.page.waitForSelector('button:text-is("Start"):not([disabled])', { timeout: 5000 });
    await s.page.reload();
    await s.page.waitForSelector("nav button");
    await nav(s.page, "Log");
    await sleep(1000);
    check(label + " (after the button is usable again): player appears", (await s.page.locator("audio").count()) === 1);
  }
  await s.close();
}

{
  const s = await open(OUT + "race.wav");
  await nav(s.page, "Practice");
  await s.page.evaluate(() => { IDBObjectStore.prototype.put = () => { throw new Error("no room"); }; });
  await s.page.locator('label:has-text("Record") input').check();
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  await sleep(1500);
  await stop(s.page);
  await s.page.waitForSelector('button:text-is("Start"):not([disabled])', { timeout: 5000 });
  check("a recording that can't be saved says so, and Start works again", (await s.page.locator(".warning").first().innerText()).includes("couldn't be saved"), await s.page.locator(".warning").first().innerText());
  await nav(s.page, "Log");
  await s.page.waitForSelector("h2:text-is('This week')");
  check("the screen can still be left, with the session in the Log", (await s.page.locator("section > ul > li").count()) === 1 && (await s.page.locator("audio").count()) === 0);
  await s.close();
}
