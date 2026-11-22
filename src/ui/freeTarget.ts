import { startReference } from "../audio/reference";
import { t } from "../i18n";
import { HIGHEST_MIDI, LOWEST_MIDI } from "../music/fingering";
import { getSettings, saveSettings } from "../storage";
import type { createStaff } from "./staff";
import { wordToggle } from "./toggles";

// The mic is ignored this long after the note stops, so it doesn't hear the speakers' last of it.
const ECHO_MS = 150;

// Free play's note to copy: a tap on the staff picks one, the natural note on the line or space tapped, within the
// violin's first position, and sounds it on the violin until it's tapped again, which takes it away. The Sound switch,
// in the settings panel, keeps the note but silences it. While it sounds, the mic is ignored, as in Practice,
// so the speakers don't count as the player. changed redraws the staff.
export function createFreeTarget(staff: ReturnType<typeof createStaff>, changed: () => void) {
  const settings = getSettings();
  let midi: number | null = null;
  let tone: ReturnType<typeof startReference> | null = null;
  let mutedUntil = 0;

  // Sounds the note picked, if there is one and the speaker's on, or stops it.
  function sound() {
    if (tone) {
      tone.stop();
      tone = null;
      mutedUntil = performance.now() + ECHO_MS;
    }
    if (midi !== null && settings.listenReferenceOn) tone = startReference(midi);
  }

  const speaker = wordToggle(t.referenceSound, settings.listenReferenceOn, (on) => {
    settings.listenReferenceOn = on;
    saveSettings();
    sound();
  });

  // The note a tap at a height on the screen would pick, within first position.
  const at = (clientY: number) => Math.max(LOWEST_MIDI, Math.min(HIGHEST_MIDI, staff.midiAt(clientY)));

  return {
    speaker,
    get midi() {
      return midi;
    },
    at,
    // A tap on the staff, at a height on the screen: picks the note there, or takes away the one picked.
    tap(clientY: number) {
      midi = midi === null ? at(clientY) : null;
      sound();
      changed();
    },
    // Whether the mic counts now: not while the note sounds, or just after.
    hearing: (now: number) => tone === null && now >= mutedUntil,
    // Takes the note away, as when the mode changes or Listen is left.
    clear() {
      midi = null;
      sound();
    },
  };
}
