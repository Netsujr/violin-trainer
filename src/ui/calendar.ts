import { t } from "../i18n";
import { dayKey, minutesByDay, monthGrid, piecesOn, planDone } from "../practice/calendar";
import { allPieces, getSettings, loadLog, saveSettings } from "../storage";
import { createDayPanel } from "./calendarDay";
import { pasteInto } from "./calendarPlan";
import { h, type Screen } from "./dom";
import { TRASH_ICON } from "./toggles";

const chevron = (path: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;

// A month of practice, with the day picked beside it: each day's minutes and its plan, and tapping a day shows what was
// practised then. Today and later days can be planned, with pieces to practise; a past day shows which of its planned
// pieces were practised.
export function calendarScreen(): Screen {
  const settings = getSettings();
  const entries = loadLog();
  const pieces = allPieces();
  const minutes = minutesByDay(entries);
  const today = dayKey(new Date());
  const shown = new Date();
  shown.setDate(1);
  let selected = today;
  // While a copied plan's being pasted: picking, each day from today on is tapped to paste into, and shows it's done.
  let picking = false;
  const pasted = new Set<string>();
  const urls: string[] = [];

  const monthTitle = h("h1", { className: "calendar-month" });
  const grid = h("div", { className: "calendar-grid", role: "grid" });
  const day = createDayPanel({ entries, pieces, urls, onChange: () => rerender(), onPaste: togglePicking });
  const renderDay = () => day.render(selected, today, picking);
  const planFor = (day: string) => settings.plan[day] ?? [];

  function moveMonth(by: number) {
    shown.setMonth(shown.getMonth() + by);
    renderMonth();
  }

  // Back to this month, with today picked.
  function goToday() {
    shown.setFullYear(new Date().getFullYear(), new Date().getMonth(), 1);
    selected = today;
    rerender();
  }

  function renderMonth() {
    monthTitle.textContent = shown.toLocaleDateString(t.locale, { month: "long", year: "numeric" });
    const days = monthGrid(shown.getFullYear(), shown.getMonth());
    const busiest = Math.max(1, ...days.map((day) => minutes.get(dayKey(day)) ?? 0));
    const weekdays = days.slice(0, 7).map((day) => h("span", { className: "calendar-weekday" }, day.toLocaleDateString(t.locale, { weekday: "short" })));
    const tiles = days.map((day) => {
        const key = dayKey(day);
        const played = minutes.get(key) ?? 0;
        const planned = planFor(key).length;
        // The day's plan: a block for each piece, full once done, half partway, all blue once the plan's done.
        const done = planned ? planDone(planFor(key), settings.planTargets[key], new Map(piecesOn(entries, key).map((piece) => [piece.pieceId, piece.minutes]))) : null;
        const plan = h(
          "span",
          { className: `calendar-plan${done?.share === 1 ? " done" : ""}` },
          ...(done ? [h("span", { className: "plan-blocks" }, ...done.shares.map((share) => h("i", { className: share === 1 ? "full" : share > 0 ? "half" : "" })))] : []),
        );
        const date = day.toLocaleDateString(t.locale, { weekday: "long", day: "numeric", month: "long" });
        const cell = h(
          "button",
          {
            type: "button",
            className: [
              "calendar-day",
              day.getMonth() !== shown.getMonth() && "other-month",
              key === today && "today",
              key === selected && "selected",
              played > 0 && "practised",
              picking && key >= today && "pickable",
              pasted.has(key) && "pasted",
            ]
              .filter(Boolean)
              .join(" "),
            ariaLabel: [date, ...(played > 0 ? [`${Math.max(1, Math.round(played))} min`] : []), ...(done ? [t.planDoneOf(done.met, planned)] : []), ...(picking && key >= today ? [pasted.has(key) ? t.pastedHere : t.pasteHere] : [])].join(", "),
            ariaPressed: String(key === selected),
            onclick() {
              // Picking, a tap pastes into the day, if it can still be planned, and the day picked stays.
              if (picking) {
                if (key < today) return;
                pasteInto(key);
                pasted.add(key);
                return rerender();
              }
              selected = key;
              renderMonth();
              renderDay();
            },
          },
          h("span", { className: "calendar-date" }, String(day.getDate())),
          // At the bottom, the minutes in a small pill, then the plan's blocks.
          h("span", { className: "calendar-foot" }, ...(played > 0 ? [h("span", { className: "calendar-minutes" }, `${Math.max(1, Math.round(played))} min`)] : []), plan),
        );
        // Busier days are a stronger brass.
        if (played > 0) cell.style.setProperty("--level", `${Math.round(15 + 50 * (played / busiest))}%`);
        cell.classList.toggle("busy", played / busiest > 0.5);
        // Picking, a day with a plan has a red trash in its corner, on top of it, as its own button, clearing the plan.
        if (!picking || key < today || !planned) return cell;
        const clear = h("button", {
          type: "button",
          className: "day-clear",
          innerHTML: TRASH_ICON,
          title: t.clearPlan(date),
          ariaLabel: t.clearPlan(date),
          onclick() {
            delete settings.plan[key];
            delete settings.planTargets[key];
            saveSettings();
            pasted.delete(key);
            rerender();
          },
        });
        return h("div", { className: "calendar-cell" }, cell, clear);
    });
    grid.replaceChildren(...weekdays, ...tiles);
  }

  function rerender() {
    renderMonth();
    renderDay();
  }

  // Paste, pressed: picking days to paste into starts, or ends.
  function togglePicking() {
    picking = !picking;
    pasted.clear();
    rerender();
  }

  renderMonth();
  renderDay();

  return {
    element: h(
      "section",
      { className: "calendar" },
      h(
        "div",
        { className: "title-row" },
        monthTitle,
        h(
          "div",
          { className: "title-tools" },
          h("button", { type: "button", className: "ghost-button icon-only", innerHTML: chevron("m15 18-6-6 6-6"), ariaLabel: t.previousMonth, title: t.previousMonth, onclick: () => moveMonth(-1) }),
          h("button", { type: "button", className: "ghost-button icon-only", innerHTML: chevron("m9 18 6-6-6-6"), ariaLabel: t.nextMonth, title: t.nextMonth, onclick: () => moveMonth(1) }),
          h("button", { type: "button", className: "ghost-button", textContent: t.today, onclick: goToday }),
        ),
      ),
      h("div", { className: "calendar-body" }, h("div", { className: "calendar-month-grid" }, grid), day.element),
    ),
    leave() {
      urls.forEach((url) => URL.revokeObjectURL(url));
    },
  };
}
