// The Calendar: a month of practice, a day's plan with its targets, copying a plan to another day, and what was practised.
import { wav, rest } from "./wav.mjs";
import { open, nav, sleep, check, seed, OUT, setLanguage } from "./lib.mjs";

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
// A planned piece's minutes against its target, and how far its bar has filled.
const target = (name) => cell(name).locator(".plan-target").innerText();
const minus = (name) => cell(name).locator(".plan-minus");
const progress = (name) => cell(name).locator(".plan-bar > span").evaluate((fill) => fill.style.width);
const toolsShown = () => page.locator(".day-plan .plan-add").evaluate((row) => [...row.children].filter((child) => child.offsetParent).map((child) => child.ariaLabel || child.textContent).join());
const pickDay = (offset) => page.locator(".calendar-day:not(.other-month)").filter({ has: page.locator(".calendar-date", { hasText: new RegExp(`^${new Date(Date.now() + offset * 864e5).getDate()}$`) }) }).first().click();

// The month, and today
check("opens on today's month, with today's minutes on its tile", (await page.locator(".calendar-day.today .calendar-minutes").innerText()) === "20 min");
const blocks = await page.locator(".calendar-day.today .plan-blocks i").evaluateAll((items) => items.map((item) => item.className || "empty"));
check("and its plan as a block a piece: one done, one halfway, one not started", blocks.join() === "full,half,empty", blocks.join());
const order = await page.evaluate(() => { const day = document.querySelector(".day-details"), [date, plan, total] = [".day-title", ".day-plan", ".day-total"].map((selector) => day.querySelector(selector)); return Boolean(date.compareDocumentPosition(plan) & 4 && plan.compareDocumentPosition(total) & 4); });
check("the day reads: its date, the plan, then what was practised", order);
check("with how much of its plan is done", (await page.locator(".day-summary").innerText()) === "1 of 3 planned done");
check("the plan has +, Copy plan and Clear plan under it", (await toolsShown()) === "Add a piece to the plan,Copy plan,Clear plan", await toolsShown());

// Targets and progress
check("each planned piece shows how far it's got against its target", (await target("D (Ré) major")) === "Done, 10 min" && (await target("Hills and Dales")) === "20 min" && (await target("Twinkle")) === "", `${await target("D (Ré) major")} | ${await target("Hills and Dales")}`);
check("its bar fills to match", (await progress("D (Ré) major")) === "100%" && (await progress("Hills and Dales")) === "50%" && (await progress("Twinkle")) === "0%", `${await progress("D (Ré) major")} ${await progress("Hills and Dales")} ${await progress("Twinkle")}`);
check("the plan adds up its targets", (await page.locator(".plan-total").innerText()) === "20 of 30 min");
check("a row a piece, with no − to begin with", (await page.locator(".plan-item").count()) === 3 && !(await minus("Hills and Dales").isVisible()));
await piece("Twinkle").click();
check("tapping a piece gives it a minute, and offers a −", (await target("Twinkle")) === "1 min" && (await minus("Twinkle").isVisible()));
await piece("Twinkle").click(); await piece("Twinkle").click();
check("each tap steps up: 2, then 3", (await target("Twinkle")) === "3 min");
await minus("Twinkle").click();
check("the − steps back down", (await target("Twinkle")) === "2 min" && (await page.locator(".plan-total").innerText()) === "20 of 32 min");
await sleep(5300);
check("the − goes 5 seconds after the last tap", !(await minus("Twinkle").isVisible()));
// From 2 minutes: 3, 5, then fives from 10 to an hour, thirteen taps, and one more past it.
for (let tap = 0; tap < 14; tap++) await piece("Twinkle").click();
check("past an hour it goes back to no target", (await target("Twinkle")) === "");
await piece("Twinkle").click(); await piece("Twinkle").click();
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("settings")));
check("targets are saved, and remembered for the piece", saved.planTargets[Object.keys(saved.plan)[0]]["twinkle-twinkle"] === 2 && saved.lastTargets["twinkle-twinkle"] === 2, JSON.stringify(saved.planTargets));

// What was practised, added up
const hills = (await page.locator(".day-piece", { hasText: "Hills and Dales" }).locator("li .info-chip").allInnerTexts()).join(" · ");
check("a piece's runs are summed into one line of chips", hills.startsWith("2 runs, 10.0 min · Score: 60% · 60 hit, 40 missed"), hills);

// Copying to tomorrow, and adding from the menu
await page.locator('.day-plan button:text-is("Copy plan")').click();
await pickDay(1); await sleep(150);
check("another day offers paste, after +", (await toolsShown()) === "Add a piece to the plan,Paste plan (3)", await toolsShown());
await page.locator('button:text-is("Paste plan (3)")').click(); await sleep(150);
check("paste starts picking days: each from today on shows a +, and paste is pressed, offering to finish", (await page.locator(".calendar-day.pickable").count()) > 1 && (await page.locator('button:text-is("Done pasting")').getAttribute("aria-pressed")) === "true");
await pickDay(1); await sleep(150);
check("pasting brings the pieces and their targets", (await page.locator(".plan-item").count()) === 3 && (await target("D (Ré) major")) === "10 min" && (await target("Twinkle")) === "2 min");
const picked = await page.locator(".calendar-day.selected .calendar-date").innerText();
await pickDay(2); await sleep(150);
check("each day tapped is pasted into and ticked, and the day picked stays", (await page.locator(".calendar-day.pasted").count()) === 2 && (await page.locator(".calendar-day.selected .calendar-date").innerText()) === picked);
await page.locator('button:text-is("Done pasting")').click(); await sleep(150);
check("paste again ends picking", (await page.locator(".calendar-day.pickable, .calendar-day.pasted").count()) === 0 && (await page.locator('button:text-is("Paste plan (3)")').getAttribute("aria-pressed")) === "false");
await page.locator(".plan-add .piece-select").click();
check("the add menu stars highlighted pieces", (await page.locator(".plan-add .piece-menu button.highlighted").allInnerTexts()).join() === "Hills and Dales");
await page.locator(".plan-add .piece-menu button[value='ode-to-joy']").evaluate((item) => item.click()); await sleep(150);
check("picking one adds it", (await page.locator(".plan-item").count()) === 4);
await cell("Ode to Joy").locator(".plan-remove").click(); await sleep(150);
check("its ✕ takes it off", (await page.locator(".plan-item").count()) === 3);
await page.locator(".day-clear-plan").click(); await page.locator("dialog[open]").waitFor();
check("Clear plan asks first", (await page.locator("dialog[open]").innerText()).includes("Take every piece off this day's plan"));
await page.locator("dialog[open]").getByRole("button", { name: "Clear plan", exact: true }).click(); await sleep(150);
check("and then takes every piece off", (await page.locator(".plan-item").count()) === 0 && (await page.locator(".plan-empty").innerText()) === "Nothing planned.");

// Past days
await pickDay(-1); await sleep(150);
check("a past day can't be planned", (await page.locator(".plan-add .piece-select").count()) === 0 && (await page.locator(".plan").count()) === 0);

// Today's plan in Practice
await nav(page, "Practice"); await sleep(300);
// In the sidebar under Practice: a row a piece, its minutes against its target and a thin bar, the open piece marked.
const rows = () => page.locator(".today-plan .plan-row").evaluateAll((items) => items.map((item) => `${item.querySelector(".plan-name").textContent} ${item.querySelector(".plan-minutes").textContent}${item.ariaPressed === "true" ? "*" : ""}`).join(" | "));
check("Practice shows today's plan in the sidebar, with how many pieces are done", (await page.locator(".today-plan").isVisible()) && (await page.locator(".today-plan .plan-head").innerText()).includes("1 of 3 done") && (await rows()) === "D (Ré) major Done* | Hills and Dales 10/20 min | Twinkle Twinkle Little Star 0/2 min", await rows());
await page.locator(".plan-row", { hasText: "Hills and Dales" }).click(); await sleep(300);
check("picking a row opens that piece", (await page.locator(".practice-title h1").innerText()) === "Hills and Dales" && (await rows()).includes("Hills and Dales 10/20 min*"), await rows());
const bar = await page.locator(".plan-row", { hasText: "Hills and Dales" }).locator(".plan-bar > span").evaluate((fill) => fill.style.width);
check("its bar is half filled", bar === "50%", bar);
await page.click('button[aria-label="Fullscreen"]'); await sleep(200);
check("fullscreen leaves it out", await page.locator(".today-plan").isHidden());
await page.click('button[aria-label="Exit fullscreen"]'); await sleep(200);
await nav(page, "Calendar"); await sleep(250);

await setLanguage(page, "PT");
await page.locator("header > nav > button").nth(3).click(); await sleep(250);
check("pt: translated", (await page.locator(".plan-total").innerText()) === "20 de 32 min" && (await page.locator('button:text-is("Copiar plano")').count()) === 1 && (await page.locator('.title-tools button:text-is("Hoje")').count()) === 1);
check("no page errors", s.problems.length === 0, s.problems.join(" | "));
await s.close();

// A past day's plan can be copied, and pasted from there. Picking, a day with a plan has a trash that clears it, and a
// tap anywhere else on a day pastes.
{
  const s = await open(OUT + "calendar-silent.wav");
  const { page } = s;
  await seed(page, { settings: { plan: { [key(-1)]: ["d-major-1oct", "twinkle-twinkle"], [key(1)]: ["ode-to-joy"], [key(2)]: ["a-major-1oct"] } } });
  await nav(page, "Calendar"); await sleep(300);
  const day = (offset) => page.locator(".calendar-day:not(.other-month)").filter({ has: page.locator(".calendar-date", { hasText: new RegExp(`^${new Date(Date.now() + offset * 864e5).getDate()}$`) }) }).first();
  await day(-1).click(); await sleep(150);
  await page.locator('button:text-is("Copy plan")').click(); await sleep(100);
  check("a past day's plan can be copied, and pasting starts from there", (await page.locator('button:text-is("Paste plan (2)")').count()) === 1);
  await page.locator('button:text-is("Paste plan (2)")').click(); await sleep(150);
  check("picking, each day with a plan from today on has a trash", (await page.locator(".day-clear").count()) === 2);
  await page.locator(".calendar-cell").first().locator(".day-clear").click(); await sleep(150);
  await day(2).click({ position: { x: 20, y: 15 } }); await sleep(150);
  const plans = await page.evaluate(() => JSON.parse(localStorage.getItem("settings")).plan);
  check("its trash clears a day's plan, and a tap elsewhere pastes", plans[key(1)] === undefined && plans[key(2)].join() === "a-major-1oct,d-major-1oct,twinkle-twinkle", JSON.stringify(plans));
  // Today, from another month: back to this month, with today picked.
  await page.locator('button:text-is("Done pasting")').click(); await sleep(100);
  await page.locator('button[aria-label="Next month"]').click(); await page.locator('button[aria-label="Next month"]').click(); await sleep(100);
  await page.locator('.title-tools button:text-is("Today")').click(); await sleep(150);
  check("Today goes back to this month, with today picked", (await page.locator(".calendar-day.today.selected").count()) === 1);
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}
