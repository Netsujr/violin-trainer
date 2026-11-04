import { localTitle, t } from "../i18n";
import { parseQuickText } from "../music/parse";
import { noteLabels } from "../music/notes";
import { allPieces, deletePiece, getSettings, savePiece, saveSettings } from "../storage";
import type { Piece } from "../music/notes";
import { h, type Screen } from "./dom";
import { CALENDAR_ICON, PLAY_ICON } from "./toggles";

export function libraryScreen(goPractice: (pieceId: string) => void): Screen {
  const settings = getSettings();
  const list = h("div", { className: "library" });
  const title = h("input", { placeholder: t.pieceTitle, oninput: () => preview() });
  const text = h("textarea", {
    rows: 6,
    placeholder: "D4 E4 F#4 G4 | A4 B4 C#5 D5",
    oninput: () => preview(),
  });
  const previewView = h("div");
  const saveButton = h("button", { textContent: t.savePiece, disabled: true, onclick: save });

  // The select is clear and sits over the icon, so tapping the icon opens the native list.
  function targetDayPicker(pieceId: string) {
    const day = h("span");
    const showDay = () => {
      const index = settings.targetDays[pieceId];
      day.textContent = t.days[index] ?? "";
      picker.classList.toggle("set", index !== undefined);
    };
    const select = h(
      "select",
      {
        title: t.targetDay,
        ariaLabel: t.targetDay,
        onchange() {
          if (select.value === "") delete settings.targetDays[pieceId];
          else settings.targetDays[pieceId] = Number(select.value);
          saveSettings();
          showDay();
        },
      },
      h("option", { value: "", textContent: t.noTargetDay }),
      ...t.days.map((day, index) =>
        h("option", { value: String(index), selected: settings.targetDays[pieceId] === index, textContent: day }),
      ),
    );
    const picker = h("div", { className: "day-picker" }, h("span", { className: "icon", innerHTML: CALENDAR_ICON }), day, select);
    showDay();
    return picker;
  }

  const pieceRow = (piece: Piece) =>
    h(
      "div",
      { className: "row piece" },
      h(
        "div",
        { className: "piece-name" },
        h("strong", {}, localTitle(piece.id, piece.title)),
        h("span", {}, t.pieces[piece.id]?.subtitle ?? piece.subtitle ?? t.noteCount(piece.notes.length)),
      ),
      h("button", {
        className: "outline icon-button",
        innerHTML: PLAY_ICON,
        title: t.screens.Practice,
        ariaLabel: t.screens.Practice,
        onclick: () => goPractice(piece.id),
      }),
      targetDayPicker(piece.id),
      ...(piece.source === "imported"
        ? [h("button", { textContent: t.deletePiece, className: "secondary outline", onclick: () => remove(piece.id) })]
        : []),
    );

  function renderList() {
    const pieces = allPieces();
    const isScale = (piece: Piece) => piece.source === "built-in";
    list.replaceChildren(
      h("div", {}, h("h3", {}, t.scales), ...pieces.filter(isScale).map(pieceRow)),
      h("div", {}, h("h3", {}, t.songs), ...pieces.filter((piece) => !isScale(piece)).map(pieceRow)),
    );
  }

  function remove(pieceId: string) {
    deletePiece(pieceId);
    renderList();
  }

  function preview() {
    const { notes, errors, flagged } = parseQuickText(text.value);
    saveButton.disabled = notes.length === 0 || errors.length > 0 || title.value.trim() === "";
    previewView.replaceChildren(
      ...[...errors, ...flagged].map((problem) => h("p", { className: "warning" }, problem)),
      h(
        "ol",
        {},
        ...notes.map((note) => {
          const { solfege, letter } = noteLabels(note.pitch);
          return h("li", {}, `${solfege} / ${letter} · ${t.stringFinger(t.strings[note.string!], t.finger(note.finger ?? "?"))}`);
        }),
      ),
    );
  }

  function save() {
    const { notes } = parseQuickText(text.value);
    savePiece({ id: crypto.randomUUID(), title: title.value.trim(), source: "imported", notes });
    title.value = "";
    text.value = "";
    preview();
    renderList();
  }

  renderList();

  return {
    element: h(
      "section",
      {},
      h("h2", {}, t.screens.Library),
      list,
      h("h2", {}, t.addPiece),
      h("div", { className: "add-piece" }, title, text, saveButton),
      previewView,
    ),
    leave() {},
  };
}
