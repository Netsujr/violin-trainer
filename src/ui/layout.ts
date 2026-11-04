const MAX_CONTENT_WIDTH = 960;
const PAGE_PADDING = 16;
const PHONE_WIDTH = 600;
const SHORT_HEIGHT = 500;
// Fullscreen fills the height with the timeline and a one-line staff, in the same units they're drawn in.
const TIMELINE_AND_STAFF_HEIGHT = 336 + 160;
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

// The size the timeline and staff are drawn at. They keep readable text and show fewer beats, rather than shrinking to fit.
export const timelineScale = () => {
  if (fullscreen) {
    const controls = FULLSCREEN_CONTROLS_HEIGHT + (innerWidth < PHONE_WIDTH ? FULLSCREEN_COUNTER_ROW_HEIGHT : 0);
    return Math.min((innerHeight - controls) / TIMELINE_AND_STAFF_HEIGHT, contentWidth() / FULLSCREEN_MIN_VIEW_WIDTH);
  }
  return innerHeight < SHORT_HEIGHT ? 0.6 : innerWidth < PHONE_WIDTH ? 0.75 : 1;
};

export const isSmallScreen = () => innerWidth < PHONE_WIDTH || innerHeight < SHORT_HEIGHT;
