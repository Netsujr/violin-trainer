import { getSettings } from "../../storage";

// What the mic hears was played this long ago.
export const MIC_DELAY_MS = 70;
// With tempo on, a note with a written length clears after about half of it, leaving the rest for the glide to the next beat.
// The mic's delay in hearing a note comes off that, or a short note would leave no room to come in slightly late.
const TEMPO_HOLD_SHARE = 0.5;
const SHORTEST_TEMPO_HOLD_MS = 80;
// Otherwise it clears just short of its full length, because the mic takes a moment to hear a note start.
const FULL_HOLD_SHARE = 0.9;

export const beatMs = () => 60000 / getSettings().bpm;

// How long a note must sound to count. A note with a written length is held for that long, not the usual short hold.
// glides is whether tempo will glide on to a next note after it.
export function holdMsFor(beats: number | undefined, glides: boolean) {
  const settings = getSettings();
  if (!beats) return settings.holdMs;

  const noteMs = beats * beatMs();
  if (glides) return Math.max(SHORTEST_TEMPO_HOLD_MS, noteMs * TEMPO_HOLD_SHARE - MIC_DELAY_MS);
  return noteMs * FULL_HOLD_SHARE;
}
