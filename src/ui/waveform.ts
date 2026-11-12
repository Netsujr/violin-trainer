import { t } from "../i18n";
import { h } from "./dom";
import { PAUSE_ICON, PLAY_ICON } from "./toggles";

const BARS = 160;
const ARROW_STEP_SECONDS = 5;

// The loudest moment in each slice of the recording, from 0 to 1.
function peaksOf(samples: Float32Array) {
  const size = Math.max(1, Math.floor(samples.length / BARS));
  const peaks = Array.from({ length: BARS }, (_, bar) => {
    let peak = 0;
    for (let i = bar * size; i < (bar + 1) * size && i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    return peak;
  });
  const loudest = Math.max(...peaks) || 1;
  return peaks.map((peak) => peak / loudest);
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

// A player for a recording: play, the recording drawn as its waveform, the part played coloured in, and the time.
// Tapping the waveform, or the arrow keys on it, moves through it. One the browser can't decode gets its own player.
export function waveformPlayer(blob: Blob, audio: HTMLAudioElement) {
  const canvas = h("canvas", { className: "waveform", tabIndex: 0, role: "slider", ariaLabel: t.playPosition });
  const play = h("button", { type: "button", className: "outline icon-button" });
  const time = h("span", { className: "waveform-time" });
  let peaks: number[] = [];
  let seconds = 0;

  function draw() {
    const width = Math.round(canvas.clientWidth * devicePixelRatio);
    const height = Math.round(canvas.clientHeight * devicePixelRatio);
    if (canvas.width !== width || canvas.height !== height) Object.assign(canvas, { width, height });
    const context = canvas.getContext("2d")!;
    const style = getComputedStyle(canvas);
    const played = seconds ? audio.currentTime / seconds : 0;
    const step = width / peaks.length;
    context.clearRect(0, 0, width, height);
    peaks.forEach((peak, bar) => {
      const tall = Math.max(devicePixelRatio, peak * height);
      context.fillStyle = bar / peaks.length < played ? style.getPropertyValue("--pico-primary") : style.getPropertyValue("--pico-muted-border-color");
      context.fillRect(bar * step, (height - tall) / 2, Math.max(1, step - devicePixelRatio), tall);
    });
    time.textContent = `${clock(audio.currentTime)} / ${clock(seconds)}`;
    canvas.ariaValueText = time.textContent;
  }

  // Only when it changes: swapping the icon under a press, every frame, loses the click.
  function showPlaying() {
    const playing = !audio.paused;
    Object.assign(play, { innerHTML: playing ? PAUSE_ICON : PLAY_ICON, title: playing ? t.pause : t.play, ariaLabel: playing ? t.pause : t.play });
  }

  const tick = () => {
    draw();
    if (!audio.paused) requestAnimationFrame(tick);
  };
  const seek = (to: number) => {
    if (seconds) audio.currentTime = Math.min(seconds, Math.max(0, to));
  };
  ["play", "pause", "seeked", "ended"].forEach((event) => audio.addEventListener(event, tick));
  ["play", "pause", "ended"].forEach((event) => audio.addEventListener(event, showPlaying));
  play.onclick = () => (audio.paused ? audio.play() : audio.pause());
  canvas.onclick = (event) => seek((event.offsetX / canvas.clientWidth) * seconds);
  canvas.onkeydown = (event) => {
    const by = { ArrowLeft: -ARROW_STEP_SECONDS, ArrowRight: ARROW_STEP_SECONDS }[event.key];
    if (by === undefined) return;
    event.preventDefault();
    seek(audio.currentTime + by);
  };

  const element = h("div", { className: "waveform-player" }, play, canvas, time);
  blob
    .arrayBuffer()
    .then((bytes) => new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes))
    .then((decoded) => {
      seconds = decoded.duration;
      peaks = peaksOf(decoded.getChannelData(0));
      draw();
    })
    .catch(() => {
      element.remove();
      audio.controls = true;
    });
  draw();
  showPlaying();
  return element;
}
