import "@picocss/pico/css/pico.pumpkin.min.css";
import "./style.css";
import { setLanguage, t, type Language } from "./i18n";
import { getSettings, saveSettings } from "./storage";
import { h, type Screen } from "./ui/dom";
import { libraryScreen } from "./ui/library";
import { listenScreen } from "./ui/listen";
import { calendarScreen } from "./ui/calendar";
import { practiceScreen } from "./ui/practice";
import { progressScreen, type GroupKey } from "./ui/progress";
import { createSettingsPanel } from "./ui/settings";

const SCREEN_NAMES = ["Listen", "Practice", "Library", "Calendar"] as const;
// Progress isn't in the menu: it opens from a Library group, for that group.
type ScreenName = (typeof SCREEN_NAMES)[number] | "Progress";

const LANGUAGES: [Language, string][] = [
  ["en", "EN"],
  ["pt", "PT"],
];

const header = h("header");
const main = h("main");
let navButtons: HTMLButtonElement[] = [];
let currentName: ScreenName = "Listen";
let current: Screen | undefined;

// id is the piece for Practice, and the group for Progress.
function build(name: ScreenName, id?: string, aligning = false) {
  if (name === "Listen") return listenScreen();
  if (name === "Progress") return progressScreen(id as GroupKey, () => show("Library"));
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
  const menuName = name === "Progress" ? "Library" : name;
  navButtons.forEach((button, index) => (button.ariaCurrent = SCREEN_NAMES[index] === menuName ? "page" : null));
}

function renderHeader() {
  document.documentElement.lang = t.locale;
  document.title = t.appName;
  navButtons = SCREEN_NAMES.map((name) => h("button", { textContent: t.screens[name], onclick: () => show(name) }));
  header.replaceChildren(
    h("strong", { className: "brand" }, t.appName),
    h("nav", {}, h("div", { role: "group" }, ...navButtons)),
    h(
      "div",
      { role: "group", className: "language", ariaLabel: t.language },
      ...LANGUAGES.map(([language, label]) =>
        h("button", {
          textContent: label,
          ariaPressed: String(language === getSettings().language),
          onclick: () => changeLanguage(language),
        }),
      ),
    ),
    createSettingsPanel(),
  );
}

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
