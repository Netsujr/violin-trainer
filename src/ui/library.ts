import { localTitle, t } from "../i18n";
import { fillFingering } from "../music/fingering";
import { parseQuickText } from "../music/parse";
import { barMarks, BEAT_LABELS, noteLabels } from "../music/notes";
import { allPieces, deletePiece, getSettings, isHighlighted, isScale, loadDraft, pieceGroups, saveDraft, savePiece, toggleHighlighted, updatePiece } from "../storage";
import type { Piece } from "../music/notes";
import { confirmAction } from "./confirm";
import { h, type Screen } from "./dom";
import { createPieceEditor } from "./pieceEditor";
import { downloadSheet } from "./sheetPdf";
import { DOWNLOAD_ICON, PENCIL_ICON, PLAY_ICON, TRASH_ICON } from "./toggles";

const SHOWN_PIECES = 3;

const editableNote = (note: Piece["notes"][number]) => ({ ...note, beats: note.beats ?? 1 });

export function libraryScreen(goPractice: (pieceId: string) => void): Screen {
  const settings = getSettings();
  const list = h("div", { className: "library" });
  const draft = loadDraft();
  // The saved piece on the staff, if any. Its id is in the draft, so a reload doesn't turn the edit into a copy.
  let editing = allPieces().find((piece) => piece.id === draft.editingId);
  const title = h("input", { placeholder: t.pieceTitle, value: draft.title, oninput: () => refreshForms() });
  const editor = createPieceEditor(draft.notes, () => refreshForms());
  const saveButton = h("button", { textContent: t.savePiece, onclick: saveFromStaff });
  const clearButton = h("button", {
    textContent: t.clearStaff,
    className: "secondary outline",
    async onclick() {
      if (editing) {
        if (!hasUnsavedWork() || (await confirmAction(t.discardConfirm, t.discard))) stopEditing();
      } else if (await confirmAction(t.clearConfirm, t.clearStaff)) editor.setNotes([]);
    },
  });
  const text = h("textarea", {
    rows: 6,
    placeholder: "D4:2 E4 F#4 | G4:3 A4 | B4:4",
    oninput: () => refreshForms(),
  });
  const previewView = h("div");
  const saveTypedButton = h("button", { textContent: t.savePiece, onclick: saveFromText });
  const heading = h("h2");
  const typedNotes = h(
    "details",
    { className: "type-notes" },
    h("summary", {}, t.typeNotes),
    h("p", { className: "editor-hint" }, t.typeHint),
    h("div", { className: "add-piece" }, text, saveTypedButton),
    previewView,
  );

  // Clicking a card, anywhere but its buttons, marks it for practice or clears the mark.
  const pieceRow = (piece: Piece) =>
    h(
      "div",
      {
        className: `row piece${isHighlighted(piece) ? " highlighted" : ""}`,
        title: t.markForPractice,
        onclick(event) {
          if ((event.target as Element).closest(".icon-button")) return;
          toggleHighlighted(piece);
          renderList();
        },
      },
      h(
        "button",
        { type: "button", className: "piece-name", ariaPressed: String(isHighlighted(piece)) },
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
      ...(isScale(piece)
        ? []
        : [
            h("button", {
              className: "secondary outline icon-button",
              innerHTML: DOWNLOAD_ICON,
              title: t.downloadPdf,
              ariaLabel: t.downloadPdf,
              onclick: () =>
                downloadSheet(localTitle(piece.id, piece.title), piece.notes, { names: settings.toggles.noteNames, fingers: settings.toggles.fingers }),
            }),
          ]),
      ...(piece.source === "imported"
        ? [
            h("button", {
              className: "secondary outline icon-button",
              innerHTML: PENCIL_ICON,
              title: t.editPiece,
              ariaLabel: t.editPiece,
              onclick: () => edit(piece),
            }),
            h("button", {
              className: "secondary outline icon-button",
              innerHTML: TRASH_ICON,
              title: t.delete,
              ariaLabel: t.delete,
              onclick: () => remove(piece),
            }),
          ]
        : []),
    );

  // Each group shows its first few, with the rest in a drawer that stays open across changes.
  const openDrawers = new Set<string>();
  function renderList() {
    list.replaceChildren(
      ...pieceGroups(allPieces())
        .filter(([, group]) => group.length > 0)
        .map(([key, group]) => {
          const rest = group.slice(SHOWN_PIECES);
          const selected = group.filter(isHighlighted).length;
          const drawer = h(
            "details",
            {
              className: "more-pieces",
              open: openDrawers.has(key),
              ontoggle: () => (drawer.open ? openDrawers.add(key) : openDrawers.delete(key)),
            },
            h("summary", {}, t.showMore(rest.length)),
            ...rest.map(pieceRow),
          );
          const heading = selected ? `${t[key]} (${t.selectedCount(selected)})` : t[key];
          return h("div", {}, h("h3", {}, heading), ...group.slice(0, SHOWN_PIECES).map(pieceRow), ...(rest.length ? [drawer] : []));
        }),
    );
  }

  async function remove(piece: Piece) {
    if (await confirmAction(t.deleteConfirm(localTitle(piece.id, piece.title)), t.delete)) {
      deletePiece(piece.id);
      if (editing?.id === piece.id) stopEditing();
      renderList();
    }
  }

  function hasUnsavedWork() {
    if (!editing) return title.value.trim() !== "" || editor.notes().length > 0;
    return title.value.trim() !== editing.title || JSON.stringify(editor.notes()) !== JSON.stringify(editing.notes.map(editableNote));
  }

  async function edit(piece: Piece) {
    if (editing?.id !== piece.id) {
      if (hasUnsavedWork() && !(await confirmAction(t.replaceConfirm, t.replace))) return;

      editing = piece;
      title.value = piece.title;
      editor.setNotes(piece.notes.map(editableNote));
    }
    heading.scrollIntoView();
  }

  function stopEditing() {
    editing = undefined;
    title.value = "";
    editor.setNotes([]);
  }

  function refreshForms() {
    const hasTitle = title.value.trim() !== "";
    saveDraft({ title: title.value, notes: editor.notes(), editingId: editing?.id });
    saveButton.disabled = !hasTitle || editor.notes().length === 0 || editor.crossesBar();
    clearButton.disabled = !editing && editor.notes().length === 0;
    clearButton.textContent = editing ? t.cancel : t.clearStaff;
    heading.textContent = editing ? t.editPiece : t.addPiece;
    typedNotes.hidden = editing !== undefined;

    const { notes, errors, flagged } = parseQuickText(text.value);
    const overBar = barMarks(notes).findIndex((mark) => mark.crossesBar);
    saveTypedButton.disabled = !hasTitle || notes.length === 0 || errors.length > 0 || overBar >= 0;
    previewView.replaceChildren(
      ...[...errors, ...flagged, ...(overBar >= 0 ? [t.noteOverBar(overBar + 1)] : [])].map((problem) => h("p", { className: "warning" }, problem)),
      h(
        "ol",
        {},
        ...notes.map((note) => {
          const { solfege, letter } = noteLabels(note.pitch);
          const length = t.beatCount(BEAT_LABELS[note.beats!], note.beats! > 1);
          return h("li", {}, `${solfege} / ${letter} · ${t.stringFinger(t.strings[note.string!], t.finger(note.finger ?? "?"))} · ${length}`);
        }),
      ),
    );
  }

  function savePieceWith(notes: Piece["notes"]) {
    const name = title.value.trim();
    if (editing) updatePiece({ ...editing, title: name, notes });
    else savePiece({ id: crypto.randomUUID(), title: name, source: "imported", notes });
    editing = undefined;
    title.value = "";
    renderList();
  }

  function saveFromStaff() {
    savePieceWith(editor.notes().map(fillFingering));
    editor.setNotes([]);
  }

  function saveFromText() {
    savePieceWith(parseQuickText(text.value).notes);
    text.value = "";
    refreshForms();
  }

  renderList();
  refreshForms();

  return {
    element: h(
      "section",
      {},
      h("h2", {}, t.screens.Library),
      list,
      heading,
      h("div", { className: "add-piece" }, title),
      editor.element,
      h("div", { className: "row" }, saveButton, clearButton),
      typedNotes,
    ),
    leave() {},
  };
}
