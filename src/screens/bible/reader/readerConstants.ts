// The squared top controls are 40pt so they match the reference pill; the slop
// restores the 44pt touch floor without growing the visible square.
export const TOP_ACTION_HIT_SLOP = 2;
export const TOP_ACTION_ICON_SIZE = 20;
// Reader chrome floats over the verses at a fixed size, and the verse column is
// padded by exactly that size. Letting its labels grow without limit clipped
// them inside the 44pt reference pill and pushed the plan strip up over the
// last verses, so chrome text scales only this far. The verses themselves, and
// the full reference behind each control, are not capped.
export const READER_REFERENCE_PILL_MAX_FONT_SCALE = 1.4;
export const PLAN_SESSION_BAR_MAX_FONT_SCALE = 1.3;

export const AUDIO_PORTION_MIN_DURATION_MS = 1000;
export const AUDIO_PORTION_DEFAULT_DURATION_MS = 30000;
export const AUDIO_PORTION_HANDLE_WIDTH = 20;
// One screen-reader increment/decrement of a clip handle.
export const AUDIO_PORTION_A11Y_STEP_MS = 5000;
export const CHAPTER_FEEDBACK_AUDIO_TIMER_MS = 500;
export const CHAPTER_FEEDBACK_AUDIO_APP_ACTIVE_TIMEOUT_MS = 3000;
export const FEEDBACK_AUDIO_COUNTDOWN_SIZE = 58;
export const FEEDBACK_AUDIO_COUNTDOWN_STROKE_WIDTH = 4;
export const FEEDBACK_AUDIO_COUNTDOWN_RADIUS =
  (FEEDBACK_AUDIO_COUNTDOWN_SIZE - FEEDBACK_AUDIO_COUNTDOWN_STROKE_WIDTH) / 2;
export const FEEDBACK_AUDIO_COUNTDOWN_CIRCUMFERENCE = 2 * Math.PI * FEEDBACK_AUDIO_COUNTDOWN_RADIUS;
export const READER_SCROLL_JS_UPDATE_INTERVAL_PX = 48;

/** The root tab navigator the reader drives (hides it in plan sessions, slides it on scroll). */
export type RootTabNavigationHandle = {
  setOptions: (options: { tabBarStyle?: unknown }) => void;
} | null;
