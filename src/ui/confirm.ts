import { t } from "../i18n";
import { h } from "./dom";

// Asks before something that can't be undone, and resolves to whether to go ahead. Cancel, Esc or a click outside all
// say no, and Cancel starts with the focus, so a stray Enter says no too.
export function confirmAction(message: string, confirmLabel: string) {
  return new Promise<boolean>((resolve) => {
    const dialog = h(
      "dialog",
      {
        ariaLabel: message,
        className: "confirm",
        onclick(event) {
          if (event.target === dialog) dialog.close();
        },
        onclose() {
          dialog.remove();
          resolve(dialog.returnValue === "yes");
        },
      },
      h(
        "article",
        {},
        h("p", {}, message),
        h(
          "footer",
          {},
          h("button", { className: "secondary outline", textContent: t.cancel, onclick: () => dialog.close() }),
          h("button", { className: "confirm-yes", textContent: confirmLabel, onclick: () => dialog.close("yes") }),
        ),
      ),
    );
    document.body.append(dialog);
    dialog.showModal();
  });
}
