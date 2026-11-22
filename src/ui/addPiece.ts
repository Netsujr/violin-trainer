import { t } from "../i18n";
import { fillFingering } from "../music/fingering";
import { countNotes, type Piece } from "../music/notes";
import { allPieces, loadDraft, saveDraft, savePiece, updatePiece, type PieceDraft } from "../storage";
import { confirmAction } from "./confirm";
import { h, type Screen } from "./dom";
import { createPieceEditor } from "./pieceEditor";

const BACK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';

const editableNote = (note: Piece["notes"][number]) => ({ ...note, beats: note.beats ?? 1 });

// Whether the staff holds work that isn't saved: anything at all for a new piece, or a change to the one being edited.
export function hasUnsavedWork({ title, notes, editingId }: PieceDraft) {
  const editing = allPieces().find((piece) => piece.id === editingId);
  if (!editing) return title.trim() !== "" || notes.length > 0;
  return title.trim() !== editing.title || JSON.stringify(notes) !== JSON.stringify(editing.notes.map(editableNote));
}

// Puts a saved piece on the staff, to edit it.
export const draftOf = (piece: Piece): PieceDraft => ({ title: piece.title, notes: piece.notes.map(editableNote), editingId: piece.id });

// Writing a piece, or editing one, on a screen of its own: a back button to Library, the title, and the staff filling
// the room, with the selected note's tools docked under it. What's on the staff is kept as a draft, so leaving or
// reloading doesn't lose it, and its id says which piece it's editing.
export function addPieceScreen(back: () => void): Screen {
  const draft = loadDraft();
  let editing = allPieces().find((piece) => piece.id === draft.editingId);
  const title = h("input", { type: "text", placeholder: t.pieceTitlePlaceholder, ariaLabel: t.pieceTitle, value: draft.title, oninput: () => refresh() });
  const editor = createPieceEditor(draft.notes, () => refresh());
  const heading = h("h1");
  const saveButton = h("button", { type: "button", className: "start-button", textContent: t.savePiece, onclick: save });
  const clearButton = h("button", {
    type: "button",
    className: "ghost-button",
    async onclick() {
      if (editing) {
        if (!hasUnsavedWork(current()) || (await confirmAction(t.discardConfirm, t.discard))) stopEditing();
      } else if (await confirmAction(t.clearConfirm, t.clearStaff)) editor.setNotes([]);
    },
  });
  const current = (): PieceDraft => ({ title: title.value, notes: editor.notes(), editingId: editing?.id });

  function stopEditing() {
    editing = undefined;
    title.value = "";
    editor.setNotes([]);
  }

  function refresh() {
    saveDraft(current());
    // A piece needs a title, and a note to play, not just rests, and no note crossing a bar line.
    saveButton.disabled = title.value.trim() === "" || countNotes(editor.notes()) === 0 || editor.crossesBar();
    clearButton.disabled = !editing && editor.notes().length === 0;
    clearButton.textContent = editing ? t.cancel : t.clearStaff;
    heading.textContent = editing ? t.editPiece : t.addPiece;
  }

  function save() {
    const name = title.value.trim();
    const notes = editor.notes().map(fillFingering);
    if (editing) updatePiece({ ...editing, title: name, notes });
    else savePiece({ id: crypto.randomUUID(), title: name, source: "imported", notes });
    saveDraft({ title: "", notes: [] });
    back();
  }

  refresh();
  const backLabel = t.backTo(t.customSongs);
  return {
    element: h(
      "section",
      { className: "add-piece fills-window" },
      h(
        "div",
        { className: "title-row" },
        h("button", { type: "button", className: "ghost-button icon-only", innerHTML: BACK_ICON, ariaLabel: backLabel, title: backLabel, onclick: back }),
        heading,
        h("div", { className: "title-tools" }, clearButton, saveButton),
      ),
      h("label", { className: "piece-title" }, h("span", { className: "dock-label" }, t.pieceTitle), title),
      h("div", { className: "stage-panel editor-panel" }, editor.element),
      editor.tools,
    ),
    leave: editor.stopPlaying,
  };
}
