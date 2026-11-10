import { t } from "../../i18n";
import { h } from "../dom";
import { setFullscreenLayout } from "../layout";
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

  function set(value: boolean) {
    on = value;
    setFullscreenLayout(value);
    document.documentElement.classList.toggle("fullscreen", value);
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
