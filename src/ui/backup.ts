import { t } from "../i18n";
import { dayKey } from "../practice/calendar";
import { backupJson, restoreBackup } from "../storage";
import { confirmAction } from "./confirm";
import { h } from "./dom";

// Back up and Restore, by the storage line: the practice log, plans and pieces as a file, without recordings or tracks.
// Restoring replaces what's here, so it asks first. say shows a problem on the storage line.
export function backupButtons(say: (problem: string) => void) {
  const file = h("input", { type: "file", accept: "application/json,.json", hidden: true });
  file.onchange = async () => {
    const picked = file.files?.[0];
    file.value = "";
    if (!picked || !(await confirmAction(t.restoreConfirm, t.restore))) return;
    if (restoreBackup(await picked.text())) location.reload();
    else say(t.notABackup);
  };

  async function backUp() {
    if (!(await confirmAction(t.backUpWarning, t.download))) return;
    const url = URL.createObjectURL(new Blob([backupJson()], { type: "application/json" }));
    h("a", { href: url, download: `violin-practice-${dayKey(new Date())}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return [
    h("button", { type: "button", className: "link-button", textContent: t.backUp, onclick: backUp }),
    h("button", { type: "button", className: "link-button", textContent: t.restore, onclick: () => file.click() }),
    file,
  ];
}
