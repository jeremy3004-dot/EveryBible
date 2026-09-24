import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { APPEARANCE_PALETTES } from '../constants/appearancePalettes';
import { mockModule, sourcePath } from '../testing/mockModules';
import { WCAG_AA_TEXT, contrastRatio } from './contrast';

// The base palette hexes come from the real ThemeContext module. It only needs the auth
// store at render time, so a stub keeps the native store graph out of the runner; it is
// required synchronously because the per-palette tests below are declared at load time.
mockModule(mock, sourcePath('stores/authStore.ts'), { useAuthStore: () => undefined });
const theme = createRequire(import.meta.url)(
  '../contexts/ThemeContext.tsx'
) as typeof import('../contexts/ThemeContext');

// ---------------------------------------------------------------------------
// WCAG contrast audit for the Illuminated palette matrix: every core text/accent
// token must stay legible across all 5 theme modes × 4 accent palettes. Scripted
// version of the Phase 5 contrast pass — asserts the >= 4.5:1 text floor.
// ---------------------------------------------------------------------------

const AA_TEXT = WCAG_AA_TEXT;
const ON_ACCENT_DARK = '#1A140F';
const ON_ACCENT_LIGHT = '#FFFFFF';

const BASE_PALETTES: Record<string, Record<string, string>> = {
  baseDarkColors: theme.darkColors as unknown as Record<string, string>,
  baseLightColors: theme.lightColors as unknown as Record<string, string>,
};

function colorToken(objectName: string, tokenName: string): string {
  const value = BASE_PALETTES[objectName]?.[tokenName];
  assert.match(
    value ?? '',
    /^#[A-Fa-f0-9]{6}$/,
    `${objectName}.${tokenName} should be a hex colour`
  );
  return value!;
}

// The EL design system ships two scopes; low-light, parchment and midnight were
// retired with the reskin.
const MODES = [
  { name: 'dark', object: 'baseDarkColors', lightFamily: false },
  { name: 'light', object: 'baseLightColors', lightFamily: true },
] as const;

for (const palette of APPEARANCE_PALETTES) {
  for (const mode of MODES) {
    const background = colorToken(mode.object, 'background');
    const cardBackground = colorToken(mode.object, 'cardBackground');
    const primaryText = colorToken(mode.object, 'primaryText');
    const secondaryText = colorToken(mode.object, 'secondaryText');
    const accent = mode.lightFamily ? palette.swatches.primaryDeep : palette.swatches.primary;
    const onAccent = mode.lightFamily ? ON_ACCENT_LIGHT : ON_ACCENT_DARK;
    // The selected-surface pair is per palette per scope: the "you are here"
    // fill (active tab pill, chips) and the glyph that sits on it.
    const accentSurface = mode.lightFamily
      ? palette.swatches.lightAccentSurface
      : palette.swatches.darkAccentSurface;
    const onAccentSurface = mode.lightFamily
      ? palette.swatches.lightOnAccentSurface
      : palette.swatches.darkOnAccentSurface;
    // Status-chip pairs are scope tokens, not palette tokens, so they come from
    // the base palettes in ThemeContext.
    const successSoft = colorToken(mode.object, 'successSoft');
    const onSuccessSoft = colorToken(mode.object, 'onSuccessSoft');

    test(`contrast: ${palette.id} on ${mode.name}`, () => {
      const checks: Array<[string, string, string]> = [
        ['primaryText on background', primaryText, background],
        ['secondaryText on background', secondaryText, background],
        ['secondaryText on cardBackground', secondaryText, cardBackground],
        ['accent on background', accent, background],
        ['accent on cardBackground', accent, cardBackground],
        ['onAccent on accent fill', onAccent, accent],
        ['onAccentSurface on accentSurface', onAccentSurface, accentSurface],
        ['onSuccessSoft on successSoft', onSuccessSoft, successSoft],
      ];

      for (const [label, fg, bg] of checks) {
        const ratio = contrastRatio(fg, bg);
        assert.ok(
          ratio >= AA_TEXT,
          `${palette.id}/${mode.name} — ${label}: ${ratio.toFixed(2)}:1 (need ${AA_TEXT}:1)`
        );
      }
    });
  }
}

// The missed-day ledger cell is a `warningSoft` fill inside a 1px `warning`
// border, so the border is what carries the state. `warning` is a saturated
// mid-tone that only clears 2.83:1 against vellum itself, and lightening the
// fill far enough to reach 3:1 against it lands on a near-white that no longer
// reads as a tint on `cardBackground` (1.03:1). The pair is locked here at the
// design's own values so a future edit has to make the trade deliberately.
test('warningSoft stays a legible tint under its warning border', () => {
  for (const mode of MODES) {
    const warning = colorToken(mode.object, 'warning');
    const warningSoft = colorToken(mode.object, 'warningSoft');
    const cardBackground = colorToken(mode.object, 'cardBackground');

    const borderOnFill = contrastRatio(warning, warningSoft);
    assert.ok(
      borderOnFill >= 2.5,
      `${mode.name} — warning border on warningSoft: ${borderOnFill.toFixed(2)}:1 (need 2.5:1)`
    );
    assert.notEqual(
      warningSoft,
      cardBackground,
      `${mode.name} — warningSoft must be distinguishable from the card it sits on`
    );
  }
});

// `muted` is the inert well behind empty ledger cells and segmented-control
// tracks. It has to sit *between* the page and the card, or the track disappears.
test('muted reads as a well against both the page and card surfaces', () => {
  for (const mode of MODES) {
    const muted = colorToken(mode.object, 'muted');
    const primaryText = colorToken(mode.object, 'primaryText');

    const ratio = contrastRatio(primaryText, muted);
    assert.ok(
      ratio >= AA_TEXT,
      `${mode.name} — primaryText on muted: ${ratio.toFixed(2)}:1 (need ${AA_TEXT}:1)`
    );
  }
});

// ---------------------------------------------------------------------------
// Status and reader foregrounds. The block above audits the accent matrix; the
// pairs below are the scope tokens the a11y audit found being used as *text*
// colours in screens, plus the two tokens added to make those uses legal.
// ---------------------------------------------------------------------------

// `success` and `warning` are fill/border tones, not text tones: on vellum they
// land at 3.47:1 and 2.83:1. Screens that need green or amber *words* use the
// `on*Soft` foregrounds, which are asserted here against every surface a status
// line can sit on — the page, a card, and the matching soft tint.
test('the status foregrounds clear AA on page, card and their own tint', () => {
  for (const mode of MODES) {
    const background = colorToken(mode.object, 'background');
    const cardBackground = colorToken(mode.object, 'cardBackground');

    const pairs: Array<[string, string, string]> = [
      ['onSuccessSoft on background', colorToken(mode.object, 'onSuccessSoft'), background],
      ['onSuccessSoft on cardBackground', colorToken(mode.object, 'onSuccessSoft'), cardBackground],
      [
        'onWarningSoft on warningSoft',
        colorToken(mode.object, 'onWarningSoft'),
        colorToken(mode.object, 'warningSoft'),
      ],
      ['onWarningSoft on background', colorToken(mode.object, 'onWarningSoft'), background],
      ['onWarningSoft on cardBackground', colorToken(mode.object, 'onWarningSoft'), cardBackground],
    ];

    for (const [label, fg, bg] of pairs) {
      const ratio = contrastRatio(fg, bg);
      assert.ok(
        ratio >= AA_TEXT,
        `${mode.name} — ${label}: ${ratio.toFixed(2)}:1 (need ${AA_TEXT}:1)`
      );
    }
  }
});

// Guard the reason those tokens exist: if a future edit makes `success` or
// `warning` itself readable as body text on the page, this test is the place to
// relax the rule deliberately rather than discovering it by shipping.
test('success and warning stay fills, not text colours, on the light page', () => {
  const background = colorToken('baseLightColors', 'background');
  for (const token of ['success', 'warning']) {
    const ratio = contrastRatio(colorToken('baseLightColors', token), background);
    assert.ok(
      ratio < AA_TEXT,
      `${token} now clears ${ratio.toFixed(2)}:1 on vellum — if that is intended, drop this guard ` +
        `and let screens use it as text directly instead of on${token[0].toUpperCase()}${token.slice(1)}Soft`
    );
  }
});

// The follow band is a highlight the reader paints behind the verse being read
// aloud. Body text on it is fine (9.23:1 / 8.74:1), but the verse *number* is
// set in `bibleSecondaryText`, which only reaches 3.18:1 on the light band —
// hence `bibleFollowVerseNumber`.
test('the follow band carries both scripture and its verse numbers', () => {
  for (const mode of MODES) {
    const band = colorToken(mode.object, 'bibleFollowHighlight');

    const bodyRatio = contrastRatio(colorToken(mode.object, 'biblePrimaryText'), band);
    assert.ok(
      bodyRatio >= AA_TEXT,
      `${mode.name} — biblePrimaryText on bibleFollowHighlight: ${bodyRatio.toFixed(2)}:1`
    );

    const numberRatio = contrastRatio(colorToken(mode.object, 'bibleFollowVerseNumber'), band);
    assert.ok(
      numberRatio >= AA_TEXT,
      `${mode.name} — bibleFollowVerseNumber on bibleFollowHighlight: ${numberRatio.toFixed(2)}:1`
    );

    // Documented exception: the band itself against the page is 1.6:1 (light) /
    // 1.8:1 (dark). It is a reading-position tint, not a UI boundary — the
    // audible playback is the primary signal and the text on it stays >= 8:1 —
    // so it is deliberately below the 3:1 non-text floor. Raising it would put
    // a coloured slab through the middle of scripture.
    const bandOnPage = contrastRatio(band, colorToken(mode.object, 'bibleBackground'));
    assert.ok(
      bandOnPage < 3,
      `${mode.name} — the follow band is now ${bandOnPage.toFixed(2)}:1 against the page; if that ` +
        `is intended, this documented exception should be re-argued rather than silently kept`
    );
  }
});

// Documented exception: disabled controls (IconButton, ListRow) render at 0.45
// opacity, which drops any foreground below AA. WCAG 1.4.3 exempts inactive
// controls, and both primitives also set accessibilityState.disabled so the
// state is announced rather than relying on the dimming alone. Asserted here so
// the exemption stays a decision with a stated basis.
// UI-only source check: IconButton and ListRow render code; the suite has no renderer.
test('the disabled treatment is opacity plus announced state, not colour alone', () => {
  const iconButton = readFileSync(
    fileURLToPath(new URL('../components/ui/IconButton.tsx', import.meta.url).href),
    'utf8'
  );
  const listRow = readFileSync(
    fileURLToPath(new URL('../components/ui/ListRow.tsx', import.meta.url).href),
    'utf8'
  );

  assert.match(iconButton, /opacity: 0\.45/, 'IconButton keeps the 0.45 disabled dimming');
  assert.match(
    iconButton,
    /accessibilityState=\{\{ disabled \}\}/,
    'IconButton must announce disabled, since the dimming alone is below AA'
  );
  assert.match(
    listRow,
    /accessibilityState=\{\{ disabled \}\}/,
    'ListRow must announce disabled, since the dimming alone is below AA'
  );
});

// `error` is used as text on cards in a handful of places. The EL kit's dark
// --danger was 4.39:1 on a dark card; it is lifted to clear AA, and the solid
// destructive fill carries `onError` (near-black in dark) rather than white.
// themeTokenContrast.test.ts asserts every surface; this is the headline pair.
test('error text on a dark card clears AA', () => {
  const ratio = contrastRatio(
    colorToken('baseDarkColors', 'error'),
    colorToken('baseDarkColors', 'cardBackground')
  );
  assert.ok(ratio >= AA_TEXT, `dark — error on cardBackground: ${ratio.toFixed(2)}:1`);
});

// A selected "Accurate" chip and the rhythm "done" pill used to set `onAccent`
// (white) on a `success` fill, which is 4.09:1 on vellum — below AA for their
// labels. They now use the successSoft / onSuccessSoft pair audited above. If
// `success` is ever darkened far enough to carry white text, drop this guard and
// the fills may go back to solid.
test('white labels do not sit on the success fill in the light scope', () => {
  const ratio = contrastRatio(ON_ACCENT_LIGHT, colorToken('baseLightColors', 'success'));
  assert.ok(
    ratio < AA_TEXT,
    `white on success now clears ${ratio.toFixed(2)}:1 — solid success fills may carry labels again`
  );
});
