import { localTitle, t } from "../../i18n";
import type { Piece } from "../../music/notes";
import { isHighlighted, pieceGroups, piecesWithTracks } from "../../storage";
import { h } from "../dom";

const pieceTitle = (piece: Piece) => localTitle(piece.id, piece.title);
const MENU_GAP = 4;

// The piece picker: a button opening a menu of groups (scales, the songs that come with the app, and songs
// added later or imported), each opening its pieces on hover or tap. Highlighted pieces are starred, and pieces with a
// backing track have a note after them.
// shown is the piece picked, which the button names, or a fixed label for a button that adds one.
export function createPieceMenu(pieces: Piece[], shown: Piece | string, onPick: (piece: Piece) => void) {
  // A group's pieces open beside it, moved up as far as they need to stay on screen. Longer than the screen, they scroll.
  function fitSubmenu(event: Event) {
    const submenu = (event.target as Element).closest(".piece-group")?.querySelector<HTMLElement>(".piece-submenu");
    if (!submenu) return;
    submenu.style.top = "";
    if (getComputedStyle(submenu).position !== "absolute") return;
    const { top, bottom } = submenu.getBoundingClientRect();
    const overflow = bottom - (innerHeight - MENU_GAP);
    if (overflow > 0) submenu.style.top = `${submenu.offsetTop - Math.min(overflow, top - MENU_GAP)}px`;
  }

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
  menu.addEventListener("pointerover", fitSubmenu);
  menu.addEventListener("focusin", fitSubmenu);
  const button = h("button", { type: "button", className: "piece-select", ariaHasPopup: "menu", textContent: typeof shown === "string" ? shown : pieceTitle(shown), popoverTargetElement: menu });
  // The menu sits in the top layer, so it's placed by its button each time it opens: under it, or above it if there
  // isn't room below, as near the bottom of a page.
  async function markTracks() {
    const tracked = await piecesWithTracks();
    menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]').forEach((item) => item.classList.toggle("has-track", tracked.has(item.value)));
  }
  markTracks();
  menu.addEventListener("toggle", () => {
    markTracks(); // A track may have been added or removed since.
    const { left, top, bottom } = button.getBoundingClientRect();
    menu.style.left = `${left}px`;
    const fitsBelow = bottom + MENU_GAP + menu.offsetHeight <= innerHeight;
    menu.style.top = `${fitsBelow ? bottom + MENU_GAP : Math.max(MENU_GAP, top - MENU_GAP - menu.offsetHeight)}px`;
  });
  return { button, menu };
}
