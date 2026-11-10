import { t } from "../../i18n";
import type { PieceNote } from "../../music/notes";
import { getTrack, saveTrack, type Track } from "../../storage";
import { h } from "../dom";
import { createTrackAlign } from "./trackAlign";

// Starting partway, the recording starts this many beats before the note, to come in on.
const LEAD_IN_BEATS = 4;
// Between the media clock's steps, the wall clock carries it on, but never further than this, in case it has stalled.
const MAX_CARRY_MS = 250;

type Options = {
  // While lining the track up, the way back to Library. Otherwise null.
  aligning: (() => void) | null;
  // Ends a running session, before a change it can't carry on through.
  stopRun: () => Promise<unknown>;
  onChange: () => void;
};

// The piece's backing track in a run. Tracks are added in Library: Practice just switches one on, and aligning shows the
// controls to line it up. During a run the lanes follow its playback, so speed and any change to the alignment carry
// straight through.
export function createBackingTrack({ aligning, stopRun, onChange }: Options) {
  let pieceId = "";
  let track: Track | null = null;
  const audio = new Audio();
  audio.preservesPitch = true;
  // Some browsers move the media clock in steps, so between steps the wall clock carries it on.
  let mediaTime = 0;
  let wallTime = 0;
  const save = () => {
    if (track) saveTrack(pieceId, track);
  };
  const align = aligning ? createTrackAlign({ track: () => track, audio, save, onDone: aligning }) : null;
  const toggle = h("div", { className: "track" });
  const active = () => Boolean(track && (aligning || track.on));

  function show(next: Track | null) {
    track = next;
    if (audio.src) URL.revokeObjectURL(audio.src);
    if (track) audio.src = URL.createObjectURL(track.blob);
    else audio.removeAttribute("src");
    renderToggle();
    align?.load();
    onChange();
  }

  function renderToggle() {
    if (!track || aligning) return toggle.replaceChildren();

    const current = track;
    const input = h("input", {
      type: "checkbox",
      checked: current.on,
      async onchange() {
        await stopRun();
        current.on = input.checked;
        save();
        onChange();
      },
    });
    toggle.replaceChildren(h("label", {}, input, ` ${t.playWithTrack(current.name)}`));
  }

  return {
    // The switch for Practice's Options.
    toggle,
    // While aligning: the controls, in place of Options, and the waveform, under the lanes.
    panel: align?.panel ?? null,
    strip: align?.strip ?? null,
    // Whether a run plays along with it.
    get active() {
      return active();
    },
    // Whether the mic listens. Only a run with the track can leave it off, and aligning always does.
    get listening() {
      return !active() || (!aligning && track!.listen);
    },
    // How long a beat lasts, at the speed it's playing.
    beatMs: () => 60000 / (track!.bpm * track!.speed),
    // How far the recording has got, in beats from the piece's first note.
    beat(now: number) {
      if (audio.currentTime !== mediaTime) {
        mediaTime = audio.currentTime;
        wallTime = now;
      }
      const carried = Math.min(MAX_CARRY_MS, Math.max(0, now - wallTime));
      const seconds = audio.paused ? mediaTime : mediaTime + (carried / 1000) * audio.playbackRate;
      return ((seconds - track!.offset) * track!.bpm) / 60;
    },
    // From the start for the first note, and with a lead-in for any other.
    playFrom(notes: PieceNote[], index: number) {
      const beats = notes.slice(0, index).reduce((sum, note) => sum + (note.beats ?? 1), 0);
      audio.playbackRate = track!.speed;
      audio.currentTime = index === 0 ? 0 : Math.max(0, track!.offset + ((beats - LEAD_IN_BEATS) * 60) / track!.bpm);
      mediaTime = audio.currentTime;
      wallTime = performance.now();
      // ponytail: a browser that refuses to play (no recent tap) leaves the lanes waiting at the first note; say so if it bites.
      audio.play().catch(() => {});
    },
    pause: () => audio.pause(),
    // The lanes moved: the waveform follows them.
    showBeat: (beat: number) => align?.showBeat(beat),
    // The piece's own track, if it has one.
    async load(id: string) {
      audio.pause();
      pieceId = id;
      const saved = await getTrack(id);
      if (pieceId === id) show(saved ?? null);
    },
    leave() {
      audio.pause();
      if (audio.src) URL.revokeObjectURL(audio.src);
    },
  };
}
