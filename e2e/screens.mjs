// Every screen and the main flows on phone and tablet sizes, by touch, plus small computer windows.
// This is Chrome emulating those sizes: it checks layout and touch handling, not Safari or a real device's mic.
import { wav, rest } from "./wav.mjs";
import { open, nav, sleep, check, followNotes, progress, audit, auditCheck, D_MAJOR as D, OUT, typeNotes, openDrawers } from "./lib.mjs";

const SIZES = [
  ["small phone", 320, 568, true],
  ["phone", 360, 640, true],
  ["iPhone", 390, 844, true],
  ["large phone", 430, 932, true],
  ["smallest phone landscape", 568, 320, true],
  ["small phone landscape", 667, 375, true],
  ["phone landscape", 844, 390, true],
  ["iPad mini", 768, 1024, true],
  ["iPad Air", 820, 1180, true],
  ["iPad landscape", 1180, 820, true],
  ["iPad Pro", 1024, 1366, true],
  ["iPad Pro landscape", 1366, 1024, true],
  ["narrow window", 500, 700, false],
  ["short window", 900, 450, false],
];
const fillsWidth = (canvas, screen) => Math.abs(canvas - Math.min(960, screen - 32)) <= 2; // style.css caps the page at 960.
const ARROW_TURN_MS = 350; // The arrow overflows its row by a pixel while it turns.
const LONG_TITLE = "Concerto for Violin and Orchestra in D major, first movement";
const longPiece = Array(10).fill("D4 E4 F#4 G4").join(" | ");
wav(OUT + "screens-silent.wav", [rest(3)]);

// The audit has to catch a broken page, or its passes mean nothing.
{
  const s = await open(OUT + "screens-silent.wav", undefined, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const { page } = s;
  const start = page.locator('button:text-is("Start")');
  const clean = await audit(page);
  await page.evaluate(() => { const wide = document.createElement("div"); wide.id = "wide"; wide.style.width = "2000px"; wide.textContent = "wide"; document.querySelector("main").append(wide); });
  const wide = await audit(page);
  check("audit: starts clean, then catches something too wide", clean.sideways <= 0 && !clean.offEdge.length && wide.sideways > 0 && wide.offEdge.length > 0, JSON.stringify(wide.offEdge));
  await page.evaluate(() => document.querySelector("#wide").remove());
  await start.evaluate((button) => { const cover = document.createElement("div"); const box = button.getBoundingClientRect(); cover.style.cssText = `position:absolute;left:${box.left}px;top:${box.top + scrollY}px;width:${box.width}px;height:${box.height}px;z-index:9`; document.querySelector("#app").append(cover); });
  check("audit: catches a covered control", (await audit(page)).covered.some((text) => text.includes("Start")));
  await page.reload(); await page.waitForSelector("nav button");
  await start.evaluate((button) => { button.style.cssText = "width:60px;white-space:nowrap;overflow:hidden;height:16px;padding:0;min-height:0"; button.textContent = "A much longer label than fits"; });
  const squeezed = await audit(page);
  check("audit: catches a cut-off label and a small control", squeezed.cut.length > 0 && squeezed.small.length > 0, JSON.stringify({ cut: squeezed.cut, small: squeezed.small }));
  await s.close();
}

// node e2e/screens.mjs 390x844 runs one size.
for (const [label, width, height, touch] of SIZES.filter(([, w, h]) => !process.argv[2] || process.argv[2] === `${w}x${h}`)) {
  console.log(`\n=== ${label} ${width}x${height}`);
  const tag = `${width}x${height}`;
  const s = await open(OUT + "screens-silent.wav", undefined, { viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
  const { page } = s;
  const go = (selector) => (touch ? page.locator(selector).first().tap() : page.locator(selector).first().click());
  const goNav = (name) => (touch ? page.locator(`nav button:text-is("${name}")`).tap() : nav(page, name));
  const isPhone = width < 600 || height < 500;
  const openOptions = async () => { if (!(await page.locator(".options").evaluate((panel) => panel.open))) { await go(".options > summary"); await sleep(ARROW_TURN_MS); } };
  const closeOptions = async () => { if (await page.locator(".options").evaluate((panel) => panel.open)) { await go(".options > summary"); await sleep(ARROW_TURN_MS); } };

  if (touch) check(`${tag}: the browser reports a finger, not a mouse`, await page.evaluate(() => matchMedia("(pointer: coarse)").matches));

  // Every screen, in English and in the longer Portuguese
  for (const language of ["EN", "PT"]) {
    await go(`.language button:text-is("${language}")`); await sleep(200);
    const tabs = await page.locator("nav button").allInnerTexts();
    for (let index = 0; index < 4; index++) {
      await page.locator("nav button").nth(index).click(); await sleep(250);
      await auditCheck(page, `${tag} ${language} ${tabs[index]}`);
      if (index === 1) {
        await openOptions();
        await auditCheck(page, `${tag} ${language} Options open`);
        await go(".staff-toggle"); await sleep(200);
        await auditCheck(page, `${tag} ${language} full sheet`);
        await go(".staff-toggle"); await sleep(200);
      }
    }
    await page.locator("header summary").click(); await sleep(150);
    const panel = await page.locator(".settings-panel").boundingBox();
    check(`${tag} ${language} Settings: fits on screen`, panel.x >= 0 && panel.x + panel.width <= width + 1, JSON.stringify(panel));
    await auditCheck(page, `${tag} ${language} Settings open`, ".settings-panel");
    await page.keyboard.press("Escape"); await sleep(100);
  }
  await go('.language button:text-is("EN")'); await sleep(200);
  await goNav("Practice"); await sleep(250);

  // Options are closed by default on a phone only, so this one clears what the steps above saved.
  const fresh = await s.context.newPage();
  await fresh.goto(page.url());
  await fresh.evaluate(() => localStorage.clear()); await fresh.reload(); await fresh.waitForSelector("nav button");
  await fresh.locator('nav button:text-is("Practice")').click(); await sleep(250);
  check(`${tag}: Options start ${isPhone ? "closed" : "open"}`, (await fresh.locator(".options").evaluate((panel) => panel.open)) === !isPhone);
  await fresh.close();

  // The timeline and the run buttons can be seen together
  await closeOptions();
  await page.evaluate(() => document.querySelector(".actions").scrollIntoView({ block: "start", behavior: "instant" })); await sleep(100);
  const view = await page.evaluate(() => { const a = document.querySelector(".actions").getBoundingClientRect(), c = document.querySelector("canvas").getBoundingClientRect(); return { top: Math.round(a.top), canvasBottom: Math.round(c.bottom), canvasWidth: Math.round(c.width), height: innerHeight, width: innerWidth }; });
  check(`${tag}: Start and the timeline fit on one screen`, view.top >= 0 && view.canvasBottom <= view.height, JSON.stringify(view));
  check(`${tag}: the timeline fills the width`, fillsWidth(view.canvasWidth, view.width), JSON.stringify(view));
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));

  const needleWidth = await page.locator(".needle").evaluate((needle) => Math.round(needle.getBoundingClientRect().width));
  check(`${tag}: the tuning needle stays readable`, needleWidth >= 60, `${needleWidth}px`);

  // Fullscreen: only the controls, lanes and staff, with nothing to scroll
  await go('button[aria-label="Fullscreen"]'); await sleep(400);
  const full = await page.evaluate(() => { const canvas = document.querySelector("canvas").getBoundingClientRect(), staff = document.querySelector(".staff").getBoundingClientRect(); return { down: document.documentElement.scrollHeight - innerHeight, canvasWidth: Math.round(canvas.width), staffBottom: Math.round(staff.bottom), inner: innerHeight, width: innerWidth, header: !!document.querySelector("header").checkVisibility(), bpm: !!document.querySelector(".actions .bpm") }; });
  check(`${tag} fullscreen: lanes and staff fit with no scrolling`, full.down <= 0 && full.staffBottom <= full.inner && Math.abs(full.canvasWidth - (full.width - 32)) <= 2 && !full.header && full.bpm, JSON.stringify(full));
  await auditCheck(page, `${tag} fullscreen`);
  await go('button[aria-label="Exit fullscreen"]'); await sleep(400);
  check(`${tag} fullscreen: exits to the normal layout`, fillsWidth(await page.locator("canvas").evaluate((c) => Math.round(c.getBoundingClientRect().width)), width) && (await page.locator("header").isVisible()));

  // Tapping a tile, on the D string
  const tile = async (index) => { const box = await page.locator("canvas").boundingBox(); const scale = box.height / (84 * 4); const position = { x: (130 + index * 120 + 40) * scale, y: 2.5 * 84 * scale }; await page.locator(".highway-scroll").scrollIntoViewIfNeeded(); touch ? await page.locator(".highway-scroll").tap({ position }) : await page.locator(".highway-scroll").click({ position }); };
  await tile(1); await sleep(700);
  check(`${tag}: tapping a note starts from it`, (await progress(page)) === "Note 2 of 15", await progress(page));
  const staffOffset = await page.evaluate(() => { const panel = document.querySelector(".staff-panel").getBoundingClientRect(), box = document.querySelector(".staff .vf-stavenote.current")?.getBoundingClientRect(); return box ? { left: Math.round(box.left - panel.left), right: Math.round(panel.right - box.right) } : null; });
  check(`${tag}: the staff shows that note`, staffOffset && staffOffset.left >= 0 && staffOffset.right >= 0, JSON.stringify(staffOffset));

  // Swiping the timeline
  if (touch) {
    const box = await page.locator("canvas").boundingBox();
    const before = await page.locator(".highway-scroll").evaluate((e) => e.scrollLeft);
    const cdp = await s.context.newCDPSession(page);
    await cdp.send("Input.synthesizeScrollGesture", { x: box.x + box.width * 0.8, y: box.y + box.height / 2, xDistance: -Math.round(box.width * 0.5), yDistance: 0, gestureSourceType: "touch", speed: 800 });
    await sleep(300);
    const after = await page.locator(".highway-scroll").evaluate((e) => e.scrollLeft);
    check(`${tag}: swiping scrolls the timeline`, after > before + 20, `${before} > ${after}`);
    await cdp.detach();
  }

  // A whole scale, with Start at the first note
  await page.reload(); await page.waitForSelector("nav button");
  await goNav("Practice"); await sleep(250);
  await followNotes(page, { midis: D, delayMs: 30 });
  await go('button:text-is("Start")'); await page.waitForSelector('button:text-is("Stop")');
  try {
    await page.waitForFunction(() => document.querySelector("section > p").textContent.startsWith("All"), null, { timeout: 30000 });
    check(`${tag}: a whole scale plays through`, (await page.locator(".stats").innerText()).includes("15 hit"), (await page.locator(".stats").innerText()).replaceAll("\n", " / "));
  } catch { check(`${tag}: a whole scale plays through`, false, await progress(page)); }
  await auditCheck(page, `${tag} finished`);
  await go('button:text-is("Stop")'); await sleep(200);

  // Tempo with the metronome, and a pattern
  await openOptions();
  await page.locator('.options label:has-text("Tempo")').click();
  await page.locator('.options label:has-text("Metronome")').click();
  await go('.patterns button:text-is("4")'); await sleep(200);
  await auditCheck(page, `${tag} Tempo and pattern`);
  await closeOptions();
  const notes = Number((await progress(page)).match(/of (\d+)/)[1]);
  check(`${tag}: pattern 4 expands the scale`, notes === 90, String(notes));
  await go('.patterns button:text-is("1")'); await sleep(200);
  await followNotes(page, { midis: D, delayMs: 30 });
  await go('button:text-is("Start")'); await page.waitForSelector('button:text-is("Stop")');
  try {
    await page.waitForFunction(() => document.querySelector("section > p").textContent.startsWith("All"), null, { timeout: 40000 });
    check(`${tag}: Tempo and metronome run through`, true);
  } catch { check(`${tag}: Tempo and metronome run through`, false, await progress(page)); }
  await go('button:text-is("Stop")'); await sleep(200);
  await openOptions();
  await page.locator('.options label:has-text("Tempo")').click();
  await page.locator('.options label:has-text("Metronome")').click();
  await closeOptions();

  // Turning the device mid-scale
  if (touch) {
    await followNotes(page, { midis: D, delayMs: 400 });
    await go('button:text-is("Start")'); await page.waitForSelector('button:text-is("Stop")');
    await page.waitForFunction(() => /^Note [3-9] of/.test(document.querySelector("section > p").textContent), null, { timeout: 15000 });
    const at = await progress(page);
    await page.setViewportSize({ width: height, height: width }); await sleep(500);
    const turned = await page.evaluate(() => { const c = document.querySelector("canvas").getBoundingClientRect(), current = document.querySelector(".highway-scroll"); return { width: Math.round(c.width), inner: innerWidth, sideways: document.documentElement.scrollWidth - innerWidth, scroll: Math.round(current.scrollLeft) }; });
    check(`${tag}: turning mid-scale refits the timeline`, fillsWidth(turned.width, turned.inner) && turned.sideways <= 0, JSON.stringify(turned));
    try {
      await page.waitForFunction(() => document.querySelector("section > p").textContent.startsWith("All"), null, { timeout: 30000 });
      check(`${tag}: and the run carries on to the end`, true, `from ${at}`);
    } catch { check(`${tag}: and the run carries on to the end`, false, `${at} > ${await progress(page)}`); }
    await auditCheck(page, `${tag} turned`);
    await go('button:text-is("Stop")'); await sleep(200);
    await page.setViewportSize({ width, height }); await sleep(300);
  }

  // A recording, and a long title
  await goNav("Library"); await sleep(200);
  await page.fill('input[placeholder="Title"]', LONG_TITLE);
  await typeNotes(page, longPiece);
  await go('.type-notes button:text-is("Save piece")'); await sleep(200);
  await auditCheck(page, `${tag} Library with a long title`);
  await page.locator(".piece", { hasText: LONG_TITLE }).locator('button[aria-label="Practice"]').click(); await sleep(400);
  await auditCheck(page, `${tag} Practice, long title`);
  await go(".staff-toggle"); await sleep(250);
  const sheet = await page.evaluate(() => { const panel = document.querySelector(".staff-panel").getBoundingClientRect(), notes = [...document.querySelectorAll(".staff .vf-stavenote")].map((n) => n.getBoundingClientRect()); return { notes: notes.length, outside: notes.filter((n) => n.right > panel.right + 1 || n.left < panel.left - 1).length }; });
  check(`${tag}: a 40-note sheet wraps inside the page`, sheet.notes === 40 && sheet.outside === 0, JSON.stringify(sheet));
  await go(".staff-toggle"); await sleep(200);
  await goNav("Library"); await sleep(200);
  const columns = await page.locator(".library > div").evaluateAll((columns) => columns.map((column) => Math.round(column.getBoundingClientRect().left)));
  check(`${tag}: scales and songs ${width >= 716 ? "side by side" : "stacked"}`, (columns[0] !== columns[1]) === width >= 716, JSON.stringify(columns));
  await openDrawers(page); await sleep(100);
  await page.locator(".piece", { hasText: "Ode to Joy" }).locator('button[aria-label="Practice"]').click(); await sleep(300);
  await go(".staff-toggle"); await sleep(250);
  const song = await page.evaluate(() => { const panel = document.querySelector(".staff-panel").getBoundingClientRect(), notes = [...document.querySelectorAll(".staff .vf-stavenote")].map((n) => n.getBoundingClientRect()); return { notes: notes.length, outside: notes.filter((n) => n.right > panel.right + 1 || n.left < panel.left - 1).length }; });
  check(`${tag}: a song in bars stays inside the page`, song.notes === 62 && song.outside === 0, JSON.stringify(song));
  await auditCheck(page, `${tag} a song's full sheet`);
  await go(".staff-toggle"); await sleep(200);
  await goNav("Library"); await sleep(200);
  await page.locator(".piece", { hasText: LONG_TITLE }).locator('button[aria-label="Practice"]').click(); await sleep(300);
  await openOptions();
  await page.locator('.options label:has-text("Record")').click();
  await closeOptions();
  await followNotes(page, { midis: Array(10).fill([62, 64, 66, 67]).flat(), delayMs: 30 });
  await go('button:text-is("Start")'); await page.waitForSelector('button:text-is("Stop")');
  await page.waitForFunction(() => /^Note [4-9] of/.test(document.querySelector("section > p").textContent), null, { timeout: 15000 });
  await go('button:text-is("Stop")'); await page.waitForSelector('button:text-is("Start"):not([disabled])');
  await goNav("Log"); await page.waitForSelector("audio"); await sleep(500);
  await auditCheck(page, `${tag} Log with a recording`);
  const audio = await page.locator("audio").boundingBox();
  check(`${tag}: the player fits`, audio.x >= 0 && audio.x + audio.width <= width + 1, JSON.stringify(audio));
  await goNav("Practice"); await sleep(250);
  await goNav("Listen"); await sleep(250);

  check(`${tag}: no page errors`, s.problems.length === 0, s.problems.slice(0, 3).join(" | "));
  await s.close();
}
