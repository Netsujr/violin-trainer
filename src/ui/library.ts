import { parseQuickText } from "../music/parse";
import { noteLabels } from "../music/notes";
import { allPieces, deletePiece, getSettings, savePiece, saveSettings } from "../storage";
import { h, type Screen } from "./dom";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function libraryScreen(goPractice: (pieceId: string) => void): Screen {
  const settings = getSettings();
  const list = h("div");
  const title = h("input", { placeholder: "Title", oninput: () => preview() });
  const text = h("textarea", {
    rows: 6,
    placeholder: "D4 E4 F#4 G4 | A4 B4 C#5 D5",
    oninput: () => preview(),
  });
  const previewView = h("div");
  const saveButton = h("button", { textContent: "Save piece", disabled: true, onclick: save });

  function targetDaySelect(pieceId: string) {
    const select = h(
      "select",
      {
        onchange() {
          if (select.value === "") delete settings.targetDays[pieceId];
          else settings.targetDays[pieceId] = Number(select.value);
          saveSettings();
        },
      },
      h("option", { value: "", textContent: "No target day" }),
      ...DAYS.map((day, index) =>
        h("option", { value: String(index), selected: settings.targetDays[pieceId] === index, textContent: day }),
      ),
    );
    return select;
  }

  function renderList() {
    list.replaceChildren(
      ...allPieces().map((piece) =>
        h(
          "div",
          { className: "row piece" },
          h("strong", {}, piece.title),
          h("span", {}, piece.subtitle ?? `${piece.notes.length} notes`),
          h("button", { textContent: "Practice", onclick: () => goPractice(piece.id) }),
          targetDaySelect(piece.id),
          ...(piece.source === "imported"
            ? [h("button", { textContent: "Delete", onclick: () => remove(piece.id) })]
            : []),
        ),
      ),
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
          return h("li", {}, `${solfege} / ${letter} · ${note.string} string · finger ${note.finger ?? "?"}`);
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
      h("h2", {}, "Library"),
      list,
      h("h2", {}, "Add piece"),
      h("div", { className: "add-piece" }, title, text, saveButton),
      previewView,
    ),
    leave() {},
  };
}
