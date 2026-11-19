import { localNumber, localTitle, t } from "../i18n";
import type { Piece } from "../music/notes";
import { planProgress } from "../practice/calendar";
import { getSettings, saveSettings } from "../storage";
import { h } from "./dom";
import { createPieceMenu } from "./practice/pieceMenu";
import { COPY_ICON, PASTE_ICON } from "./toggles";

const PLAN_COLUMNS = 3;
// The targets a tap steps through, in minutes: a few short ones, then fives up to an hour.
const TARGETS = [1, 2, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
const MINUS_SHOWN_MS = 5000;

// A copied plan, with its targets, kept while the app is open, to paste into other days.
let copied: { ids: string[]; targets: Record<string, number> } | null = null;

// Pastes the copied plan into a day: what it doesn't have yet, with its targets, each one the piece's last too.
export function pasteInto(day: string) {
  const settings = getSettings();
  const plan = settings.plan[day] ?? [];
  const added = copied?.ids.filter((id) => !plan.includes(id)) ?? [];
  if (!added.length) return;
  settings.plan[day] = [...plan, ...added];
  for (const id of added) {
    const minutes = copied!.targets[id];
    if (minutes) (settings.planTargets[day] ??= {})[id] = settings.lastTargets[id] = minutes;
  }
  saveSettings();
}

// The next target: up from none through TARGETS, then back to none; or down again, to none. One saved between steps
// moves to the next step either way.
export function nextTarget(target: number | undefined, by: 1 | -1) {
  if (target === undefined) return by > 0 ? TARGETS[0] : undefined;
  return by > 0 ? TARGETS.find((minutes) => minutes > target) : TARGETS.findLast((minutes) => minutes < target);
}

type Options = {
  day: string;
  editable: boolean;
  pieces: Piece[];
  // Minutes practised that day, by piece.
  practised: Map<string, number>;
  // A piece added, taken off or pasted in.
  onChange: () => void;
  // Whether days are being picked to paste into, and the paste button's press, which starts or ends picking.
  picking: boolean;
  onPaste: () => void;
};

// A day's plan: its pieces in a faint table, each practised against an optional target in minutes, then the menu to add
// more, and copy and paste between days. Tapping a piece raises its target, and a − beside it for 5 seconds lowers it.
export function planSection({ day, editable, pieces, practised, onChange, picking, onPaste }: Options) {
  const settings = getSettings();
  const plan = settings.plan[day] ?? [];
  const targetOf = (pieceId: string) => settings.planTargets[day]?.[pieceId];
  const title = (pieceId: string) => localTitle(pieceId, pieces.find((piece) => piece.id === pieceId)?.title ?? pieceId);
  const total = h("span", { className: "plan-total" });

  function showTotal() {
    const timed = plan.filter((pieceId) => targetOf(pieceId) !== undefined);
    const target = timed.reduce((sum, pieceId) => sum + targetOf(pieceId)!, 0);
    const done = timed.reduce((sum, pieceId) => sum + Math.min(practised.get(pieceId) ?? 0, targetOf(pieceId)!), 0);
    total.textContent = target ? t.planTotal(localNumber(done, 0), target) : "";
  }

  function setTarget(pieceId: string, minutes: number | undefined) {
    const targets = (settings.planTargets[day] ??= {});
    if (minutes === undefined) delete targets[pieceId];
    else targets[pieceId] = settings.lastTargets[pieceId] = minutes;
    if (Object.keys(targets).length === 0) delete settings.planTargets[day];
    saveSettings();
  }

  function setPlan(ids: string[], targets: Record<string, number> = {}) {
    if (ids.length) settings.plan[day] = ids;
    else delete settings.plan[day];
    for (const pieceId of plan.filter((id) => !ids.includes(id))) setTarget(pieceId, undefined);
    for (const [pieceId, minutes] of Object.entries(targets)) setTarget(pieceId, minutes);
    saveSettings();
    onChange();
  }

  function cell(pieceId: string) {
    const name = title(pieceId);
    let hideMinus = 0;
    const piece = h("button", { type: "button", className: "plan-piece", disabled: !editable, onclick: () => change(1) });
    const minus = h("button", { type: "button", className: "plan-minus", textContent: "−", hidden: true, title: t.lessTime(name), ariaLabel: t.lessTime(name), onclick: () => change(-1) });

    function show() {
      const target = targetOf(pieceId);
      const done = practised.get(pieceId) ?? 0;
      const { status, percent } = planProgress(done, target);
      piece.textContent = `${status} ${name}${target ? ` (${target} min)` : ""}`;
      piece.title = target ? t.targetProgress(localNumber(done, 0), target) : editable ? t.tapForTime : name;
      // The cell fills faintly from the left as the target is practised.
      item.style.setProperty("--progress", `${percent}%`);
    }

    // The − stays while the target is being set, and goes 5 seconds after the last tap.
    function offerMinus() {
      minus.hidden = targetOf(pieceId) === undefined;
      clearTimeout(hideMinus);
      hideMinus = window.setTimeout(() => (minus.hidden = true), MINUS_SHOWN_MS);
    }

    function change(by: 1 | -1) {
      setTarget(pieceId, nextTarget(targetOf(pieceId), by));
      show();
      showTotal();
      offerMinus();
    }

    const remove = h("button", { type: "button", className: "plan-remove", textContent: "✕", title: t.removeFromPlan(name), ariaLabel: t.removeFromPlan(name), onclick: () => setPlan(plan.filter((id) => id !== pieceId)) });
    const item = h("li", { className: "plan-item" }, piece, minus, ...(editable ? [remove] : []));
    if (editable) piece.addEventListener("focus", offerMinus);
    show();
    return item;
  }

  // The table is there before anything is planned, and always fills whole rows of three.
  const empty = Array.from({ length: Math.max(PLAN_COLUMNS, Math.ceil(plan.length / PLAN_COLUMNS) * PLAN_COLUMNS) - plan.length }, () =>
    h("li", { className: "plan-item empty", ariaHidden: "true" }),
  );
  // The same menu as Practice's, with highlighted pieces starred. A piece starts with the target it last had.
  const add = createPieceMenu(pieces, t.addToPlan, (picked) => {
    if (plan.includes(picked.id)) return;
    const last = settings.lastTargets[picked.id];
    setPlan([...plan, picked.id], last ? { [picked.id]: last } : {});
  });
  const copy = h("button", {
    type: "button",
    className: "secondary outline icon-button plan-icon",
    innerHTML: COPY_ICON,
    title: t.copyPlan,
    ariaLabel: t.copyPlan,
    onclick() {
      copied = { ids: [...plan], targets: { ...settings.planTargets[day] } };
      onChange();
    },
  });
  // Paste starts picking days to paste into, each tapped on the calendar, and ends it, pressed, when pressed again.
  const pasteLabel = picking ? t.donePasting : t.pastePlan(copied?.ids.length ?? 0);
  const paste = h("button", {
    type: "button",
    className: "secondary outline icon-button plan-icon",
    innerHTML: PASTE_ICON,
    title: picking ? t.donePasting : `${pasteLabel}: ${t.pasteHint}`,
    ariaLabel: pasteLabel,
    ariaPressed: String(picking),
    onclick: onPaste,
  });
  showTotal();
  return {
    // For the day's heading, on the right: paste and copy as icons, then the menu. Paste comes first, so copy stays put.
    // Paste shows on any day once a plan's copied, a past one too, as it pastes into days picked on the calendar.
    tools: [...(copied?.ids.length ? [paste] : []), ...(plan.length ? [copy] : []), ...(editable ? [add.button, add.menu] : [])],
    table: [h("h4", {}, t.plan, " ", total), h("ul", { className: "plan", ariaLabel: plan.length ? t.plan : t.nothingPlanned }, ...plan.map(cell), ...empty)],
  };
}
