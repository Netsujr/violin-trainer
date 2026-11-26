import { t } from "../../i18n";
import { h } from "../dom";
import { COMPRESS_ICON, EXPAND_ICON } from "../toggles";
import { ICON_BUTTON } from "./options";

// The fullscreen button. Works without the browser's own fullscreen too, which iPhones don't offer to web pages.
// onChange lays the screen out for the new state.
export function createFullscreen(onChange: (on: boolean) => void) {
  let on = false;
  const button = h("button", { className: ICON_BUTTON, onclick: toggle });

  function label() {
    const text = on ? t.exitFullscreen : t.fullscreen;
    button.innerHTML = on ? COMPRESS_ICON : EXPAND_ICON;
    button.title = text;
    button.ariaLabel = text;
  }

  // Record and the metronome stay to hand: in the title row while the sidebar's hidden, and back in it after.
  function moveRailTools() {
    const tools = document.querySelectorAll(".record-toggle, .metronome-button");
    if (on) button.parentElement?.prepend(...tools);
    else document.querySelector(".rail-tools")?.prepend(...tools);
  }

  // What's written on the notes comes too, first in the title row, from the settings panel that's hidden, and goes back.
  let labelsHome: Element | null = null;
  function moveLabels() {
    const labels = document.querySelector(".note-labels");
    if (!labels) return;
    if (on) {
      labelsHome = labels.parentElement;
      button.parentElement?.prepend(labels);
    } else labelsHome?.append(labels);
  }

  function set(value: boolean) {
    on = value;
    document.documentElement.classList.toggle("fullscreen", value);
    moveRailTools();
    moveLabels();
    label();
    onChange(value);
  }

  function toggle() {
    set(!on);
    if (on) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen();
  }

  // Leaving the browser's fullscreen, by its own controls, leaves ours too.
  function onFullscreenChange() {
    if (on && !document.fullscreenElement) set(false);
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && on) toggle();
  }
  document.addEventListener("fullscreenchange", onFullscreenChange);
  addEventListener("keydown", onKeyDown);
  label();

  return {
    button,
    get on() {
      return on;
    },
    leave() {
      if (on) toggle();
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      removeEventListener("keydown", onKeyDown);
    },
  };
}
