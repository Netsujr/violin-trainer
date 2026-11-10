import { findBeat } from "../audio/tempo";
import { localTitle, t } from "../i18n";
import type { Piece } from "../music/notes";
import { deleteTrack, listTracks, saveTrack } from "../storage";
import { confirmAction } from "./confirm";
import { h } from "./dom";
import { ALIGN_ICON, REMOVE_TRACK_ICON, UPLOAD_ICON } from "./toggles";

// Backing tracks on Library's cards: a button to add one to a piece, and once it has one, buttons to line it up and to
// remove it. Adding one finds its tempo and first note, then opens it to line up. onChange is a track added or removed.
export function createCardTracks(goAlign: (pieceId: string) => void, onChange: () => void) {
  // Each piece's track, by its file name.
  const names = new Map<string, string>();
  let adding = "";
  const message = h("p", { className: "track-status" });
  // One picker for every card, outside them, so opening it doesn't count as a click on a card.
  const file = h("input", { type: "file", accept: "audio/*", hidden: true, onchange: () => file.files?.[0] && add(adding, file.files[0]) });

  async function add(pieceId: string, audio: File) {
    message.textContent = t.findingBeat;
    try {
      const { bpm, offset } = await findBeat(audio);
      await saveTrack(pieceId, { name: audio.name, blob: audio, bpm, offset, on: true, speed: 1, listen: false });
      message.textContent = "";
      goAlign(pieceId);
    } catch {
      message.textContent = t.trackUnreadable;
    }
    file.value = "";
  }

  const iconButton = (icon: string, label: string, onclick: () => void) =>
    h("button", { type: "button", className: "secondary outline icon-button", innerHTML: icon, title: label, ariaLabel: label, onclick });

  listTracks().then((tracks) => {
    tracks.forEach(({ pieceId, track }) => names.set(pieceId, track.name));
    onChange();
  });

  return {
    file,
    message,
    name: (pieceId: string) => names.get(pieceId),
    buttons(piece: Piece) {
      if (!names.has(piece.id)) {
        return [
          iconButton(UPLOAD_ICON, t.addTrack, () => {
            adding = piece.id;
            file.click();
          }),
        ];
      }
      return [
        iconButton(ALIGN_ICON, t.alignTrack, () => goAlign(piece.id)),
        iconButton(REMOVE_TRACK_ICON, t.removeTrack, async () => {
          if (!(await confirmAction(t.removeTrackConfirm(names.get(piece.id)!, localTitle(piece.id, piece.title)), t.removeTrack))) return;
          await deleteTrack(piece.id);
          names.delete(piece.id);
          onChange();
        }),
      ];
    },
  };
}
