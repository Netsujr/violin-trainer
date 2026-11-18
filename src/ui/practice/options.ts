import { sharedAudioContext } from "../../audio/reference";
import { t } from "../../i18n";
import { PATTERNS } from "../../music/patterns";
import { COUNT_IN_CHOICES, getSettings, saveSettings, type Settings } from "../../storage";
import { h } from "../dom";
import { METRONOME_ICON } from "../toggles";

export const ICON_BUTTON = "secondary outline icon-button";
const MIN_BPM = 30;
const MAX_BPM = 120;
// How far a slide on the metronome goes for one BPM, in pixels.
const SLIDE_PX = 4;

type OptionKey = { [Key in keyof Settings]-?: Settings[Key] extends boolean ? Key : never }[keyof Settings];
// Ends a running session, before a change it can't carry on through.
type StopRun = () => Promise<unknown>;

// An on/off setting shown as an icon in a box that lights up when on. It's a checkbox underneath, laid over the icon,
// and its name is the tooltip and what screen readers say.
export function iconSwitch(key: OptionKey, label: string, icon: string, title = label, onChange?: () => void) {
  const settings = getSettings();
  const input = h("input", {
    type: "checkbox",
    checked: settings[key],
    onchange() {
      settings[key] = input.checked;
      saveSettings();
      onChange?.();
    },
  });
  return { input, label: h("label", { className: "icon-switch", title }, input, h("span", { className: "icon", innerHTML: icon }), h("span", { className: "visually-hidden" }, label)) };
}

// An icon button by Start that turns a mode on and off. With stopRun, it ends a running session first.
export function modeButton(key: OptionKey, label: string, icon: string, title: string, apply: () => void, stopRun?: StopRun) {
  const settings = getSettings();
  const button = h("button", {
    className: ICON_BUTTON,
    innerHTML: icon,
    title,
    ariaLabel: label,
    ariaPressed: String(settings[key]),
    async onclick() {
      if (stopRun) await stopRun();
      settings[key] = !settings[key];
      button.ariaPressed = String(settings[key]);
      saveSettings();
      apply();
    },
  });
  return button;
}

// The metronome as one button, its BPM small in the corner. A tap switches it on and off. Pressed and slid right the
// BPM goes up, slid left down, a step every SLIDE_PX, without switching it. The mouse wheel and the arrow keys step it too.
export function createMetronomeButton(onChange: () => void) {
  const settings = getSettings();
  const badge = h("span", { className: "bpm-badge" });
  const button = h("button", {
    type: "button",
    className: "box-toggle metronome-button",
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
  }, h("span", { className: "icon", innerHTML: METRONOME_ICON }), badge);
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
    badge.textContent = String(settings.bpm);
    button.ariaPressed = String(settings.metronomeOn);
    button.ariaLabel = `${t.metronome}, ${settings.bpm} BPM`;
  }
  show();
  return button;
}

// The count-in as one button: each press steps through off, ×2, ×4 and on up to ×10, then back to off.
export function createCountInButton(icon: string, onChange: () => void) {
  const settings = getSettings();
  const beats = h("span", { className: "count-in-beats" });
  const button = h("button", {
    type: "button",
    className: "box-toggle count-in",
    onclick() {
      const next = settings.countInOn ? COUNT_IN_CHOICES[COUNT_IN_CHOICES.indexOf(settings.countInBeats) + 1] : COUNT_IN_CHOICES[0];
      settings.countInOn = next !== undefined;
      if (next) settings.countInBeats = next;
      saveSettings();
      show();
      onChange();
    },
  }, h("span", { className: "icon", innerHTML: icon }), beats);
  function show() {
    const label = settings.countInOn ? `×${settings.countInBeats}` : t.off;
    beats.textContent = settings.countInOn ? label : "";
    button.ariaPressed = String(settings.countInOn);
    button.title = `${t.countIn}: ${label}. ${t.countInHint}`;
    button.ariaLabel = `${t.countIn}: ${label}`;
  }
  show();
  return button;
}

// The rhythm patterns under the staff, for scales.
export function createPatternRow(stopRun: StopRun, onChange: () => void) {
  const settings = getSettings();
  const buttons = PATTERNS.map((_, pattern) =>
    h("button", {
      textContent: String(pattern + 1),
      title: `${t.pattern} ${pattern + 1}`,
      ariaPressed: String(pattern === settings.pattern),
      async onclick() {
        await stopRun();
        settings.pattern = pattern;
        saveSettings();
        buttons.forEach((button, index) => (button.ariaPressed = String(index === pattern)));
        onChange();
      },
    }),
  );
  return h("div", { className: "row patterns" }, t.pattern, h("div", { role: "group", ariaLabel: t.pattern }, ...buttons));
}
