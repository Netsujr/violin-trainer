import { localTitle, t } from "../../i18n";
import type { Piece } from "../../music/notes";
import { isHighlighted, pieceGroups } from "../../storage";
import { h } from "../dom";

const pieceTitle = (piece: Piece) => localTitle(piece.id, piece.title);
const MENU_GAP = 4;

// The piece picker: a button opening a menu of groups (scales, the songs that come with the app, and songs
// added later or imported), each opening its pieces on hover or tap. Highlighted pieces are starred.
// shown is the piece picked, which the button names, or a fixed label for a button that adds one.
export function createPieceMenu(pieces: Piece[], shown: Piece | string, onPick: (piece: Piece) => void) {
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
                  if (typeof shown !== "string") button.textContent = pieceTitle(piece);
                  onPick(piece);
                },
              }),
            ),
          ),
        ),
      ),
  );
  const button = h("button", { type: "button", className: "piece-select", ariaHasPopup: "menu", textContent: typeof shown === "string" ? shown : pieceTitle(shown), popoverTargetElement: menu });
  // The menu sits in the top layer, so it's placed by its button each time it opens: under it, or above it if there
  // isn't room below, as near the bottom of a page.
  menu.addEventListener("toggle", () => {
    const { left, top, bottom } = button.getBoundingClientRect();
    menu.style.left = `${left}px`;
    const fitsBelow = bottom + MENU_GAP + menu.offsetHeight <= innerHeight;
    menu.style.top = `${fitsBelow ? bottom + MENU_GAP : Math.max(MENU_GAP, top - MENU_GAP - menu.offsetHeight)}px`;
  });
  return { button, menu };
}
