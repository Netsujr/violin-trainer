// Practice's settings panel, the staff's labels and its two modes, Settings, and the dial's zones.
import { readFileSync, writeFileSync } from "node:fs";
import { wav, note, rest } from "./wav.mjs";
import { open, nav, start, sleep, check, seed, progress, OUT, pickPiece, heard, openSettings, openTuning, setLanguage, clickLanes } from "./lib.mjs";

wav(OUT + "s-silent.wav", [rest(3)]);
const detuned = (cents) => 440 * 2 ** (cents / 1200);
wav(OUT + "s-green.wav", [{ hz: detuned(8), seconds: 4, wave: "sine" }]);
wav(OUT + "s-yellow.wav", [{ hz: detuned(30), seconds: 4, wave: "sine" }]);
wav(OUT + "s-out.wav", [{ hz: detuned(46), seconds: 4, wave: "sine" }]);

const picture = (page) => page.locator("canvas").evaluate((canvas) => canvas.toDataURL());

{
  const s = await open(OUT + "s-silent.wav");
  const page = s.page;
  await nav(page, "Practice");
  await sleep(250);

  // The run's choices, in the settings panel docked under the panels, each in words
  const dock = page.locator(".dock");
  const text = await dock.innerText();
  check("the settings panel holds the run's choices, with record and the metronome in the sidebar", ["On the notes", "On screen", "Pace", "Repeat", "Top note", "Pattern", "Count-in", "Glide"].every((word) => text.includes(word)) && !["Record", "Metronome"].some((word) => text.includes(word)), text.replaceAll("\n", " ").slice(0, 160));
  const record = await page.locator('header button[aria-label="Record"]').boundingBox(), metronome = await page.locator("header .metronome-button").boundingBox();
  check("the sidebar has record just above the metronome", record.y + record.height <= metronome.y + 1 && Math.abs(record.x - metronome.x) < 2);
  check("named with its BPM", /^Metronome \d+$/.test(await page.locator("header .metronome-button").innerText()));
  check("Start is in the title row, the lanes have no bar of their own", (await page.locator('.title-row button:text-is("Start")').count()) === 1 && (await page.locator(".section-bar").count()) === 0);
  const glide = dock.locator('button:text-is("Glide")');
  check("options: Glide starts off", (await glide.getAttribute("aria-pressed")) === "false");
  await glide.click();
  check("options: and switches on, saved", (await glide.getAttribute("aria-pressed")) === "true" && (await page.evaluate(() => JSON.parse(localStorage.getItem("settings")).tempoOn)) === true);
  await glide.click();

  // The panels
  const arrow = await page.evaluate(() => { const panel = document.querySelector(".staff-panel").getBoundingClientRect(), button = document.querySelector(".staff-toggle").getBoundingClientRect(); return { left: Math.round(button.left - panel.left), bottom: Math.round(panel.bottom - button.bottom) }; });
  check("staff: the arrow sits at its bottom left", arrow.left >= 0 && arrow.left < 16 && arrow.bottom >= 0 && arrow.bottom < 16, JSON.stringify(arrow));
  const label = (name) => dock.locator(`[aria-label="On the notes"] button:text-is("${name}")`);
  for (const key of ["Fingers", "Do Ré Mi", "A B C"]) {
    const before = await picture(page);
    await label(key).click();
    await sleep(60);
    check(`labels: ${key} changes the lanes, and switches off`, (await picture(page)) !== before && (await label(key).getAttribute("aria-pressed")) === "false");
    await label(key).click();
    await sleep(60);
    check(`labels: ${key} comes back`, (await picture(page)) === before);
  }

  // Staff labels
  const labels = () => page.locator(".staff > svg > text").evaluateAll((texts) => texts.map((text) => text.textContent).join(" "));
  check("staff: fingers and names show by default", (await labels()).startsWith("0 Ré 1 Mi 2 Fa♯ 3 Sol"), await labels());
  // Each starts on, so every press here turns it off or back on.
  const lane = (name) => ({ uncheck: () => label(name).click(), check: () => label(name).click() });
  await lane("Do Ré Mi").uncheck();
  check("staff: the lanes' names switch hides its names too", (await labels()) === "0 1 2 3 0 1 2 3 2 1 0 3 2 1 0", await labels());
  await lane("Fingers").uncheck();
  check("staff: the lanes' fingers switch hides its fingers too", (await labels()) === "");
  await lane("Fingers").check();
  await lane("Do Ré Mi").check();
  check("staff: both come back", (await labels()).startsWith("0 Ré 1 Mi"), await labels());
  const sheet = () => page.locator(".staff svg").evaluate((svg) => svg.outerHTML);
  const before = await sheet();
  await lane("A B C").uncheck();
  check("staff: letter names are only for the lanes", (await sheet()) === before);
  await lane("A B C").check();
  await pickPiece(page, "c-major-1oct");
  await sleep(150);
  const low = await page.locator(".staff > svg > text").evaluateAll((texts) => texts.filter((text) => text.getAttribute("fill") === "#f08a8d").map((text) => text.textContent).join());
  check("staff: low fingers are red, with a plain number", low.length > 0 && !low.includes("L"), low);
  const inside = await page.locator(".staff").evaluate((staff) => { const box = staff.getBoundingClientRect(); return [...staff.querySelectorAll("svg > text")].every((text) => { const rect = text.getBoundingClientRect(); return rect.top >= box.top && rect.bottom <= box.bottom; }); });
  check("staff: labels stay inside the sheet", inside);

  // Staff modes, with the current note on the playhead
  await pickPiece(page, "d-major-1oct");
  await sleep(150);
  // How far the current notehead is from the playhead, which sits 130 units in, at the staff's scale.
  const headOffset = () => page.evaluate(() => {
    const staff = document.querySelector(".staff").getBoundingClientRect();
    const scale = parseFloat(getComputedStyle(document.querySelector(".staff-panel")).getPropertyValue("--timeline-scale"));
    const glyphs = [...document.querySelectorAll(".staff .vf-stavenote.current .vf-notehead text")];
    return Math.round(Math.max(...glyphs.map((glyph) => glyph.getBoundingClientRect().left)) - staff.left - 130 * scale);
  });
  check("staff: closed by default, one line", (await page.locator(".staff.collapsed").count()) === 1 && (await page.locator(".staff .vf-stave").count()) === 1);
  check("staff: the first note starts on the playhead", Math.abs(await headOffset()) <= 1, String(await headOffset()));
  const clef = await page.evaluate(() => { const panel = document.querySelector(".staff").getBoundingClientRect(), clef = document.querySelector(".staff .vf-clef").getBoundingClientRect(); return { left: Math.round(clef.left - panel.left), scrolled: document.querySelector(".staff").scrollLeft }; });
  check("staff: the clef isn't cut off at the start", clef.left >= 8 && clef.scrolled === 0, JSON.stringify(clef));
  const box = await page.locator("canvas").boundingBox();
  // F sharp, the third note, on the D string.
  await clickLanes(page, 130 + 2 * 120 + 40, 2.5 * 84);
  await sleep(900);
  check("staff: follows the timeline to a clicked sharp note", (await progress(page)) === "Note 3 of 15" && Math.abs(await headOffset()) <= 1, `${await progress(page)} ${await headOffset()}`);
  check("staff: marks the same note", (await page.locator(".staff .vf-stavenote").evaluateAll((notes) => notes.findIndex((n) => n.classList.contains("current")))) === 2);
  const staffScroll = () => page.evaluate(() => document.querySelector(".staff").scrollLeft);
  const staffBefore = await staffScroll();
  await page.mouse.move(box.x + 500, box.y + 60);
  await page.mouse.wheel(240, 0);
  await sleep(350);
  const moved = await staffScroll();
  check("staff: moves when the timeline is scrolled by hand", moved > staffBefore + 100, `${staffBefore} → ${moved}`);
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

// Tuning, set on the tuner itself, its dial redrawn as you slide; the Settings screen keeps the rest
{
  const s = await open(OUT + "s-silent.wav");
  const current = () => s.page.locator('nav button[aria-current="page"]').innerText();
  await nav(s.page, "Listen");
  await openTuning(s.page);
  const arc = () => s.page.locator(".stage-tuner .dial-yellow").getAttribute("d");
  const before = await arc();
  await s.page.locator('input[aria-label="Close enough"]').fill("30");
  const saved = await s.page.evaluate(() => JSON.parse(localStorage.getItem("settings")).toleranceCents);
  check("tuning: saved as you slide", saved === 30, String(saved));
  check("tuning: the dial's close-enough arc moves as you slide", (await arc()) !== before);
  await s.page.locator('input[aria-label="Close enough"]').fill("10");
  check("tuning: Close enough slid down to in tune is off, its arc gone and its key saying so", (await s.page.locator(".stage-tuner .dial-yellow").evaluate((path) => path.style.visibility)) === "hidden" && (await s.page.locator(".dial-key").innerText()).includes("Close enough: off"));
  await s.page.locator('input[aria-label="Close enough"]').fill("40");
  await openSettings(s.page);
  check("settings: a screen of its own, marked in the sidebar, with no tuning on it", (await current()) === "Settings" && (await s.page.locator(".settings .needle").count()) === 0, await current());
  await setLanguage(s.page, "PT");
  check("settings: switching language stays on Settings", (await current()) === "Configurações", await current());
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
  for (const [minRms, expected] of [[0.01, "0 Lá A"], [0.05, ""]]) {
    const s = await open(OUT + "s-quiet.wav");
    await seed(s.page, { settings: { minRms } });
    await start(s.page);
    await s.page.waitForSelector('button:text-is("Stop")');
    await sleep(1200);
    const shown = await heard(s.page);
    check(`gate ${minRms}: a quiet note reads ${expected || "nothing"}`, shown === expected, shown);
    await s.close();
  }
}

// The needle
for (const [file, cents, zone] of [["s-green.wav", 8, "green"], ["s-yellow.wav", 30, "yellow"], ["s-out.wav", 46, "out"]]) {
  const s = await open(OUT + file);
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  await sleep(1200);
  // The needle turns 1.8 degrees a cent, 90 at 50 cents sharp.
  const seen = await s.page.locator(".needle").evaluate((needle) => ({ zone: needle.dataset.zone, cents: parseFloat(needle.querySelector(".dial-needle").style.transform.match(/-?[\d.]+/)[0]) / 1.8 }));
  check(`needle: ${cents} cents reads ${zone}`, seen.zone === zone && Math.abs(seen.cents - cents) < 3, JSON.stringify(seen));
  await s.close();
}
{
  const s = await open(OUT + "s-yellow.wav");
  await openTuning(s.page);
  await s.page.locator('input[aria-label="Close enough"]').fill("50");
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  await sleep(1200);
  // Close enough at 50 cents reaches the dial's ends, the first at (30, 160).
  const seen = await s.page.evaluate(() => ({ zone: document.querySelector(".needle").dataset.zone, arc: document.querySelector(".needle .dial-yellow").getAttribute("d") }));
  check("needle: Close enough moves the zones", seen.zone === "yellow" && seen.arc.startsWith("M30.0 160.0"), JSON.stringify(seen));
  await s.close();
}
