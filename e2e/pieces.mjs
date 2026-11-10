// Pieces you make yourself: writing one on the staff or typing it, editing it, saving it as a PDF, and the questions
// asked before anything is lost. Also the size of the buttons on a Library row, and the bars and labels on the sheet.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { wav, rest } from "./wav.mjs";
import { answer, auditCheck, canvasHasColor, check, nav, open, openDrawers, OUT, pickPiece, progress, saveTyped, seed, sleep, typeNotes } from "./lib.mjs";

const WAV = OUT + "pieces-silent.wav";
wav(WAV, [rest(3)]);
const flow = (title) => console.log(`\n=== ${title}`);
const note = (pitch, beats, more = {}) => ({ pitch, beats, ...more });
const lengths = (...beats) => beats.map((length) => note("D4", length));
const custom = (id, title, notes) => ({ id, title, source: "imported", notes });
// Where a press lands on a sheet, in pixels from its top: the second line up is G4, and two steps are one line.
const G4_Y = 90;
const D5_Y = 60;
const STEP_PX = 7.5;

// The Library, with these saved pieces and this on the staff.
async function library(page, { pieces = [], draft = { title: "", notes: [] }, settings } = {}) {
  await page.evaluate((draft) => localStorage.setItem("pieceDraft", JSON.stringify(draft)), draft);
  await seed(page, { settings, pieces });
  await nav(page, "Library");
  await sleep(200);
  await openDrawers(page);
}

function tools(page, press = (locator) => locator.click()) {
  const row = (text) => page.locator(".piece", { hasText: text });
  const say = async (label) => { await press(page.locator("dialog[open]").getByRole("button", { name: label, exact: true })); await sleep(100); };
  return {
    press,
    row,
    say,
    modal: page.locator("dialog[open]"),
    title: page.locator('input[placeholder="Title"]'),
    save: page.locator("section > .row").last().getByRole("button", { name: "Save piece", exact: true }),
    clear: (label = "Clear") => page.locator("section > .row").last().getByRole("button", { name: label, exact: true }),
    pencil: (text) => row(text).getByRole("button", { name: "Edit piece", exact: true }),
    trash: (text) => row(text).getByRole("button", { name: "Delete", exact: true }),
    download: (text) => row(text).getByRole("button", { name: "Download PDF", exact: true }),
    blank: () => page.locator(".editor-column.blank .editor-sheet").first(),
    sheetOf: (index) => page.locator(`.editor-column[data-index="${index}"] .editor-sheet`),
    nameOf: (index) => page.locator(`.editor-column[data-index="${index}"] button.editor-name`),
    beatsOf: (index) => page.locator(`.editor-column[data-index="${index}"] select`),
    heading: () => page.locator("section > h2").last().textContent(),
    names: () => page.$$eval(".editor-column button.editor-name", (names) => names.map((name) => name.textContent).join()),
    beats: () => page.$$eval(".beat-picker select", (selects) => selects.map((select) => select.value).join()),
    widths: () => page.$$eval(".editor-column", (columns) => columns.map((column) => column.getBoundingClientRect().width)),
    stored: () => page.evaluate(() => JSON.parse(localStorage.getItem("pieces") ?? "[]")),
    draft: () => page.evaluate(() => JSON.parse(localStorage.getItem("pieceDraft"))),
    open: async () => (await page.locator("dialog[open]").count()) === 1,
    closed: async () => (await page.locator("dialog").count()) === 0,
  };
}

const notProblems = (s) => check("no page errors", s.problems.length === 0, s.problems.join(" | "));

flow("Writing on the staff");
{
  const s = await open(WAV);
  const { page } = s;
  const t = tools(page);
  await library(page);
  check("Save starts off", await t.save.isDisabled());
  check("so does Clear, with nothing to clear", await t.clear().isDisabled());

  const beatNumbers = await page.$$eval(".editor-row:first-child .editor-column text", (numbers) => numbers.map((number) => number.textContent).join());
  check("a blank staff already shows its bars, counted in beats", beatNumbers.startsWith("1,2,3,4,1,2,3,4"), beatNumbers);
  check("with bar lines", (await page.locator('.editor-row:first-child line[stroke="#000"]').count()) >= 2);

  await t.blank().scrollIntoViewIfNeeded();
  const box = await t.blank().boundingBox();
  await page.mouse.move(box.x + 20, box.y + G4_Y);
  await sleep(50);
  check("hovering shows where a note would go, and its name", (await page.locator(".editor-column.blank svg ellipse").count()) === 1 && (await page.locator(".editor-column.blank .editor-name").first().textContent()) === "Sol");
  await page.mouse.move(box.x + 20, box.y - 200);
  await sleep(50);
  check("and it goes away with the mouse", (await page.locator(".editor-column.blank svg ellipse").count()) === 0);

  await t.blank().click({ position: { x: 20, y: G4_Y } });
  await sleep(100);
  check("a click places the note, named, at one beat", (await t.names()) === "Sol" && (await t.beats()) === "1", `${await t.names()} ${await t.beats()}`);

  const drag = async (index, fromY, toY) => {
    const sheet = await t.sheetOf(index).boundingBox();
    await page.mouse.move(sheet.x + 20, sheet.y + fromY);
    await page.mouse.down();
    await page.mouse.move(sheet.x + 20, sheet.y + toY, { steps: 6 });
    await page.mouse.up();
    await sleep(100);
  };
  await drag(0, G4_Y, D5_Y);
  check("dragging moves it, and its name follows", (await t.names()) === "Ré", await t.names());
  await drag(0, D5_Y + 60, D5_Y + 90);
  check("a press well away from a note doesn't move it", (await t.names()) === "Ré", await t.names());
  await drag(0, D5_Y, G4_Y);

  const accidentals = [];
  for (let i = 0; i < 3; i++) { await t.nameOf(0).click(); await sleep(60); accidentals.push(await t.names()); }
  check("clicking the name goes through sharp, flat and natural", accidentals.join() === "Sol♯,Sol♭,Sol", accidentals.join());

  await t.beatsOf(0).selectOption("2");
  await t.blank().click({ position: { x: 20, y: D5_Y } });
  await sleep(100);
  check("the next click lands after it", (await t.names()) === "Sol,Ré" && (await t.beats()) === "2,1");
  const inBar = await t.beatsOf(1).evaluate((select) => [...select.options].filter((option) => option.disabled).map((option) => option.value).join());
  check("lengths that don't fit the bar can't be picked", inBar === "3,4", inBar);

  const offsets = await page.$$eval(".editor-delete", (buttons) => buttons.map((button) => button.getBoundingClientRect().left - button.closest(".editor-sheet").getBoundingClientRect().left));
  check("each note's trash sits in the same place inside the staff", new Set(offsets).size === 1, offsets.join());
  await page.locator(".editor-delete").first().click();
  await sleep(100);
  check("and removes just that note", (await t.names()) === "Ré");

  await t.title.fill("On the staff");
  await page.reload();
  await page.waitForSelector("nav button");
  await nav(page, "Library");
  await sleep(200);
  check("a reload keeps what's on the staff", (await t.names()) === "Ré" && (await t.title.inputValue()) === "On the staff");

  await t.save.click();
  await sleep(150);
  const saved = (await t.stored()).at(-1);
  check("Save keeps the note, with a fingering", saved.title === "On the staff" && saved.notes[0].pitch === "D5" && saved.notes[0].finger !== undefined, JSON.stringify(saved.notes));
  check("then the staff and title are blank", (await t.names()) === "" && (await t.title.inputValue()) === "");
  await t.row("On the staff").getByRole("button", { name: "Practice", exact: true }).click();
  await sleep(300);
  check("it opens in Practice", (await progress(page)) === "Note 1 of 1", await progress(page));
  notProblems(s);
  await s.close();
}

flow("The space notes take, and the bar lines");
{
  const s = await open(WAV);
  const { page } = s;
  const t = tools(page);
  await library(page, { draft: { title: "", notes: lengths(2, 0.5, 0.5, 1) } });
  check("a quick note gets a whole beat's room, a long one more", (await t.widths()).slice(0, 4).join() === "144,72,72,72", (await t.widths()).join());

  await library(page, { draft: { title: "", notes: lengths(1, 1, 1, 1) } });
  const place = () => page.$$eval(".editor-column[data-index]", (columns) => columns.map((column) => column.getBoundingClientRect().left));
  const before = await place();
  await t.beatsOf(0).selectOption("4");
  await sleep(100);
  const after = await place();
  check("a note made longer pushes the next ones along", after[1] - before[1] === 216 && (await t.widths())[0] === 288, `${after[1] - before[1]}`);

  await library(page, { draft: { title: "", notes: lengths(2, 1, 0.5) } });
  await t.blank().click({ position: { x: 20, y: G4_Y } });
  await sleep(100);
  check("a note with half a beat left starts at ½", (await t.draft()).notes.at(-1).beats === 0.5, JSON.stringify((await t.draft()).notes.at(-1)));
  check("and a full bar leaves a fresh one to write in", (await t.blank().count()) === 1);

  const eighths = Array.from({ length: 32 }, () => 0.5);
  await library(page, { draft: { title: "", notes: lengths(...eighths) } });
  const rows = await page.$$eval(".editor-row", (list) => list.map((row) => row.getBoundingClientRect().right));
  const room = await page.locator(".editor-rows").evaluate((rows) => rows.getBoundingClientRect().right);
  check("wide bars wrap into rows, inside the page", rows.length > 1 && rows.every((right) => right <= room + 1), `${rows.length} rows`);
  await auditCheck(page, "A long staff", ".piece-editor");

  await library(page, { draft: { title: "Over", notes: lengths(1, 1, 0.5, 0.5, 1) } });
  check("a bar that fits has no warning", (await page.locator(".piece-editor .warning").textContent()) === "" && (await t.save.isEnabled()));
  await t.beatsOf(0).selectOption("1.5");
  await sleep(100);
  check("a push over the bar line turns the note red, and shows the overflow", (await page.locator(".editor-column.crosses-bar").count()) === 1 && (await page.locator(".editor-column.spill").count()) === 1);
  check("it explains, and Save waits", (await page.locator(".piece-editor .warning").textContent()).includes("Each bar holds 4 beats") && (await t.save.isDisabled()));
  await t.beatsOf(0).selectOption("1");
  await sleep(100);
  check("fixing it clears all that", (await page.locator(".editor-column.crosses-bar").count()) === 0 && (await t.save.isEnabled()));
  notProblems(s);
  await s.close();
}

flow("Typing the notes");
{
  const s = await open(WAV);
  const { page } = s;
  const t = tools(page);
  await library(page);
  check("the form starts closed", !(await page.locator(".type-notes textarea").isVisible()));
  await t.title.fill("Typed");
  await typeNotes(page, "D4:2 E4 F#4");
  const items = await page.locator(".type-notes ol li").allInnerTexts();
  check("the preview reads the beats, with 1 when there are none", items[0].includes("2 beats") && items[1].includes("1 beat") && items[1].includes("Mi"), items.join(" ; "));
  await typeNotes(page, "D4:5");
  check("a length a note can't have is refused", (await saveTyped(page).isDisabled()) && (await page.locator(".type-notes .warning").first().innerText()).includes("D4:5"));
  await typeNotes(page, "D4:3 E4:2");
  check("so is a note that runs over the bar", (await saveTyped(page).isDisabled()) && (await page.locator(".type-notes .warning").first().innerText()).includes("Note 2"));
  await typeNotes(page, "D4:2 E4 F#4 | G4:4");
  await saveTyped(page).click();
  await sleep(150);
  check("saved with its lengths", (await t.stored()).at(-1).notes.map((saved) => saved.beats).join() === "2,1,1,4");
  notProblems(s);
  await s.close();
}

flow("The question before anything is lost");
{
  const s = await open(WAV);
  const { page } = s;
  const t = tools(page);
  let popups = 0;
  page.on("dialog", (dialog) => { popups++; dialog.dismiss(); });
  const LONG = "An extremely long custom title that keeps going, Supercalifragilisticexpialidociousandthensome";
  const pieces = [custom("mine", "My tune", [note("D4", 1)]), custom("other", "Other tune", [note("D4", 1)]), custom("long", LONG, [note("D4", 1)])];
  await library(page, { pieces });
  await t.trash("My tune").click();
  await t.modal.waitFor();
  check("the trash asks, naming the song", (await t.modal.innerText()).includes(`Delete "My tune"? This can't be undone.`));
  check("nothing is gone yet", (await t.stored()).length === 3);
  check("Cancel starts with the focus", (await page.evaluate(() => document.activeElement.textContent)) === "Cancel");
  check("the page behind can't be reached", await page.evaluate(() => document.elementFromPoint(5, 5).closest("dialog") !== null));
  check("or scrolled", (await page.evaluate(() => getComputedStyle(document.documentElement).overflow)) === "hidden");
  const red = () => page.locator(".confirm-yes").evaluate((button) => { const style = getComputedStyle(button); return `${style.backgroundColor} ${style.color}`; });
  check("the button that deletes is red", (await red()) === "rgb(176, 48, 32) rgb(255, 255, 255)", await red());
  await page.locator(".confirm-yes").hover();
  check("and stays red under the mouse", (await red()).startsWith("rgb(176, 48, 32)"), await red());
  const footer = await page.locator("dialog article").evaluate((article) => getComputedStyle(article).backgroundColor === getComputedStyle(article.querySelector("footer")).backgroundColor);
  check("the footer matches the card", footer);

  const keeps = async (label) => check(`${label} keeps the song and closes`, (await t.stored()).length === 3 && (await t.closed()));
  await answer(page, "Cancel");
  await keeps("Cancel");
  check("the page scrolls again", (await page.evaluate(() => getComputedStyle(document.documentElement).overflow)) !== "hidden");
  await t.trash("My tune").click(); await t.modal.waitFor();
  await page.keyboard.press("Escape"); await sleep(100);
  await keeps("Esc");
  await t.trash("My tune").click(); await t.modal.waitFor();
  await page.keyboard.press("Enter"); await sleep(100);
  await keeps("a stray Enter");
  await t.trash("My tune").click(); await t.modal.waitFor();
  await page.mouse.click(6, 6); await sleep(100);
  await keeps("a click outside");

  await t.trash(LONG).click(); await t.modal.waitFor();
  const fits = await t.modal.locator("article").evaluate((article) => { const box = article.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && article.scrollWidth <= article.clientWidth; });
  check("a very long title stays inside the box", fits);
  await answer(page, "Cancel");

  await t.trash("My tune").click(); await t.modal.waitFor();
  await answer(page, "Delete");
  check("Delete removes only that song", (await t.stored()).map((piece) => piece.id).join() === "other,long" && (await t.row("My tune").count()) === 0);
  await page.reload(); await page.waitForSelector("nav button"); await nav(page, "Library"); await sleep(200);
  await openDrawers(page);
  check("for good", (await t.row("My tune").count()) === 0);

  await library(page, { pieces, draft: { title: "", notes: [note("D4", 1)] } });
  await t.clear().click(); await t.modal.waitFor();
  check("Clear asks too", (await t.modal.innerText()).includes("Remove all the notes"));
  await answer(page, "Cancel");
  check("Cancel keeps the notes", (await t.names()) === "Ré");
  await t.clear().click(); await t.modal.waitFor();
  await answer(page, "Clear");
  check("Clear empties the staff", (await t.names()) === "");

  await page.evaluate(async () => {
    const storage = await import("/src/storage.ts");
    await storage.saveRecording("take", { blob: new Blob(["sound"], { type: "audio/webm" }), markers: [] });
    storage.appendLog({ id: "entry", startedAt: new Date().toISOString(), pieceId: "other", pieceTitle: "Other tune", minutes: 1, passes: 1, notesHit: 3, notesSkipped: 0, averageCents: 5, averagePassSeconds: 10, slowest: [], recordingId: "take" });
  });
  await nav(page, "Log");
  await page.locator("audio").waitFor({ state: "attached" });
  const hasTake = () => page.evaluate(async () => (await (await import("/src/storage.ts")).getRecording("take")) !== undefined);
  await page.click('button:text-is("Delete recording")'); await t.modal.waitFor();
  check("Delete recording asks too", (await t.modal.innerText()).includes("Delete this recording"));
  await answer(page, "Cancel");
  check("Cancel keeps the recording", (await page.locator("audio").count()) === 1 && (await hasTake()));
  await page.click('button:text-is("Delete recording")'); await t.modal.waitFor();
  await answer(page, "Delete"); await sleep(150);
  check("Delete removes the recording", (await page.locator("audio").count()) === 0 && !(await hasTake()));

  await nav(page, "Library"); await sleep(200);
  await openDrawers(page);
  await page.getByRole("button", { name: "PT", exact: true }).click(); await sleep(200);
  await openDrawers(page); // Changing language builds the Library again, with its drawers closed.
  await t.row("Other tune").getByRole("button", { name: "Excluir", exact: true }).click(); await t.modal.waitFor();
  const question = await t.modal.innerText();
  check("the question comes in Portuguese too", question.includes('Excluir "Other tune"?') && question.includes("Cancelar"), question.replaceAll("\n", " | "));
  await answer(page, "Cancelar");
  await page.getByRole("button", { name: "EN", exact: true }).click(); await sleep(200);
  await openDrawers(page);
  check("the browser's own popups aren't used anywhere", popups === 0, `${popups}`);
  notProblems(s);
  await s.close();
}

flow("Editing a saved song");
{
  const s = await open(WAV);
  const { page } = s;
  const t = tools(page);
  const mine = custom("mine", "My tune", [note("D4", 2, { string: "D", finger: "0" }), note("A4", 1, { string: "D", finger: "4" }), note("B4", 1, { string: "A", finger: "1" })]);
  const other = custom("other", "Other tune", [{ pitch: "D4", string: "D", finger: "0" }]);
  const pieces = [mine, other];
  const settings = { highlighted: ["mine"] };
  const savedMine = async () => (await t.stored()).find((piece) => piece.id === "mine");
  await library(page, { pieces, settings });
  const buttonsOn = (text) => t.row(text).first().evaluate((row) => [...row.querySelectorAll("button.icon-button")].map((button) => button.getAttribute("aria-label")).join());
  check("custom songs get the pencil, beside the trash", (await buttonsOn("My tune")) === "Practice,Download PDF,Edit piece,Delete,Add a backing track", await buttonsOn("My tune"));
  check("built-in songs don't", !(await buttonsOn("Ode to Joy")).includes("Edit") && !(await buttonsOn("Ode to Joy")).includes("Delete"));

  await t.pencil("My tune").click(); await sleep(150);
  check("the heading says Edit piece", (await t.heading()) === "Edit piece", await t.heading());
  check("the title, notes and lengths come along", (await t.title.inputValue()) === "My tune" && (await t.names()) === "Ré,Lá,Si" && (await t.beats()) === "2,1,1", `${await t.names()} ${await t.beats()}`);
  check("it scrolls to the editor", await page.locator("section > h2").last().evaluate((heading) => { const { top } = heading.getBoundingClientRect(); return top >= -1 && top < innerHeight; }));
  check("the typing form steps aside", !(await page.locator(".type-notes").isVisible()));
  await page.screenshot({ path: OUT + "pieces-editing.png" });

  await t.clear("Cancel").click(); await sleep(100);
  check("Cancel with no changes doesn't ask", !(await t.open()));
  check("and leaves a blank staff", (await t.heading()) === "Add piece" && (await t.names()) === "" && (await t.title.inputValue()) === "");

  await t.pencil("My tune").click(); await sleep(150);
  await t.title.fill("My better tune");
  await t.beatsOf(0).selectOption("1");
  await t.nameOf(2).click(); await sleep(100);
  await t.save.click(); await sleep(150);
  const changed = await savedMine();
  check("Save updates the song in place", (await t.stored()).length === 2 && changed.title === "My better tune" && changed.notes[0].beats === 1, JSON.stringify((await t.stored()).map((piece) => piece.title)));
  check("a note left alone keeps a hand-set finger", changed.notes[1].finger === "4" && changed.notes[1].string === "D", JSON.stringify(changed.notes[1]));
  check("a note given a new pitch gets a fresh fingering", changed.notes[2].pitch === "B#4" && changed.notes[2].finger !== "1" && changed.notes[2].finger !== undefined, JSON.stringify(changed.notes[2]));
  check("the editor goes back to adding", (await t.heading()) === "Add piece" && (await t.names()) === "" && (await page.locator(".type-notes").isVisible()));
  check("the highlight stays with the song", await t.row("My better tune").evaluate((card) => card.classList.contains("highlighted")));

  await t.row("My better tune").getByRole("button", { name: "Practice", exact: true }).click(); await sleep(300);
  check("Practice gets the changes", (await progress(page)) === "Note 1 of 3" && (await page.locator(".piece-select").innerText()) === "My better tune", await progress(page));
  await nav(page, "Library"); await sleep(200);
  await openDrawers(page);

  await t.pencil("My better tune").click(); await sleep(150);
  await t.title.fill("After a reload");
  await page.reload(); await page.waitForSelector("nav button"); await nav(page, "Library"); await sleep(200);
  await openDrawers(page);
  check("a reload stays in the edit", (await t.heading()) === "Edit piece" && (await t.title.inputValue()) === "After a reload");
  await t.save.click(); await sleep(150);
  check("so saving doesn't make a copy", (await t.stored()).length === 2 && (await savedMine()).title === "After a reload", JSON.stringify((await t.stored()).map((piece) => piece.title)));

  await t.pencil("After a reload").click(); await sleep(150);
  await t.title.fill("Changed my mind");
  await t.clear("Cancel").click(); await t.modal.waitFor();
  check("Cancel with changes asks", (await t.modal.innerText()).includes("Discard your changes"));
  await answer(page, "Cancel");
  check("and can go back to editing", (await t.heading()) === "Edit piece" && (await t.title.inputValue()) === "Changed my mind");
  await t.clear("Cancel").click(); await t.modal.waitFor();
  await answer(page, "Discard");
  check("Discard leaves the saved song alone", (await savedMine()).title === "After a reload" && (await t.heading()) === "Add piece" && (await t.title.inputValue()) === "");

  await t.title.fill("My draft");
  await t.pencil("After a reload").click(); await t.modal.waitFor();
  check("the pencil asks before replacing a draft", (await t.modal.innerText()).includes("Replace what's on the staff"));
  await answer(page, "Cancel");
  check("Cancel keeps the draft", (await t.title.inputValue()) === "My draft" && (await t.heading()) === "Add piece");
  await t.pencil("After a reload").click(); await t.modal.waitFor();
  await answer(page, "Replace");
  check("Replace loads the song", (await t.heading()) === "Edit piece" && (await t.title.inputValue()) === "After a reload");

  await t.pencil("Other tune").click(); await sleep(150);
  check("an unchanged edit moves to another song without asking", !(await t.open()) && (await t.title.inputValue()) === "Other tune");
  check("a note with no written length opens as 1 beat", (await t.beats()) === "1");
  await t.trash("Other tune").click(); await t.modal.waitFor();
  await answer(page, "Delete");
  check("deleting the song being edited clears the editor", (await t.heading()) === "Add piece" && (await t.names()) === "" && (await t.stored()).length === 1);
  await page.reload(); await page.waitForSelector("nav button"); await nav(page, "Library"); await sleep(200);
  await openDrawers(page);
  check("and a reload doesn't bring the edit back", (await t.heading()) === "Add piece");
  notProblems(s);
  await s.close();
}

flow("Saving as a PDF");
{
  const s = await open(WAV);
  const { page } = s;
  const t = tools(page);
  const bar = (start) => [2, 0.5, 0.5, 1].map((beats, index) => note(["D4", "E4", "F#4", "G4", "A4", "B4", "C#5", "D5"][(start + index) % 8], beats, { finger: String((start + index) % 4) }));
  const pieces = [custom("mine", "Mine: a tune", bar(0)), custom("long", "Long one", Array.from({ length: 40 }, (_, index) => bar(index)).flat())];
  const fetchPdf = async (text, file) => {
    const [download] = await Promise.all([page.waitForEvent("download"), t.download(text).click()]);
    await download.saveAs(OUT + file);
    const bytes = readFileSync(OUT + file);
    const raw = bytes.toString("latin1");
    const images = [];
    for (let at = raw.indexOf("/DCTDecode /Length "); at >= 0; at = raw.indexOf("/DCTDecode /Length ", at + 1)) {
      const length = parseInt(raw.slice(at + 19, at + 30), 10);
      const start = raw.indexOf("stream\n", at) + 7;
      images.push(bytes.subarray(start, start + length).toString("base64"));
    }
    return { name: download.suggestedFilename(), raw, pages: (raw.match(/\/Type \/Page /g) ?? []).length, images };
  };
  // Decodes a page's image in the browser and counts what's on it: ink, and the brown of the note names.
  const inkOn = (image) => page.evaluate(async (image) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${image}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let dark = 0, brown = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 60 && data[i + 1] < 60 && data[i + 2] < 60) dark++;
      if (Math.abs(data[i] - 107) < 20 && Math.abs(data[i + 1] - 58) < 20 && Math.abs(data[i + 2] - 30) < 20) brown++;
    }
    return { width: bitmap.width, height: bitmap.height, corner: data[0], dark, brown };
  }, image);
  await library(page, { pieces });
  const icons = async (text) => t.row(text).first().getByRole("button", { name: "Download PDF", exact: true }).count();
  check("every song gets a download, and scales don't", (await icons("Hot Cross Buns")) === 1 && (await icons("Mine: a tune")) === 1 && (await icons("D (Ré) major")) === 0);

  const ode = await fetchPdf("Ode to Joy", "pieces-ode.pdf");
  check("the file is named after the song", ode.name === "Ode to Joy.pdf", ode.name);
  check("it's one A4 page", ode.raw.startsWith("%PDF-") && ode.pages === 1 && ode.raw.includes("/MediaBox [0 0 595 842]"));
  const ink = await inkOn(ode.images[0]);
  check("the page holds the music on white paper", ink.width === 2380 && ink.height === 3368 && ink.corner > 250 && ink.dark > 5000, JSON.stringify(ink));
  check("and the note names", ink.brown > 500, `${ink.brown}`);
  if (process.platform === "darwin") {
    execFileSync("sips", ["-s", "format", "png", OUT + "pieces-ode.pdf", "--out", OUT + "pieces-ode.png"], { stdio: "ignore" });
    check("a real PDF reader opens it", existsSync(OUT + "pieces-ode.png"));
  }

  const short = await fetchPdf("Mine: a tune", "pieces-mine.pdf");
  check("a custom song downloads too", short.pages === 1 && short.name.endsWith(" a tune.pdf"), short.name);
  const long = await fetchPdf("Long one", "pieces-long.pdf");
  check("a long song runs over several pages", long.pages >= 2 && long.images.length === long.pages, `${long.pages} pages`);
  check("with music on the last one", (await inkOn(long.images.at(-1))).dark > 5000);

  await library(page, { pieces, settings: { toggles: { fingers: false, noteNames: false, letterNames: false, staff: true, grid: true } } });
  const plain = await fetchPdf("Ode to Joy", "pieces-plain.pdf");
  const plainInk = await inkOn(plain.images[0]);
  check("with the labels off in Practice, the sheet is plain", plainInk.dark > 5000 && plainInk.brown === 0, JSON.stringify(plainInk));
  notProblems(s);
  await s.close();
}

flow("The sheet in Practice: bars, and labels that stay with their line");
{
  const s = await open(WAV);
  const { page } = s;
  await seed(page, { settings: { optionsOpen: true }, pieces: [] });
  await nav(page, "Practice"); await sleep(300);
  // Three between the four bars of D major, and one at each end of the staff.
  const barLines = await page.locator(".staff .vf-stavebarline").count();
  check("a scale is written in bars, on the staff", barLines === 5, `${barLines}`);
  check("and with heavier lines on the lanes", await canvasHasColor(page, 0x5a, 0x4e, 0x42));

  // Reads the open sheet in its own units. Noteheads are font text, whose boxes are far taller than what shows, so they're sized by hand.
  const collisions = () => page.evaluate(() => {
    const svg = document.querySelector(".staff svg");
    const labels = [...svg.querySelectorAll(":scope > text")].map((text) => {
      const x = Number(text.getAttribute("x")), y = Number(text.getAttribute("y")), size = Number(text.getAttribute("font-size")), { width } = text.getBBox();
      return { left: x - width / 2, right: x + width / 2, top: y - 0.75 * size, bottom: y + 0.1 * size };
    });
    const lines = [...svg.querySelectorAll(".vf-stem, .vf-beam")].map((part) => { const { x, y, width, height } = part.getBBox(); return { left: x, right: x + width, top: y, bottom: y + height }; });
    const heads = [...svg.querySelectorAll(".vf-notehead text")].map((head) => { const x = Number(head.getAttribute("x")), y = Number(head.getAttribute("y")); return { left: x, right: x + 12, top: y - 5, bottom: y + 5 }; });
    const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    let onNotes = 0, onLabels = 0;
    labels.forEach((label, index) => {
      for (const part of [...lines, ...heads]) if (hit(label, part)) onNotes++;
      for (const other of labels.slice(index + 1)) if (hit(label, other)) onLabels++;
    });
    return { labels: labels.length, onNotes, onLabels };
  });
  const lowThenLeaps = [
    note("G3", 2, { finger: "0" }), note("A3", 2, { finger: "1" }), note("E4", 4, { finger: "1" }), note("E4", 4, { finger: "1" }), note("E4", 4, { finger: "1" }), note("E4", 4, { finger: "1" }), note("E4", 4, { finger: "1" }),
    note("D4", 0.5, { finger: "0" }), note("D5", 0.5, { finger: "3" }), note("D4", 0.5, { finger: "0" }), note("D5", 0.5, { finger: "3" }), note("E4", 2, { finger: "1" }),
  ];
  await seed(page, { settings: { staffOpen: true, optionsOpen: true }, pieces: [custom("leaps", "Low then leaps", lowThenLeaps)] });
  await nav(page, "Practice"); await sleep(300);
  const choices = await page.locator(".piece-menu button[value]").evaluateAll((items) => items.map((item) => [item.value, item.textContent]));
  const titles = choices.filter(([, title]) => title !== "Low then leaps");
  const total = { labels: 0, onNotes: 0, onLabels: 0 };
  for (const [id, title] of titles) {
    await pickPiece(page, id); await sleep(200);
    const found = await collisions();
    for (const key of Object.keys(total)) total[key] += found[key];
    if (found.onNotes || found.onLabels) console.log(`  ${title}:`, found);
  }
  check(`no finger or name touches a note on any of the ${titles.length} scales and songs`, total.labels > 500 && total.onNotes === 0, JSON.stringify(total));
  check("or another label", total.onLabels === 0);
  await pickPiece(page, "leaps"); await sleep(200);
  const leaps = await collisions();
  check("a low line above a line of leaps doesn't run labels together", leaps.labels > 0 && leaps.onLabels === 0, JSON.stringify(leaps));
  notProblems(s);
  await s.close();
}

flow("The buttons on a row");
const rowSizes = async (page, t, label, drawn, tap) => {
  const pieces = [custom("mine", "My tune", [note("D4", 1, { finger: "0" })])];
  await library(page, { pieces, settings: { highlighted: ["mine"] } });
  const sizes = await t.row("My tune").evaluate((row) => [...row.querySelectorAll(".icon-button")].map((control) => {
    const box = control.getBoundingClientRect(), shown = control.querySelector("svg").getBoundingClientRect();
    return { shown: `${shown.width}x${shown.height}`, tall: box.height, wide: box.width };
  }));
  check(`${label}: five controls`, sizes.length === 5);
  check(`${label}: drawn at ${drawn} px`, sizes.every(({ shown }) => shown === `${drawn}x${drawn}`), sizes.map(({ shown }) => shown).join());
  check(`${label}: tapped at ${tap} px`, sizes.every(({ tall, wide }) => tall === tap && wide >= tap), sizes.map(({ wide, tall }) => `${wide}x${tall}`).join());
  const answers = await t.row("My tune").evaluate((row) => [...row.querySelectorAll(".icon-button")].every((control) => {
    control.scrollIntoView({ block: "center" });
    const box = control.getBoundingClientRect();
    return [[box.left + 4, box.top + 4], [box.right - 4, box.top + 4], [box.left + 4, box.bottom - 4], [box.right - 4, box.bottom - 4]].every(([x, y]) => control.contains(document.elementFromPoint(x, y)));
  }));
  check(`${label}: the whole tap area answers`, answers);
  await auditCheck(page, `${label}: Library rows`, ".library");
};
{
  const s = await open(WAV);
  await rowSizes(s.page, tools(s.page), "Mouse", 20, 28);
  await s.page.locator(".library > div").nth(1).screenshot({ path: OUT + "pieces-rows-mouse.png" });
  notProblems(s);
  await s.close();
}

for (const [label, width, height] of [["iPhone size", 393, 852], ["Small phone", 320, 640]]) {
  flow(`${label}, by touch`);
  const s = await open(WAV, undefined, { viewport: { width, height }, hasTouch: true, isMobile: true });
  const { page } = s;
  const t = tools(page, (locator) => locator.tap());
  await rowSizes(page, t, label, 18, 32);
  await page.locator(".library > div").nth(1).screenshot({ path: `${OUT}pieces-rows-${width}.png` });

  await library(page, { pieces: [custom("mine", "My tune", [note("D4", 1, { finger: "0" })])] });
  await t.title.fill("By touch");
  await t.blank().scrollIntoViewIfNeeded();
  await t.blank().tap({ position: { x: 20, y: G4_Y } });
  await sleep(150);
  check(`${label}: a tap places a note`, (await t.names()) === "Sol", await t.names());
  const session = await s.context.newCDPSession(page);
  await t.sheetOf(0).scrollIntoViewIfNeeded();
  const sheet = await t.sheetOf(0).boundingBox();
  const touchAt = (type, y) => session.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: sheet.x + 20, y }] });
  await touchAt("touchStart", sheet.y + G4_Y);
  for (let step = 1; step <= 4; step++) { await touchAt("touchMove", sheet.y + G4_Y - step * STEP_PX); await sleep(40); }
  await touchAt("touchEnd");
  await sleep(100);
  check(`${label}: a finger drags it, right through the redraws`, (await t.names()) === "Ré", await t.names());
  await t.nameOf(0).tap(); await sleep(100);
  check(`${label}: a tap on the name sharpens it`, (await t.names()) === "Ré♯", await t.names());
  await t.beatsOf(0).selectOption("4"); await sleep(100);
  for (const beats of [0.5, 0.5, 0.5, 0.5, 2]) {
    await t.blank().scrollIntoViewIfNeeded();
    await t.blank().tap({ position: { x: 20, y: G4_Y } }); await sleep(100);
    const last = (await page.locator(".editor-column[data-index]").count()) - 1;
    await t.beatsOf(last).selectOption(String(beats)); await sleep(100);
  }
  await auditCheck(page, `${label}: a staff of quick notes`, ".piece-editor");

  await t.save.scrollIntoViewIfNeeded();
  await t.save.tap(); await sleep(150);
  await openDrawers(page); // A fourth song of your own goes in a new drawer.
  check(`${label}: it saves`, (await t.stored()).length === 2);
  await t.trash("By touch").tap(); await t.modal.waitFor();
  await auditCheck(page, `${label}: the question`, "dialog[open]");
  await page.screenshot({ path: `${OUT}pieces-question-${width}.png` });
  await page.touchscreen.tap(4, 4); await sleep(150);
  check(`${label}: a tap outside keeps the song`, (await t.stored()).length === 2 && (await t.closed()));
  await t.trash("By touch").tap(); await t.modal.waitFor();
  await t.say("Delete");
  check(`${label}: and Delete removes it`, (await t.stored()).length === 1);
  await t.pencil("My tune").tap(); await sleep(250);
  check(`${label}: the pencil opens the editor`, (await t.heading()) === "Edit piece");
  await auditCheck(page, `${label}: editing`);
  notProblems(s);
  await s.close();
}
