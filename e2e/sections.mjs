// The Options panel, the section bars, the staff's labels and its two modes, and the needle's zones.
import { readFileSync, writeFileSync } from "node:fs";
import { wav, note, rest } from "./wav.mjs";
import { open, nav, start, sleep, check, seed, progress, OUT, pickPiece } from "./lib.mjs";

wav(OUT + "s-silent.wav", [rest(3)]);
const detuned = (cents) => 440 * 2 ** (cents / 1200);
wav(OUT + "s-green.wav", [{ hz: detuned(8), seconds: 4, wave: "sine" }]);
wav(OUT + "s-yellow.wav", [{ hz: detuned(30), seconds: 4, wave: "sine" }]);
wav(OUT + "s-out.wav", [{ hz: detuned(46), seconds: 4, wave: "sine" }]);

const titles = (page, section) => page.locator(`${section} .section-bar .box-toggle:not([hidden])`).evaluateAll((buttons) => buttons.map((button) => button.title));
const picture = (page) => page.locator("canvas").evaluate((canvas) => canvas.toDataURL());

{
  const s = await open(OUT + "s-silent.wav");
  const page = s.page;
  await nav(page, "Practice");
  await sleep(250);

  // Options
  const options = page.locator(".options");
  check("options: no drawer, boxed right above the lanes", (await options.evaluate((panel) => panel.tagName)) === "DIV" && (await page.locator(".options + .timeline-section").count()) === 1);
  const text = (await options.innerText()) + " " + (await options.locator("[aria-label]").evaluateAll((elements) => elements.map((element) => element.ariaLabel).join(" ")));
  check("options: holds Tempo, Metronome, the count-in and BPM", ["Tempo", "Metronome", "count-in", "BPM"].every((word) => text.includes(word)) && !text.includes("Record"), text.replaceAll("\n", " ").slice(0, 80));
  check("options: the display switches moved out", !["Fingers", "Note names", "Grid"].some((word) => text.includes(word)));
  const rowOf = (selector) => page.locator(selector).evaluate((element) => Math.round(element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2));
  const record = await page.locator('.actions button[aria-label="Record"]').boundingBox(), startButton = await page.locator('button:text-is("Start")').boundingBox();
  check("record sits just left of Start", record.x + record.width <= startButton.x && Math.abs((await rowOf('.actions button[aria-label="Record"]')) - (await rowOf('button:text-is("Start")'))) < 4);
  check("options: the BPM slider is wide", (await page.locator(".bpm input").boundingBox()).width > 400);
  check("run buttons are outside the panel", (await page.locator('.options button:text-is("Start")').count()) === 0);
  const label = page.locator('.options label:has-text("Tempo")');
  const color = () => label.evaluate((element) => getComputedStyle(element).color);
  const off = await color();
  check("options: an off switch is grey", off === "rgb(163, 154, 139)", off);
  await label.locator("input").check();
  check("options: an on switch lights up", (await color()) !== off, await color());
  await label.locator("input").uncheck();
  check("options: off stays clickable", await label.locator("input").isEnabled());

  // Bars
  check("bars: timeline order", (await titles(page, ".timeline-section")).join() === "Fingers,Note names (Do Ré Mi),Letter names (A G D)", (await titles(page, ".timeline-section")).join());
  check("bars: the piece picker on the left, and no grid switch, the grid always drawn", (await page.locator(".section-bar > *").first().getAttribute("class")) === "piece-select" && (await page.locator('.box-toggle[title="Grid"]').count()) === 0);
  check("bars: only the lanes have a header", (await page.locator(".section-bar").count()) === 1 && (await page.locator(".staff-section label").count()) === 0);
  const toggleText = await page.locator(".section-bar .box-toggle:not([hidden])").evaluateAll((buttons) => buttons.map((button) => button.textContent).join(""));
  check("bars: icons in boxes instead of names", toggleText === "DoA" && (await page.locator(".section-bar input[type=checkbox]").count()) === 0, toggleText);
  const below = (selector) => page.evaluate((selector) => { const section = document.querySelector(selector); return section.querySelector(".section-bar").getBoundingClientRect().bottom <= section.querySelector("canvas, .staff").getBoundingClientRect().top + 0.5; }, selector);
  check("bars: nothing sits on the lanes", await below(".timeline-section"));
  const arrow = await page.evaluate(() => { const panel = document.querySelector(".staff-panel").getBoundingClientRect(), button = document.querySelector(".staff-toggle").getBoundingClientRect(); return { left: Math.round(button.left - panel.left), bottom: Math.round(panel.bottom - button.bottom) }; });
  check("staff: the arrow sits at its bottom left", arrow.left >= 0 && arrow.left < 16 && arrow.bottom >= 0 && arrow.bottom < 16, JSON.stringify(arrow));
  for (const key of ["Fingers", "Note names (Do Ré Mi)", "Letter names (A G D)"]) {
    const toggle = page.locator(`.timeline-section .box-toggle[title="${key}"]`);
    const before = await picture(page);
    await toggle.click();
    await sleep(60);
    check(`bars: ${key} changes the timeline, and lights off`, (await picture(page)) !== before && (await toggle.getAttribute("aria-pressed")) === "false");
    await toggle.click();
    await sleep(60);
    check(`bars: ${key} comes back`, (await picture(page)) === before);
  }

  // Staff labels
  const labels = () => page.locator(".staff > svg > text").evaluateAll((texts) => texts.map((text) => text.textContent).join(" "));
  check("staff: fingers and names show by default", (await labels()).startsWith("0 Ré 1 Mi 2 Fa♯ 3 Sol"), await labels());
  // Each starts on, so every press here turns it off or back on.
  const lane = (name) => ({ uncheck: () => page.locator(`.timeline-section .box-toggle[title="${name}"]`).click(), check: () => page.locator(`.timeline-section .box-toggle[title="${name}"]`).click() });
  await lane("Note names (Do Ré Mi)").uncheck();
  check("staff: the lanes' names switch hides its names too", (await labels()) === "0 1 2 3 0 1 2 3 2 1 0 3 2 1 0", await labels());
  await lane("Fingers").uncheck();
  check("staff: the lanes' fingers switch hides its fingers too", (await labels()) === "");
  await lane("Fingers").check();
  await lane("Note names (Do Ré Mi)").check();
  check("staff: both come back", (await labels()).startsWith("0 Ré 1 Mi"), await labels());
  const sheet = () => page.locator(".staff svg").evaluate((svg) => svg.outerHTML);
  const before = await sheet();
  await lane("Letter names (A G D)").uncheck();
  check("staff: letter names are only for the lanes", (await sheet()) === before);
  await lane("Letter names (A G D)").check();
  await pickPiece(page, "c-major-1oct");
  await sleep(150);
  const low = await page.locator(".staff > svg > text").evaluateAll((texts) => texts.filter((text) => text.getAttribute("fill") === "#b03020").map((text) => text.textContent).join());
  check("staff: low fingers are red, with a plain number", low.length > 0 && !low.includes("L"), low);
  const inside = await page.locator(".staff").evaluate((staff) => { const box = staff.getBoundingClientRect(); return [...staff.querySelectorAll("svg > text")].every((text) => { const rect = text.getBoundingClientRect(); return rect.top >= box.top && rect.bottom <= box.bottom; }); });
  check("staff: labels stay inside the sheet", inside);

  // Staff modes, with the current note on the playhead
  await pickPiece(page, "d-major-1oct");
  await sleep(150);
  const headOffset = () => page.evaluate(() => {
    const panel = document.querySelector(".staff-panel").getBoundingClientRect();
    const glyphs = [...document.querySelectorAll(".staff .vf-stavenote.current .vf-notehead text")];
    return Math.round(Math.max(...glyphs.map((glyph) => glyph.getBoundingClientRect().left)) - panel.left);
  });
  check("staff: closed by default, one line", (await page.locator(".staff.collapsed").count()) === 1 && (await page.locator(".staff .vf-stave").count()) === 1);
  check("staff: the first note starts on the playhead", (await headOffset()) === 130, String(await headOffset()));
  const clef = await page.evaluate(() => { const panel = document.querySelector(".staff").getBoundingClientRect(), clef = document.querySelector(".staff .vf-clef").getBoundingClientRect(); return { left: Math.round(clef.left - panel.left), scrolled: document.querySelector(".staff").scrollLeft }; });
  check("staff: the clef isn't cut off at the start", clef.left >= 8 && clef.scrolled === 0, JSON.stringify(clef));
  const box = await page.locator("canvas").boundingBox();
  await page.mouse.click(box.x + 130 + 6 * 120, box.y + 126);
  await sleep(900);
  check("staff: follows the timeline to a clicked sharp note", (await progress(page)) === "Note 7 of 15" && (await headOffset()) === 130, `${await progress(page)} ${await headOffset()}`);
  check("staff: marks the same note", (await page.locator(".staff .vf-stavenote").evaluateAll((notes) => notes.findIndex((n) => n.classList.contains("current")))) === 6);
  await page.mouse.move(box.x + 500, box.y + 60);
  await page.mouse.wheel(240, 0);
  await sleep(350);
  const moved = await page.evaluate(() => document.querySelector(".staff").scrollLeft);
  check("staff: moves when the timeline is scrolled by hand", moved > 400, String(moved));
  await page.click(".staff-toggle");
  await sleep(200);
  check("staff: the arrow opens the full sheet", (await page.locator(".staff.collapsed").count()) === 0 && (await page.locator(".staff-toggle").getAttribute("aria-expanded")) === "true");
  check("staff: the full sheet doesn't scroll", await page.locator(".staff").evaluate((staff) => staff.scrollLeft === 0 && staff.scrollWidth <= staff.clientWidth + 1));
  await pickPiece(page, "g-major-2oct");
  await sleep(150);
  check("staff: a long piece wraps", (await page.locator(".staff .vf-stave").count()) >= 2);
  await page.reload();
  await page.waitForSelector("nav button");
  await nav(page, "Practice");
  await sleep(200);
  check("staff: stays open after a reload", (await page.locator(".staff.collapsed").count()) === 0);
  await page.click(".staff-toggle");
  await sleep(200);
  check("staff: closes again", (await page.locator(".staff.collapsed").count()) === 1);
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}
{
  // A staff switched off before the Staff switch was removed still shows
  const s = await open(OUT + "s-silent.wav");
  await seed(s.page, { settings: { toggles: { staff: false } } });
  check("Listen always shows the staff", await s.page.locator(".staff").isVisible());
  await nav(s.page, "Practice");
  await sleep(200);
  check("Practice always shows the staff", await s.page.locator(".staff").isVisible());
  await s.close();
}

// The Settings panel
{
  const s = await open(OUT + "s-silent.wav");
  const panel = s.page.locator("header details");
  const isOpen = () => panel.evaluate((details) => details.open);
  await nav(s.page, "Practice");
  await s.page.click("header summary");
  check("settings: opens", await isOpen());
  await s.page.locator('label.setting:has-text("Tolerance") input').fill("30");
  check("settings: using a control keeps it open", await isOpen());
  const saved = await s.page.evaluate(() => JSON.parse(localStorage.getItem("settings")).toleranceCents);
  check("settings: saved as you slide", saved === 30, String(saved));
  await s.page.mouse.click(300, 600);
  check("settings: clicking elsewhere closes it", !(await isOpen()));
  await s.page.click("header summary");
  await s.page.keyboard.press("Escape");
  check("settings: Esc closes it", !(await isOpen()));
  await s.page.click("header summary");
  await s.page.click("header summary");
  check("settings: its own header still toggles it", !(await isOpen()));
  await s.page.click("header summary");
  await s.page.click('.language button:text-is("PT")');
  await sleep(200);
  check("settings: closed when the language changes", !(await isOpen()));
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// The volume gate, with a note quiet enough to sit between two settings
{
  const samples = 48000 * 3, data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / 48000) * 0.02 * 32767), i * 2);
  const header = readFileSync(OUT + "s-silent.wav").subarray(0, 44);
  header.writeUInt32LE(36 + data.length, 4);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(OUT + "s-quiet.wav", Buffer.concat([header, data]));
  for (const [minRms, expected] of [[0.01, "Lá4 / A4"], [0.05, "Listening…"]]) {
    const s = await open(OUT + "s-quiet.wav");
    await seed(s.page, { settings: { minRms } });
    await start(s.page);
    await s.page.waitForSelector('button:text-is("Stop")');
    await sleep(1200);
    const big = await s.page.locator(".big-note").innerText();
    check(`gate ${minRms}: a quiet note reads ${expected}`, big === expected, big);
    await s.close();
  }
}

// The needle
for (const [file, cents, zone] of [["s-green.wav", 8, "green"], ["s-yellow.wav", 30, "yellow"], ["s-out.wav", 46, "out"]]) {
  const s = await open(OUT + file);
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  await sleep(1200);
  const seen = await s.page.locator(".needle").evaluate((needle) => ({ zone: needle.dataset.zone, left: parseFloat(needle.querySelector("i").style.left) }));
  check(`needle: ${cents} cents reads ${zone}`, seen.zone === zone && Math.abs(seen.left - (50 + cents)) < 3, JSON.stringify(seen));
  await s.close();
}
{
  const s = await open(OUT + "s-yellow.wav");
  await s.page.click("summary");
  await s.page.locator('label.setting:has-text("Tolerance") input').fill("50");
  await s.page.click("summary");
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  await sleep(1200);
  const seen = await s.page.evaluate(() => ({ zone: document.querySelector(".needle").dataset.zone, tolerance: document.documentElement.style.getPropertyValue("--tolerance") }));
  check("needle: Tolerance moves the zones", seen.zone === "yellow" && seen.tolerance === "50%", JSON.stringify(seen));
  await s.close();
}
