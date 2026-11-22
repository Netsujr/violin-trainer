import "@picocss/pico/css/pico.pumpkin.min.css";
import "./styles/base.css";
import "./style.css";
// The shared screen parts first, so the sidebar's own versions of them win.
import "./styles/screen.css";
import "./styles/shell.css";
import "./styles/staff.css";
import "./styles/listen.css";
import "./styles/practice.css";
import "./styles/library.css";
import "./styles/calendar.css";
import "./styles/progress.css";
import "./styles/settings.css";
import { sharedMetronome } from "./audio/metronome";
import { sharedAudioContext } from "./audio/reference";
import { setLanguage, t, type Language } from "./i18n";
import { getSettings, saveSettings } from "./storage";
import { h, type Screen } from "./ui/dom";
import { addPieceScreen } from "./ui/addPiece";
import { libraryScreen } from "./ui/library";
import { listenScreen } from "./ui/listen";
import { calendarScreen } from "./ui/calendar";
import { practiceScreen } from "./ui/practice";
import { progressScreen, type GroupKey } from "./ui/progress";
import { createMetronomeButton } from "./ui/practice/options";
import { createRecordToggle } from "./ui/runControls";
import { settingsScreen } from "./ui/settings";
import { BOOK_ICON, CALENDAR_ICON, GEAR_ICON, MIC_ICON, MUSIC_ICON, PANEL_ICON } from "./ui/toggles";

const SCREEN_NAMES = ["Listen", "Practice", "Library", "Calendar"] as const;
// Settings sits at the bottom of the sidebar, apart from the screens. Progress and Add piece aren't in the menu:
// Progress opens from a Library group, for that group, or from Listen, for its scored modes, and Add piece from
// Library, under which both show.
type MenuName = (typeof SCREEN_NAMES)[number] | "Settings";
type ScreenName = MenuName | "Progress" | "AddPiece";
const NAV_ICONS = { Listen: MIC_ICON, Practice: MUSIC_ICON, Library: BOOK_ICON, Calendar: CALENDAR_ICON, Settings: GEAR_ICON };
const LANGUAGES: [Language, string][] = [
  ["en", "EN"],
  ["pt", "PT"],
];

const app = document.querySelector<HTMLElement>("#app")!;
const header = h("header");
const main = h("main");
// A screen's own items, like Listen's modes, under its button in the sidebar.
const subItems = h("div", { className: "nav-sub" });
const navButtons = new Map<MenuName, HTMLButtonElement>();
let currentName: ScreenName = "Listen";
let current: Screen | undefined;

// id is the piece for Practice, and the group for Progress and Library.
function build(name: ScreenName, id?: string, aligning = false) {
  if (name === "Listen") return listenScreen(() => show("Progress", "listen"));
  if (name === "Progress")
    return progressScreen(
      id as GroupKey | "listen",
      () => show(id === "listen" ? "Listen" : "Library", id === "listen" ? undefined : id),
      (group) => show("Library", group),
    );
  if (name === "Practice") return practiceScreen(id, aligning ? () => show("Library") : undefined);
  if (name === "Library")
    return libraryScreen(
      { practise: (piece) => show("Practice", piece), align: (piece) => show("Practice", piece, true), progress: (group) => show("Progress", group), addPiece: () => show("AddPiece") },
      id as GroupKey | undefined,
    );
  // Back from Add piece goes to the group its pieces join.
  if (name === "AddPiece") return addPieceScreen(() => show("Library", "customSongs"));
  if (name === "Settings") return settingsScreen();
  return calendarScreen();
}

// aligning opens Practice to line up the piece's backing track.
async function show(name: ScreenName, id?: string, aligning = false) {
  await current?.leave();
  currentName = name;
  current = build(name, id, aligning);
  main.replaceChildren(current.element);
  // Progress and Add piece open from a Library card or group, which can be far down the page.
  if (name === "Progress" || name === "AddPiece") scrollTo(0, 0);
  const menuName = name === "Progress" ? (id === "listen" ? "Listen" : "Library") : name === "AddPiece" ? "Library" : name;
  navButtons.forEach((button, screen) => (button.ariaCurrent = screen === menuName ? "page" : null));
  navButtons.get(menuName)!.after(subItems);
  subItems.replaceChildren(...(current.sidebar ? [current.sidebar] : []));
  subItems.hidden = !current.sidebar;
}

function renderHeader() {
  const settings = getSettings();
  document.documentElement.lang = t.locale;
  document.title = t.appName;
  const navButton = (name: MenuName) => {
    const button = h("button", { type: "button", className: "nav-item", onclick: () => show(name) }, icon(NAV_ICONS[name]), h("span", { className: "nav-word" }, t.screens[name]));
    navButtons.set(name, button);
    return button;
  };
  // Shrinks the sidebar to its icons, and back, remembered for next time.
  const railToggle = h("button", {
    type: "button",
    className: "rail-toggle",
    innerHTML: PANEL_ICON,
    onclick() {
      settings.sidebarIcons = !settings.sidebarIcons;
      saveSettings();
      showRail();
    },
  });
  const showRail = () => {
    app.classList.toggle("sidebar-icons", settings.sidebarIcons);
    railToggle.ariaLabel = settings.sidebarIcons ? t.expandSidebar : t.shrinkSidebar;
  };
  showRail();
  header.replaceChildren(
    h("div", { className: "brand-row" }, h("strong", { className: "brand" }, t.appName), railToggle),
    h("nav", {}, ...SCREEN_NAMES.map(navButton)),
    // Record, and the metronome with its BPM, on every screen, then Settings with the language beside it.
    h(
      "div",
      { className: "rail-tools" },
      createRecordToggle(),
      createMetronomeButton(tempoChanged),
      h(
        "div",
        { className: "set-row" },
        h("nav", {}, navButton("Settings")),
        h(
          "div",
          { role: "group", className: "segments language", ariaLabel: t.language },
          ...LANGUAGES.map(([language, label]) => h("button", { type: "button", textContent: label, ariaPressed: String(language === settings.language), onclick: () => changeLanguage(language) })),
        ),
      ),
    ),
  );
}

const icon = (svg: string) => h("span", { className: "icon", innerHTML: svg });

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
app.append(header, main);

addEventListener("pagehide", () => current?.leave());

// The header's metronome, playing whenever it's on, on any screen that doesn't play its own clicks.
const METRONOME_TICK_MS = 25;
setInterval(() => {
  const { metronomeOn, bpm } = getSettings();
  if (metronomeOn && !current?.ownsMetronome?.() && sharedAudioContext().state === "running") sharedMetronome.tick(performance.now(), bpm);
}, METRONOME_TICK_MS);

// The lanes draw their labels in Barlow, and the staff its notes in Bravura, so both are ready first.
await Promise.all([document.fonts.load("30px Bravura"), document.fonts.load("700 16px Barlow")]);
show("Listen");
