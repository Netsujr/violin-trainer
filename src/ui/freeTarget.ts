import { startReference } from "../audio/reference";
import { t } from "../i18n";
import { HIGHEST_MIDI, LOWEST_MIDI } from "../music/fingering";
import type { createStaff } from "./staff";
import { h } from "./dom";
import { SPEAKER_ICON } from "./toggles";

// The mic is ignored this long after the note stops, so it doesn't hear the speakers' last of it.
const ECHO_MS = 150;

// Free play's note to copy: a tap on the staff picks one, the natural note on the line or space tapped, within the
// violin's first position, and a second tap takes it away. The speaker in the staff's corner sounds it on the violin
// until it's pressed again, and stays on, or off, from one note picked to the next. While it sounds, the mic is ignored, as in Practice, so the speakers don't count as the player.
// changed redraws the staff.
export function createFreeTarget(staff: ReturnType<typeof createStaff>, changed: () => void) {
  let midi: number | null = null;
  let tone: ReturnType<typeof startReference> | null = null;
  let mutedUntil = 0;
  let on = false;

  // The note picked sounds while the speaker's on, and stops otherwise.
  function sound() {
    if (tone) {
      tone.stop();
      tone = null;
      mutedUntil = performance.now() + ECHO_MS;
    }
    if (on && midi !== null) tone = startReference(midi);
  }

  const speaker = h("button", {
    type: "button",
    className: "target-speaker",
    innerHTML: SPEAKER_ICON,
    ariaLabel: t.hearTheNote,
    ariaPressed: "false",
    disabled: true,
    onclick() {
      on = !on;
      speaker.ariaPressed = String(on);
      sound();
    },
  });

  // The note a tap at a height on the screen would pick, within first position.
  const at = (clientY: number) => Math.max(LOWEST_MIDI, Math.min(HIGHEST_MIDI, staff.midiAt(clientY)));

  // Picks a note, sounding it if the speaker's on, or takes it away and its sound with it. The speaker can be pressed
  // only with a note to sound.
  function pick(next: number | null) {
    midi = next;
    speaker.disabled = midi === null;
    sound();
  }

  return {
    speaker,
    get midi() {
      return midi;
    },
    at,
    // A tap on the staff, at a height on the screen: picks the note there, or takes away the one picked.
    tap(clientY: number) {
      pick(midi === null ? at(clientY) : null);
      changed();
    },
    // Whether the mic counts now: not while the note sounds, or just after.
    hearing: (now: number) => tone === null && now >= mutedUntil,
    // Takes the note away, as when the mode changes or Listen is left.
    clear: () => pick(null),
  };
}
