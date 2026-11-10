import { t } from "../../i18n";
import { PATTERNS } from "../../music/patterns";
import { COUNT_IN_CHOICES, getSettings, saveSettings, type Settings } from "../../storage";
import { h } from "../dom";

export const ICON_BUTTON = "secondary outline icon-button";

type OptionKey = { [Key in keyof Settings]-?: Settings[Key] extends boolean ? Key : never }[keyof Settings];
// Ends a running session, before a change it can't carry on through.
type StopRun = () => Promise<unknown>;

// A checkbox in Options for an on/off setting.
export function optionSwitch(key: OptionKey, label: string, title = "", onChange?: () => void) {
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
  return { input, label: h("label", { title }, input, ` ${label}`) };
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

// The BPM slider and its reading.
export function createBpmControl(onChange: () => void) {
  const settings = getSettings();
  const value = h("output", { textContent: `${settings.bpm} BPM` });
  return h(
    "label",
    { className: "bpm" },
    h("input", {
      type: "range",
      min: "30",
      max: "120",
      step: "1",
      value: String(settings.bpm),
      oninput(event) {
        settings.bpm = Number((event.target as HTMLInputElement).value);
        value.textContent = `${settings.bpm} BPM`;
        onChange();
        saveSettings();
      },
    }),
    value,
  );
}

// How many beats the count-in lasts, beside its switch.
export function createCountInPicker(onChange: () => void) {
  const settings = getSettings();
  const select = h(
    "select",
    {
      ariaLabel: t.countIn,
      disabled: !settings.countInOn,
      onchange() {
        settings.countInBeats = Number(select.value);
        saveSettings();
        onChange();
      },
    },
    ...COUNT_IN_CHOICES.map((beats) => h("option", { value: String(beats), selected: beats === settings.countInBeats, textContent: String(beats) })),
  );
  return select;
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

// The Options panel, remembering whether it was left open.
export function createOptionsPanel(...rows: Node[]) {
  const settings = getSettings();
  const panel = h(
    "details",
    {
      className: "options",
      open: settings.optionsOpen,
      ontoggle() {
        settings.optionsOpen = panel.open;
        saveSettings();
      },
    },
    h("summary", {}, t.options),
    ...rows,
  );
  return panel;
}
