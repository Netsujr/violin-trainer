import { localNumber, localTitle, t } from "../../i18n";
import type { Piece } from "../../music/notes";
import { dayKey, piecesOn, planProgress } from "../../practice/calendar";
import { getSettings, loadLog } from "../../storage";
import { h } from "../dom";

// Today's plan, in the sidebar under Practice: how many pieces are done, then a row for each, with its minutes so far
// against its target and a thin bar, brass until it's done and then blue. Picking one opens it. Only there with a plan.
export function createTodayPlan(pieces: Piece[], current: () => Piece, onPick: (piece: Piece) => void) {
  const settings = getSettings();
  const done = h("span");
  const list = h("div", { className: "plan-list" });
  const element = h("div", { className: "today-plan", role: "group", ariaLabel: t.todaysPlan }, h("p", { className: "plan-head" }, h("span", {}, t.todaysPlan), done), list);

  function refresh() {
    const today = dayKey(new Date());
    const plan = (settings.plan[today] ?? []).flatMap((id) => pieces.filter((piece) => piece.id === id));
    element.hidden = plan.length === 0;
    const practised = new Map(piecesOn(loadLog(), today).map((piece) => [piece.pieceId, piece.minutes]));
    const targets = settings.planTargets[today] ?? {};
    let finished = 0;
    list.replaceChildren(
      ...plan.map((piece) => {
        const name = localTitle(piece.id, piece.title);
        const minutes = practised.get(piece.id) ?? 0;
        const target = targets[piece.id];
        // A piece with no target is done once it's practised at all.
        const complete = planProgress(minutes, target).status === "✓";
        const percent = complete ? 100 : planProgress(minutes, target).percent;
        if (complete) finished++;
        const bar = h("span", { className: "plan-bar" }, h("span", {}));
        (bar.firstChild as HTMLElement).style.width = `${percent}%`;
        return h(
          "button",
          { type: "button", className: `plan-row${complete ? " done" : ""}`, ariaPressed: String(piece.id === current().id), onclick: () => onPick(piece) },
          h("span", { className: "plan-name" }, name),
          h("span", { className: "plan-minutes" }, complete ? t.done : target ? t.minutesOf(localNumber(minutes, 0), target) : ""),
          bar,
        );
      }),
    );
    done.textContent = t.planDone(finished, plan.length);
  }

  refresh();
  return { element, refresh };
}
