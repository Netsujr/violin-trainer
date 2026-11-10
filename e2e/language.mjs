// Portuguese across the app, including what only appears with data in it.
import { wav, note } from "./wav.mjs";
import { open, nav, start, stop, sleep, check, seed, OUT } from "./lib.mjs";

wav(OUT + "l-a4.wav", [note(69, 4)]);
const today = new Date().toISOString();
const log = [{ id: "a", startedAt: today, pieceId: "d-major-1oct", pieceTitle: "D major", minutes: 3.2, passes: 2, notesHit: 30, notesSkipped: 1, averageCents: 12, averagePassSeconds: 21, slowest: [{ pitch: "F#4", seconds: 2.1 }] }, { id: "b", startedAt: today, pieceId: "free-play", pieceTitle: "Free play", minutes: 1, passes: 0, notesHit: 0, notesSkipped: 0, averageCents: null, averagePassSeconds: null, slowest: [] }];
const ENGLISH = /\b(the|string|strings|finger|fingers|notes?|pass|passes|hit|skipped|slowest|sessions?|week|planned|trends|storage|used|download|delete|recording|save|title|add|target|day|major|minor|octaves?|below|above|first|position|likely|listening|press|play|again|reference|skip|record|start|stop|settings|options|tolerance|hold|time|sensitivity|practice|library|listen|pattern|metronome|free)\b/i;
const everyText = (page) => page.evaluate(() => [document.body.innerText, ...[...document.querySelectorAll("[placeholder],[title],[aria-label]")].flatMap((element) => [element.getAttribute("placeholder"), element.getAttribute("title"), element.getAttribute("aria-label")])].filter(Boolean).join(" \n "));

const s = await open(OUT + "l-a4.wav");
const page = s.page;
await seed(page, { log, settings: { targetDays: { "d-major-1oct": 0 }, staffOpen: true } });
await page.click('.language button:text-is("PT")');
await sleep(250);

check("pt: the page says so", (await page.evaluate(() => document.documentElement.lang)) === "pt-BR");
check("pt: the title is translated", (await page.title()) === "Treinador de Notas para Violino");
check("pt: the choice is saved", await page.evaluate(() => JSON.parse(localStorage.getItem("settings")).language === "pt"));
await page.click("summary");
for (const [index, name] of ["Ouvir", "Praticar", "Biblioteca", "Registro"].entries()) {
  await page.locator("nav button").nth(index).click();
  await sleep(250);
  const text = await everyText(page);
  const found = text.match(ENGLISH);
  check(`pt: ${name} has no English left`, !found, found ? `"${found[0]}" in ${text.slice(Math.max(0, found.index - 40), found.index + 40).replaceAll("\n", " ")}` : "");
}
await page.click("summary");

await page.locator("nav button").nth(3).click();
await sleep(200);
const logText = await page.locator("section").innerText();
check("pt: log titles and numbers are translated", logText.includes("Ré maior") && logText.includes("Prática livre") && logText.includes("3,2 min") && logText.includes("2 passadas"), logText.slice(0, 80).replaceAll("\n", " "));
check("pt: saved logs keep the English title", await page.evaluate(() => JSON.parse(localStorage.getItem("log"))[0].pieceTitle === "D major"));

await page.locator("nav button").nth(1).click();
await sleep(250);
const staffLabels = await page.locator(".staff > svg > text").evaluateAll((texts) => texts.map((text) => text.textContent).join(" "));
check("pt: the staff labels use Portuguese names", staffLabels.includes("Fá♯") && staffLabels.includes("Dó♯"), staffLabels.slice(0, 50));
await page.locator(".patterns button").nth(1).click();
await sleep(100);

await page.locator("nav button").nth(0).click();
await sleep(150);
await page.locator('.listen button:text-is("Iniciar")').click();
await page.waitForSelector('button:text-is("Parar")');
await sleep(800);
const big = await page.locator(".big-note").innerText();
check("pt: Listen shows Portuguese names", big === "Lá4 / A4", big);
const position = await page.locator("section > p").first().innerText();
check("pt: the string is named in Portuguese", position === "Provavelmente corda Lá, dedo 0", position);
const hertz = await page.locator("section").innerText();
check("pt: a decimal comma", /\d+,\d Hz/.test(hertz));
await page.click('.language button:text-is("EN")');
await sleep(500);
check("switching language ends a running session", (await page.locator('.listen button:text-is("Start")').count()) === 1);
check("en: back to English", (await page.locator("nav button").first().innerText()) === "Listen");
const logged = await page.evaluate(() => JSON.parse(localStorage.getItem("log")).at(-1));
check("that session was logged", logged.pieceId === "free-play" && logged.minutes > 0, JSON.stringify(logged).slice(0, 80));
check("no page errors", s.problems.length === 0, s.problems.join(" | "));
await s.close();

{
  const pt = await open(OUT + "l-a4.wav", undefined, { locale: "pt-BR" });
  check("a Portuguese browser starts in Portuguese", (await pt.page.locator("nav button").first().innerText()) === "Ouvir");
  await pt.close();
}
{
  const en = await open(OUT + "l-a4.wav", undefined, { locale: "en-GB" });
  check("other browsers start in English", (await en.page.locator("nav button").first().innerText()) === "Listen");
  await en.close();
}
