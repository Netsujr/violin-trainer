// The Calendar: a month of practice, a day's plan with its targets, copying a plan to another day, and what was practised.
import { wav, rest } from "./wav.mjs";
import { open, nav, sleep, check, seed, OUT } from "./lib.mjs";

wav(OUT + "calendar-silent.wav", [rest(2)]);
const key = (offset) => {
  const day = new Date();
  day.setDate(day.getDate() + offset);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
};
const at = (hour) => {
  const time = new Date();
  time.setHours(hour, 0, 0, 0);
  return time.toISOString();
};
const run = (id, pieceId, pieceTitle, hour, minutes, extra = {}) => ({ id, startedAt: at(hour), pieceId, pieceTitle, minutes, passes: 1, notesHit: 30, notesSkipped: 0, averageCents: 9, averagePassSeconds: 40, slowest: [], ...extra });

const s = await open(OUT + "calendar-silent.wav");
const { page } = s;
await seed(page, {
  settings: { highlighted: ["hills-and-dales"], plan: { [key(0)]: ["d-major-1oct", "hills-and-dales", "twinkle-twinkle"] }, planTargets: { [key(0)]: { "d-major-1oct": 10, "hills-and-dales": 20 } } },
  log: [run("a", "d-major-1oct", "D major", 9, 10), run("b", "hills-and-dales", "Hills and Dales", 10, 6, { passes: 0, notesHit: 40, notesSkipped: 10, score: 80 }), run("c", "hills-and-dales", "Hills and Dales", 11, 4, { passes: 0, notesHit: 20, notesSkipped: 30, score: 40 })],
});
await nav(page, "Calendar"); await sleep(300);
const cell = (name) => page.locator(".plan-item", { hasText: name });
const piece = (name) => cell(name).locator(".plan-piece");
const minus = (name) => cell(name).locator(".plan-minus");
const progress = (name) => cell(name).evaluate((item) => item.style.getPropertyValue("--progress"));
const pickDay = (offset) => page.locator(".calendar-day:not(.other-month)").filter({ has: page.locator(".calendar-date", { hasText: new RegExp(`^${new Date(Date.now() + offset * 864e5).getDate()}$`) }) }).first().click();

// The month, and today
check("opens on today's month, with today's minutes on its tile", (await page.locator(".calendar-day.today .calendar-minutes").innerText()) === "20′");
const order = await page.locator(".day-details > *").evaluateAll((parts) => parts.map((part) => part.className || part.tagName.toLowerCase()));
check("the day reads: heading, a line, the plan, a line, then what was practised", order.slice(0, 5).join() === "day-head,hr,h4,plan,hr" && order.includes("day-total"), order.join());
const tools = await page.locator(".day-head .plan-add").evaluate((row) => [...row.children].filter((child) => child.offsetParent).map((child) => child.ariaLabel || child.textContent).join());
check("the heading has copy and the add menu on its right", tools === "Copy plan,Add a piece to the plan", tools);

// Targets and progress
check("each planned piece shows its target, and how far it's got", (await piece("D (Ré) major").innerText()) === "✓ D (Ré) major (10 min)" && (await piece("Hills and Dales").innerText()) === "◐ Hills and Dales (20 min)" && (await piece("Twinkle").innerText()) === "○ Twinkle Twinkle Little Star");
check("its cell fills faintly to match", (await progress("D (Ré) major")) === "100%" && (await progress("Hills and Dales")) === "50%" && (await progress("Twinkle")) === "0%", `${await progress("D (Ré) major")} ${await progress("Hills and Dales")} ${await progress("Twinkle")}`);
check("the plan adds up its targets", (await page.locator(".plan-total").innerText()) === "20 of 30 min");
check("the table fills whole rows of three, with no − to begin with", (await page.locator(".plan-item").count()) === 3 && !(await minus("Hills and Dales").isVisible()));
await piece("Twinkle").click();
check("tapping a piece gives it 5 minutes, and offers a −", (await piece("Twinkle").innerText()) === "○ Twinkle Twinkle Little Star (5 min)" && (await minus("Twinkle").isVisible()));
await piece("Twinkle").click(); await piece("Twinkle").click();
check("each tap adds 5 more", (await piece("Twinkle").innerText()).endsWith("(15 min)"));
await minus("Twinkle").click();
check("the − takes 5 off", (await piece("Twinkle").innerText()).endsWith("(10 min)") && (await page.locator(".plan-total").innerText()) === "20 of 40 min");
await sleep(5300);
check("the − goes 5 seconds after the last tap", !(await minus("Twinkle").isVisible()));
// From 10 minutes: ten taps to an hour, and one more past it.
for (let tap = 0; tap < 11; tap++) await piece("Twinkle").click();
check("past an hour it goes back to no target", (await piece("Twinkle").innerText()) === "○ Twinkle Twinkle Little Star");
await piece("Twinkle").click(); await piece("Twinkle").click();
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("settings")));
check("targets are saved, and remembered for the piece", saved.planTargets[Object.keys(saved.plan)[0]]["twinkle-twinkle"] === 10 && saved.lastTargets["twinkle-twinkle"] === 10, JSON.stringify(saved.planTargets));

// What was practised, added up
const hills = (await page.locator(".day-piece", { hasText: "Hills and Dales" }).locator("li .info-chip").allInnerTexts()).join(" · ");
check("a piece's runs are summed into one line of chips", hills.startsWith("2 runs, 10.0 min · Score: 60% · 60 hit, 40 missed"), hills);

// Copying to tomorrow, and adding from the menu
await page.locator('button[aria-label="Copy plan"]').click();
await pickDay(1); await sleep(150);
const pasteTools = await page.locator(".day-head .plan-add").evaluate((row) => [...row.children].filter((child) => child.offsetParent).map((child) => child.ariaLabel || child.textContent).join());
check("another day offers paste, left of the rest", pasteTools === "Paste plan (3),Add a piece to the plan", pasteTools);
await page.locator('button[aria-label="Paste plan (3)"]').click(); await sleep(150);
check("pasting brings the pieces and their targets", (await page.locator(".plan-item:not(.empty)").count()) === 3 && (await piece("D (Ré) major").innerText()) === "○ D (Ré) major (10 min)" && (await piece("Twinkle").innerText()).endsWith("(10 min)"));
await page.locator(".plan-add .piece-select").click();
check("the add menu stars highlighted pieces", (await page.locator(".plan-add .piece-menu button.highlighted").allInnerTexts()).join() === "Hills and Dales");
await page.locator(".plan-add .piece-menu button[value='ode-to-joy']").evaluate((item) => item.click()); await sleep(150);
check("picking one adds it, filling the next row with empty cells", (await page.locator(".plan-item:not(.empty)").count()) === 4 && (await page.locator(".plan-item").count()) === 6);
await cell("Ode to Joy").locator(".plan-remove").click(); await sleep(150);
check("its ✕ takes it off", (await page.locator(".plan-item:not(.empty)").count()) === 3);

// Past days
await pickDay(-1); await sleep(150);
check("a past day can't be planned", (await page.locator(".plan-add .piece-select").count()) === 0 && (await page.locator(".plan").count()) === 0);

// Today's plan in Practice
await nav(page, "Practice"); await sleep(300);
const chips = () => page.locator(".today-chips .today-chip").evaluateAll((items) => items.map((item) => `${item.textContent}${item.ariaPressed === "true" ? "*" : ""}`).join(" | "));
check("Practice shows today's plan as chips, with no title", (await page.locator(".today-plan").isVisible()) && (await page.locator(".today-plan > summary").innerText()) === "" && (await chips()) === "✓ D (Ré) major · 10 min* | ◐ Hills and Dales · 20 min | ○ Twinkle Twinkle Little Star · 10 min", await chips());
await page.locator(".today-chip", { hasText: "Hills and Dales" }).click(); await sleep(300);
check("picking a chip opens that piece", (await page.locator(".piece-select").innerText()) === "Hills and Dales" && (await chips()).includes("Hills and Dales · 20 min*"));
await page.locator(".today-plan > summary").click(); await sleep(150);
const box = await page.locator(".today-plan").evaluate((drawer) => ({ open: drawer.open, text: drawer.querySelector("summary").textContent, progress: drawer.style.getPropertyValue("--progress"), filled: drawer.classList.contains("showing-progress") }));
check("closed, the drawer itself shows the open piece's progress", !box.open && box.text === "◐ Hills and Dales · 20 min" && box.progress === "50%" && box.filled, JSON.stringify(box));
await page.reload(); await page.waitForSelector("nav button"); await nav(page, "Practice"); await sleep(300);
check("and stays closed after a reload", !(await page.locator(".today-plan").evaluate((drawer) => drawer.open)));
await page.click('button[aria-label="Fullscreen"]'); await sleep(200);
check("fullscreen leaves it out", await page.locator(".today-plan").isHidden());
await page.click('button[aria-label="Exit fullscreen"]'); await sleep(200);
await nav(page, "Calendar"); await sleep(250);

await page.click('.language button:text-is("PT")'); await sleep(250);
await page.locator("nav button").nth(3).click(); await sleep(250);
check("pt: translated", (await page.locator(".plan-total").innerText()) === "20 de 40 min" && (await page.locator('button[aria-label="Copiar plano"]').count()) === 1);
check("no page errors", s.problems.length === 0, s.problems.join(" | "));
await s.close();
