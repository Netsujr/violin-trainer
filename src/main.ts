import "@picocss/pico/css/pico.pumpkin.min.css";
import "./style.css";
import { h, type Screen } from "./ui/dom";
import { libraryScreen } from "./ui/library";
import { listenScreen } from "./ui/listen";
import { logScreen } from "./ui/log";
import { practiceScreen } from "./ui/practice";
import { createSettingsPanel } from "./ui/settings";

const SCREEN_NAMES = ["Listen", "Practice", "Library", "Log"] as const;
type ScreenName = (typeof SCREEN_NAMES)[number];

const main = h("main");
const navButtons = SCREEN_NAMES.map((name) => h("button", { textContent: name, onclick: () => show(name) }));
let current: Screen | undefined;

function build(name: ScreenName, pieceId?: string) {
  if (name === "Listen") return listenScreen();
  if (name === "Practice") return practiceScreen(pieceId);
  if (name === "Library") return libraryScreen((id) => show("Practice", id));
  return logScreen();
}

async function show(name: ScreenName, pieceId?: string) {
  await current?.leave();
  current = build(name, pieceId);
  main.replaceChildren(current.element);
  navButtons.forEach((button) => (button.ariaCurrent = button.textContent === name ? "page" : null));
}

document
  .querySelector("#app")!
  .append(
    h(
      "header",
      {},
      h("strong", { className: "brand" }, "Violin Note Trainer"),
      h("nav", {}, h("div", { role: "group" }, ...navButtons)),
      createSettingsPanel(),
    ),
    main,
  );

addEventListener("pagehide", () => current?.leave());

await document.fonts.load("30px Bravura");
show("Listen");
