import { localTitle, t } from "../i18n";
import { countNotes, meterOf, type Piece } from "../music/notes";
import { dayKey } from "../practice/calendar";
import { allPieces, deletePiece, getSettings, isHighlighted, isScale, loadDraft, loadLog, pieceGroups, saveDraft, toggleHighlighted } from "../storage";
import { draftOf, hasUnsavedWork } from "./addPiece";
import { confirmAction } from "./confirm";
import { h, type Screen } from "./dom";
import { createCardTracks } from "./libraryTracks";
import { shortDay, type GroupKey } from "./progress";
import { downloadSheet } from "./sheetPdf";
import { CHART_ICON, DOWNLOAD_ICON, PENCIL_ICON, PLAY_ICON, TRASH_ICON } from "./toggles";

const PLUS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

// The group shown last, to come back to.
let shownGroup: GroupKey = "scales";

// Library's groups, for the sidebar under Library: each with its count, the one shown marked. pick shows a group.
export function libraryGroups(current: () => GroupKey, pick: (key: GroupKey) => void) {
  const groups = pieceGroups(allPieces()).filter(([, pieces]) => pieces.length > 0);
  const buttons = groups.map(([key, pieces]) =>
    h("button", { type: "button", className: "sub-item", onclick: () => pick(key) }, h("span", { className: "sub-name" }, t[key]), h("span", { className: "sub-hint" }, t.pieceCount(pieces.length))),
  );
  const show = () => buttons.forEach((button, index) => (button.ariaPressed = String(groups[index][0] === current())));
  show();
  return { element: h("div", { role: "group", ariaLabel: t.screens.Library }, ...buttons), show };
}

type Actions = {
  practise: (pieceId: string) => void;
  align: (pieceId: string) => void;
  progress: (group: GroupKey) => void;
  // Add piece, with what's on its staff, a new piece or one to edit.
  addPiece: () => void;
};

// Library: one group of pieces at a time, the groups in the sidebar under Library with their counts. Each piece is a
// card: its title, which marks it for practice, its subtitle and when it was last practised, and its buttons.
// group, when given, is the group to show.
export function libraryScreen(actions: Actions, group?: GroupKey): Screen {
  const settings = getSettings();
  if (group) shownGroup = group;
  const heading = h("h1");
  const count = h("p", { className: "title-caption" });
  const cards = h("div", { className: "piece-grid" });
  const tracks = createCardTracks(actions.align, () => render());
  const subtitle = (piece: Piece) => t.pieces[piece.id]?.subtitle ?? piece.subtitle ?? t.noteCount(countNotes(piece.notes));
  // The day each piece was last practised.
  const lastDays = new Map(loadLog().map((entry) => [entry.pieceId, dayKey(new Date(entry.startedAt))]));
  const button = (icon: string, text: string, onclick: () => void, className = "") =>
    h("button", { type: "button", className: `card-button ${className}`, innerHTML: icon, onclick }, text);

  const card = (piece: Piece) => {
    const name = localTitle(piece.id, piece.title);
    const track = tracks.name(piece.id);
    const last = lastDays.get(piece.id);
    return h(
      "div",
      { className: `piece${isHighlighted(piece) ? " highlighted" : ""}` },
      h(
        "button",
        {
          type: "button",
          className: "piece-name",
          title: t.markForPractice,
          ariaPressed: String(isHighlighted(piece)),
          onclick() {
            toggleHighlighted(piece);
            render();
          },
        },
        h("strong", {}, name),
        h("span", {}, track ? `${subtitle(piece)} · ♪ ${track}` : subtitle(piece)),
        ...(last ? [h("span", { className: "piece-last" }, t.lastPractisedOn(shortDay(last)))] : []),
      ),
      h(
        "div",
        { className: "card-buttons" },
        button(PLAY_ICON, t.practise, () => actions.practise(piece.id), "main"),
        ...(isScale(piece) ? [] : [button(DOWNLOAD_ICON, t.pdf, () => downloadSheet(name, piece.notes, { names: settings.toggles.noteNames, fingers: settings.toggles.fingers }, meterOf(piece)))]),
        ...tracks.buttons(piece),
        ...(piece.source === "imported" ? [button(PENCIL_ICON, t.edit, () => edit(piece)), button(TRASH_ICON, t.delete, () => remove(piece))] : []),
      ),
    );
  };

  function render() {
    const groups = pieceGroups(allPieces()).filter(([, pieces]) => pieces.length > 0);
    const [key, pieces] = groups.find(([key]) => key === shownGroup) ?? groups[0];
    shownGroup = key;
    sidebar.show();
    const selected = pieces.filter(isHighlighted).length;
    heading.textContent = t[key];
    count.textContent = selected ? `${t.pieceCount(pieces.length)} · ${t.selectedCount(selected)}` : t.pieceCount(pieces.length);
    cards.replaceChildren(...pieces.map(card));
  }

  async function remove(piece: Piece) {
    if (!(await confirmAction(t.deleteConfirm(localTitle(piece.id, piece.title)), t.delete))) return;
    deletePiece(piece.id);
    // A piece deleted while it's on the staff isn't being edited any more.
    const draft = loadDraft();
    if (draft.editingId === piece.id) saveDraft({ title: "", notes: [] });
    render();
  }

  // Edit puts the piece on Add piece's staff, asking first if that would replace work there.
  async function edit(piece: Piece) {
    const draft = loadDraft();
    if (draft.editingId !== piece.id) {
      if (hasUnsavedWork(draft) && !(await confirmAction(t.replaceConfirm, t.replace))) return;
      saveDraft(draftOf(piece));
    }
    actions.addPiece();
  }

  const sidebar = libraryGroups(
    () => shownGroup,
    (key) => {
      shownGroup = key;
      render();
    },
  );

  render();
  return {
    element: h(
      "section",
      { className: "library" },
      h(
        "div",
        { className: "title-row" },
        h("div", {}, heading, count),
        h(
          "div",
          { className: "title-tools" },
          h("button", { type: "button", className: "ghost-button", innerHTML: CHART_ICON, onclick: () => actions.progress(shownGroup) }, t.progress),
          h("button", { type: "button", className: "start-button icon-only", innerHTML: PLUS_ICON, ariaLabel: t.addPiece, title: t.addPiece, onclick: actions.addPiece }),
        ),
      ),
      tracks.message,
      cards,
      tracks.file,
    ),
    sidebar: sidebar.element,
    leave() {},
  };
}
