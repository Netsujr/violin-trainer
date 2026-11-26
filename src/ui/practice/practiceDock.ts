import { t } from "../../i18n";
import { PATTERNS } from "../../music/patterns";
import { getSettings, saveSettings } from "../../storage";
import { h } from "../dom";
import { dockOption, panelButton } from "../panels";
import { chipGroup, noteLabelToggles, wordToggle } from "../toggles";
import { createCountInStepper } from "./options";

type Deps = {
  // Ends a running session, before a change it can't carry on through.
  stopRun: () => Promise<unknown>;
  // Draws the notes again, for the labels and the count-in.
  render: () => void;
  // Builds the piece again, for the top note and the pattern.
  loadPiece: () => void;
  // Shows what applies now, after Pace, Repeat or the panels change.
  changed: () => void;
  // Lays the panels out again.
  arrange: () => void;
  // The backing track's switches, shown only when the piece has one.
  trackSwitches: HTMLElement;
};

// Practice's settings panel, docked under the panels: what's written on the notes, which panels are on screen and the
// pattern, then, on a row of its own, how a run goes. show hides what doesn't apply.
export function createPracticeDock({ stopRun, render, loadPiece, changed, arrange, trackSwitches }: Deps) {
  const settings = getSettings();
  const panels = settings.practicePanels;
  const panelsChanged = () => {
    saveSettings();
    arrange();
  };
  // A choice of two, kept, as one button saying which is picked: pressing it picks the other. Some end the run first.
  function pair<Key extends "followOn" | "loopOn" | "repeatTopOn">(key: Key, label: string, names: [string, string], apply: () => void, stops = false) {
    const button = h("button", {
      type: "button",
      className: "flip",
      async onclick() {
        settings[key] = !settings[key];
        saveSettings();
        show();
        if (stops) await stopRun();
        apply();
      },
    });
    const show = () => {
      button.textContent = names[Number(settings[key])];
      button.ariaLabel = `${label}: ${button.textContent}`;
    };
    show();
    return button;
  }

  const labels = noteLabelToggles(render);
  const tuner = wordToggle(t.tuner, panels.tuner, (on) => {
    panels.tuner = on;
    panelsChanged();
  });
  const onScreen = h(
    "div",
    { role: "group", className: "segments", ariaLabel: t.onScreen },
    panelButton("lanes", t.lanes, panels, panelsChanged),
    panelButton("staff", t.staff, panels, panelsChanged),
    panelButton("board", t.fingerboard, panels, panelsChanged),
    tuner,
  );
  const paceHint = h("p", { className: "dock-caption", textContent: t.waitHint });
  const pace = dockOption(t.pace, pair("followOn", t.pace, [t.waitForMe, t.keepMoving], changed, true), paceHint);
  const topNote = dockOption(t.topNote, pair("repeatTopOn", t.topNote, [t.once, t.twice], loadPiece, true));
  const pattern = dockOption(
    t.pattern,
    chipGroup(t.pattern, PATTERNS.map((_, index) => index), (index) => String(index + 1), () => settings.pattern, async (index) => {
      settings.pattern = index;
      saveSettings();
      await stopRun();
      loadPiece();
    }),
  );
  const countIn = dockOption(t.countIn, createCountInStepper(render));
  const track = dockOption(t.backingTrack, trackSwitches);

  return {
    element: h(
      "section",
      { className: "dock", ariaLabel: t.screens.Settings },
      dockOption(t.onTheNotes, labels),
      dockOption(t.onScreen, onScreen),
      pattern,
      // How a run goes starts a row of its own.
      h("div", { className: "dock-break" }),
      pace,
      dockOption(t.repeat, pair("loopOn", t.repeat, [t.once, t.loop], changed)),
      topNote,
      countIn,
      track,
    ),
    // A backing track sets the pace, so there's no Pace or count-in with one; with Keep moving, no count-in either, as
    // nothing waits. The top note and the patterns are for scales.
    show(scale: boolean, trackActive: boolean) {
      // Waiting says what it does; Keep moving speaks for itself.
      paceHint.hidden = settings.followOn;
      pace.hidden = trackActive;
      countIn.hidden = trackActive || settings.followOn;
      topNote.hidden = pattern.hidden = !scale;
      track.hidden = trackSwitches.hidden;
    },
  };
}
