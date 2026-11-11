import type { Section } from "../highway";

// The selected notes. Shift+click selects from the last note picked, and a trouble spot from the results selects its own.
// spotted says the section is a trouble spot's, so Play again can go back to the whole piece.
export function createSelection(onChange: (section: Section | null) => void) {
  let section: Section | null = null;
  let anchor = 0;
  let spotted = false;
  function set(next: Section | null, isSpot = false) {
    section = next;
    spotted = isSpot;
    onChange(section);
  }
  return {
    get section() {
      return section;
    },
    get spotted() {
      return spotted;
    },
    // A note, or with extend, the notes from the last one picked to it. Returns the note to start from.
    pick(index: number, extend: boolean) {
      if (!extend) anchor = index;
      set(extend ? { first: Math.min(anchor, index), last: Math.max(anchor, index) } : null);
      return section ? section.first : index;
    },
    spot(spot: Section | null) {
      if (spot) anchor = spot.first;
      set(spot && { first: spot.first, last: spot.last }, Boolean(spot));
    },
  };
}
