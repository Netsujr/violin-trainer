import "@picocss/pico/css/pico.pumpkin.min.css";
import "./style.css";
import { sharedMetronome } from "./audio/metronome";
import { sharedAudioContext } from "./audio/reference";
import { setLanguage, t, type Language } from "./i18n";
import { getSettings, saveSettings } from "./storage";
import { h, type Screen } from "./ui/dom";
import { libraryScreen } from "./ui/library";
import { listenScreen } from "./ui/listen";
import { calendarScreen } from "./ui/calendar";
import { practiceScreen } from "./ui/practice";
import { progressScreen, type GroupKey } from "./ui/progress";
import { createMetronomeButton } from "./ui/practice/options";
import { createRecordToggle } from "./ui/runControls";
import { createSettingsPanel } from "./ui/settings";

const SCREEN_NAMES = ["Listen", "Practice", "Library", "Calendar"] as const;
// Progress isn't in the menu: it opens from a Library group, for that group, or from Listen, for its scored modes.
type ScreenName = (typeof SCREEN_NAMES)[number] | "Progress";

const header = h("header");
const main = h("main");
let navButtons: HTMLButtonElement[] = [];
let currentName: ScreenName = "Listen";
let current: Screen | undefined;

// id is the piece for Practice, and the group for Progress.
function build(name: ScreenName, id?: string, aligning = false) {
  if (name === "Listen") return listenScreen(() => show("Progress", "listen"));
  if (name === "Progress") return progressScreen(id as GroupKey | "listen", () => show(id === "listen" ? "Listen" : "Library"));
  if (name === "Practice") return practiceScreen(id, aligning ? () => show("Library") : undefined);
  if (name === "Library") return libraryScreen((piece) => show("Practice", piece), (piece) => show("Practice", piece, true), (group) => show("Progress", group));
  return calendarScreen();
}

// aligning opens Practice to line up the piece's backing track.
async function show(name: ScreenName, id?: string, aligning = false) {
  await current?.leave();
  currentName = name;
  current = build(name, id, aligning);
  main.replaceChildren(current.element);
  // Progress opens from a Library group, which can be far down the page.
  if (name === "Progress") scrollTo(0, 0);
  const menuName = name === "Progress" ? (id === "listen" ? "Listen" : "Library") : name;
  navButtons.forEach((button, index) => (button.ariaCurrent = SCREEN_NAMES[index] === menuName ? "page" : null));
}

function renderHeader() {
  document.documentElement.lang = t.locale;
  document.title = t.appName;
  navButtons = SCREEN_NAMES.map((name) => h("button", { textContent: t.screens[name], onclick: () => show(name) }));
  header.replaceChildren(
    h("strong", { className: "brand" }, t.appName),
    h("nav", {}, h("div", { role: "group" }, ...navButtons)),
    // Record, and the metronome with its BPM, on every screen, by Settings.
    h("div", { className: "row header-tools" }, createRecordToggle(), createMetronomeButton(tempoChanged)),
    createSettingsPanel(changeLanguage),
  );
}

const tempoChanged = () => current?.tempoChanged?.();

// ponytail: rebuilding the screen ends a running session (logged and saved) and returns Practice to its first piece.
function changeLanguage(language: Language) {
  getSettings().language = language;
  saveSettings();
  setLanguage(language);
  renderHeader();
  return show(currentName === "Progress" ? "Library" : currentName);
}

setLanguage(getSettings().language);
renderHeader();
document.querySelector("#app")!.append(header, main);

addEventListener("pagehide", () => current?.leave());

// The header's metronome, playing whenever it's on, on any screen that doesn't play its own clicks.
const METRONOME_TICK_MS = 25;
setInterval(() => {
  const { metronomeOn, bpm } = getSettings();
  if (metronomeOn && !current?.ownsMetronome?.() && sharedAudioContext().state === "running") sharedMetronome.tick(performance.now(), bpm);
}, METRONOME_TICK_MS);

// The Settings panel covers the run buttons, so anything outside it closes it, as a menu would.
const closeSettings = () => header.querySelector("details")?.removeAttribute("open");
// A press rather than a click, because iOS sends no click for a tap on plain content.
addEventListener("pointerdown", (event) => {
  if (!header.querySelector("details")?.contains(event.target as Node)) closeSettings();
});
addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSettings();
});

await document.fonts.load("30px Bravura");
show("Listen");
