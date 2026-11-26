import { t } from "../i18n";
import { h } from "./dom";
import { chip } from "./recordingDialog";

// A note guesser game's end: the heading, how it went as chips, and Close and Play again. Close, Esc or a click outside
// just close it; only Play again runs onPlayAgain.
export function openGuessResults(heading: string, words: string[], onPlayAgain: () => void) {
  const dialog = h(
    "dialog",
    {
      className: "confirm",
      ariaLabel: heading,
      onclick(event) {
        if (event.target === dialog) dialog.close();
      },
      onclose() {
        dialog.remove();
        if (dialog.returnValue === "again") onPlayAgain();
      },
    },
    h(
      "article",
      {},
      h("header", {}, h("strong", {}, heading)),
      h("div", { className: "chip-row" }, ...words.map(chip)),
      h(
        "footer",
        {},
        h("button", { className: "secondary outline", textContent: t.close, onclick: () => dialog.close() }),
        h("button", { textContent: t.playAgain, onclick: () => dialog.close("again") }),
      ),
    ),
  );
  document.body.append(dialog);
  dialog.showModal();
}
