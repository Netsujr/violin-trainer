import { FIRST_CLICK_DELAY_MS, type createMetronome } from "../../audio/metronome";
import { t } from "../../i18n";
import { getSettings } from "../../storage";
import { h } from "../dom";
import { beatMs } from "./timing";

// The pause before a sheet when the notes wait for the player, counting down in beats so a BPM change applies.
// Fullscreen also shows the count over everything, fading to 10% just before the first note.
export function createCountIn(metronome: ReturnType<typeof createMetronome>, showText: (text: string) => void) {
  const settings = getSettings();
  let state: { beats: number; beatsLeft: number; at: number } | null = null;
  const overlay = h("div", { className: "countdown", hidden: true, ariaHidden: "true" });

  function show(beatsLeft: number, beats: number) {
    const count = Math.min(beats, Math.ceil(beatsLeft));
    showText(t.startsIn(count));
    overlay.hidden = false;
    overlay.textContent = String(count);
    overlay.style.opacity = String(0.1 + 0.8 * Math.min(1, beatsLeft / beats));
  }

  return {
    overlay,
    get active() {
      return state !== null;
    },
    get beats() {
      return state?.beats ?? settings.countInBeats;
    },
    // The first click comes after a short delay and counts in the first note, so the two share a beat. A metronome
    // that's already ticking keeps its beat, and the count-in starts on its next click.
    start(beats = settings.countInBeats) {
      const now = performance.now();
      const firstClickAt = settings.metronomeOn ? metronome.nextClick : null;
      metronome.reset(beats, firstClickAt);
      state = { beats, beatsLeft: beats + (firstClickAt === null ? FIRST_CLICK_DELAY_MS : firstClickAt - now) / beatMs(), at: now };
    },
    // Counts down to now, and says whether the count-in has just ended.
    tick(now: number) {
      const current = state!;
      current.beatsLeft -= (now - current.at) / beatMs();
      current.at = now;
      if (current.beatsLeft > 0) {
        show(current.beatsLeft, current.beats);
        return false;
      }
      state = null;
      return true;
    },
    cancel() {
      state = null;
    },
    hideOverlay() {
      overlay.hidden = true;
    },
  };
}
