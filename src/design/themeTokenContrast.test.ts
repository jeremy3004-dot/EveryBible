import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { APPEARANCE_PALETTE_IDS } from '../constants/appearancePalettes';
import { mockModule, sourcePath } from '../testing/mockModules';
import { WCAG_AA_TEXT, WCAG_NON_TEXT, contrastRatio } from './contrast';
import type { ThemeColors } from '../contexts/ThemeContext';

// The real ThemeContext module resolves every scope × accent palette the app can
// render. It only needs the auth store at render time, so a stub keeps the
// native store graph out of the runner.
mockModule(mock, sourcePath('stores/authStore.ts'), { useAuthStore: () => undefined });
const theme = createRequire(import.meta.url)(
  '../contexts/ThemeContext.tsx'
) as typeof import('../contexts/ThemeContext');

type Token = keyof ThemeColors;
type Pair = readonly [foreground: Token, background: Token, usedFor: string];

const SCOPES = ['light', 'dark'] as const;

function assertPairs(floor: number, pairs: readonly Pair[]) {
  const failures: string[] = [];
  for (const scope of SCOPES) {
    for (const palette of APPEARANCE_PALETTE_IDS) {
      const colors = theme.createThemeColors(scope, palette);
      for (const [fg, bg, usedFor] of pairs) {
        if (!colors[fg] || !colors[bg]) {
          failures.push(`${scope}/${palette} has no ${colors[fg] ? bg : fg} token — ${usedFor}`);
          continue;
        }
        const ratio = contrastRatio(colors[fg], colors[bg]);
        if (ratio < floor) {
          failures.push(
            `${scope}/${palette} ${fg} ${colors[fg]} on ${bg} ${colors[bg]}: ` +
              `${ratio.toFixed(2)}:1 (need ${floor}:1) — ${usedFor}`
          );
        }
      }
    }
  }
  assert.deepEqual(failures, []);
}

// Text pairs a screen actually draws. contrastAudit.test.ts covers the accent and
// status-chip matrix; these are the remaining foreground/surface combinations.
test('every text token clears 4.5:1 on the surfaces it is set on', () => {
  assertPairs(WCAG_AA_TEXT, [
    ['primaryText', 'cardBackground', 'body copy on cards'],
    ['primaryText', 'muted', 'segmented-control labels, keypad keys'],
    ['secondaryText', 'muted', 'unselected TabSwitch labels on the track'],
    ['textTertiary', 'background', 'future plan-day rows, version line'],
    ['textTertiary', 'cardBackground', 'plan-day date eyebrows, input placeholders'],
    ['textTertiary', 'muted', 'unread day numbers in the reading-activity calendar'],
    ['accentSecondary', 'background', 'secondary accent copy'],
    ['accentSecondary', 'cardBackground', 'secondary accent copy on cards'],
    ['tabInactive', 'cardBackground', 'inactive tab labels on the tab bar'],
    ['error', 'background', 'form errors on the page'],
    ['error', 'cardBackground', 'errors and destructive rows on cards'],
    ['error', 'bibleSurface', 'reader feedback errors, destructive picker rows'],
    ['onError', 'error', 'destructive button and swipe-to-delete labels'],
    ['biblePrimaryText', 'bibleBackground', 'scripture'],
    ['biblePrimaryText', 'bibleSurface', 'reader sheets'],
    ['biblePrimaryText', 'bibleElevatedSurface', 'reader chapter pill, inputs'],
    ['bibleSecondaryText', 'bibleBackground', 'verse numbers, reader meta'],
    ['bibleSecondaryText', 'bibleSurface', 'reader sheet meta'],
    ['bibleSecondaryText', 'bibleElevatedSurface', 'reader input placeholders'],
    ['bibleAccent', 'bibleBackground', 'reader accent copy'],
    ['bibleAccent', 'bibleSurface', 'companion card eyebrows'],
    ['bibleBackground', 'bibleControlBackground', 'inverse primary CTA labels'],
  ]);
});

// WCAG 1.4.11: anything that is the only cue for "this is an input / toggle /
// checkbox" or for its state must reach 3:1 against what is next to it.
// `cardBorder`, `borderStrong` and `bibleDivider` are decorative separators that
// sit near 1.5:1 by design; controls use `controlBorder` instead.
test('control boundaries and state marks clear 3:1 against every surface', () => {
  assertPairs(WCAG_NON_TEXT, [
    ['controlBorder', 'background', 'input and checkbox outlines on the page'],
    ['controlBorder', 'cardBackground', 'input outlines, switch off-track, plan dots on cards'],
    ['controlBorder', 'muted', 'selected TabSwitch segment outline on its track'],
    ['controlBorder', 'bibleBackground', 'reader input outlines'],
    ['controlBorder', 'bibleSurface', 'reader sheet input outlines'],
    ['controlBorder', 'bibleElevatedSurface', 'outline around a filled reader input'],
    ['cardBackground', 'controlBorder', 'switch thumb on the off track'],
    ['cardBackground', 'accentPrimary', 'switch thumb on the on track'],
    ['accentPrimary', 'cardBackground', 'switch on-track, done plan dots, today ring'],
    ['bibleAccent', 'bibleElevatedSurface', 'reader transport glyphs on their discs'],
  ]);
});
