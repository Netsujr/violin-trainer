import { getSettings } from "../storage";

const MAX_CONTENT_WIDTH = 960;
const PAGE_PADDING = 16;
const PHONE_WIDTH = 600;
// Up to this wide, a phone in landscape gives the note counter its own row too, as in style.css.
const SMALL_LANDSCAPE_WIDTH = 700;
const SHORT_HEIGHT = 500;
// Fullscreen fills the height with the timeline and a one-line staff, in the same units they're drawn in.
const TIMELINE_HEIGHT = 336;
const STAFF_HEIGHT = 160;
// "Bigger staff" swaps which of the two gets most of the room.
const BIG_STAFF_SHARE = 1.6;
const SMALL_TIMELINE_SHARE = 0.5;
const FULLSCREEN_CONTROLS_HEIGHT = 96;
// On a narrow screen the note counter takes its own row above the buttons.
const FULLSCREEN_COUNTER_ROW_HEIGHT = 30;
// The clear space ahead of the hit line, wide enough for three beats, which limits the scale on narrow screens.
const FULLSCREEN_MIN_VIEW_WIDTH = 130 + 3 * 120;

let fullscreen = false;
export const setFullscreenLayout = (value: boolean) => (fullscreen = value);

// The width of the page content, which #app caps in style.css.
export const contentWidth = () =>
  Math.min(fullscreen ? Infinity : MAX_CONTENT_WIDTH, document.documentElement.clientWidth - PAGE_PADDING * 2);

const timelineShare = () => (getSettings().staffBig ? SMALL_TIMELINE_SHARE : 1);
const staffShare = () => (getSettings().staffBig ? BIG_STAFF_SHARE : 1);

// The size the timeline and staff are drawn at. They keep readable text and show fewer beats, rather than shrinking to fit.
const baseScale = () => {
  if (fullscreen) {
    const counterRow = innerWidth < PHONE_WIDTH || (innerHeight <= SHORT_HEIGHT && innerWidth <= SMALL_LANDSCAPE_WIDTH);
    const controls = FULLSCREEN_CONTROLS_HEIGHT + (counterRow ? FULLSCREEN_COUNTER_ROW_HEIGHT : 0);
    const height = TIMELINE_HEIGHT * timelineShare() + STAFF_HEIGHT * staffShare();
    return Math.min((innerHeight - controls) / height, contentWidth() / FULLSCREEN_MIN_VIEW_WIDTH / Math.max(timelineShare(), staffShare()));
  }
  return innerHeight < SHORT_HEIGHT ? 0.6 : innerWidth < PHONE_WIDTH ? 0.75 : 1;
};
export const timelineScale = () => baseScale() * timelineShare();
export const staffScale = () => baseScale() * staffShare();

export const isSmallScreen = () => innerWidth < PHONE_WIDTH || innerHeight < SHORT_HEIGHT;
