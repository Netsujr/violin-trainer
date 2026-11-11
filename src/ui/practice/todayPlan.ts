import { localNumber, localTitle, t } from "../../i18n";
import type { Piece } from "../../music/notes";
import { dayKey, piecesOn, planProgress } from "../../practice/calendar";
import { getSettings, loadLog, saveSettings } from "../../storage";
import { h } from "../dom";

// Today's plan, a drawer above the run buttons like Options: a chip for each planned piece, filling as it's practised, in
// any order, and picking one opens it. Closed, the drawer itself shows the open piece's progress. Only there with a plan.
export function createTodayPlan(pieces: Piece[], current: () => Piece, onPick: (piece: Piece) => void) {
  const settings = getSettings();
  // No heading on screen: its arrow opens and closes it, and screen readers hear its name.
  const summary = h("summary", { ariaLabel: t.todaysPlan });
  const chips = h("div", { className: "today-chips" });
  const element = h(
    "details",
    {
      className: "today-plan",
      hidden: true,
      open: settings.todayPlanOpen,
      ontoggle() {
        settings.todayPlanOpen = element.open;
        saveSettings();
        refresh();
      },
    },
    summary,
    chips,
  );

  function refresh() {
    const today = dayKey(new Date());
    const plan = (settings.plan[today] ?? []).flatMap((id) => pieces.filter((piece) => piece.id === id));
    element.hidden = plan.length === 0;
    if (plan.length === 0) return chips.replaceChildren();

    const practised = new Map(piecesOn(loadLog(), today).map((piece) => [piece.pieceId, piece.minutes]));
    const targets = settings.planTargets[today] ?? {};
    // A piece's chip: a button to open it, or, in the closed drawer's heading, just its look.
    const chip = (piece: Piece, tag: "button" | "span") => {
      const name = localTitle(piece.id, piece.title);
      const done = practised.get(piece.id) ?? 0;
      const target = targets[piece.id];
      const { status, percent } = planProgress(done, target);
      const tile = h(tag, { className: "today-chip", title: target ? t.targetProgress(localNumber(done, 0), target) : name }, `${status} ${name}${target ? ` · ${target} min` : ""}`);
      tile.style.setProperty("--progress", `${percent}%`);
      return tile;
    };
    chips.replaceChildren(
      ...plan.map((piece) => {
        const button = chip(piece, "button") as HTMLButtonElement;
        button.type = "button";
        button.ariaPressed = String(piece.id === current().id);
        button.onclick = () => onPick(piece);
        return button;
      }),
    );
    // Closed, the whole drawer is the open piece's progress: its name, and the box filling as it's practised.
    const open = plan.find((piece) => piece.id === current().id);
    const showing = !element.open && open ? chip(open, "span") : null;
    summary.replaceChildren(...(showing ? [h("span", { className: "today-current" }, showing.textContent!)] : []));
    element.classList.toggle("showing-progress", showing !== null);
    element.style.setProperty("--progress", showing?.style.getPropertyValue("--progress") ?? "0%");
  }

  refresh();
  return { element, refresh };
}
