import { decodeAudio, findBeat } from "../../audio/tempo";
import { localNumber, t } from "../../i18n";
import { TRACK_SPEEDS, type Track } from "../../storage";
import { h } from "../dom";
import { BEAT_WIDTH, HIT_X } from "../highway";
import { contentWidth, timelineScale } from "../layout";

const STRIP_HEIGHT = 72;
const PEAKS_PER_SECOND = 200;
const NUDGE_SECONDS = 0.02;
const WAVE_COLOR = "#e0a050";
const BEAT_LINE_COLOR = "rgba(255, 255, 255, 0.14)";
const FIRST_NOTE_COLOR = "#4cd07d";
const HIT_LINE_COLOR = "rgba(176, 48, 32, 0.8)";

type Deps = { track: () => Track | null; audio: HTMLAudioElement; save: () => void; onDone: () => void };

// Lining a backing track up with its piece. The recording's waveform runs under the lanes on the same timeline, and is
// dragged until its notes sit under the tiles. Tempo, first note and speed can be set by hand too, all while it plays.
export function createTrackAlign({ track, audio, save, onDone }: Deps) {
  // The loudest sound in each short stretch of the recording.
  let peaks: Float32Array | null = null;
  let beatAtHit = 0;
  const strip = h("canvas", { className: "waveform", title: t.dragWaveform, ariaLabel: t.dragWaveform });
  const context = strip.getContext("2d")!;
  const panel = h("div", { className: "track-align-panel" });
  const status = h("span", { className: "track-status" });
  let offsetInput = h("input");

  function draw() {
    const scale = timelineScale();
    const width = contentWidth();
    const height = STRIP_HEIGHT * scale;
    strip.width = width * devicePixelRatio;
    strip.height = height * devicePixelRatio;
    strip.style.width = `${width}px`;
    strip.style.height = `${height}px`;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    const current = track();
    if (!current || !peaks) return;

    const pxPerBeat = BEAT_WIDTH * scale;
    const hitX = HIT_X * scale;
    const xOfBeat = (beat: number) => hitX + (beat - beatAtHit) * pxPerBeat;
    const secondsAt = (x: number) => current.offset + ((beatAtHit + (x - hitX) / pxPerBeat) * 60) / current.bpm;
    context.fillStyle = BEAT_LINE_COLOR;
    for (let beat = Math.ceil(beatAtHit - hitX / pxPerBeat); xOfBeat(beat) <= width; beat++) context.fillRect(xOfBeat(beat), 0, 1, height);
    context.fillStyle = WAVE_COLOR;
    for (let x = 0; x < width; x++) {
      const from = Math.floor(secondsAt(x) * PEAKS_PER_SECOND);
      const to = Math.max(from + 1, Math.floor(secondsAt(x + 1) * PEAKS_PER_SECOND));
      let peak = 0;
      for (let bin = Math.max(0, from); bin < to && bin < peaks.length; bin++) peak = Math.max(peak, peaks[bin]);
      const bar = Math.max(1, peak * height * 0.9);
      context.fillRect(x, (height - bar) / 2, 1, bar);
    }
    context.fillStyle = FIRST_NOTE_COLOR;
    context.fillRect(xOfBeat(0) - 1, 0, 2, height);
    context.fillStyle = HIT_LINE_COLOR;
    context.fillRect(hitX - 2, 0, 4, height);
  }

  function setOffset(seconds: number, keep = true) {
    const current = track()!;
    current.offset = Math.max(0, Math.round(seconds * 1000) / 1000);
    offsetInput.value = String(current.offset);
    draw();
    if (keep) save();
  }

  // Dragging the waveform right makes the piece start earlier in the recording, and left later.
  strip.addEventListener("pointerdown", (down) => {
    const current = track();
    if (!current) return;
    strip.setPointerCapture(down.pointerId);
    const startOffset = current.offset;
    const toSeconds = (pixels: number) => ((pixels / (BEAT_WIDTH * timelineScale())) * 60) / current.bpm;
    strip.onpointermove = (move) => setOffset(startOffset - toSeconds(move.clientX - down.clientX), false);
    strip.onpointerup = strip.onpointercancel = () => {
      strip.onpointermove = null;
      save();
    };
  });

  const button = (text: string, onclick: () => void, label = text) =>
    h("button", { type: "button", className: "secondary outline", textContent: text, title: label, ariaLabel: label, onclick });
  const numberInput = (value: number, step: string, label: string, onchange: (value: number) => void) => {
    const input = h("input", { type: "number", min: "0", step, value: String(value), ariaLabel: label, onchange: () => onchange(Number(input.value)) });
    return input;
  };

  function render() {
    const current = track();
    if (!current) {
      panel.replaceChildren(h("p", {}, t.noTrack), button(t.done, onDone));
      return;
    }
    const bpm = numberInput(current.bpm, "0.1", t.trackBpm, (value) => {
      if (value > 0) current.bpm = value;
      draw();
      save();
    });
    offsetInput = numberInput(current.offset, "0.01", t.firstNoteAt, (value) => setOffset(value));
    const speed = h(
      "select",
      { ariaLabel: t.trackSpeed, onchange: () => ((current.speed = Number(speed.value)), (audio.playbackRate = current.speed), save()) },
      ...TRACK_SPEEDS.map((value) => h("option", { value: String(value), selected: value === current.speed, textContent: `${value * 100}%` })),
    );
    const listen = h("input", { type: "checkbox", checked: current.listen, onchange: () => ((current.listen = listen.checked), save()) });
    const firstNoteNow = button(t.firstNoteNow, () => setOffset(audio.currentTime));
    firstNoteNow.disabled = audio.paused;
    audio.onplay = audio.onpause = () => (firstNoteNow.disabled = audio.paused);
    const detectAgain = button(t.detectAgain, async () => {
      status.textContent = t.findingBeat;
      const found = await findBeat(current.blob);
      current.bpm = found.bpm;
      bpm.value = String(found.bpm);
      setOffset(found.offset);
      status.textContent = t.foundBeat(localNumber(found.bpm, 1), localNumber(found.offset, 2));
    });

    panel.replaceChildren(
      h("p", { className: "track-align-title" }, h("strong", {}, t.aligning(current.name)), " ", t.alignHint),
      h(
        "div",
        { className: "row" },
        h("label", {}, `${t.trackBpm} `, bpm),
        h("label", {}, `${t.firstNoteAt} `, offsetInput),
        button("−", () => setOffset(current.offset - NUDGE_SECONDS), t.earlier),
        button("+", () => setOffset(current.offset + NUDGE_SECONDS), t.later),
        h("label", {}, `${t.trackSpeed} `, speed),
        h("label", {}, listen, ` ${t.listenToNotes}`),
      ),
      h("div", { className: "row" }, firstNoteNow, detectAgain, h("button", { type: "button", textContent: t.done, onclick: onDone }), status),
    );
  }

  return {
    panel,
    strip,
    // The track to line up, once it's loaded, with its waveform worked out from the recording.
    async load() {
      render();
      const current = track();
      peaks = null;
      draw();
      if (!current) return;

      const sound = await decodeAudio(current.blob);
      const samples = sound.getChannelData(0);
      const binSize = Math.max(1, Math.round(sound.sampleRate / PEAKS_PER_SECOND));
      const loud = new Float32Array(Math.ceil(samples.length / binSize));
      for (let i = 0; i < samples.length; i++) loud[Math.floor(i / binSize)] = Math.max(loud[Math.floor(i / binSize)], Math.abs(samples[i]));
      const loudest = loud.reduce((max, value) => Math.max(max, value), 0) || 1;
      peaks = loud.map((value) => value / loudest);
      draw();
    },
    showBeat(beat: number) {
      beatAtHit = beat;
      draw();
    },
  };
}
