# Phase 15: Reverential Theme & Typography - Research

**Researched:** 2026-03-22
**Domain:** React Native theme system, custom font loading, visual design system migration
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Accent color is minimal — typography, spacing, and tonal contrast do the visual hierarchy work. Color accent reserved strictly for interactive affordances (tappable elements, active/selected states, toggles). No decorative color.
- D-02: Dark mode backgrounds use warm near-black tones (~#0C0B09 range, warm-tinted), not cool blue-grey.
- D-03: Text colors use warm cream/off-white on dark backgrounds (#F0EBE0 range), not pure #FFFFFF.
- D-04: Card surfaces use subtle warm dark grey, barely lifted from background. No blue tint. No heavy shadows/glows.
- D-05: Light mode uses warm off-white/cream backgrounds, not clinical #f5f7fa.
- D-06: Low-light mode is warm sepia-toned — amber/brown-shifted backgrounds and text.
- D-07: Three theme modes: Dark (primary), Light (secondary), Low-light/Sepia (third).
- D-08: Dark mode is the hero experience, the default design target.
- D-09: User preference for theme persists via existing authStore preferences mechanism (extend 'dark'/'light' to include 'low-light').
- D-10: Bundle a custom serif font (~100-200KB acceptable). Claude's discretion on exact typeface.
- D-11: Claude's discretion on serif vs. sans-serif boundary across the app.
- D-12: Current `readingFontFamily` (Georgia/serif) in system.ts replaced by bundled custom serif for all reading surfaces.
- D-13: Strip "AI-generated UI" patterns: excessive rounded corners, drop shadows/glows for hierarchy, nested cards-inside-cards, generic system sans-serif as default voice.
- D-14: Claude's discretion on replacement approach — candidates include mostly square/subtle radius (2-4px), removing card containers in favor of spacing and dividers, flattening hierarchy, killing nested cards, reducing border radius globally.
- D-15: Individual screens updated in this phase — NOT just a token swap. Every screen gets the new visual language applied.
- D-16: All screens swept: Home, Bible browser/book hub/reader, Learn/Harvest, More/Settings/Profile, Reading Activity, audio player, group screens, onboarding.
- D-17: The sweep applies new palette, typography, and stripped visual patterns. Does NOT change layouts, navigation structure, or feature logic.
- D-18: Hardcoded colors (~31 instances across 8 files) must be migrated to theme tokens.

### Claude's Discretion
- Exact serif typeface selection (EB Garamond, Cormorant Garamond, or other)
- Serif vs. sans-serif boundary across the app (which surfaces get serif, which keep functional sans)
- Border radius values (how far toward square/print-editorial to go)
- Card removal vs. card simplification per screen
- Shadow/elevation removal strategy
- Exact hex values for all three palettes (Dark, Light, Low-light) — guided by reference images
- Divider/separator styling to replace removed card boundaries
- Tab bar treatment (the Glorify reference shows a frosted/glass tab bar)
- Verse number and section heading typographic treatment

### Deferred Ideas (OUT OF SCOPE)
- Custom font size/style selector per-user (like Genesis app's "Classic/Stylish/Modern" toggle)
- Book-specific ornamental illustrations (ornate Nehemiah architecture drawing)
- Drop cap rendering for chapter openings
- Animated theme transitions between modes
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| M2-DESIGN-01 | User experiences a unified, professional visual system across the main app surfaces with consistent typography, spacing, color tokens, and component chrome | All research sections apply: font selection, three-palette ThemeContext, token system, screen sweep |
</phase_requirements>

---

## Summary

Phase 15 replaces the existing cool-toned, generic-looking design system with a warm, reverential aesthetic across all screens. The technical work has three pillars: (1) extend ThemeContext with a third `low-light` palette and expose a three-way theme selector, (2) bundle a custom serif font and wire it through `expo-font` before the app renders, and (3) sweep every screen to apply new tokens and strip the "AI-generated" visual patterns (excessive radius, nested cards, drop shadows used for decoration).

The existing architecture is well-suited for this work. ThemeContext is the single source of truth for all color values, `system.ts` is the single source of truth for radius/typography/shadows, and Zustand authStore already handles preference persistence. The migration path is clear: update tokens, extend the theme selector, load the font, then do a screen-by-screen visual pass.

The primary technical risk is font loading integration — bundled fonts must be loaded before the splash screen hides, or users see unstyled text. The existing `SplashScreen.preventAutoHideAsync()` call in App.tsx is already in place and provides a natural integration point.

**Primary recommendation:** Use Lora (not Cormorant Garamond or EB Garamond) for the bundled serif. Lora is designed specifically for screen readability at text sizes, ships at ~480KB for Regular + Italic (the two weights actually needed for reading surfaces), and has been validated for body text use on mobile. Cormorant Garamond excels at display sizes but is too thin and high-contrast for body reading at 18px on small phones. EB Garamond has similar issues. Save the larger full-family packages for if the team decides to add heading variants later.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| expo-font | ~14.0.11 (already installed) | Bundle and load custom serif font | Native integration, already in the dependency tree |
| expo-splash-screen | ~31.0.13 (already installed) | Hold splash while fonts load | Already integrated in App.tsx — extend existing pattern |
| ThemeContext | — (internal) | Three-palette theme provider | Already the single source of truth for colors |
| system.ts | — (internal) | Design token file for radius, typography, shadows | Already imported everywhere |
| authStore | — (internal) | Persists theme preference via Zustand + AsyncStorage | Already handles dark/light — extend to low-light |

### Font Package Options (choose one to bundle)
| Library | Unpacked Size | Key Weights | Best For |
|---------|-------------|------------|---------|
| Lora (manual TTF bundle) | ~480KB for Regular + Italic | Regular, Italic | Body text at 16-22px on screen |
| @expo-google-fonts/lora | 2.0MB (all 8 weights) | Regular, Italic, Medium, Bold + italics | Convenient if multiple weights needed |
| @expo-google-fonts/cormorant-garamond | 6.6MB | 5 weights × 9 styles = 45 files | Display/heading use at large sizes |
| @expo-google-fonts/eb-garamond | 6.5MB | Multiple weights | Print-origin, harder at small screen sizes |

**Recommendation:** Download Lora-Regular.ttf and Lora-Italic.ttf directly from Google Fonts and bundle them manually in `assets/fonts/`. Total cost: ~480KB. This avoids the 2MB npm package overhead and bundles only what the app uses.

**Version verification:** expo-font 14.0.11 is current for Expo SDK 54.

### Installation
```bash
# No new npm packages needed if bundling fonts manually (recommended)
# Place font files in:
#   assets/fonts/Lora-Regular.ttf
#   assets/fonts/Lora-Italic.ttf

# If using the npm package instead:
npx expo install @expo-google-fonts/lora
```

---

## Architecture Patterns

### Pattern 1: Three-Palette ThemeContext

**What:** Extend the existing `ThemeColors` interface and `ThemeContextValue` to support a third `low-light` palette and a three-way `theme` type.

**When to use:** This is the locked approach (D-07, D-09).

**Key changes required:**

1. `src/types/user.ts` — extend the `theme` union type:
```typescript
// BEFORE
theme: 'dark' | 'light';
// AFTER
theme: 'dark' | 'light' | 'low-light';
```

2. `src/stores/persistedStateSanitizers.ts` — extend `validThemes` set:
```typescript
// BEFORE
const validThemes = new Set<UserPreferences['theme']>(['dark', 'light']);
// AFTER
const validThemes = new Set<UserPreferences['theme']>(['dark', 'light', 'low-light']);
```
Note: The sanitizer will reject persisted `low-light` values from old app versions (falling back to `dark`). This is correct safe behavior — existing users stay on dark.

3. `src/contexts/ThemeContext.tsx` — add third palette, update ThemeContextValue, update isDark logic, update ThemeProvider state:
```typescript
// New signature
interface ThemeContextValue {
  colors: ThemeColors;
  isDark: boolean;
  isLowLight: boolean;        // NEW
  themeMode: 'dark' | 'light' | 'low-light'; // NEW
  setTheme: (mode: 'dark' | 'light' | 'low-light') => void; // replaces toggleTheme
}
```

4. `src/screens/more/SettingsScreen.tsx` — replace the existing binary toggle with a three-option selector UI.

5. `src/i18n/locales/en.ts` (and es, ne, hi) — add translation key for `settings.lowLightMode` (and potentially rename `darkMode` key context to a `themeMode` section).

**AuthStore migration note:** The existing `toggleTheme` in ThemeContext calls `setPreferences({ theme: isDark ? 'light' : 'dark' })`. This will become `setTheme(mode)` which calls `setPreferences({ theme: mode })`. Because `authStore` version is currently 3, adding `low-light` as a valid theme value does NOT require a version bump — it's an additive value. The sanitizer handles unknown values by falling back to `dark`, which is the safe default.

### Pattern 2: Font Loading with SplashScreen Hold

**What:** Load bundled serif font before hiding the splash screen.

**When to use:** Required for all font usage — unstyled text flashes before font loads if skipped.

**Official pattern (Expo SDK 54, verified against docs.expo.dev):**

```typescript
// In App.tsx — the font load must happen BEFORE SplashScreen.hideAsync()
import { useFonts } from 'expo-font';

// Inside LoadingScreen component, alongside the existing auth init:
const [fontsLoaded, fontError] = useFonts({
  'Lora-Regular': require('./assets/fonts/Lora-Regular.ttf'),
  'Lora-Italic': require('./assets/fonts/Lora-Italic.ttf'),
});

// The existing isReady gate already holds SplashScreen — font load can be
// added to the same condition:
if (!isReady || (!fontsLoaded && !fontError)) {
  return null;
}
// Then SplashScreen.hideAsync() fires as before
```

**Alternative: expo-font config plugin**
The config plugin embeds font files in native binary so they are available synchronously without async load. Requires a new development build but eliminates the async load race. For this project, the runtime `useFonts` approach is simpler because:
- No new native build required for the design change itself
- The splash screen integration is already there
- Font files are small (~240KB each)

### Pattern 3: Design Token Update in system.ts

**What:** Replace current radius values (sm:12, md:16, lg:24, xl:32) with print-editorial scale.

**Recommended replacement direction (Claude's discretion area):**

```typescript
export const radius = {
  xs: 2,   // Nearly square — structural elements, chapter tiles
  sm: 4,   // Subtle rounding — most card/surface elements
  md: 8,   // Moderate — modals, larger surfaces
  lg: 12,  // Generous — only for pill-adjacent shapes
  pill: 999,  // Pill — keep for toggle/chip affordances
} as const;
```

Current values (sm:12, md:16, lg:24, xl:32) feel like "default UI kit" settings. Going toward xs:2/sm:4 for most elements creates the print-editorial feel without going fully rectangular.

**Shadow strategy:** Remove `shadows.card` and `shadows.floating` from most screen usages. Replace with `cardBorder` token (a 1px border line in warm grey). Keep elevation only for modals/overlays that must float above content.

### Pattern 4: Warm Palette Token Design

**What:** Three complete `ThemeColors` objects in ThemeContext.

**Palette direction (Claude's discretion area — hex values are recommendations):**

**Dark palette (hero, target first):**
```typescript
const darkColors: ThemeColors = {
  background: '#0C0B09',          // Warm near-black (D-02)
  cardBackground: '#161410',      // Barely lifted warm dark
  cardBorder: '#2A2620',          // Warm dark grey, no blue
  primaryText: '#F0EBE0',         // Warm cream (D-03)
  secondaryText: '#9E9589',       // Warm muted
  accentGreen: '#C0392B',         // Legacy alias — keep warm red accent
  accentPrimary: '#C0392B',       // Warm red — interactive affordances only
  accentSecondary: '#D9D3C8',     // Warm light grey
  accentTertiary: '#7A7269',      // Warm muted grey
  tabActive: '#F0EBE0',
  tabInactive: '#6B635A',
  error: '#E07060',
  success: '#7A9E6E',
  warning: '#C9A055',
  overlay: 'rgba(10, 8, 6, 0.72)',
  bibleBackground: '#0C0B09',
  bibleSurface: '#131210',        // Very subtle lift
  bibleElevatedSurface: '#1A1815',
  bibleDivider: '#2A2620',
  biblePrimaryText: '#F0EBE0',
  bibleSecondaryText: '#9E9589',
  bibleAccent: '#C0392B',
  bibleControlBackground: '#F0EBE0',
};
```

**Light palette:**
```typescript
const lightColors: ThemeColors = {
  background: '#F5F0E8',          // Warm cream (D-05)
  cardBackground: '#FDFAF5',      // Slightly warmer than bg
  cardBorder: '#DDD7CC',          // Warm tan border
  primaryText: '#1C1814',         // Warm near-black
  secondaryText: '#6B5F52',       // Warm brown-grey
  accentGreen: '#8B2020',         // Warm dark red
  accentPrimary: '#8B2020',
  accentSecondary: '#3D3530',
  accentTertiary: '#9A8E82',
  tabActive: '#1C1814',
  tabInactive: '#9A8E82',
  error: '#B5352A',
  success: '#4E7A44',
  warning: '#8B6820',
  overlay: 'rgba(0, 0, 0, 0.20)',
  bibleBackground: '#F5F0E8',
  bibleSurface: '#FDFAF5',
  bibleElevatedSurface: '#EDE8DE',
  bibleDivider: '#DDD7CC',
  biblePrimaryText: '#1C1814',
  bibleSecondaryText: '#6B5F52',
  bibleAccent: '#8B2020',
  bibleControlBackground: '#1C1814',
};
```

**Low-light (sepia) palette:**
```typescript
const lowLightColors: ThemeColors = {
  background: '#1A1408',          // Very dark amber (D-06 — parchment by candlelight)
  cardBackground: '#221B0B',      // Warm amber-brown lift
  cardBorder: '#352A10',          // Golden-brown border
  primaryText: '#D4BA8A',         // Amber parchment text
  secondaryText: '#8A7250',       // Muted amber
  accentGreen: '#A0522D',         // Sienna — warm interactive accent
  accentPrimary: '#A0522D',
  accentSecondary: '#C4A87A',
  accentTertiary: '#6B5530',
  tabActive: '#D4BA8A',
  tabInactive: '#6B5530',
  error: '#C87060',
  success: '#7A8E5A',
  warning: '#B8901A',
  overlay: 'rgba(10, 6, 0, 0.72)',
  bibleBackground: '#1A1408',
  bibleSurface: '#1E1809',
  bibleElevatedSurface: '#24200E',
  bibleDivider: '#352A10',
  biblePrimaryText: '#D4BA8A',
  bibleSecondaryText: '#8A7250',
  bibleAccent: '#A0522D',
  bibleControlBackground: '#D4BA8A',
};
```

### Pattern 5: Typography Extension in system.ts

**What:** Add `readingFontFamily` pointing to the bundled Lora font, update all `reading*` typography tokens.

```typescript
// NEW: bundled serif
const readingFontFamily = 'Lora-Regular';
const readingFontFamilyItalic = 'Lora-Italic';

// Update reading tokens:
readingDisplay: {
  fontFamily: readingFontFamilyItalic,  // Lora Italic for display verse
  fontSize: 28,
  lineHeight: 38,   // slightly more generous for serif
  fontStyle: 'italic',
  fontWeight: '400',
  letterSpacing: 0.2,  // serif benefits from slight positive tracking
},
readingHeading: {
  fontFamily: readingFontFamily,  // Lora Regular for section headings
  fontSize: 14,
  lineHeight: 20,
  fontWeight: '400',
  letterSpacing: 0.8,  // Small caps feel — achieved via tracking + uppercase
  textTransform: 'uppercase',
},
readingBody: {
  fontFamily: readingFontFamily,
  fontSize: 18,
  lineHeight: 30,    // Serif needs more line height (1.67x)
  fontWeight: '400',
  letterSpacing: 0.1,
},
readingVerseNumber: {
  fontFamily: readingFontFamily,
  fontSize: 11,
  lineHeight: 18,
  fontWeight: '400',
  letterSpacing: 0.5,
},
```

**Serif vs sans-serif boundary (Claude's discretion, D-11):**
- **Serif (Lora):** All reading surfaces (BibleReader body text, verse numbers, section headings, daily verse on HomeScreen, lesson body text in FourFields)
- **Sans-serif (system):** All interactive UI — tab labels, buttons, settings rows, navigation headers, form labels, error messages, group management UI, modal controls. Functional affordances stay legible and familiar.
- **Serif italic:** Featured verse display on HomeScreen (the "verse-of-the-day" hero), pull quotes in Four Fields lessons

This boundary matches the ESV and Glorify reference apps: serif for content, sans for chrome.

### Recommended Project Structure (additions only)
```
assets/
└── fonts/
    ├── Lora-Regular.ttf     # NEW: ~240KB
    └── Lora-Italic.ttf      # NEW: ~240KB

src/
├── contexts/
│   └── ThemeContext.tsx     # MODIFY: add lowLightColors, isLowLight, themeMode, setTheme
├── design/
│   └── system.ts            # MODIFY: update radius, typography.reading*, add font names
├── types/
│   └── user.ts              # MODIFY: extend theme union to 'dark' | 'light' | 'low-light'
├── stores/
│   └── persistedStateSanitizers.ts  # MODIFY: extend validThemes set
└── screens/
    └── more/
        └── SettingsScreen.tsx  # MODIFY: three-way theme selector UI
```

### Anti-Patterns to Avoid
- **Do not add expo-font config plugin** unless a new native build is already required for another reason — the useFonts runtime approach is sufficient and avoids an unnecessary rebuild.
- **Do not use variable fonts** — expo-font documentation states variable fonts lack full platform support. Use static TTF files.
- **Do not bundle full Cormorant Garamond family** — 45 files at 6.6MB is excessive for a typeface that requires display sizes (28px+) to render well.
- **Do not keep both `toggleTheme` and `setTheme`** — replace `toggleTheme` entirely. Update all call sites (only SettingsScreen and ThemeProvider currently call it).
- **Do not forget the Zustand store version bump** — adding 'low-light' to the theme union is backward compatible (sanitizer falls back to dark), but if the store migrate() function is ever changed, increment the version.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Font loading with splash hold | Custom font-loading state machine | `expo-font` useFonts + existing SplashScreen gate | Race conditions, platform differences, already integrated |
| Three-way toggle UI | Custom segmented control | React Native TouchableOpacity row with active/inactive state (3 items) | Simple, no dependency needed; matches existing pattern in settings |
| Sepia/warm palette math | Color tinting algorithm | Manually authored hex values per palette | Mathematical tinting produces wrong results; editorial palettes require human judgment |
| Border radius stripping | Script to find/replace radius values | Manual screen-by-screen audit | Context matters — a border radius on a pill button must stay 999; a card radius should go to 4 |

**Key insight:** In a design system migration, the hard work is editorial judgment per screen — not code generation. Tooling can find tokens; only a human-guided pass decides which card surfaces to flatten vs. simplify vs. keep.

---

## Common Pitfalls

### Pitfall 1: Font Flash (FOUC)
**What goes wrong:** App renders with system serif (Georgia) before Lora loads, causing a visible font swap.
**Why it happens:** `useFonts` is async — if the null-return guard fires too early or the SplashScreen gate is bypassed, the text renders before fonts are ready.
**How to avoid:** Keep the existing `SplashScreen.preventAutoHideAsync()` + `isReady` gate in App.tsx. Add `(!fontsLoaded && !fontError)` to the null return guard alongside `!isReady`. Font errors should not block rendering — allow fallback to Georgia if Lora fails to load.
**Warning signs:** Text changes appearance after splash screen hides.

### Pitfall 2: 'low-light' Rejected by Sanitizer on Old Builds
**What goes wrong:** User sets theme to 'low-light', app restarts, preference resets to 'dark'.
**Why it happens:** `validThemes` in persistedStateSanitizers.ts is a Set that rejects unknown values. Old app builds have the old Set.
**How to avoid:** Add 'low-light' to `validThemes` in the same PR as the type union change. Since this is a new value (not renaming existing), old app versions will safely fall back to 'dark' — correct behavior.
**Warning signs:** Theme preference doesn't survive app restart.

### Pitfall 3: ThemeContextValue Interface Mismatch
**What goes wrong:** TypeScript errors across the codebase when `ThemeContextValue` changes.
**Why it happens:** Components destructure `{ colors, isDark, toggleTheme }` from `useTheme()`. Removing `toggleTheme` breaks every call site.
**How to avoid:** Keep `isDark` (computed as `themeMode !== 'light'`). Add `isLowLight` (computed as `themeMode === 'low-light'`). Add `themeMode` and `setTheme`. Deprecate but keep `toggleTheme` as `() => setTheme(isDark ? 'light' : 'dark')` until all call sites are migrated, then remove it. This makes the migration incremental.
**Warning signs:** TypeScript compile errors on `useTheme()` destructuring.

### Pitfall 4: BibleReader Glass Effects Losing Theme Awareness
**What goes wrong:** The BibleReaderScreen uses hardcoded `rgba(255,255,255,0.16)` and similar glass values that look correct on dark but break on warm palettes.
**Why it happens:** Glass/blur effects are alpha-composited over content — the base color matters. Warm backgrounds need warm-tinted glass.
**How to avoid:** When migrating BibleReaderScreen hardcoded values, derive glass colors from theme: `overlay` token is the primary glass base. For the scroll-collapse glass header, use `rgba(12, 11, 9, 0.85)` (dark) / `rgba(245, 240, 232, 0.88)` (light) / `rgba(26, 20, 8, 0.88)` (low-light). Add these as new tokens: `glassBackground`.
**Warning signs:** Reader header glass looks wrong in light or low-light mode.

### Pitfall 5: Hardcoded Icon Colors (#fff, #4169E1, #FFD700, #9932CC)
**What goes wrong:** GroupSessionScreen uses hardcoded icon colors that don't respond to theme.
**Why it happens:** Original developer used semantic colors (blue for back, gold for insight, purple for prayer) rather than theme tokens.
**How to avoid:** Map these to the closest theme token during the screen sweep. Gold insight → `colors.warning`. Blue back → `colors.accentPrimary`. Purple prayer → consider a new `colors.spiritual` token or reuse `colors.accentPrimary`. White on colored buttons → keep as white since these are on accent-colored surfaces where white is always correct.
**Warning signs:** Icons look out-of-place on warm backgrounds.

### Pitfall 6: StatusBar Style in Low-Light Mode
**What goes wrong:** StatusBar stays `light` or `dark` based on `isDark`, but low-light is also dark and needs light status bar text.
**Why it happens:** App.tsx uses `isDark ? 'light' : 'dark'` — low-light will compute `isDark = true` which is correct if low-light is treated as dark. Confirm this computation.
**How to avoid:** Low-light is a dark background mode, so `isDark` should return `true` when `themeMode === 'low-light'`. Status bar `style='light'` is correct for both dark and low-light.
**Warning signs:** Status bar text invisible on low-light backgrounds.

---

## Code Examples

Verified patterns from official sources and existing codebase:

### Font Loading (useFonts pattern)
```typescript
// Source: docs.expo.dev/develop/user-interface/fonts/
import { useFonts } from 'expo-font';

// In App.tsx LoadingScreen component:
const [fontsLoaded, fontError] = useFonts({
  'Lora-Regular': require('./assets/fonts/Lora-Regular.ttf'),
  'Lora-Italic': require('./assets/fonts/Lora-Italic.ttf'),
});

// Guard: keep splash until both auth AND fonts are ready
if (!isReady || (!fontsLoaded && !fontError)) {
  return null;
}
// fontError is intentionally not blocking — fall back to system serif gracefully
```

### Three-Way Theme Selector (SettingsScreen)
```typescript
// Replaces the existing Switch toggle for dark mode
// Uses same pattern as existing font size increase/decrease buttons
const themeOptions: Array<{ value: 'dark' | 'light' | 'low-light'; label: string }> = [
  { value: 'dark', label: t('settings.themeDark') },
  { value: 'light', label: t('settings.themeLight') },
  { value: 'low-light', label: t('settings.themeLowLight') },
];

// Render as three-button row, active state highlighted with accentPrimary background
```

### Extended ThemeContextValue
```typescript
interface ThemeContextValue {
  colors: ThemeColors;
  isDark: boolean;          // true for 'dark' and 'low-light'
  isLowLight: boolean;      // true only for 'low-light'
  themeMode: 'dark' | 'light' | 'low-light';
  setTheme: (mode: 'dark' | 'light' | 'low-light') => void;
  toggleTheme: () => void;  // keep temporarily for backward compat
}

// In ThemeProvider:
const isDark = themeMode !== 'light';
const isLowLight = themeMode === 'low-light';
const colors = themeMode === 'dark'
  ? darkColors
  : themeMode === 'light'
  ? lightColors
  : lowLightColors;
```

### system.ts readingFontFamily Token
```typescript
// Replace the platform-select with the bundled font name
// The string 'Lora-Regular' is the key passed to useFonts
const readingFontFamily = 'Lora-Regular';
const readingFontFamilyItalic = 'Lora-Italic';
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Platform.select({ ios: 'Georgia' }) for reading font | Bundled custom TTF via expo-font useFonts | Expo SDK 33+ | Consistent cross-platform rendering |
| Binary dark/light toggle | Three-mode selector (dark, light, sepia) | This phase | Adds low-light/reading mode popular in Bible apps |
| useFonts with AppLoading | useFonts with SplashScreen.preventAutoHideAsync | Expo SDK 44+ | AppLoading deprecated; SplashScreen is current approach |
| expo-font config plugin (preferred) | useFonts runtime hook | SDK 50+ | Config plugin needs native build; runtime hook is more flexible |

**Deprecated/outdated:**
- `AppLoading` from expo: deprecated in SDK 44, removed in SDK 50. SplashScreen is the replacement. Already using SplashScreen.
- `Georgia` as readingFontFamily: works but yields platform-inconsistent rendering. Replaced by bundled Lora.

---

## Screen Sweep Inventory

All screens and components that need the new visual language applied (D-16):

| Screen/Component | Hardcoded Colors | High-Radius Elements | Nested Cards | Shadow Usage |
|------------------|-----------------|---------------------|--------------|--------------|
| HomeScreen | No | Yes (multiple) | Yes (verse card-in-card) | Yes (via shadows.card) |
| BibleReaderScreen | 5 rgba values | Yes | Yes | Glass effects |
| BibleBrowserScreen | No | Yes | No | Minimal |
| ChapterSelectorScreen | No | Yes | No | Minimal |
| GroupSessionScreen | 9 hardcoded | Yes | Yes | Some |
| FourFieldsJourneyScreen | 2 (#fff) | Yes | No | No |
| FourFieldsLessonViewScreen | 2 (#FFD700, #fff) | Yes | Yes | No |
| FieldOverviewScreen | 1 (#fff) | Yes | No | No |
| GroupDetailScreen | 1 (#fff) | Yes | No | No |
| CourseListScreen | 1 (#fff) | Yes | No | No |
| SettingsScreen | 4 (#ffffff) | Yes | No | No |
| MoreScreen | 1 (#ffffff) | Yes | No | Minimal |
| ReadingActivityScreen | 2 (#ffffff) | Yes | No | No |
| AboutScreen | Unknown | Yes | No | No |
| SignInScreen/SignUpScreen | Unknown | Yes | No | No |
| LocaleSetupFlow | Unknown | Yes | No | No |
| ProfileScreen | Unknown | Yes | No | No |
| PrivacyPreferencesScreen | Unknown | Yes | No | No |
| LocalePreferencesScreen | Unknown | Yes | No | No |
| AudioPlaybackControls component | 1 rgba | Yes | No | No |
| FieldCard component | 5 hardcoded | Yes | No | No |
| JourneyPath component | 2 rgba | No | No | No |
| PracticeCard component | 1 (#fff) | No | No | No |

**Total known hardcoded colors:** ~31 instances across screens + ~14 in components = ~45 total

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (tsx) |
| Config file | None — test commands use explicit file paths |
| Quick run command | `npm run test:release` |
| Full suite command | `npm run release:verify` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| M2-DESIGN-01 | Theme token values are valid (no null/undefined) | manual visual | N/A — visual only | ❌ Manual |
| M2-DESIGN-01 | Three theme modes render without crash | manual | simulator visual check | ❌ Manual |
| M2-DESIGN-01 | Font loads without FOUC (unstyled flash) | manual | device check | ❌ Manual |
| M2-DESIGN-01 | Low-light preference persists across app restart | unit | existing sanitizer tests | Consider adding |
| M2-DESIGN-01 | sanitizeUserPreferences accepts 'low-light' | unit | extend persistedStateSanitizers tests | ❌ Need new test |

The design system phase is primarily a visual/manual verification domain. The one automatable unit test is verifying that `sanitizeUserPreferences` correctly accepts `'low-light'` as a valid theme value — this should be added as part of the wave that modifies `persistedStateSanitizers.ts`.

### Sampling Rate
- **Per task commit:** TypeScript typecheck (`npm run typecheck`) to catch ThemeContextValue/UserPreferences type errors
- **Per wave merge:** `npm run release:verify` (lint + typecheck + existing regression suite)
- **Phase gate:** Full suite green + manual device visual review before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Unit test for `sanitizeUserPreferences` accepting `'low-light'` theme value — add to the existing test suite or as a new test alongside `persistedStateSanitizers.ts` changes

---

## Reader Layout Principles

This addendum focuses on scripture readability mechanics rather than palette or brand voice. The strongest cross-source pattern is simple: readable Bible layout behaves more like disciplined editorial text and less like standard app UI. The key levers are measure, leading, whitespace, and intrusions.

**Evidence-backed defaults**
- Keep long-form reading blocks left-aligned, not fully justified. WCAG calls out justification as a readability risk because irregular word spacing creates visual rivers and makes tracking harder.
- Keep reading width narrow. WCAG's upper bound is 80 characters; Crossway's own Bible production guide says readable single-column Bible setting lands around 45-75 characters, and general mobile readability guidance trends lower than that.
- Give text more vertical room than default app typography. WCAG's spacing guidance and typography practice both support looser leading for sustained reading than typical interface copy uses.

**Inferred product guidance**
- On phones, EveryBible should target the lower half of those ranges, because scripture is continuous long-form reading, not skimmable UI copy.
- Reader mode should optimize for reading flow first, not verse addressability first. Study affordances can remain available, but they should stop dominating the text block.

## Prose Layout Rules

### Measure and margins
- Target prose measure at roughly **34-42 characters per line** on phones, with **30-50 CPL** as the safe operating band.
- Use **20-24 px** horizontal reader margins on standard phones. Increase to **28-32 px** on larger phones/tablets rather than letting the line length sprawl.
- Keep the text in a single centered column. Do not use full-width edge-to-edge text for reading surfaces.

### Leading and paragraph rhythm
- Set prose line-height to **1.45-1.55** for continuous scripture reading.
- Ensure the layout still survives user overrides at **1.5x line spacing** and larger paragraph spacing without clipping or overlap.
- Use **one paragraph signal only**:
  - Reader mode recommendation: first-line indent for narrative prose.
  - Study mode alternative: paragraph spacing with no first-line indent.
- If using indents, keep them shallow on mobile: **1.0-1.5 em**. Avoid deep print-style indents that waste narrow screen width.
- If using paragraph spacing instead, use **0.4-0.75 line-height** between paragraphs. Avoid blank-line-sized gaps in ordinary narrative prose.

### Alignment and emphasis
- Keep prose left-aligned.
- Avoid routine bolding inside the text block. Use italic or color sparingly for headings only.
- Keep sentence rhythm visually clean: no decorative underlines, no dense inline metadata, no aggressive contrast shifts inside the paragraph body.

## Poetry And Quote Layout Rules

Poetry needs a different rhythm from prose. The main rule is to preserve line meaning without turning the page into a staircase.

### Poetry lines
- Preserve each poetic line as a real line, not as soft-wrapped prose.
- Use a slightly tighter line-height than prose: **1.3-1.4** usually reads best for Psalms, prophetic poetry, and quoted canticles.
- Keep stanza or thought-group spacing modest: **0.5-0.75 line-height** between grouped units.

### Indentation
- Prefer **shallow, semantic indentation**, not a rigid alternating pattern on every second line.
- Mark Ward's reader-Bible critique is useful here: he explicitly praises sparing indentation and finds aggressively alternating poetic indents jarring.
- For wrapped poetic lines, use a **hanging continuation indent** so wrapped text reads as continuation, not a new poetic unit.
- In wisdom literature like Proverbs, keep couplets visually grouped. Do not insert full empty-line gaps after every short line unless the source structure truly demands it.

### Quotes and embedded speech
- Distinguish block quotations from body prose with structure first:
  - **16-24 px** inset
  - subtle left rule or tonal shift only if needed
  - preserve the same base type size when possible
- Do not make quotes feel like cards. They should remain text-first, not component-first.

## Bible-Specific Layout Decisions

### Verse numbers
- Verse numbers should help navigation without breaking reading flow.
- In reader mode, prefer either:
  - hidden verse numbers, or
  - very quiet inline numbers at roughly **0.72-0.82 em** of body size with reduced contrast.
- Keep verse numbers baseline-aligned or slightly raised, but do not let them materially change line-height.
- Never bold verse numbers.
- If a verse starts a new paragraph, the paragraph structure should remain the dominant signal, not the number.

### Section headings
- Use restrained headings. ESV-style readability benefits from headings that orient without shouting.
- Best default:
  - serif italic or quiet small-caps treatment
  - size roughly **1.1-1.25x** body text
  - generous spacing above, tighter spacing below
- Do not use oversized app-style headers inside the reading column.

### Chapter landmarks
- Chapter numbers may remain visually prominent, but they should function as occasional landmarks, not repeated interruptions.
- A chapter opening can carry more ornament or whitespace than the rest of the text block, but once reading begins, the page should settle into a stable rhythm quickly.

### Reader vs study behavior
- Split the modes conceptually:
  - **Reader mode:** prose-first, low-noise, minimal verse markers.
  - **Study mode:** keeps verse numbers, tighter spacing, clearer sectional scaffolding.
- Both modes should share the same core typographic voice so switching modes does not feel like switching apps.

## Why ESV Feels Easier To Read

Crossway's own materials point to the big reasons:
- generous margins
- spacious layout
- single-column reading
- removal or reduction of verse-number noise in reader-oriented editions
- careful attention to line length, leading, and page orderliness

The ESV feel is not magic. It is mostly restraint.

What ESV-style layout gets right:
- It treats scripture as reading, not as a database dump.
- It reduces inline clutter so the eye can stay in the paragraph.
- It gives the text block enough margin and leading to breathe.
- It uses hierarchy softly instead of relying on loud UI chrome.

What ESV does less well, based on Bible typography criticism worth taking seriously:
- Some reader-Bible implementations can become too regimented in poetry, using line breaks and indents that feel mechanically consistent rather than semantically expressive.
- EveryBible should not blindly copy ESV poetic indentation. The better lesson is its restraint, then improve on poetry grouping with subtler indent logic.

## EveryBible Implementation Defaults

These are the recommended starting defaults for the React Native reader unless device testing disproves them:

### Reader mode
- Body size: **18 px** default
- Line-height: **1.48**
- Horizontal padding: **22 px**
- Target measure: **~36-40 CPL**
- Alignment: left
- Paragraphs: first-line indent **1.1 em**, no extra paragraph gap
- Verse numbers: hidden by default or ultra-muted
- Section headings: serif italic, about **1.15x** body size

### Study mode
- Body size: **17 px** default
- Line-height: **1.4**
- Horizontal padding: **20 px**
- Paragraphs: no indent, modest paragraph spacing
- Verse numbers: visible, muted, small
- Section headings: same family, slightly stronger contrast

### Poetry mode
- Body size: match current mode
- Line-height: **1.34-1.4**
- Preserve source line breaks
- Use semantic indents only
- Wrapped lines get hanging continuation indents
- Couplets and stanzas stay visually grouped; avoid excessive empty-line fragmentation

### Large-screen rule
- On tablets or wide panes, preserve the same effective measure by increasing margins or narrowing the column.
- Do not let the reader text block expand to full available width just because space exists.

## Open Questions / Validation Needs

1. **Prose measure on actual devices**
   - Verify the recommended defaults on the smallest supported iPhone and a large Pro Max class device.
   - The implementation target is the same visual measure, not the same raw padding value.

2. **Verse number strategy**
   - Validate whether muted inline verse numbers are acceptable in reader mode or whether the app should fully hide them there and reserve visible numbers for study mode.

3. **Poetry indentation logic**
   - Test representative passages from Psalms, Proverbs, Isaiah, and the Gospels' embedded quotations.
   - The goal is to confirm that poetic grouping feels natural and not over-designed.

4. **Heading restraint**
   - Compare italic serif headings against small-caps + letterspaced roman headings.
   - Choose the quieter option that still preserves section discoverability.

5. **Accessibility overrides**
   - Confirm the reader survives larger line spacing, larger paragraph spacing, and increased text size without overlap, clipping, or broken verse-number placement.

---

## Open Questions

1. **Lora font license for App Store distribution**
   - What we know: Lora is OFL-1.1 licensed — free for commercial use and app bundling per the SIL Open Font License.
   - What's unclear: Whether the eas.json build configuration requires any attribution step.
   - Recommendation: OFL-1.1 permits bundling without attribution in the app itself. No additional configuration needed.

2. **Tab bar frosted glass treatment**
   - What we know: Glorify reference shows a frosted glass tab bar. expo-blur is already installed.
   - What's unclear: Whether frosted blur over warm palettes looks good on Android (BlurView has known Android quality issues).
   - Recommendation: Research the BlurView Android quality for the Low-light palette specifically before committing to frosted tab bar. Fallback: warm semi-opaque solid (e.g., `rgba(12, 11, 9, 0.92)`) achieves similar effect without platform concerns.

3. **Four Fields field-specific icon colors (gold, blue, purple)**
   - What we know: GroupSessionScreen uses #FFD700 (insight), #4169E1 (back), #9932CC (prayer).
   - What's unclear: Whether these should become theme tokens or be replaced with accent/warning tokens.
   - Recommendation: Map to existing tokens (`warning` for gold/insight, `accentPrimary` for action-forward elements). Avoids polluting the token system with one-off semantic colors. If the Four Fields design merits distinct field colors, create a separate `fieldColors` object in system.ts that is not part of ThemeColors.

---

## Sources

### Primary (HIGH confidence)
- [Expo Fonts documentation](https://docs.expo.dev/develop/user-interface/fonts/) — useFonts API, SplashScreen integration, format requirements (OTF/TTF recommended, variable fonts not fully supported)
- [expo-font 14.0.11 already in package.json](../../../package.json) — confirmed installed, no new dependency needed
- [ThemeContext.tsx in codebase](../../../src/contexts/ThemeContext.tsx) — confirmed dark/light palettes, ThemeContextValue shape, toggleTheme call sites
- [system.ts in codebase](../../../src/design/system.ts) — confirmed current radius values (sm:12, md:16, lg:24, xl:32), readingFontFamily pattern, typography tokens
- [persistedStateSanitizers.ts](../../../src/stores/persistedStateSanitizers.ts) — confirmed validThemes Set at line 29, defaultAuthPreferences pattern
- [user.ts types](../../../src/types/user.ts) — confirmed `theme: 'dark' | 'light'` union type at line 14

### Secondary (MEDIUM confidence)
- [Cormorant Garamond vs EB Garamond comparison](https://typogram.co/font-discovery/how-to-use-cormorant-font) — Cormorant better for digital at display sizes; both challenging at body text sizes
- [Lora Google Fonts](https://fonts.google.com/specimen/Lora) — designed for screen body text, moderate contrast, calligraphic origin; OFL-1.1 license
- @expo-google-fonts/lora npm package — 2.0MB unpacked (all 8 weights); selective bundling of individual TTF files preferred
- [W3C WCAG 2.2: Visual Presentation](https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html) — text blocks should support narrow width, no full justification, and increased leading/paragraph spacing
- [W3C WCAG 2.2: Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html) — concrete spacing override requirements that the reader layout must survive
- [Butterick's Practical Typography summary](https://www.practicaltypography.com/summary-of-key-rules.html) — practical ranges for line length, line spacing, and paragraph treatment
- [Crossway Bible Production Guide (2024)](https://uploads.crossway.org/extra/esv-bible-production-guide-2024-reduced.pdf) — Bible-specific readability terms for line length, leading, line matching, and margins
- [Crossway: ESV Psalms, Photography Edition](https://www.crossway.org/articles/introducing-esv-psalms-photography-edition/) — explicitly ties spacious layout, generous margins, and removal of verse numbers to easier psalm reading
- [Mark Ward on reader Bible layout](https://byfaithweunderstand.com/2017/09/13/review-brand-new-csb-readers-bible/) — useful critique of poetic indentation, line-break rigidity, and visual grouping in reader-focused Bible typography

### Tertiary (LOW confidence)
- Glorify app reference screenshots — visual direction only; implementation details unknown
- ESV app reference screenshots — visual direction only; implementation details unknown

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — expo-font already installed and documented; all relevant files read from codebase
- Architecture: HIGH — ThemeContext, system.ts, authStore all read; migration path is clear
- Palette values: MEDIUM — hex values are researcher recommendations aligned with D-02 through D-06; final values are Claude's discretion and should be tuned visually
- Pitfalls: HIGH — derived from actual codebase reading (hardcoded colors found, BibleReader glass effects confirmed)
- Font selection: MEDIUM — recommendation based on screen readability research; Lora vs Cormorant evidence is clear but exact rendering on device should be confirmed

**Research date:** 2026-04-12 (layout/readability addendum), 2026-03-22 (theme/font baseline)
**Valid until:** 2026-07-12 for layout addendum; 2026-06-22 for prior theme/font baseline
