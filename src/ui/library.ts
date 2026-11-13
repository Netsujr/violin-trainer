import { localTitle, t } from "../i18n";
import { fillFingering } from "../music/fingering";
import { allPieces, deletePiece, getSettings, isHighlighted, isScale, loadDraft, pieceGroups, saveDraft, savePiece, toggleHighlighted, updatePiece } from "../storage";
import type { Piece } from "../music/notes";
import { confirmAction } from "./confirm";
import { h, type Screen } from "./dom";
import { createCardTracks } from "./libraryTracks";
import { createPieceEditor } from "./pieceEditor";
import { downloadSheet } from "./sheetPdf";
import type { GroupKey } from "./progress";
import { CHART_ICON, DOWNLOAD_ICON, PENCIL_ICON, PLAY_ICON, TRASH_ICON } from "./toggles";

const SHOWN_PIECES = 3;

const editableNote = (note: Piece["notes"][number]) => ({ ...note, beats: note.beats ?? 1 });

export function libraryScreen(goPractice: (pieceId: string) => void, goAlign: (pieceId: string) => void, goProgress: (group: GroupKey) => void): Screen {
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
  const heading = h("h2");

  const tracks = createCardTracks(goAlign, () => renderList());
  const subtitle = (piece: Piece) => t.pieces[piece.id]?.subtitle ?? piece.subtitle ?? t.noteCount(piece.notes.length);

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
        h("span", {}, tracks.name(piece.id) ? `${subtitle(piece)} · ♪ ${tracks.name(piece.id)}` : subtitle(piece)),
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
      ...tracks.buttons(piece),
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
          const label = t.progressOf(t[key]);
          const chart = h("button", { type: "button", className: "secondary outline icon-button", innerHTML: CHART_ICON, title: label, ariaLabel: label, onclick: () => goProgress(key) });
          return h("div", {}, h("div", { className: "group-head" }, h("h3", {}, heading), chart), ...group.slice(0, SHOWN_PIECES).map(pieceRow), ...(rest.length ? [drawer] : []));
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
  }

  function saveFromStaff() {
    const name = title.value.trim();
    const notes = editor.notes().map(fillFingering);
    if (editing) updatePiece({ ...editing, title: name, notes });
    else savePiece({ id: crypto.randomUUID(), title: name, source: "imported", notes });
    editing = undefined;
    title.value = "";
    editor.setNotes([]);
    renderList();
  }

  renderList();
  refreshForms();

  return {
    element: h(
      "section",
      {},
      h("h2", {}, t.screens.Library),
      tracks.message,
      list,
      tracks.file,
      heading,
      h("div", { className: "add-piece" }, title),
      editor.element,
      h("div", { className: "row" }, saveButton, clearButton),
    ),
    leave() {},
  };
}
