const MAX_CONTENT_WIDTH = 960;
const PAGE_PADDING = 16;
const PHONE_WIDTH = 600;
const SHORT_HEIGHT = 500;

// The width of the page content, which #app caps in style.css.
export const contentWidth = () =>
  Math.min(MAX_CONTENT_WIDTH, document.documentElement.clientWidth - PAGE_PADDING * 2);

// The size the timeline and staff are drawn at. They keep readable text and show fewer beats, rather than shrinking to fit.
export const timelineScale = () => (innerHeight < SHORT_HEIGHT ? 0.6 : innerWidth < PHONE_WIDTH ? 0.75 : 1);

export const isSmallScreen = () => innerWidth < PHONE_WIDTH || innerHeight < SHORT_HEIGHT;
