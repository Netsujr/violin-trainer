// Pieces you make yourself: writing one on Add piece's staff, editing it, saving it as a PDF, and the questions asked
// before anything is lost. Also the size of the buttons on a Library card, and the bars and labels on the sheet.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { wav, rest } from "./wav.mjs";
import { answer, auditCheck, canvasHasColor, cardOf, check, nav, open, showGroup, OUT, pickPiece, progress, seed, sleep, setLanguage } from "./lib.mjs";

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

// The Library's My songs, with these saved pieces and this on Add piece's staff.
async function library(page, { pieces = [], draft = { title: "", notes: [] }, settings } = {}) {
  await page.evaluate((draft) => localStorage.setItem("pieceDraft", JSON.stringify(draft)), draft);
  await seed(page, { settings, pieces });
  await nav(page, "Library");
  await showGroup(page, "My songs");
  await sleep(200);
}
// Add piece, opened from Library's +, with these saved pieces and this on its staff.
async function editor(page, options) {
  await library(page, options);
  await page.click('.library button[aria-label="Add piece"]');
  await sleep(200);
}

function tools(page, press = (locator, options) => locator.click(options)) {
  const row = (text) => page.locator(".piece", { hasText: text });
  const say = async (label) => { await press(page.locator("dialog[open]").getByRole("button", { name: label, exact: true })); await sleep(100); };
  return {
    press,
    row,
    say,
    modal: page.locator("dialog[open]"),
    title: page.locator('input[aria-label="Title"]'),
    save: page.locator('.title-tools button:text-is("Save piece")'),
    clear: (label = "Clear") => page.locator(`.title-tools button:text-is("${label}")`),
    back: () => press(page.locator(".add-piece .title-row .icon-only")),
    pencil: (text) => row(text).getByRole("button", { name: "Edit", exact: true }),
    trash: (text) => row(text).getByRole("button", { name: "Delete", exact: true }),
    // A card's PDF button, from whichever group holds it.
    download: async (text) => (await cardOf(page, text)).getByRole("button", { name: "PDF", exact: true }),
    blank: () => page.locator(".editor-column.blank .editor-sheet").first(),
    sheetOf: (index) => page.locator(`.editor-column[data-index="${index}"] .editor-sheet`),
    // Picks a note out for the note tools, with a press low on its sheet, well away from the note, so it doesn't move.
    pick: async (index) => { await press(page.locator(`.editor-column[data-index="${index}"] .editor-sheet`), { position: { x: 4, y: 185 } }); await sleep(60); },
    tool: (text) => page.locator(`.note-tools button:text-is("${text}")`),
    // A note's length, in the note tools, by its label: ½, 1, 1½, 2, 3 or 4.
    beatsButton: (label) => page.locator(`.note-tools [aria-label="Beats"] button:text-is("${label}")`),
    heading: () => page.locator(".add-piece h1").textContent(),
    // The notes' names, as each shows on hover, and their lengths, as the staff keeps them.
    names: () => page.$$eval(".editor-column[title]", (columns) => columns.map((column) => column.title).join()),
    beats: async () => (await page.evaluate(() => JSON.parse(localStorage.getItem("pieceDraft")).notes.map((note) => note.beats).join())),
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
  await editor(page);
  check("Save starts off", await t.save.isDisabled());
  check("so does Clear, with nothing to clear", await t.clear().isDisabled());

  const beatNumbers = await page.$$eval(".editor-row:first-child .editor-column text", (numbers) => numbers.map((number) => number.textContent).join());
  check("a blank staff already shows its bars, counted in beats", beatNumbers.startsWith("1,2,3,4,1,2,3,4"), beatNumbers);
  check("with bar lines", (await page.locator('.editor-row:first-child line[stroke="#6f7a8d"]').count()) >= 2);

  await t.blank().scrollIntoViewIfNeeded();
  const box = await t.blank().boundingBox();
  await page.mouse.move(box.x + 20, box.y + G4_Y);
  await sleep(50);
  check("hovering shows where a note would go", (await page.locator(".editor-column.blank svg ellipse").count()) === 1);
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

  check("the note placed is picked out, and the note tools name it", (await page.locator(".editor-column.selected").count()) === 1 && (await page.locator(".selected-note").innerText()) === "Sol (G), bar 1");
  const accidentals = [];
  for (const label of ["♯ Sharp", "♭ Flat", "Natural"]) { await t.tool(label).click(); await sleep(60); accidentals.push(await t.names()); }
  check("the note tools set sharp, flat and natural", accidentals.join() === "Sol♯,Sol♭,Sol", accidentals.join());

  await t.beatsButton("2").click();
  await t.blank().click({ position: { x: 20, y: D5_Y } });
  await sleep(100);
  check("the next click lands after it", (await t.names()) === "Sol,Ré" && (await t.beats()) === "2,1");
  const inBar = await page.$$eval('.note-tools [aria-label="Beats"] button:disabled', (buttons) => buttons.map((button) => button.textContent).join());
  check("lengths that don't fit the bar can't be picked", inBar === "3,4", inBar);

  await t.pick(0);
  check("a press on a note picks it out", (await page.locator(".selected-note").innerText()) === "Sol (G), bar 1");
  await page.locator('.note-tools button[aria-label="Delete note"]').click();
  await sleep(100);
  check("and its bin removes just that note, leaving nothing picked", (await t.names()) === "Ré" && (await t.tool("Hear this line").isHidden()));

  await t.title.fill("On the staff");
  await page.reload();
  await page.waitForSelector("nav button");
  await nav(page, "Library");
  await page.click('.library button[aria-label="Add piece"]');
  await sleep(200);
  check("a reload keeps what's on the staff", (await t.names()) === "Ré" && (await t.title.inputValue()) === "On the staff");

  await t.save.click();
  await sleep(150);
  const saved = (await t.stored()).at(-1);
  check("Save keeps the note, with a fingering", saved.title === "On the staff" && saved.notes[0].pitch === "D5" && saved.notes[0].finger !== undefined, JSON.stringify(saved.notes));
  check("then goes back to My songs, the staff and title blank", (await page.locator(".library h1").innerText()) === "My songs" && (await t.draft()).notes.length === 0 && (await t.draft()).title === "");
  await t.row("On the staff").getByRole("button", { name: "Practise", exact: true }).click();
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
  await editor(page, { draft: { title: "", notes: lengths(2, 0.5, 0.5, 1) } });
  check("a quick note gets a whole beat's room, a long one more", (await t.widths()).slice(0, 4).join() === "144,72,72,72", (await t.widths()).join());

  await editor(page, { draft: { title: "", notes: lengths(1, 1, 1, 1) } });
  const place = () => page.$$eval(".editor-column[data-index]", (columns) => columns.map((column) => column.getBoundingClientRect().left));
  const before = await place();
  await t.pick(0);
  await t.beatsButton("4").click();
  await sleep(100);
  const after = await place();
  check("a note made longer pushes the next ones along", after[1] - before[1] === 216 && (await t.widths())[0] === 288, `${after[1] - before[1]}`);

  await editor(page, { draft: { title: "", notes: lengths(2, 1, 0.5) } });
  await t.blank().click({ position: { x: 20, y: G4_Y } });
  await sleep(100);
  check("a note with half a beat left starts at ½", (await t.draft()).notes.at(-1).beats === 0.5, JSON.stringify((await t.draft()).notes.at(-1)));
  check("and a full bar leaves a fresh one to write in", (await t.blank().count()) === 1);

  const eighths = Array.from({ length: 32 }, () => 0.5);
  await editor(page, { draft: { title: "", notes: lengths(...eighths) } });
  const rows = await page.$$eval(".editor-row", (list) => list.map((row) => row.getBoundingClientRect().right));
  const room = await page.locator(".editor-rows").evaluate((rows) => rows.getBoundingClientRect().right);
  check("wide bars wrap into rows, inside the page", rows.length > 1 && rows.every((right) => right <= room + 1), `${rows.length} rows`);
  await auditCheck(page, "A long staff", ".piece-editor");

  await editor(page, { draft: { title: "Over", notes: lengths(1, 1, 0.5, 0.5, 1) } });
  check("a bar that fits has no warning", (await page.locator(".piece-editor .warning").textContent()) === "" && (await t.save.isEnabled()));
  await t.pick(0);
  await t.beatsButton("1½").click();
  await sleep(100);
  check("a push over the bar line turns the note red, and shows the overflow", (await page.locator(".editor-column.crosses-bar").count()) === 1 && (await page.locator(".editor-column.spill").count()) === 1);
  check("it explains, and Save waits", (await page.locator(".piece-editor .warning").textContent()).includes("Each bar holds 4 beats") && (await t.save.isDisabled()));
  await t.beatsButton("1").click();
  await sleep(100);
  check("fixing it clears all that", (await page.locator(".editor-column.crosses-bar").count()) === 0 && (await t.save.isEnabled()));
  notProblems(s);
  await s.close();
}

flow("Hearing a line of the staff");
{
  const s = await open(WAV);
  const { page } = s;
  const t = tools(page);
  await editor(page);
  const play = page.locator(".note-tools .editor-play");
  check("with no note picked, there's no line to hear", await play.isHidden());

  // Two beats at 120 BPM: a second.
  await editor(page, { draft: { title: "", notes: lengths(1, 1) }, settings: { bpm: 120 } });
  await t.pick(0);
  check("a note picked can hear its line", (await play.innerText()) === "Hear this line");
  await play.click();
  check("pressing it plays the line, and it becomes Stop", (await play.innerText()) === "Stop");
  await sleep(1500);
  check("it goes back once the line has played", (await play.innerText()) === "Hear this line");
  await play.click();
  await play.click();
  check("pressing Stop stops it", (await play.innerText()) === "Hear this line");
  notProblems(s);
  await s.close();
}

flow("Rests");
{
  const s = await open(WAV);
  const { page } = s;
  const t = tools(page);
  await editor(page, { draft: { title: "Breath", notes: [] } });
  const addRest = t.tool("Add a rest");
  check("the note tools always have Add a rest", await addRest.isVisible());
  await addRest.click();
  await sleep(100);
  const rest = page.locator(".editor-column.rest");
  check("it adds a rest of one beat, picked out and named as one, with its length to pick", (await rest.count()) === 1 && (await page.locator(".selected-note").innerText()) === "Rest, bar 1" && (await t.beats()) === "1", await t.beats());
  check("a rest has no sharp or flat", await t.tool("♯ Sharp").isHidden());
  check("drawn with the rest sign", (await rest.locator(".vf-stavenote").textContent()).includes("\uE4E5"));
  check("rests alone can't be saved", await t.save.isDisabled());
  await t.blank().click({ position: { x: 20, y: G4_Y } });
  await sleep(100);
  check("after a note they can", !(await t.save.isDisabled()));
  await t.save.click();
  await sleep(200);
  const saved = (await t.stored()).find((piece) => piece.title === "Breath");
  check("the rest is kept with no pitch, string or finger", JSON.stringify(saved?.notes) === JSON.stringify([{ beats: 1 }, note("G4", 1, { string: "D", finger: "3" })]), JSON.stringify(saved?.notes));
  check("and isn't counted as a note", (await t.row("Breath").textContent()).includes("1 note"));

  await seed(page, { pieces: [custom("breath", "Breath", [note("D4", 3, { string: "D", finger: "0" }), { beats: 1 }, note("E4", 4, { string: "D", finger: "1" })])] });
  await nav(page, "Practice");
  await sleep(300);
  await pickPiece(page, "breath");
  await sleep(200);
  check("Practice draws the rest on the staff", (await page.locator(".staff .vf-stavenote").nth(1).textContent()).includes("\uE4E5"));
  check("and counts only the notes", (await progress(page)) === "Note 1 of 2", await progress(page));
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
  await page.reload(); await page.waitForSelector("nav button"); await nav(page, "Library"); await showGroup(page, "My songs"); await sleep(200);
  check("for good", (await t.row("My tune").count()) === 0);

  await editor(page, { pieces, draft: { title: "", notes: [note("D4", 1)] } });
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
  await nav(page, "Calendar"); // Today's recordings are under today, which it opens on.
  await page.locator(".recording-note").click();
  await page.locator("audio").waitFor({ state: "attached" });
  const hasTake = () => page.evaluate(async () => (await (await import("/src/storage.ts")).getRecording("take")) !== undefined);
  await page.click('.recording-actions button:text-is("Delete")'); await sleep(150);
  await answer(page, "Cancel");
  check("Delete asks, and Cancel keeps the recording", (await page.locator(".recording-note").count()) === 1 && (await hasTake()));
  await page.click('.recording-actions button:text-is("Delete")'); await sleep(150);
  await answer(page, "Delete"); await sleep(150);
  check("confirming removes it", (await page.locator("dialog[open]").count()) === 0 && (await page.locator("audio, .recording-note").count()) === 0 && !(await hasTake()));

  await nav(page, "Library"); await showGroup(page, "My songs"); await sleep(200);
  await setLanguage(page, "PT");
  await t.row("Other tune").getByRole("button", { name: "Excluir", exact: true }).click(); await t.modal.waitFor();
  const question = await t.modal.innerText();
  check("the question comes in Portuguese too", question.includes('Excluir "Other tune"?') && question.includes("Cancelar"), question.replaceAll("\n", " | "));
  await answer(page, "Cancelar");
  await setLanguage(page, "EN");
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
  const buttonsOn = (text) => t.row(text).first().evaluate((row) => [...row.querySelectorAll(".card-button")].map((button) => button.textContent).join());
  check("your own songs get Edit and Delete", (await buttonsOn("My tune")) === "Practise,PDF,Add track,Edit,Delete", await buttonsOn("My tune"));
  await showGroup(page, "Classic tunes");
  check("built-in songs don't", !(await buttonsOn("Ode to Joy")).includes("Edit") && !(await buttonsOn("Ode to Joy")).includes("Delete"));
  await showGroup(page, "My songs");

  await t.pencil("My tune").click(); await sleep(150);
  check("Edit opens Add piece, saying Edit piece", (await t.heading()) === "Edit piece", await t.heading());
  check("the title, notes and lengths come along", (await t.title.inputValue()) === "My tune" && (await t.names()) === "Ré,Lá,Si" && (await t.beats()) === "2,1,1", `${await t.names()} ${await t.beats()}`);
  await page.screenshot({ path: OUT + "pieces-editing.png" });

  await t.clear("Cancel").click(); await sleep(100);
  check("Cancel with no changes doesn't ask", !(await t.open()));
  check("and leaves a blank staff", (await t.heading()) === "Add piece" && (await t.names()) === "" && (await t.title.inputValue()) === "");
  await t.back(); await sleep(150);

  await t.pencil("My tune").click(); await sleep(150);
  await t.title.fill("My better tune");
  await t.pick(0); await t.beatsButton("1").click();
  await t.pick(2); await t.tool("♯ Sharp").click(); await sleep(100);
  await t.save.click(); await sleep(150);
  const changed = await savedMine();
  check("Save updates the song in place", (await t.stored()).length === 2 && changed.title === "My better tune" && changed.notes[0].beats === 1, JSON.stringify((await t.stored()).map((piece) => piece.title)));
  check("a note left alone keeps a hand-set finger", changed.notes[1].finger === "4" && changed.notes[1].string === "D", JSON.stringify(changed.notes[1]));
  check("a note given a new pitch gets a fresh fingering", changed.notes[2].pitch === "B#4" && changed.notes[2].finger !== "1" && changed.notes[2].finger !== undefined, JSON.stringify(changed.notes[2]));
  check("the staff goes back to adding", (await t.draft()).editingId === undefined && (await t.draft()).notes.length === 0);
  check("the highlight stays with the song", await t.row("My better tune").evaluate((card) => card.classList.contains("highlighted")));

  await t.row("My better tune").getByRole("button", { name: "Practise", exact: true }).click(); await sleep(300);
  check("Practice gets the changes", (await progress(page)) === "Note 1 of 3" && (await page.locator(".practice-title h1").innerText()) === "My better tune", await progress(page));
  await nav(page, "Library"); await sleep(200);

  await t.pencil("My better tune").click(); await sleep(150);
  await t.title.fill("After a reload");
  await page.reload(); await page.waitForSelector("nav button"); await nav(page, "Library"); await page.click('.library button[aria-label="Add piece"]'); await sleep(200);
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
  await t.back(); await sleep(150);
  await t.pencil("After a reload").click(); await t.modal.waitFor();
  check("Edit asks before replacing a draft", (await t.modal.innerText()).includes("Replace what's on the staff"));
  await answer(page, "Cancel");
  check("Cancel keeps the draft", (await t.draft()).title === "My draft" && (await page.locator(".library").count()) === 1);
  await t.pencil("After a reload").click(); await t.modal.waitFor();
  await answer(page, "Replace"); await sleep(150);
  check("Replace loads the song", (await t.heading()) === "Edit piece" && (await t.title.inputValue()) === "After a reload");

  await t.back(); await sleep(150);
  await t.pencil("Other tune").click(); await sleep(150);
  check("an unchanged edit moves to another song without asking", !(await t.open()) && (await t.title.inputValue()) === "Other tune");
  check("a note with no written length opens as 1 beat", (await t.beats()) === "1");
  await t.back(); await sleep(150);
  await t.trash("Other tune").click(); await t.modal.waitFor();
  await answer(page, "Delete");
  check("deleting the song being edited clears the staff", (await t.draft()).editingId === undefined && (await t.draft()).notes.length === 0 && (await t.stored()).length === 1);
  await page.reload(); await page.waitForSelector("nav button"); await nav(page, "Library"); await page.click('.library button[aria-label="Add piece"]'); await sleep(200);
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
    const button = await t.download(text);
    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
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
  const icons = async (text) => (await t.download(text)).count();
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
  check("and with heavier lines on the lanes", await canvasHasColor(page, 0x3a, 0x44, 0x56));

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

flow("The buttons on a card");
const cardSizes = async (page, t, label) => {
  const pieces = [custom("mine", "My tune", [note("D4", 1, { finger: "0" })])];
  await library(page, { pieces, settings: { highlighted: ["mine"] } });
  const buttons = await t.row("My tune").evaluate((row) => [...row.querySelectorAll(".card-button")].map((control) => ({ text: control.textContent, tall: control.getBoundingClientRect().height })));
  check(`${label}: five buttons, each with its word`, buttons.map(({ text }) => text).join() === "Practise,PDF,Add track,Edit,Delete", buttons.map(({ text }) => text).join());
  check(`${label}: each tall enough to tap`, buttons.every(({ tall }) => tall >= 38), buttons.map(({ tall }) => tall).join());
  const answers = await t.row("My tune").evaluate((row) => [...row.querySelectorAll(".card-button")].every((control) => {
    control.scrollIntoView({ block: "center" });
    const box = control.getBoundingClientRect();
    return [[box.left + 4, box.top + 4], [box.right - 4, box.top + 4], [box.left + 4, box.bottom - 4], [box.right - 4, box.bottom - 4]].every(([x, y]) => control.contains(document.elementFromPoint(x, y)));
  }));
  check(`${label}: the whole tap area answers`, answers);
  await auditCheck(page, `${label}: Library cards`, ".library");
};
{
  const s = await open(WAV);
  await cardSizes(s.page, tools(s.page), "Mouse");
  await s.page.locator(".piece-grid").screenshot({ path: OUT + "pieces-cards-mouse.png" });
  notProblems(s);
  await s.close();
}

for (const [label, width, height] of [["iPhone size", 393, 852], ["Small phone", 320, 640]]) {
  flow(`${label}, by touch`);
  const s = await open(WAV, undefined, { viewport: { width, height }, hasTouch: true, isMobile: true });
  const { page } = s;
  const t = tools(page, (locator) => locator.tap());
  await cardSizes(page, t, label);
  await page.locator(".piece-grid").screenshot({ path: `${OUT}pieces-cards-${width}.png` });

  await editor(page, { pieces: [custom("mine", "My tune", [note("D4", 1, { finger: "0" })])] });
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
  await t.tool("♯ Sharp").tap(); await sleep(100);
  check(`${label}: a tap on Sharp sharpens it`, (await t.names()) === "Ré♯", await t.names());
  await t.beatsButton("4").tap(); await sleep(100);
  // Each note placed is picked out, so its length is set straight away.
  for (const beats of ["½", "½", "½", "½", "2"]) {
    await t.blank().scrollIntoViewIfNeeded();
    await t.blank().tap({ position: { x: 20, y: G4_Y } }); await sleep(100);
    await t.beatsButton(beats).tap(); await sleep(100);
  }
  await auditCheck(page, `${label}: a staff of quick notes`, ".piece-editor");

  await t.save.scrollIntoViewIfNeeded();
  await t.save.tap(); await sleep(150);
  check(`${label}: it saves, back on My songs`, (await t.stored()).length === 2 && (await t.row("By touch").count()) === 1);
  await t.trash("By touch").tap(); await t.modal.waitFor();
  await auditCheck(page, `${label}: the question`, "dialog[open]");
  await page.screenshot({ path: `${OUT}pieces-question-${width}.png` });
  await page.touchscreen.tap(4, 4); await sleep(150);
  check(`${label}: a tap outside keeps the song`, (await t.stored()).length === 2 && (await t.closed()));
  await t.trash("By touch").tap(); await t.modal.waitFor();
  await t.say("Delete");
  check(`${label}: and Delete removes it`, (await t.stored()).length === 1);
  await t.pencil("My tune").tap(); await sleep(250);
  check(`${label}: Edit opens Add piece`, (await t.heading()) === "Edit piece");
  await auditCheck(page, `${label}: editing`);
  notProblems(s);
  await s.close();
}
