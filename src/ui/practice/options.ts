import { sharedAudioContext } from "../../audio/reference";
import { t } from "../../i18n";
import { COUNT_IN_CHOICES, getSettings, saveSettings } from "../../storage";
import { h } from "../dom";
import { METRONOME_ICON } from "../toggles";

export const ICON_BUTTON = "secondary outline icon-button";
const MIN_BPM = 30;
const MAX_BPM = 120;
// How far a slide on the metronome goes for one BPM, in pixels.
const SLIDE_PX = 4;

// The metronome as one button, named with its BPM. A tap switches it on and off. Pressed and slid right the BPM goes
// up, slid left down, a step every SLIDE_PX, without switching it. The mouse wheel and the arrow keys step it too.
export function createMetronomeButton(onChange: () => void) {
  const settings = getSettings();
  const word = h("span", { className: "nav-word" });
  const button = h("button", {
    type: "button",
    className: "nav-item metronome-button",
    title: `${t.metronome}: ${t.bpmHint}`,
    onclick() {
      // A slide ends in a click, which isn't a tap.
      if (slid) return void (slid = false);
      settings.metronomeOn = !settings.metronomeOn;
      // The tap lets the browser start the sound, which it won't without one.
      if (settings.metronomeOn) void sharedAudioContext().resume();
      saveSettings();
      show();
      onChange();
    },
    onpointerdown(event) {
      slide = { x: event.clientX, bpm: settings.bpm };
      slid = false;
      button.setPointerCapture(event.pointerId);
    },
    onpointermove(event) {
      if (!slide) return;
      const moved = event.clientX - slide.x;
      if (Math.abs(moved) >= SLIDE_PX) slid = true;
      if (slid) setBpm(slide.bpm + Math.trunc(moved / SLIDE_PX));
    },
    onpointerup: () => (slide = null),
    onpointercancel: () => (slide = null),
    onwheel(event) {
      event.preventDefault();
      setBpm(settings.bpm + (event.deltaY < 0 ? 1 : -1));
    },
    onkeydown(event) {
      const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      setBpm(settings.bpm + step);
    },
  }, h("span", { className: "icon", innerHTML: METRONOME_ICON }), word);
  let slide: { x: number; bpm: number } | null = null;
  let slid = false;

  function setBpm(bpm: number) {
    bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, bpm));
    if (bpm === settings.bpm) return;
    settings.bpm = bpm;
    saveSettings();
    show();
    onChange();
  }
  function show() {
    word.textContent = `${t.metronome} ${settings.bpm}`;
    button.ariaPressed = String(settings.metronomeOn);
    button.ariaLabel = `${t.metronome}, ${settings.bpm} BPM`;
  }
  show();
  return button;
}

// The count-in as − and + either side of its beats: off, then 2, 4 and on to 10.
export function createCountInStepper(onChange: () => void) {
  const settings = getSettings();
  const choices = [0, ...COUNT_IN_CHOICES];
  const value = h("span", { className: "stepper-value", ariaLive: "polite" });
  const step = (by: number) => {
    const at = choices.indexOf(settings.countInOn ? settings.countInBeats : 0);
    const next = choices[Math.max(0, Math.min(choices.length - 1, at + by))];
    settings.countInOn = next > 0;
    if (next) settings.countInBeats = next;
    saveSettings();
    show();
    onChange();
  };
  const fewer = h("button", { type: "button", textContent: "−", ariaLabel: t.fewerBeats, onclick: () => step(-1) });
  const more = h("button", { type: "button", textContent: "+", ariaLabel: t.moreBeats, onclick: () => step(1) });
  function show() {
    value.textContent = settings.countInOn ? t.countInBeats(settings.countInBeats) : t.off;
    fewer.disabled = !settings.countInOn;
    more.disabled = settings.countInBeats === COUNT_IN_CHOICES.at(-1) && settings.countInOn;
  }
  show();
  return h("div", { role: "group", className: "segments count-in", ariaLabel: t.countIn }, fewer, value, more);
}
