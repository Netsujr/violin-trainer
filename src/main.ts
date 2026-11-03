import "@picocss/pico/css/pico.pumpkin.min.css";
import "./style.css";
import { setLanguage, t, type Language } from "./i18n";
import { getSettings, saveSettings } from "./storage";
import { h, type Screen } from "./ui/dom";
import { libraryScreen } from "./ui/library";
import { listenScreen } from "./ui/listen";
import { logScreen } from "./ui/log";
import { practiceScreen } from "./ui/practice";
import { createSettingsPanel } from "./ui/settings";

const SCREEN_NAMES = ["Listen", "Practice", "Library", "Log"] as const;
type ScreenName = (typeof SCREEN_NAMES)[number];

const LANGUAGES: [Language, string][] = [
  ["en", "EN"],
  ["pt", "PT"],
];

const header = h("header");
const main = h("main");
let navButtons: HTMLButtonElement[] = [];
let currentName: ScreenName = "Listen";
let current: Screen | undefined;

function build(name: ScreenName, pieceId?: string) {
  if (name === "Listen") return listenScreen();
  if (name === "Practice") return practiceScreen(pieceId);
  if (name === "Library") return libraryScreen((id) => show("Practice", id));
  return logScreen();
}

async function show(name: ScreenName, pieceId?: string) {
  await current?.leave();
  currentName = name;
  current = build(name, pieceId);
  main.replaceChildren(current.element);
  navButtons.forEach((button, index) => (button.ariaCurrent = SCREEN_NAMES[index] === name ? "page" : null));
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
  return show(currentName);
}

setLanguage(getSettings().language);
renderHeader();
document.querySelector("#app")!.append(header, main);

addEventListener("pagehide", () => current?.leave());

await document.fonts.load("30px Bravura");
show("Listen");
