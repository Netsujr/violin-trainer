import { localNumber, t } from "../i18n";
import { centsFrom, nearestMidi, noteLabels, pitchOf } from "../music/notes";
import { getSettings, passCents } from "../storage";
import { h } from "./dom";
import { createNeedle } from "./needle";
import { setting, slider } from "./settings";
import { GEAR_ICON } from "./toggles";

// How in tune a note is, in a word or two: in tune, a little off while it still counts, or off.
function tuningWord(cents: number) {
  const off = Math.abs(cents);
  if (off <= getSettings().greenCents) return t.tuningWords.inTune;
  if (off <= passCents()) return cents > 0 ? t.tuningWords.littleSharp : t.tuningWords.littleFlat;
  return cents > 0 ? t.tuningWords.sharp : t.tuningWords.flat;
}

// How in tune counts, set on the tuner: In tune, and Close enough, which is off slid all the way down to In tune. The
// dial and its key redraw as they slide, and the same settings apply everywhere tuning is checked.
function tuningSettings(dial: ReturnType<typeof createNeedle>) {
  const settings = getSettings();
  const key = h("div", { className: "dial-key" });
  const yellowSlider = slider(t.yellowZone, "toleranceCents", 10, 50, 1, "cents", () => showTuning());
  const yellowInput = yellowSlider.querySelector("input")!;
  function showTuning() {
    const yellowOn = passCents() > settings.greenCents;
    dial.drawZones();
    // Close enough can't be tighter than in tune, so its slider starts there, where it's off.
    yellowInput.min = String(settings.greenCents);
    yellowInput.value = String(settings.toleranceCents);
    if (!yellowOn) yellowSlider.querySelector("output")!.textContent = t.off;
    key.replaceChildren(
      h("span", { className: "in-tune" }, t.inTuneWithin(settings.greenCents)),
      h("span", { className: "close-enough" }, yellowOn ? t.closeEnoughWithin(passCents()) : t.closeEnoughOff),
    );
  }
  showTuning();
  return h(
    "div",
    { className: "tuning" },
    key,
    setting(t.greenZone, t.greenCaption, slider(t.greenZone, "greenCents", 3, 25, 1, "cents", showTuning)),
    setting(t.yellowZone, t.yellowCaption, yellowSlider),
  );
}

// The tuner, a panel of its own: the dial, the note heard large with its Do Ré Mi name, and its pitch in words. parts
// go under it. The gear in its corner turns the panel to how in tune counts, the dial still following what's played,
// and back.
export function createTuner(...parts: Node[]) {
  const dial = createNeedle();
  const letter = h("span", { className: "tuner-letter" });
  const solfege = h("span", { className: "tuner-solfege" });
  const caption = h("p", { className: "tuner-caption" });
  const label = h("p", { className: "dock-label", textContent: t.youArePlaying });
  const reading = h("div", { className: "tuner-reading" }, h("div", { className: "tuner-note" }, letter, solfege), caption, ...parts);
  let settingsFace: HTMLElement | null = null;
  const toggle = h("button", { type: "button", className: "tuner-toggle", innerHTML: GEAR_ICON, ariaLabel: t.tuning, onclick: () => showSettings(!settingsFace?.isConnected) });
  const element = h("div", { className: "stage-panel stage-tuner" }, toggle, label, dial.element, reading);

  function showSettings(on: boolean) {
    if (on) element.append((settingsFace ??= tuningSettings(dial)));
    else settingsFace?.remove();
    reading.hidden = label.hidden = on;
    toggle.ariaPressed = String(on);
  }

  // The note heard, by its nearest note: its letter, with any sharp or flat small, and its name. The dial shows how far
  // off it is from targetMidi, the note to play, or else from that nearest note.
  function hear(frequency: number | null, targetMidi?: number) {
    if (frequency === null) {
      dial.show(null);
      letter.textContent = "—";
      solfege.textContent = caption.textContent = "";
      return;
    }
    const midi = nearestMidi(frequency);
    const cents = centsFrom(frequency, targetMidi ?? midi);
    const labels = noteLabels(pitchOf(midi));
    dial.show(cents);
    letter.replaceChildren(labels.letter[0], h("small", {}, labels.letter.slice(1)));
    solfege.textContent = labels.solfege;
    caption.textContent = t.tunerCaption(localNumber(frequency, 1), tuningWord(cents));
  }

  showSettings(false);
  hear(null);
  return { element, hear };
}
