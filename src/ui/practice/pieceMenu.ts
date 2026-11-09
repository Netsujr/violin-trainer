import { localTitle, t } from "../../i18n";
import type { Piece } from "../../music/notes";
import { isHighlighted, pieceGroups } from "../../storage";
import { h } from "../dom";

const pieceTitle = (piece: Piece) => localTitle(piece.id, piece.title);

// The piece picker: a button opening a menu of groups (scales, the songs that come with the app, and songs
// added later or imported), each opening its pieces on hover or tap. Highlighted pieces are starred.
export function createPieceMenu(pieces: Piece[], current: Piece, onPick: (piece: Piece) => void) {
  const menu = h(
    "div",
    { className: "piece-menu", popover: "auto", role: "menu" },
    ...pieceGroups(pieces)
      .filter(([, group]) => group.length > 0)
      .map(([key, group]) =>
        h(
          "div",
          { className: "piece-group" },
          h("button", { type: "button", ariaHasPopup: "menu", textContent: t[key] }),
          h(
            "div",
            { className: "piece-submenu", role: "menu" },
            ...group.map((piece) =>
              h("button", {
                type: "button",
                role: "menuitem",
                value: piece.id,
                className: isHighlighted(piece) ? "highlighted" : "",
                textContent: pieceTitle(piece),
                onclick() {
                  menu.hidePopover();
                  button.textContent = pieceTitle(piece);
                  onPick(piece);
                },
              }),
            ),
          ),
        ),
      ),
  );
  const button = h("button", { type: "button", className: "piece-select", ariaHasPopup: "menu", textContent: pieceTitle(current), popoverTargetElement: menu });
  // The menu sits in the top layer, so it's placed under its button each time it opens.
  menu.addEventListener("toggle", () => {
    const { left, bottom } = button.getBoundingClientRect();
    menu.style.left = `${left}px`;
    menu.style.top = `${bottom + 4}px`;
  });
  return { button, menu };
}
