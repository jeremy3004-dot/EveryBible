# EveryBible — Beauty & Polish Spec (execution-ready)

**Prepared:** 2026-07-04 · **Auditor:** Fable 5 (read-only) · **Executor:** Opus
**Baseline:** commit `132fb6f`, main. Design tokens from `src/design/system.ts` (spacing 4/8/12/16/24/32/48 · radius xs2/sm4/md8/lg12/pill999 · `layout.minTouchTarget: 44` · `layout.screenPadding: 24` · `layout.cardPadding: 20`). Themes from `src/contexts/ThemeContext.tsx` (5 modes × 4 accent palettes; `colors.onAccent` = `#FDFAF5` dark-family / `#FFFFFF` light).

**Ground rules for execution (repo-hard):** theme tokens only (no hex outside sanctioned fixed palettes); every new/changed string is a `t()` key added to `en.ts` → `es.ts`/`ne.ts`/`hi.ts`; StyleSheet.create only; 4pt grid; no new Context providers; verify in dark(midnight) + light + parchment, at large font, in Nepali; chapter-to-chapter Bible transitions must never show a skeleton (verified intact at `BibleReaderScreen.tsx:2286–2293` — do not disturb).

---

## 0. Executive summary — the 10 themes that matter

1. **Text-on-accent token misuse (largest sweep, ~49+ sites).** `colors.cardBackground`, `colors.background`, `colors.primaryText`, and literal `'#fff'`/`'#FFFFFF'` are used as foreground on `accentPrimary`/`accentGreen`/`success`/`error` fills. In midnight (the default theme) `cardBackground` = `#101623` on `#C8463C` ≈ 3.3:1 — failing text everywhere: CTAs, checkmarks, badges, pills. The correct token `colors.onAccent` already exists. One mechanical sweep fixes dark-mode contrast across ~15 files.
2. **Two invisible/broken auth-critical states.** Submit spinner in AuthScreen/ResetPassword is `primaryText` on `bibleControlBackground` — **identical hex in all 5 themes** → invisible spinner. Apple button hardcodes `WHITE` style → invisible edges on light theme.
3. **Fake and dead UI shipped to production.** HomeScreen shows hardcoded `68%` progress and `8 min left` to every user with history (`HomeScreen.tsx:161, 619`). Four "orphaned" Four Fields screens have no-op CTAs with full press affordances. LessonBottomSheet has Download/Bookmarks rows that silently do nothing. Settings has a dead "Download for offline" touchable.
4. **i18n gaps (~60 hardcoded English strings).** Worst: RhythmComposerScreen (~20 strings), PlaybackControls + its option data files, GroupDetailScreen (8), LessonDetailScreen (6), reader theme-sheet labels, and a whole class of **hardcoded English accessibility labels** (screen readers speak English to ne/hi/es users).
5. **Touch-target deficit, stack-wide.** The 32×32 back button (`padding: 4` + 24 icon) is copy-pasted across ~10 screens; scrubber is an 18pt band; filter pills ~30pt; several primary CTAs 32–38pt. ~25 sites below 44pt.
6. **Haptics essentially absent.** `src/utils/haptics.ts` exists and is used by ~1 surface (reader copy). Zero haptics on: lesson/session/day completions, prayer post, plan enroll, theme/toggle changes, tab switch, play/pause, verse select.
7. **`tabular-nums` missing on ~25 updating numerals** — audio time labels (jitter every second), progress %, day counters, char counter, member counts, chapter grids.
8. **Press-feedback anarchy.** `activeOpacity` values in the wild: default(0.2), 0.7, 0.75, 0.8, 0.82, 0.85, 0.86, 0.88, 0.9, 0.92; several `Pressable`s with zero feedback while AnnotationActionSheet sets a 0.96-scale house standard.
9. **Design-system stragglers.** GroupList/GroupDetail/GroupSession, SettingsScreen, LocaleSetupFlow, CourseDetail, FourFieldsJourney predate `src/design/system.ts` (raw fontSizes/paddings). FieldCard + `fourFieldsCourses.ts` still carry the pre-rebrand "Tibetan" palette (`#8B2635/#D4A017/#4A90E2`) that ignores all themes and clashes with the ember accent.
10. **State-coverage holes.** PrayerWall shows a false "no prayers yet" empty state when offline (error rendered as empty — harmful on a social surface); Bible search and translation picker have no search-empty states; several loaders are static icons or bare text; several fetch failures are silently swallowed with no retry.

**What's already excellent (do not touch):** reader typography (1.56 line-height, 560px measure, 24px gutters, muted verse numbers); ReaderPlaybackDock motion; AnnotationActionSheet a11y + 0.96 press pattern; `useTabBarHeight`; the 5 stack navigators (byte-identical options); GatherScreen and RhythmComposer layout-token usage; PlansHome empty-state CTA; AuthScreen error-copy pipeline; chapter-transition no-skeleton guard.

---

## 1. Global / cross-cutting fixes

### 1.1 Token & system additions (`src/design/system.ts`, `ThemeContext.tsx`)

| Addition | Value | Rationale |
|---|---|---|
| `radius.xl` | `20` | Bottom sheets (LessonBottomSheet 20, LessonDetail sheet 20, PlaybackControls modal 22→20) — 3 surfaces invented ~20 independently |
| `radius.xxl` | `28` | AnnotationActionSheet 28, AudioFirstChapterCard 28, PlaybackControls card — third unofficial radius |
| `spacing` — no additions | — | Existing scale is sufficient; off-grid literals get mapped to it |
| `hexWithAlpha(color: string, alpha: number)` helper in `src/utils/` | `/^#[0-9a-f]{6}$/i` guard, else return color unchanged | Replaces fragile `color + '55'` string concat found in ≥6 files (ReaderPlaybackDock:175, AnnotationActionSheet:182, HighlightedVerseText:76/96, TranslationPickerList:619 fix, Settings tints) |
| `formatPlaybackTime(ms)` in `src/services/audio/` (or `src/utils/`) | extract | Duplicated verbatim in AudioPlayerBar:53–58 and AudioFirstChapterCard:77–82 |

**Legacy palette file:** `src/constants/colors.ts` has **zero `.tsx` imports** (verified by grep). Verify no `.ts` imports remain, then delete it (or add a `@deprecated — use useTheme()` header if any script depends on it). It advertises stale hex that invites new violations.

### 1.2 The onAccent sweep (P0, mechanical)

Replace foreground `colors.cardBackground` / `colors.background` / `colors.primaryText` / `'#fff'` / `'#FFFFFF'` **when rendered on accentPrimary / accentGreen / accentSecondary / success / error fills** with `colors.onAccent`. Grep found 49 `color: colors.cardBackground`-as-foreground sites; per-file anchors are in Section 2 tables. One visual check required: `onAccent` (#FDFAF5) on the tan `accentSecondary` fill (PracticeCard.tsx:107) — if it doesn't read, that one site may use `colors.background`.

### 1.3 Interaction policy (apply app-wide during the P1 pass)

- **activeOpacity:** `0.85` for buttons/cards/chrome · `0.7` for full-width list rows · `1` for backdrops. Replace all other values; add explicit `activeOpacity` where default (0.2) is in use.
- **Pressable feedback:** scale `0.96` on press (house standard from AnnotationActionSheet). Never below 0.95.
- **Haptics map** (all via existing `src/utils/haptics.ts`, one-line adds): success haptic → lesson complete, session complete, plan day complete, plan enroll, prayer posted; light impact → continue-reading, verse select (`selectionHaptic`, already imported in reader), prayed/encouraged pills, tab press, play/pause (medium), toggle switches, theme/palette change (selection); warning → leave group, destructive confirms.
- **Touch targets:** minimum 44×44 effective (visual size + hitSlop). The recurring fix: back buttons `padding: 4` → keep visual, add `hitSlop={8}`+ a11y role/label, or adopt the shared header below.
- **tabular-nums:** add `fontVariant: ['tabular-nums']` to every style flagged in Section 2 (~25 styles).

### 1.4 New shared components (small, extract-don't-invent)

| Component | Prop shape | Source pattern | Consumers |
|---|---|---|---|
| `ScreenHeader` | `{ title: string; onBack?: () => void; rightSlot?: ReactNode }` — 44×44 back target, `accessibilityRole="button"` + `t('common.back')` label, `paddingHorizontal: layout.screenPadding`, `paddingVertical: spacing.lg`, title `typography.cardTitle`, bottom hairline `cardBorder` | TranslationBrowserScreen (a11y) + Annotations (hitSlop) each have half the right answer | ~10 More/Learn/Plans screens with hand-rolled headers |
| `ProgressBar` | `{ progress: number; height?: 6 }` — track `cardBorder`, fill `accentPrimary`, `radius.xs`, `overflow: 'hidden'` | FieldOverviewScreen:288–297 (the good one) | CourseDetail (h8), LessonDetail (h3), FieldOverview, plan cards — 5 divergent implementations today |
| `InitialsAvatar` | `{ name: string; size?: 40 }` — bg `hexWithAlpha(accentPrimary, 0.15)`, initial from display name | GroupDetail 44px version | GroupDetail (44/accentGreen+'30'), PrayerWall (36/UUID-char bug) |

### 1.5 Skeleton system corrections

- `Skeleton.tsx:20–29` — pulse loop 2000ms → **1200ms** (600 per leg), explicit `Easing.inOut(Easing.ease)`.
- `Skeleton.tsx:60` — add `color?: string` prop (default `colors.cardBorder`); VersesSkeleton passes `colors.bibleDivider` so reader skeletons match the reading canvas in themed modes.
- `CardSkeleton.tsx:64–65` — radius 16 → `radius.lg` (12) to match real cards (kills the corner "snap" on load); inner image → `radius.md`; `padding: 16` → `layout.cardPadding`.
- `VersesSkeleton.tsx:26–41` — verse-number circle 24×24 → 14×12 r3 (real verse numbers are 10pt superscript); line rhythm 24px → 28px (`height 16`, `marginBottom 12`) to match `readingBody` 18/28; padding 20 → 24 to match reader gutter (fixes the load-time layout jump; see Bible §2 item 11).

---

## 2. Screen-by-screen findings

Row format: `| # | Anchor | Issue | Exact change (current → proposed) | Constraint check | Priority |`. Every row self-contained. "Already good" = do not touch.

### 2A. Home + Plans

#### src/screens/home/HomeScreen.tsx

| # | Anchor | Issue | Exact change | Constraint check | Pri |
|---|---|---|---|---|---|
| 1 | HomeScreen.tsx:161, 619 | **Fake data:** `readingProgressPercent = hasReaderHistory ? 68 : 0`; `minutesLeft { count: hasReaderHistory ? 8 : 0 }` — every user sees "68%" / "8 min left" forever | Wire to real chapter progress from progressStore/bibleStore, or remove the percent row + minutes label (drop `linearProgressTrack`/`smallCardFooter` block) until real data exists | Production trust | P0 |
| 2 | HomeScreen.tsx:392 | Share icon `color={colors.primaryText}` on `accentPrimary` fill (378) — fails light mode | → `colors.onAccent` | onAccent sweep | P0 |
| 3 | HomeScreen.tsx:721, 741 | Hardcoded `'rgba(233, 205, 172, 0.46)'` connector — parchment tint in all themes, near-invisible light mode | → `colors.cardBorder` (×2) | Verse-card scrim at 369–371 is intentional art — leave it | P0 |
| 4 | HomeScreen.tsx:604, 674 | `'rgba(255,255,255,0.12)'` track and `'rgba(255,255,255,0.22)'` dot gated on isDark | → `colors.cardBorder` unconditionally; delete both ternaries | — | P1 |
| 5 | HomeScreen.tsx:882 | `smallCardMeta` renders "68%"/"Day X of Y"/"8 min" without tabular figures | Add `fontVariant: ['tabular-nums']` | — | P1 |
| 6 | HomeScreen.tsx:836 | `headerRow: { gap: 3 }` | → `gap: spacing.xs` (4) | 4pt grid | P2 |
| 7 | HomeScreen.tsx:374–394 vs 579/632/685 | activeOpacity 0.88 vs 0.86×3 | All → `0.85` | Policy §1.3 | P2 |
| 8 | HomeScreen.tsx:385, 580 | No haptics on share / continue-reading (the 2 primary home actions) | `lightImpact()` in both handlers | — | P2 |
| 9 | HomeScreen.tsx:549, 561 | Inline styles: `{ flex: 1, minHeight }`, `{ width }` | Hoist static parts; keep dynamic values inline | — | P2 |
| 10 | HomeScreen.tsx:272–287 | Plan fetch failure silently shows fallback title | On `result.success === false` keep previous state, no-op | Bundled data, offline-safe | P2 |

Already good: verse-card scrim/typography (documented intentional palette); `adjustsFontSizeToFit` on hero text; share `hitSlop={8}`; skeleton on verse load; midnight/AppState refresh.

#### src/screens/plans/PlansHomeScreen.tsx

| # | Anchor | Issue | Exact change | Constraint check | Pri |
|---|---|---|---|---|---|
| 1 | PlansHomeScreen.tsx:83–85, 132, 419, 444, 829 | 5× `cardBackground` foreground on error/accent fills (delete row, cover fallback, sessionDot check, actionPillText, enrollBadgeText) | All → `colors.onAccent` (479/604–609 already correct — copy that) | onAccent sweep | P0 |
| 2 | PlansHomeScreen.tsx:816 | Hardcoded `` `${plan.duration_days}d` `` suffix | → `t('readingPlans.durationDaysShort', { count })`, key ×4 locales | i18n | P0 |
| 3 | PlansHomeScreen.tsx:796 | `.replace(/\s+Plan$/i, '')` English string surgery on a translation | New key `readingPlans.start` ("Start"); delete `.replace()` | i18n | P0 |
| 4 | PlansHomeScreen.tsx:1246–1250, 1358–1366 | Tab strip ~31pt targets, no `accessibilityRole="tab"`/`accessibilityState` | `minHeight: layout.minTouchTarget` + `justifyContent:'flex-end'` on `tab`; add role + `state={{selected:isActive}}` | 44pt | P0 |
| 5 | PlansHomeScreen.tsx:534, 510–545 | Dead `statsPanel…statDivider` styles incl. hardcoded `rgba(161,29,27,0.12)` | Delete lines 510–545 | Dead code | P1 |
| 6 | PlansHomeScreen.tsx:1224–1232 | Swipe-delete unenrolls instantly, no confirm — destroys progress | Wrap in `Alert.alert(t('readingPlans.deletePlanConfirmTitle'), t('readingPlans.deletePlanConfirmBody'), [cancel, destructive])` | Destructive safety | P1 |
| 7 | PlansHomeScreen.tsx:646, 677 | `dayCounter`, `percentText` not tabular | `fontVariant: ['tabular-nums']` | — | P1 |
| 8 | PlansHomeScreen.tsx:1186–1199 | `listReadingPlans` failure renders as "no plans" empty state | On `!success && length===0` render error row + `t('common.retry')` → `loadAllData()` | Error ≠ empty | P1 |
| 9 | PlansHomeScreen.tsx:943 | `searchWrap borderRadius: 18` off-scale | → `radius.lg` (12) | — | P1 |
| 10 | PlansHomeScreen.tsx:1000, 1013 | Badge `paddingVertical: 3` | → `spacing.xs` (4) ×2 | 4pt grid | P2 |
| 11 | PlansHomeScreen.tsx:966–974, 622 | Concentric radius: card r12 pad8 wraps cover r8 (should be 4); `coverFrame` r12 clips r8 image | Find-plans cover → `radius.sm` (4); `coverFrame` → `radius.md` (8) | Concentric rule | P2 |
| 12 | PlansHomeScreen.tsx:74, 397, 474, 802, 1076, 1250 | activeOpacity 0.7×3, 0.8×2, default×1 | Buttons → 0.85; rows → 0.7; explicit on delete | Policy | P2 |
| 13 | PlansHomeScreen.tsx:114–133 | `CoverImage` builds style objects inline per render (every row) | Hoist static parts; keep `{width,height}` inline | — | P2 |
| 14 | PlansHomeScreen.tsx:394, 472, 799 | No haptics on plan open / add / enroll | `lightImpact()`; `notificationSuccess()` after delete | — | P2 |

Already good: `emptyCtaButton` (591–609) is the model empty-state CTA; sticky tabs; `sectionHeader minHeight: 44`; themed RefreshControl.

#### src/screens/plans/PlanDetailScreen.tsx

| # | Anchor | Issue | Exact change | Constraint check | Pri |
|---|---|---|---|---|---|
| 1 | PlanDetailScreen.tsx:998–1002, 430, 460, 510/516, 296–298 | 7× `cardBackground` foreground on accent/success fills (Start CTA text+spinner, DayRow check, session badge/action, completeBadge) | All → `colors.onAccent` | onAccent sweep | P0 |
| 2 | PlanDetailScreen.tsx:399–401, 530 | Hardcoded English a11y labels (`` `Day ${n}…` `` etc.) | → `t('readingPlans.dayRowA11y', {day, refs})` / `currentDayRowA11y` / `sessionActionA11y` ×4 locales | i18n incl. a11y | P0 |
| 3 | PlanDetailScreen.tsx:608–614 | `sessionActionButton minHeight: 36` | → 44, or keep 36 + `hitSlop={{top:4,bottom:4}}` | 44pt | P1 |
| 4 | PlanDetailScreen.tsx:990, 1066, 1086, 1097 | Start Plan/back/retry use default activeOpacity | Add `activeOpacity={0.85}` ×4 | Policy | P1 |
| 5 | PlanDetailScreen.tsx:213, 321, 328 | Ring %, pct, "Day X of Y" not tabular | `fontVariant: ['tabular-nums']` ×3 styles | — | P1 |
| 6 | PlanDetailScreen.tsx:723–725 | `entriesResult` failure → header with zero rows, no message | If `!success && entries.length===0` set existing `error` state (retry screen shows) | Error coverage | P1 |
| 7 | PlanDetailScreen.tsx:339 | `completeBadge paddingVertical: 5` | → `spacing.xs` (4) | 4pt grid | P2 |
| 8 | PlanDetailScreen.tsx:604 | `marginTop: -spacing.xs` negative-margin hack | Remove; reduce `row.paddingVertical` md→sm when `hasSessionActions` | — | P2 |
| 9 | PlanDetailScreen.tsx:975, 981, 1201 | `rgba(0,0,0,0.4)` scrim + `#ffffff` over photo cover — intentional pattern, undocumented | Scrim → `colors.overlay`; add the one-line rationale comment HomeScreen uses (365–367) | Documented exemption | P2 |
| 10 | PlanDetailScreen.tsx:1205, 981 | RTL: `left: spacing.lg` + non-flipping `arrow-back` | `left:` → `start:`; icon `I18nManager.isRTL ? 'arrow-forward' : 'arrow-back'` | RTL | P2 |
| 11 | PlanDetailScreen.tsx:1058 | Inline `style={{ height: spacing.xxxl }}` | → `styles.footerSpacer` | — | P2 |
| 12 | PlanDetailScreen.tsx:991, 525 | No haptics on enroll / session launch | `notificationSuccess()` after enroll; `lightImpact()` on press | — | P2 |

Already good: loading/error screens keep a 44×44 back escape; ProgressRing SVG; memoized DayRow with `extraData={colors}`; commented concentric cover breakout.

#### src/screens/plans/RhythmComposerScreen.tsx

| # | Anchor | Issue | Exact change | Constraint check | Pri |
|---|---|---|---|---|---|
| 1 | RhythmComposerScreen.tsx:89, 160, 165, 286, 321, 327–355, 370–385, 397, 406, 409, 414, 429–443 | **~20 hardcoded English strings** — largest i18n violation ('Any time', 'Historic roots', 'Includes', hero card copy, `${n} presets`, 'Tap to add', 'Time of day', 'All', 'Midday', 'Tradition', empty states, 'Replace/Add rhythm'…). Tradition names from `RHYTHM_PRESET_TRADITIONS` also render raw | Add `readingPlans.rhythmComposer.*` block ×4 locales; 'Midday' (385) must use `t(RHYTHM_SLOT_META.afternoon.shortLabelKey)` like siblings; preset titles/descriptions in `rhythmPresets.ts` need label keys | i18n | P0 |
| 2 | RhythmComposerScreen.tsx:54, 80, 178, 181–182, 292 | 6× `cardBackground` foreground on accent fills (chip/pill/inlineAction/error button) | → `colors.onAccent` | onAccent sweep | P0 |
| 3 | RhythmComposerScreen.tsx:484–491, 308 | Back button 40×40, no hitSlop | → 44, or `hitSlop={4}` | 44pt | P1 |
| 4 | RhythmComposerScreen.tsx:546–553, 43 | FilterChip minHeight 36, no role/state | `hitSlop={{top:4,bottom:4}}` + `accessibilityRole="button"` + `accessibilityState={{selected:active}}` | 44pt + a11y | P1 |
| 5 | RhythmComposerScreen.tsx:116–186 | Preset card = composite Touchable with no role/label; visual "Add" pill isn't the target | `accessibilityRole="button"` + translated `accessibilityLabel={`${actionLabel}: ${preset.title}`}` | a11y | P1 |
| 6 | RhythmComposerScreen.tsx:228, 242, 177–179 | `savingPresetId` spinner branch can never render (sync store call) | Remove `savingPresetId` + spinner branch | Dead code | P2 |
| 7 | RhythmComposerScreen.tsx:45, 117, 308, 451 | activeOpacity 0.88/0.92/default×3 | All → 0.85 | Policy | P2 |
| 8 | RhythmComposerScreen.tsx:444, 270 | No haptics on apply/delete | `notificationSuccess()` after apply; `mediumImpact()` on delete confirm | — | P2 |

Already good: exemplary token usage; 48pt action buttons; destructive Alert confirm; labeled back button.

#### src/screens/plans/RhythmDetailScreen.tsx

| # | Anchor | Issue | Exact change | Constraint check | Pri |
|---|---|---|---|---|---|
| 1 | RhythmDetailScreen.tsx:443–448 | **Disabled Continue: `cardBorder` fill + `cardBackground` label = dark-on-dark, unreadable in every dark theme** | Disabled: label → `colors.secondaryText`; enabled: label → `colors.onAccent` | Broken dark mode | P0 |
| 2 | RhythmDetailScreen.tsx:384–390 | Icon-only Edit button, no `accessibilityLabel` | Add `accessibilityLabel={t('readingPlans.editRhythm')}` (new key) | a11y | P0 |
| 3 | RhythmDetailScreen.tsx:49–51, 344, 447 | StatusPill/error/continue text `cardBackground` on fills | → `colors.onAccent` | onAccent sweep | P0 |
| 4 | RhythmDetailScreen.tsx:519–526, 550–557 | Back + edit 40×40 | → 44 or `hitSlop={4}` | 44pt | P1 |
| 5 | RhythmDetailScreen.tsx:54 | StatusPill grey `cardBorder` ring on colored fills | `variant === 'neutral' ? colors.cardBorder : 'transparent'` | — | P1 |
| 6 | RhythmDetailScreen.tsx:573 | `summaryValue` stats not tabular | `fontVariant: ['tabular-nums']` | — | P1 |
| 7 | RhythmDetailScreen.tsx:357, 384, 436, 339 | **No activeOpacity anywhere in file** (all default 0.2) | `activeOpacity={0.85}` ×4 | Policy | P1 |
| 8 | RhythmDetailScreen.tsx:453–462 | Empty-sequence reuses "no rhythms" copy while a rhythm exists | New keys `readingPlans.rhythmAllDoneTitle/Body` ×4 locales | Correct copy | P2 |
| 9 | RhythmDetailScreen.tsx:436–450 | No haptic on Continue | `lightImpact()` before navigate | — | P2 |

Already good: header handles 2-line Nepali titles; flexed stat columns; tokenized spacing; safe-area bottom pad.

---

### 2B. Bible

#### src/screens/bible/BibleReaderScreen.tsx (~8,000 lines)

| # | Anchor | Issue | Exact change | Constraint check | Pri |
|---|---|---|---|---|---|
| 1 | BibleReaderScreen.tsx:391–419, 5533 | Reader theme sheet `label: 'Light'/'Parchment'/'Sepia'/'Ink'/'Midnight'` hardcoded (also feeds a11y). Copy diverges from Settings ("Sepia"/"Ink" vs "Low-light"/"Dark") | `label` → `labelKey` using existing `settings.themeLight/themeLowLight/themeParchment/themeDark/themeMidnight` (en.ts:320–324); render `t(labelKey)` — palette rail at 5600 already does this | i18n | P0 |
| 2 | BibleReaderScreen.tsx:5463, 5695 | `'Fonts & Settings'` hardcoded ×2 | → `t('bible.fontsAndSettings')` (new key) | i18n | P0 |
| 3 | BibleReaderScreen.tsx:5647 | `'All Settings'` hardcoded | → `t('bible.allSettings')` (new key) | i18n | P0 |
| 4 | BibleReaderScreen.tsx:4016 | `accessibilityHint="Goes to the previous chapter"` hardcoded (sibling `bible.nextChapterHint` exists, en.ts:202) | → `t('bible.previousChapterHint')` (new key) | i18n a11y | P0 |
| 5 | BibleReaderScreen.tsx:5269–5288 | Ellipsis "more" header button: only header button with no role/label (siblings 5223/5242/5261 have both) | Add `accessibilityRole="button"` + `accessibilityLabel={t('bible.chapterActions')}` | a11y | P0 |
| 6 | BibleReaderScreen.tsx:6650–6655 (used 5136–5145) | `floatingReaderPlanExitButton` 24×24, no hitSlop | → 32×32 + `hitSlop={8}` (net 48), or 44 | 44pt | P1 |
| 7 | BibleReaderScreen.tsx:4762, 4811, 4821–4823, 4894–4898, 3869 | Verse select/deselect (most-used touch in app) fires no haptic; `selectionHaptic` already imported (line 113) | `selectionHaptic()` in each verse-toggle onPress (shared handler) + after successful highlight | — | P1 |
| 8 | BibleReaderScreen.tsx:6994 | `modalBackdropFill paddingTop: 96` magic number ignores safe area | → `safeInsets.top + spacing.xxl` inline | Safe area | P1 |
| 9 | BibleReaderScreen.tsx:5749–5758 | Chapter-action rows: default activeOpacity + no role | `activeOpacity={0.85}` + `accessibilityRole="button"` | Policy | P1 |
| 10 | BibleReaderScreen.tsx:6752–6754, 6901–6904 | Legacy reader gutter 18+12=30px vs premium 24; 18 off-grid | `content.paddingHorizontal: 18` → 12 (total 24); `paddingTop: 18` → `spacing.lg` | Measure parity | P1 |
| 11 | BibleReaderScreen.tsx:5030 + VersesSkeleton.tsx:41 | First-load skeleton padding 20 vs reader 24 gutter → reveal jump | Covered by §1.5 VersesSkeleton fixes | First-load only — chapter rule untouched | P2 |
| 12 | BibleReaderScreen.tsx:1588–1589, 2291 | `showPremiumReadMode` includes `!isLoading` — safe only due to the loadChapter guard; future regression would flash skeleton mid-chapter | Add guard comment at 2291 + extend `bibleReaderModel` test asserting `isLoading` stays false on chapter change with existing verses | HARD-RULE protection (test, not UI change) | P1 |
| 13 | BibleReaderScreen.tsx:410–423, 7928–7937 | Ink/Midnight theme preview paper tiles vanish on dark gradients (shadow invisible) | `readerThemePaper`: add `borderWidth: 1`, per-option `borderColor: hexWithAlpha(option.line, 0.14)` | Paper palettes stay intentional | P2 |
| 14 | BibleReaderScreen.tsx:7868–7873 | `fontSheet paddingHorizontal: 14, paddingTop: 10` | → `spacing.lg` (16) / `spacing.md` (12) | 4pt grid | P2 |
| 15 | BibleReaderScreen.tsx:6944–6946 | Legacy inline verse number full-strength accent w600 competes with body (premium mutes at 0.72) | Add `opacity: 0.75` to `inlineVerseNumber` | Verse-number rule | P2 |
| 16 | BibleReaderScreen.tsx:6833–6837 | `listenTimeText` not tabular (jitters per second) | `fontVariant: ['tabular-nums']` (pattern at 6609/7192/7383) | — | P2 |
| 17 | BibleReaderScreen.tsx:7005, 7044, 7313, 7563, 7726, 7883, 8003, 6856 | 8× `fontWeight: '800'` — system tops at '700' | → `'700'` | Type scale | P2 |
| 18 | BibleReaderScreen.tsx:5045–5052, 6975 | Retry button ~41px, default opacity | `activeOpacity={0.85}` + `minHeight: layout.minTouchTarget` on `feedbackButton` | 44pt | P2 |

activeOpacity in file: 1, 0.75, 0.82, 0.85, 0.86, 0.88, 0.9 + defaults → collapse to 0.85/0.7/1 tiers.
Already good: 1.56 line-height, 560px measure, 24px premium gutters, muted verse numbers, chapter-transition guard, 44×44 chrome buttons, full state coverage.

#### src/screens/bible/BibleBrowserScreen.tsx

| # | Anchor | Issue | Exact change | Constraint check | Pri |
|---|---|---|---|---|---|
| 1 | BibleBrowserScreen.tsx:582–590 | Zero-result search = blank screen (no `ListEmptyComponent`) | Add `ListEmptyComponent` reusing `searchFeedbackCard` with new key `t('bible.noSearchResults', { query })`; gate on non-empty query && !isSearching | Missing empty state | P1 |
| 2 | BibleBrowserScreen.tsx:557–561, 751–756 | Clear-search 24×24, no label | `hitSlop={{12,12,12,12}}` (net 48) + `accessibilityLabel={t('common.clear')}` | 44pt + a11y | P1 |
| 3 | BibleBrowserScreen.tsx:654–656 | Translation-modal close wraps a 22px icon — no target/label/role | `hitSlop={{12,…}}` + role + `t('common.close')` | 44pt + a11y | P1 |
| 4 | BibleBrowserScreen.tsx:496–507, 724–731 | `modalDismissButton` 40×40, no label | → 44 + `t('common.close')` | 44pt | P1 |
| 5 | BibleBrowserScreen.tsx:566–569 | Every keystroke swaps whole list ↔ full-screen spinner | Show full spinner only when `searchResults.length === 0`; else keep results rendered with small inline indicator | Keep-old-content spirit | P1 |
| 6 | BibleBrowserScreen.tsx:570–580 | Search error has no retry | Retry button (reader `feedbackButton` pattern) re-firing via `retryNonce` state, `t('common.retry')` | Recoverable errors | P2 |
| 7 | BibleBrowserScreen.tsx:865–868 | `chapterNumber` grid not tabular | `fontVariant: ['tabular-nums']` | — | P2 |
| 8 | BibleBrowserScreen.tsx:687, 734, 771, 834 | Off-grid: paddingTop 18, paddingBottom 28, card padding 18, fontSize 19 | 18→`spacing.lg`; 28→`spacing.xl`; 19→18 (`cardTitle` size) | 4pt grid | P2 |
| 9 | BibleBrowserScreen.tsx:382/429 vs 461/503/527 | Mixed 0.7/0.85 on same-role taps | List rows → 0.7; chrome buttons → 0.85 (searchResultCard → 0.7) | Policy | P2 |
| 10 | BibleBrowserScreen.tsx:915–931 | Orphaned language-chip styles (same block dead in TranslationPickerList) | Delete | Dead code | P2 |

Already good: deferred search with cancellation, `useDeferredValue`, lazy modal content, tuned `estimatedItemSize`.

#### src/screens/bible/ChapterSelectorScreen.tsx

| # | Anchor | Issue | Exact change | Constraint check | Pri |
|---|---|---|---|---|---|
| 1 | ChapterSelectorScreen.tsx:153–164 | Back button: no label/role, default opacity | Add role + `t('common.back')` + `activeOpacity={0.85}` | a11y | P1 |
| 2 | ChapterSelectorScreen.tsx:259–264 | Hero title 36/40 (ratio 1.11) clips Devanagari marks | `lineHeight: 40` → `46` | ne/hi safety | P1 |
| 3 | ChapterSelectorScreen.tsx:28–29 | `Dimensions.get('window')` at module load — stale after rotation/split-screen | `useWindowDimensions()` inside component, memoized `ITEM_SIZE` | Layout correctness | P2 |
| 4 | ChapterSelectorScreen.tsx:279–283 | Chapter numbers not tabular | `fontVariant: ['tabular-nums']` | — | P2 |
| 5 | ChapterSelectorScreen.tsx:53–56 | Bad `bookId` deep link → `return null` blank screen | Render header + `t('bible.failedToLoad')` body | Error state | P2 |

Already good: 44×44 back target, FlashList grid, token spacing, translated book names.

#### src/screens/bible/TranslationPickerList.tsx

| # | Anchor | Issue | Exact change | Constraint check | Pri |
|---|---|---|---|---|---|
| 1 | TranslationPickerList.tsx:619 | Hardcoded `'rgba(200, 70, 60, 0.06)'` selection wash — breaks under Sapphire/Teal/Olive palettes | → `hexWithAlpha(colors.bibleAccent, 0.06)` | Hardcoded color | P0 |
| 2 | TranslationPickerList.tsx:400–462 | Zero-match search shows only the search box | Push `{type:'empty'}` row when query active && all sections empty; render `t('bible.noSearchResults')` in `bibleSecondaryText` | Empty state | P1 |
| 3 | TranslationPickerList.tsx:486–490, 1360–1362 | Clear-search = 18px icon with `marginLeft: 4` | 32×32 centered + `hitSlop={8}` + `t('common.clear')` label | 44pt + a11y | P1 |
| 4 | TranslationPickerList.tsx:979–986 | Audio-manager close: bare Touchable on 22px icon | Same treatment + `t('common.close')` | 44pt + a11y | P1 |
| 5 | TranslationPickerList.tsx:1430–1437 | Destructive trash chip 30×30 | → 36×36 + `hitSlop={4}` (net 44) | 44pt | P1 |
| 6 | TranslationPickerList.tsx:682, 712, 770 | Disabled chips render at full opacity | Conditional `disabled && { opacity: 0.5 }` ×3 (reader uses 0.48 precedent) | Disabled affordance | P2 |
| 7 | TranslationPickerList.tsx:1498–1505 | `audioBookAction` 42×42 | → 44 | 44pt | P2 |
| 8 | TranslationPickerList.tsx:1246–1248, 1296–1335 | 5 dead language-chip styles (~40 lines) | Delete | Dead code | P2 |
| 9 | TranslationPickerList.tsx:1029–1093 | Downloaded count/pct computed 4× inline in JSX | Hoist once above return | Perf hygiene | P2 |

Already good: tabular-nums on download %, labeled search + delete-with-confirm, `keyboardShouldPersistTaps`, thorough progress states.

#### src/components/bible/CompanionCard.tsx · CompanionSection.tsx · CrossReferencePanel.tsx · HighlightedVerseText.tsx

| # | Anchor | Issue | Exact change | Constraint check | Pri |
|---|---|---|---|---|---|
| 1 | CrossReferencePanel.tsx:47 | `Related Verses` hardcoded (component barrel-exported, will ship broken when wired) | → `t('bible.relatedVerses')` via `useTranslation()` (new key) | i18n | P0 |
| 2 | CompanionCard.tsx:64, 71 | Concentric break: card r24 pad16 → inner should be 8, artwork is r20 | `artwork.borderRadius: 20` → `8`; if 24 is a deliberate hero radius, use new `radius.xl`-family token, not a literal | Concentric rule | P1 |
| 3 | CompanionCard.tsx:89–93 | Title 18/22 (1.22) clips Devanagari at 2 lines | `lineHeight: 22` → `24` (= `typography.cardTitle`) | ne/hi | P1 |
| 4 | HighlightedVerseText.tsx:23 vs 96 | Fallback alpha `'33'` (20%) vs measured `HIGHLIGHT_ALPHA '4D'` (30%) — highlight visibly brightens on every mount/font change | Line 96 → `` `${highlightColor}${HIGHLIGHT_ALPHA}` `` | Core reading surface | P1 |
| 5 | CompanionSection.tsx:53–56 | Hand-rolled 24/'800' title duplicating `typography.sectionTitle`, no lineHeight | → `...typography.sectionTitle` | Token reuse; ne/hi | P1 |
| 6 | CompanionCard.tsx:85, 91, 105 | `fontWeight '800'` over system cap | → `'700'` | Type scale | P2 |
| 7 | CompanionCard.tsx:16–26 | No `accessibilityRole="button"` on tappable card | Add | a11y | P2 |
| 8 | CompanionCard.tsx:67 | width 220 carousel card ignores `scaleValue`; ne/hi 3-line clamp risk | Apply `useFontSize().scaleValue(14)` to summary; verify ne/hi at 1.2 | Font scaling | P2 |
| 9 | CompanionSection.tsx:32–40, 64–67 | Carousel trapped in 24px parent padding (hard edge clip); `paddingRight: 20` ≠ 24 | Bleed: `marginHorizontal: -layout.screenPadding` + `contentContainerStyle paddingHorizontal: layout.screenPadding`; add `decelerationRate="fast"` + `snapToInterval={232}` | Edge-to-edge polish | P2 |
| 10 | CrossReferencePanel.tsx:56–57, 94–105 | `key={index}` on tappable rows; rows ~borderline 44; reference numerals not tabular; no role | Stable key `` `${toBook}-${toChapter}-${toVerse}` ``; `minHeight: 44`; `tabular-nums` on `referenceLabel`; `accessibilityRole="button"` | — | P2 |
| 11 | HighlightedVerseText.tsx:76, 96 | Alpha concat assumes 6-digit hex | Use `hexWithAlpha` helper (§1.1) | Robustness | P2 |
| 12 | HighlightedVerseText.tsx:51 | Root Pressable zero press feedback | `style={({pressed}) => [styles.highlightVerse, pressed && { opacity: 0.7 }]}` | Policy | P2 |

---

### 2C. Four Fields / Courses (Learn)

**Structural pre-step (do this FIRST):** CourseDetailScreen, FieldOverviewScreen, FourFieldsJourneyScreen, FourFieldsLessonViewScreen self-describe as "orphaned pending migration" — no-op handlers, sample data. **Confirm reachability from LearnStack.** Any screen that is truly unreachable should be deleted, which eliminates ~⅓ of this section's P0s. Rows below assume the screen stays.

**Root fix (serves 3 consumers):** `fourFieldsCourses.ts:68–104` still defines `fieldInfo.color` as pre-rebrand hexes `#8B2635/#D4A017/#4A90E2`; `FieldCard.tsx:34–38` keys gradients off those hexes. Replace with a theme resolver — e.g. entry→`accentTertiary`, gospel/church→`accentSecondary`, discipleship/multiplication→`accentPrimary`; gradients `[lighten(c,12%), c, darken(c,12%)]`. Consumers: FieldCard, FourFieldsJourneyScreen fieldPill (155–158), FourFieldsLessonView fieldBadge (140–146). **P0.**

| # | Anchor | Issue | Exact change | Constraint check | Pri |
|---|---|---|---|---|---|
| 1 | CourseListScreen.tsx:193 | Active badge text `cardBackground` on accent | → `colors.onAccent` | onAccent sweep | P0 |
| 2 | CourseDetailScreen.tsx:33–36; FourFieldsJourneyScreen.tsx:59–71; FieldOverviewScreen.tsx:36–39; FourFieldsLessonViewScreen.tsx:82–100 | No-op CTAs with full press affordances (incl. full-width accent "Continue Journey"; "Complete & Continue" completes but doesn't continue) | Wire real navigation or strip press affordances; see structural pre-step | Dead UI | P0 |
| 3 | CourseDetailScreen.tsx:15–24, 52–56 | Hardcoded sample lessons + description (fake English content in prod) | Real course data or `t('harvest.*')` keys | i18n + trust | P0 |
| 4 | FourFieldsJourneyScreen.tsx:174–175; FieldOverviewScreen.tsx:182; FourFieldsLessonViewScreen.tsx:263–264; LessonDetailScreen.tsx:545, 548, 586, 658, 748; FoundationDetailScreen.tsx:262, 444; PracticeCard.tsx:59, 107; FieldCard.tsx:252 | 13 anchors: `'#fff'`/`'#FFFFFF'`/`cardBackground`/`background` as text/icon on accent fills | All → `colors.onAccent`. FoundationDetail:444 must move from StyleSheet to inline (StyleSheet can't see theme). Visual-check PracticeCard:107 (tan fill) per §1.2 | onAccent sweep | P0 |
| 5 | FieldOverviewScreen.tsx:91, 112, 122, 132 | `` `${p}% complete` ``, `` `~${m} min` ``, `` `${n} lessons` `` hardcoded | `t('harvest.percentComplete', {progress})`, `t('harvest.estimatedMinutes', {minutes})`, `t('harvest.lessonCount', {count})` (plural) | i18n | P0 |
| 6 | FourFieldsLessonViewScreen.tsx:106, 108, 128, 167, 195, 229, 239 | 7 hardcoded strings ('Lesson not found', 'Go back', `Lesson ${n} of ${total}`, 'Key Verse', 'Discussion Questions', 'Previous', 'Next') | `t('harvest.lessonNotFound')` (exists), `t('common.back')`, `t('harvest.lessonProgress', {current,total})`, `t('harvest.keyVerse')`, `t('harvest.discussionQuestions')`, `t('common.previous')`, `t('common.next')` | i18n | P0 |
| 7 | LessonDetailScreen.tsx:707, 722, 764, 880, 962, 974 | 6 hardcoded strings on the **shipped Gather lesson screen** ('Playback & Text', 'Playback Speed', 'Font Size', 'No passage text available', 'Listen to Story Again', 'Share App') | `t('gather.playbackAndText')`, `t('gather.playbackSpeed')`, `t('settings.fontSize')`, `t('gather.noPassageText')`, `t('gather.listenAgain')`, `t('common.shareApp')` | i18n — highest-traffic gap | P0 |
| 8 | FieldCard.tsx:261–266 | `field.title/subtitle` rendered raw English (keys exist: `FIELD_TITLE_KEYS`) | Translate inside card (it has `useTranslation`) | i18n | P0 |
| 9 | LessonDetailScreen.tsx:598–599, 624–626, 1216 | Audio time labels update 2×/s, no tabular-nums; `minWidth: 36` clips at scale >1.0 | `fontVariant: ['tabular-nums']` on `timeText`; minWidth 36→40 | Most visible tabular win | P1 |
| 10 | LessonDetailScreen.tsx:636–680 | Seek/play/settings icon-only, zero a11y labels; no-op section arrows at full opacity | Labels (`t('audio.seekBackward')` etc., state-dependent play/pause); extend existing `opacity: 0.35 + disabled` to no-op arrows | a11y + honesty | P1 |
| 11 | LessonDetailScreen.tsx:1254 | `rgba(0,0,0,0.5)` overlay | → `colors.overlay` inline | Token exists | P1 |
| 12 | Completion haptics: FourFieldsLessonViewScreen:82–86; FoundationDetailScreen:94–101; LessonDetailScreen:526–552; PracticeCard:47–49, 95–97 | Zero haptics on every completion moment | Success haptic on complete; light on un-complete | — | P1 |
| 13 | Back buttons: CourseDetailScreen:127–129; FourFieldsJourneyScreen:76–78; FieldOverviewScreen:45–50; FourFieldsLessonViewScreen:119–124 | `padding: 4` → ~32×32, unlabeled | `padding: 10` (44×44) + `accessibilityLabel={t('common.back')}` — copy FoundationDetail:116–127 (reference impl) | 44pt | P1 |
| 14 | FourFieldsLessonViewScreen.tsx:421–429, 305–307 | Footer `paddingBottom: 32` ignores insets; content pad 100 guessed | → `insets.bottom + spacing.lg`; content → 120 | Safe area (LessonDetail:565 does it right) | P1 |
| 15 | FieldCard.tsx:40–45 | `isUnlocked` prop declared, never used — locked fields fully tappable | Destructure; locked: `opacity: 0.5` + lock icon + `disabled` + `accessibilityState` | Designed-and-dropped | P1 |
| 16 | FieldCard.tsx:316–318 | Fixed 140×195 card clips at 1.2 scale / long ne-hi titles | `height` → `minHeight: 195` (keep width; `snapToInterval` 154 unchanged) | Font scale | P1 |
| 17 | JourneyPath.tsx:208–213 | 9pt uppercase label — illegible, worse in Devanagari | → 11pt (match `headerLabel`) or `typography.micro` | Legibility floor | P1 |
| 18 | CourseDetailScreen.tsx:171–174 | Progress bar h8/`radius.sm`, no `overflow: 'hidden'` | h6 + `radius.xs` + overflow hidden — or adopt shared `ProgressBar` (§1.4) | Progress unification | P1 |
| 19 | FieldOverviewScreen.tsx:139–156 | keyVerseCard lacks the accent treatment its sibling has | `borderLeftWidth: 3, borderLeftColor: accentPrimary`, bg `hexWithAlpha(accentPrimary, 0.07)` | Pattern parity (LessonView:156–171) | P1 |
| 20 | FieldOverviewScreen.tsx:24–26 | `useRoute<any>()` + duplicate local FieldType | Type `RouteProp<LearnStackParamList,'FieldOverview'>`; use `types/course` | No-any rule | P1 |
| 21 | TakeawayCard.tsx:47–52, 88–94, 19–21 | Share button ~22pt target; share message hardcoded English | `hitSlop={{12,…}}` or minHeight 44 + role; `t('harvest.shareTakeawayMessage', {text, lessonTitle})` | 44pt + i18n | P1 |
| 22 | tabular-nums: CourseDetail:167; FourFieldsJourney:286; FieldOverview:298–301; FoundationDetail:393; FieldCard:442; JourneyPath:185; FourFieldsLessonView:296 | Progress numerals not tabular | `fontVariant: ['tabular-nums']` ×7 styles | — | P1/P2 |
| 23 | Token migrations: CourseDetailScreen:140–213; FourFieldsJourneyScreen:230–404; LessonSectionRenderer:217–320 | Raw fontSizes/paddings/`borderRadius: 999` | Map to `typography.*`/`spacing.*`/`radius.pill` | Mechanical | P2 |
| 24 | FieldCard.tsx:58–67, 114 | Dead `progressAnim` spring (output never read) | Delete hook + spring | Dead code | P2 |
| 25 | FieldCard.tsx:156–164, 333 | White glass overlays wrong on light theme | Gate on `isDark`; light → `rgba(0,0,0,0.03)` | Visual check | P2 |
| 26 | LessonDetailScreen.tsx:685–689 | Bottom sheet `animationType="fade"` — materializes in place | → `"slide"` | Convention | P2 |
| 27 | LessonDetailScreen.tsx:116, 373–377 | Local font multiplier resets per mount, ignores `useFontSize()` | Seed from `useFontSize()` scale or persist in gatherStore | Product call | P2 |
| 28 | LessonDetailScreen.tsx:1245–1249; GatherScreen dead styles | Dead `ellipsisText` style | Delete | — | P2 |
| 29 | JourneyPath.tsx:51, 112–116, 88–95 | Progress card + floating badge borderless (vanish on midnight); asymmetric 34px right gutter | Add `borderWidth: 1, borderColor: cardBorder` ×2; move card gap into `contentContainerStyle` gap | — | P2 |
| 30 | FoundationDetailScreen.tsx:44–58, 145; 280–287 | Not-found header = full-width invisible tap; `paddingBottom: 40` raw; 3-dot menu ~34×34 nested touchable | Copy happy-path header; `spacing` token; hitSlop 13 | — | P1/P2 |
| 31 | LessonSectionRenderer.tsx:27–32, 105–113, 166–210 | Stale color comments; scripture card no role/hint; eyebrow labels disconnected from icon accents | Update comments; add role+hint; label color → matching `sectionColors.*` | — | P1/P2 |

Already good: FieldCard press spring (0.96, native driver, cleanup); key-verse card in LessonView; TakeawayCard theming; LessonDetail audio lifecycle; CourseList tokens.

---

### 2D. Gather / Groups / Prayer / Reading Plans (Learn)

| # | Anchor | Issue | Exact change | Constraint check | Pri |
|---|---|---|---|---|---|
| 1 | PrayerWallScreen.tsx:71–76, 380–399 | **Offline shows false "No prayers yet — be the first"** (fetch failure rendered as empty) | Add `loadError` state; distinct error block (cloud-offline icon 48 + `t('prayer.loadErrorTitle/Body')` + Retry → `loadRequests`) when `loadError && requests.length===0` | Error ≠ empty on social surface | P0 |
| 2 | PrayerWallScreen.tsx:281–284 | Avatar initial from `user_id.charAt(0)` — **UUID hex char shown as initial**; `?? '?'` never fires (`charAt` returns `''`) | Derive from displayed name: `((isOwner ? user?.displayName : t('prayer.groupMember')) ?? '?').trim().charAt(0).toUpperCase() \|\| '?'` — or shared `InitialsAvatar` (§1.4) | Real bug | P0 |
| 3 | PrayerWallScreen.tsx:36–45 | `formatRelativeTime` returns hardcoded `'just now'/'${m}m ago'/…` | 4 plural-aware keys `t('prayer.justNow'/'minutesAgo'/'hoursAgo'/'daysAgo', {count})`; NOT `Intl` in render (Hermes hot-path rule) | i18n | P0 |
| 4 | PrayerWallScreen.tsx:202–221 | `Alert.prompt` is iOS-only — Edit does nothing on Android | Android: inline edit via prefilled submit bar, or hide Edit option on Android | Platform break | P0 |
| 5 | PrayerWallScreen.tsx:394, 447 | Sign-in buttons `colors.background` on accent | → `colors.onAccent` ×2 | onAccent sweep | P0 |
| 6 | GroupDetailScreen.tsx:384, 391, 407, 417–431, 442, 203 | 8 hardcoded strings incl. share invite message ('Prayer Wall', '${n} active', 'No prayer requests yet…', 'About Group Sessions' + explainer + bullets, 'Leave Group', share text) | `t('prayer.title')` (exists), `t('groups.activeCount',{count})`, `t('prayer.noPrayersPreview')`, `t('groups.aboutSessions*')`, `t('groups.leaveGroup')` (exists), `t('groups.shareInvite',{name,code})` | i18n | P0 |
| 7 | GroupListScreen.tsx:175 | Button text `colors.background` on accent | → `colors.onAccent` | onAccent sweep | P0 |
| 8 | GroupListScreen.tsx:212–214, 300–302 | `{memberCount} • {joinCode}` — bare number, no unit, untranslated | `t('harvest.memberCount', {count}) + ' • ' + joinCode`; `tabular-nums` on `groupMeta` (463) | i18n | P0 |
| 9 | GroupSessionScreen.tsx:812–820, 662 | Absolute footer `paddingBottom: 32` ignores home indicator (SafeAreaView edges top-only) | → `Math.max(insets.bottom, spacing.lg)`; content pad 100 → 140 | Safe area | P0 |
| 10 | ReadingPlanListScreen.tsx:259–261, 301 | Category chip raw data string with `.replace('-', ' ')` + uppercase (breaks Devanagari) | `t(\`readingPlans.category.${plan.category}\`, {defaultValue})` keys; drop uppercase for non-Latin | i18n | P0 |
| 11 | ReadingPlanDetailScreen.tsx:58–65 | English book names via `getBookById().name` (LessonBottomSheet uses `getTranslatedBookName` correctly) | → `getTranslatedBookName(entry.book, t)` | i18n | P0 |
| 12 | ReadingPlanDetailScreen.tsx:237–240 | Concatenated sentence `{done} / {total} {t('engagement.days')} {t('…completed').toLowerCase()}` — wrong word order ne/hi; `.toLowerCase()` meaningless in Devanagari | Single key `t('readingPlans.daysCompleted', {done, total})` | i18n composition | P0 |
| 13 | ReadingPlanDetailScreen.tsx:335 | English a11y label `` `Day ${n}: ${refs}` `` | → `t('readingPlans.dayA11y', {day, refs})` | i18n a11y | P0 |
| 14 | LessonBottomSheet.tsx:170–174 | Hardcoded backdrop `rgba(0,0,0,0.5)` | → `colors.overlay` inline | Token exists | P0 |
| 15 | LessonBottomSheet.tsx:59–72, 128–155 | Download + Manage-bookmarks rows silently no-op and close sheet | Remove rows, or `disabled` + `opacity: 0.4` + `t('common.comingSoon')` micro label | Dead affordance | P0 |
| 16 | ReadingPlanListScreen.tsx:101–132 | Swipe-delete unenrolls instantly, no confirm, no haptic | `Alert.alert(t('readingPlans.unenrollTitle'), t('readingPlans.unenrollBody'), [cancel, destructive])` + warning haptic | Destructive parity | P1 |
| 17 | ReadingPlanDetailScreen.tsx:104–115, 122–129 | ProgressRing draws its track twice (View border + SVG circle, ~2.5pt offset → doubled track) | Remove wrapper `borderWidth/borderColor`; SVG circle is the sole track | Visual correctness | P1 |
| 18 | ReadingPlanDetailScreen.tsx:575–582 | Mark-day-complete: no haptic, failure silently swallowed | Success haptic; on failure error haptic + `Alert.alert(t('common.error'), result.error ?? t('common.retry'))` | — | P1 |
| 19 | GroupDetailScreen.tsx:371 | Prayer Wall card hidden until network fetch resolves — offline, feature disappears | Render card whenever synced-group prerequisites met; `prayerPreview === null` → loading/offline body copy | Offline discoverability | P1 |
| 20 | GroupListScreen.tsx:224–236 | Primary empty state = `cloud-offline-outline` + one line (reads as error, no CTA) | `people-outline` + title + body + accent CTA (PrayerWall:380–399 pattern) | Empty-state pattern | P1 |
| 21 | GroupListScreen.tsx:255–266 | Sync error card has no Retry | Bordered pill retry re-firing effect via `reloadKey` bump | Recoverable | P1 |
| 22 | onAccent stragglers: GroupDetail:303–306, 570; GroupSession:288, 294, 555–556, 570–571; ReadingPlanList:121–122, 167–169, 282, 324; ReadingPlanDetail:253–255, 657; AnnotationsScreen covered in 2E | `cardBackground` on accent/success/error fills (~14 sites) | All → `colors.onAccent` | onAccent sweep | P1 |
| 23 | Haptics: GroupSession:201–246 (session complete = the celebratory moment); GroupDetail:214–236 (leave, warning); PrayerWall:89–155 (post success, prayed/encouraged light); ReadingPlanList:503–519 (enroll); LessonBottomSheet:64–67 (toggle complete) | Zero haptics on all flagged moments | One-line adds per §1.3 map | — | P1 |
| 24 | Touch targets: GroupList back 119–121; GroupDetail back/share 244–253; GroupSession close 252–257; PrayerWall pills 695–702; ReadingPlanList planPill 373–380 | 28–32pt targets | 44×44 pattern (ReadingPlanListScreen:727–733 is the reference) + labels; pills `minHeight: 36` + `hitSlop={{top:6,bottom:6}}` | 44pt | P1 |
| 25 | PrayerWallScreen.tsx:262, 546 | `makeStyles(colors)` runs `StyleSheet.create` **every render** (param unused) | Hoist to module scope | Hermes hot path | P1 |
| 26 | PrayerWallScreen.tsx:148–152 | Optimistic prayed/encouraged never rolled back on failure — counts drift | On rejection/`!success`, invert local set + count delta | Offline correctness | P1 |
| 27 | Token migrations: GroupListScreen:340–488; GroupDetailScreen:450–709; GroupSessionScreen:586–854 | Pre-design-system StyleSheets (raw 10–24pt fonts, paddings 14/18/20) | Map to `typography.*`/`spacing.*`/`layout.*` per file | Mechanical | P1 |
| 28 | Loading states: GroupDetail:170–178; GroupSession:154–162; PrayerWall:516–521; GroupList:267–278 (static sync icon) | Bare text / static icon loaders | `ActivityIndicator size="large" color={accentPrimary}` above text | Consistency | P2 |
| 29 | LessonBottomSheet.tsx:32–57, 175–181, 179 | 3 share rows run identical code; no grab handle; `paddingBottom: spacing.xxxl` stands in for inset | Collapse to one `t('gather.share')` row; add 36×4 `cardBorder` pill handle; `Math.max(insets.bottom, spacing.lg) + spacing.md` | Honesty + sheet convention | P1 |
| 30 | tabular-nums: GatherScreen:319, 354; PrayerWall:623 (char counter), pillText; GroupDetail:504–507 (join code); ReadingPlanList:207, 210; ReadingPlanDetail:278–280, 170–172 | Updating numerals | `fontVariant: ['tabular-nums']` ×9 styles | — | P1/P2 |
| 31 | GatherScreen.tsx:41, 223; 53–75; 134/209; 278–292 | Wisdom titles clamp at 2 lines in fixed column (ne/hi); tabs 0.8 vs cards 0.85; a11y label lacks progress; dead infoBanner styles | `numberOfLines={3}` + `minHeight: 54`; 0.85; append `t('gather.progressA11y',{done,total})`; delete dead styles | — | P1/P2 |
| 32 | ReadingPlanListScreen.tsx:410–416, 582–591, 354–361 | My-plans empty = one line; completed cards identical to active; dead durationBadge styles | Icon+card empty per pattern; completed variant border/badge → `colors.success` + checkmark; delete dead styles | — | P1/P2 |
| 33 | ReadingPlanDetailScreen.tsx:700, 433, 387 | `keyExtractor` = index; disabled via `${color}55` concat; `padding: 12` raw | Stable keys `day-${n}`; `opacity: disabled ? 0.5 : 1`; `spacing.md` | — | P2 |
| 34 | GatherIconBadge.tsx:107–141, 51/130/148 | Badge not marked decorative; bitmap zoom>1.1 hard-clips | `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`; pre-multiply size instead of transform scale | — | P2 |
| 35 | GroupSessionScreen.tsx:730–734, 271–278 | `questionBullet width: 24` fixed; phase tabs lack role/state + default opacity | `minWidth: 24`; `accessibilityRole="tab"` + state + 0.85 | — | P1/P2 |

Already good: GatherScreen (reference file — full tokens, tab a11y); GroupList error/loading/empty triple; PrayerWall signed-out experience; ReadingPlanList structure (retry, 44pt back, ActivityIndicator); LessonBottomSheet header anatomy; GatherIconBadge deferred require.

---

### 2E. More / Auth / Onboarding

| # | Anchor | Issue | Exact change | Constraint check | Pri |
|---|---|---|---|---|---|
| 1 | AuthScreen.tsx:399; ResetPasswordScreen.tsx:189 | **Invisible submit spinner:** `ActivityIndicator color={colors.primaryText}` on `bibleControlBackground` — identical hex in all 5 themes | → `color={colors.bibleBackground}` (matches `primaryButtonText`) ×2 | Verified ThemeContext L84–189 | P0 |
| 2 | AuthScreen.tsx:301–313, 494–496 | Apple button hardcoded `WHITE` — invisible edges on light theme | `buttonStyle={isDark ? WHITE : WHITE_OUTLINE}` (both brand-compliant) | Brand + theme | P0 |
| 3 | SettingsScreen.tsx:323–330 | `formatTime` hardcodes `'PM'/'AM'` | → `new Date(0,0,0,h,m).toLocaleTimeString(i18n.language, {hour:'numeric', minute:'2-digit'})` | i18n | P0 |
| 4 | SettingsScreen.tsx:1079–1092 | "Download for offline" TouchableOpacity with **no onPress** — dims and does nothing | → `View`, or wire real action | Dead affordance | P0 |
| 5 | ProfileScreen.tsx:474–477 | Sign-in CTA `primaryText` on accent (fails light + Sapphire) | → `colors.onAccent` | onAccent sweep | P0 |
| 6 | LocaleSetupFlow.tsx:758 | **First-run double-tap bug:** ScrollView missing `keyboardShouldPersistTaps="handled"` — first tap on a result only dismisses keyboard | Add prop (AuthScreen:271 precedent) | First-run critical | P0 |
| 7 | ReadingActivityScreen.tsx:108, 195 | Calendar selected-day text `colors.background` on accent | → `colors.onAccent` ×2 | onAccent sweep | P1 |
| 8 | ReadingActivityScreen.tsx:183–199 | No `textDisabledColor` — library default `#d9e1e8` broken on parchment/midnight | Add `textDisabledColor: hexWithAlpha(colors.secondaryText, 0.33)` to calendar theme | — | P1 |
| 9 | AnnotationsScreen.tsx:172, 177 | Active filter pill icon/label `cardBackground` on accent | → `colors.onAccent` ×2 | onAccent sweep | P1 |
| 10 | AnnotationsScreen.tsx:195–204, 38–44 | Loading renders nothing (blank screen); failure shows "no notes" | Loading → `ActivityIndicator large`; track `success===false` → distinct error state + retry | Error ≠ empty | P1 |
| 11 | SettingsScreen.tsx:494–531, 1667–1678 | Theme picker `maxWidth: 220` + ~31pt pills; Nepali labels wrap per-word across 3 lines | Drop maxWidth; full-width stacked selector row; pills `paddingVertical: 10, minHeight: 44` | ne/hi + 44pt | P1 |
| 12 | SettingsScreen.tsx:596–634, 1027–1033 | Switches unlabeled; translator row = Touchable wrapping a Switch (two overlapping toggles for SR) | `accessibilityLabel` per Switch; move toggle to Switch only (row `accessible={false}`) | a11y | P1 |
| 13 | SettingsScreen.tsx:117–160 | No haptics on theme/palette/toggles | Selection haptic in `handleThemeChange`/`handleAppearancePaletteChange`; light in toggles | §1.3 map | P1 |
| 14 | PrivacyPreferencesScreen.tsx:121–124 | KAV inside SafeArea below header, no offset — PIN inputs covered by keyboard | `keyboardVerticalOffset={insets.top + 72}` or wrap whole screen | Forms | P1 |
| 15 | PrivacyPreferencesScreen.tsx:354–363 | Input `cardBackground` inside `cardBackground` card — invisible field | → `colors.background` (Settings:797 precedent) | — | P1 |
| 16 | AuthScreen.tsx:334–371; ResetPasswordScreen.tsx:133–177 | No return-key flow (email→password→submit; new→confirm→done) | Refs + `returnKeyType="next"/"go"/"done"` + `onSubmitEditing` chains | Forms | P1 |
| 17 | AuthScreen.tsx:320 | Google "G" tinted `accentPrimary` — brand mark recolored per palette (green/blue G) | → `colors.primaryText` monochrome, or multicolor G asset | Brand safety | P1 |
| 18 | AuthScreen.tsx:309, 495–499 | Apple r12/h50 vs Google r8/h52 stacked siblings | Google → `radius.lg` (12); both h52 | Consistency | P1 |
| 19 | TranslationBrowserScreen.tsx:57–77 | Header uses `bible*` surface tokens mid-More-stack — visible surface flash on push | Header → `background`/`primaryText`/`cardBorder`; keep list surface (shared with reader) | One surface family per stack | P1 |
| 20 | Back-button 32–36pt sweep: SettingsScreen:408–415; ProfileScreen:285–287; AboutScreen:124–126; ReadingActivityScreen:261–263; TranslationBrowserScreen:98–101; GroupList/GroupDetail (2D) | Stack-wide 32×32 back buttons | `hitSlop={8}` each — or adopt `ScreenHeader` (§1.4) which also fixes header padding rhythm (16 vs 24 drift) and title typography | 44pt | P1 |
| 21 | AboutScreen.tsx:17–19, 59, 67, 103 | `defaultValue` English fallbacks ('Resources', 'Made with love') | Add `about.resources`/`about.madeWithLove` keys ×4; delete constants | i18n | P1 |
| 22 | LocaleSetupFlow.tsx:1127–1131 | Header back target 56×24 | `minHeight: 24` → `44` | 44pt on first screen ever seen | P1 |
| 23 | LocaleSetupFlow.tsx:818–836, 880–887 | Recommendation card flush 0pt against search field | `searchInput marginBottom: spacing.lg` (16) | First-run polish | P1 |
| 24 | LocaleSetupFlow.tsx:1114–1359 | Off-system sheet: padding 20, heroTitle 30, headerTitle 20, gaps 10/13/14 | content → `layout.screenPadding`; heroTitle → `typography.pageTitle`; headerTitle → `typography.cardTitle`; gaps → `spacing.sm/md/lg` | Token migration | P1 |
| 25 | SettingsScreen.tsx:1345–1683 | Token bypass (raw 13–16pt, padding 16/20); `settingsGroup radius.md` vs stack `radius.lg` | Map to tokens; group radius → `radius.lg` | Mechanical | P1 |
| 26 | MoreScreen.tsx:97–153 | Default activeOpacity everywhere; row rhythm 56pt vs Settings 68pt; bare icons vs Profile's tinted containers; no roles | `activeOpacity={0.7}`; `minHeight: 60` shared rhythm; pick one icon treatment (36×36 tinted container recommended); add roles | List consistency | P1/P2 |
| 27 | SettingsScreen.tsx:453–478, 1045–1061; 710–747, 1450–1454; 1136–1167; 1636–1645 | Disabled fg = `cardBorder` (invisible); selected tint `'10'` imperceptible on parchment + unringed 14px swatches; time picker doesn't scroll to selection; language rows hairline+radius+gap combo | Disabled → `hexWithAlpha(secondaryText, 0.4)`; tint `'1F'` + swatch `borderWidth: 1 cardBorder`; `contentOffset={{y: idx*49}}`; drop borderBottom, keep gap | — | P2 |
| 28 | PrivacyPreferencesScreen.tsx:257–261, 164–188, 304–307, 221–230, 314 | Done 40×22; PIN inputs no maxLength/return chain; `typography.label` used for prose; selected = border-only; `gap: 14` | `minHeight: 44`; `maxLength={6}` + chain; → `typography.body`; add `hexWithAlpha(accentPrimary, 0.08)` selected bg; `gap: spacing.lg` | — | P1/P2 |
| 29 | AuthScreen.tsx:274–276, 388–413, 372–383; ResetPassword:120–122, 149–159 | Close 36×36; text links ~20pt; eye toggle unlabeled (RP toggles both fields from one eye) | `hitSlop={8}`; `paddingVertical: spacing.sm` + hitSlop on links; `accessibilityLabel={t(show ? 'auth.hidePassword' : 'auth.showPassword')}` (new keys); per-field toggle | 44pt + a11y | P2 |
| 30 | LocaleSetupFlow.tsx:705–711; 1075–1107; 513–672 activeOpacity 0.88/0.9 mix; 562/508 tint alphas '10' vs '18'; 1179–1187 `minWidth: '30%'` 3-up grid | Wayfinding text-only; CTA on reading-surface tokens + double disabled; press/tint drift; ne/hi cramped 3-up | 2-dot step indicator (6×6, accent/cardBorder); CTA → `accentPrimary`+`onAccent`, single `disabled && {opacity: 0.45}`; all 0.85; unify `'18'`+accent border; → `'47%'` 2-up | First-run | P2 |
| 31 | LocalePreferencesScreen.tsx:8–12 | Settings row says "Nation and Bible", pushed screen titles "Set Up Your Bible Experience" | Pass `titleKey` prop (settings mode → `'settings.nationAndLanguage'`) | Label ≠ destination | P2 |
| 32 | MoreScreen/About header + link roles; TranslationBrowser offline notice; ReadingActivity statChip 14/gap 12 | Minor consistency | About header → `paddingVertical: spacing.lg`; `accessibilityRole="link"` ×4; micro notice when catalog fetch fails; grid values | — | P2 |

Already good: MoreScreen tokens + onAccent CTA; ProfileScreen avatar picker a11y; About row anatomy = MoreScreen (best list consistency); Annotations `hitSlop={12}` back; TranslationBrowser labeled back (the pattern to copy); AuthScreen error-copy pipeline + KAV; LocaleSetupFlow option-card anatomy with real download states.

---

### 2F. Shared chrome, audio, skeletons

| # | Anchor | Issue | Exact change | Constraint check | Pri |
|---|---|---|---|---|---|
| 1 | PlaybackControls.tsx:362–367 | 'Music and sounds' + subtitle hardcoded | `t('audio.backgroundMusicTitle'/'backgroundMusicSubtitle')` (new keys) | i18n | P0 |
| 2 | PlaybackControls.tsx:274–275, 293, 320, 337 | Hardcoded English a11y strings (background music, repeat cycle, 'Show text', share hint) | `t()` keys each (e.g. `t('audio.backgroundMusicA11y', {label})`) | i18n a11y | P0 |
| 3 | src/types/audio.ts:58–65 + backgroundMusicCatalog.ts:13 (via PlaybackControls:483–495) | Option data carries display copy: `'Off'/'5 min'/'1 hour'`, music labels/descriptions | Store `labelKey`s in option arrays; render `t(option.labelKey)` | i18n in data files | P0 |
| 4 | ReaderPlaybackDock.tsx:77, 136, 218 | Hardcoded a11y: 'Pause/Play chapter audio', 'Previous/Next chapter' | → `t('audio.pauseChapter'/'playChapter')`, `t('bible.previousChapter'/'nextChapter')` + `useTranslation()` | i18n a11y | P0 |
| 5 | ReaderPlaybackDock.tsx:193–198, 267–269 | `playIcon marginLeft: 2` applied unconditionally — **pause icon pushed 2px off-center** | Offset only when `playButtonIconName === 'play'` | Optical centering | P1 |
| 6 | PlaybackControls.tsx:200–204; MiniPlayer.tsx:95–99 | Play triangle dead-centered (reads left-heavy) | `style={!isPlaying ? {marginLeft: 2} : undefined}` | 2px convention | P1 |
| 7 | PlaybackControls.tsx:184–206 | Play/skip/prev/next/timer/speed: no a11y labels (repeat/music/text/share have them); no play haptic | Labels ×6 (state-dependent play/pause); `mediumHaptic()` on play | a11y + haptics | P1 |
| 8 | PlaybackControls.tsx:537–549, 647–649 | iconButton 36, utility 38, skip 42 — all sub-44 | `hitSlop={{top:4,bottom:4,left:2,right:2}}` / `hitSlop={4}` → ≥44 effective | 44pt | P1 |
| 9 | PlaybackControls.tsx:678 | `rgba(0,0,0,0.55)` overlay | → `colors.overlay` inline | Token | P1 |
| 10 | AudioProgressScrubber.tsx:77, 94–96 | 18pt scrub band, no hitSlop | `minHeight: 32` + `hitSlop={{top:12,bottom:12}}` | 44pt | P1 |
| 11 | AudioProgressScrubber.tsx:77–91 | No `accessibilityRole="adjustable"`/`accessibilityValue`/actions — SR users can't seek | Add all three; increment/decrement → `onSeek(position ± 10000)` | a11y | P1 |
| 12 | AudioProgressScrubber.tsx:78–89 | No thumb affordance | 12×12 circle (`radius.pill`, `fillColor`) at progress%, 16px while `isScrubbing` | Brief requirement | P1 |
| 13 | AudioPlayerBar.tsx:219–222; AudioFirstChapterCard.tsx:241–244 | Time labels not tabular (countdown re-widths every second) | `fontVariant: ['tabular-nums']` ×2 | Most visible jitter | P1 |
| 14 | AudioPlayerBar.tsx:125–127, 194–199 | Close 32×32, unlabeled | `hitSlop={8}` + role + `t('common.close')` | 44pt | P1 |
| 15 | AudioReturnTab.tsx:93, 113 | `rgba(255,255,255,0.78)` border on accent; 30pt touch strip | → `hexWithAlpha(colors.onAccent, 0.78)`; `hitSlop={8}` | Tokens + 44pt | P1 |
| 16 | TabNavigator.tsx:183–242 | No haptic on tab switch | Shared `listeners={{ tabPress: () => lightHaptic() }}` on all 5 screens | §1.3 | P1 |
| 17 | TabNavigator.tsx:88–89 vs 105–106 | 1px label clip pressure (height math leaves 44px for 45px content) | `paddingBottom: tabBarBottomPadding + spacing.xs` (was `+ spacing.sm`) | 4pt grid | P1 |
| 18 | TabNavigator.tsx:96–109, 161–165 | Tab bar flips normal-flow ↔ absolute mid-collapse → ~86px content reflow on first collapse frame | All three style variants `position:'absolute', left/right/bottom: 0`; verify each tab screen pads via `useTabBarHeight` first | Motion correctness | P1 |
| 19 | MiniPlayer.tsx (file) | Dead component (only barrel-referenced; RootNavigator mounts AudioReturnTab) | Confirm via grep, delete — or apply its 3 sub-fixes if re-mounted | Dead code | P1 |
| 20 | Skeleton system | Pulse 2000ms; single color; radius/rhythm mismatches | §1.5 (all four fixes) | — | P1 |
| 21 | AnnotationActionSheet.tsx:339–346 | Done button `bibleSurface` on accent | → `colors.onAccent` | onAccent sweep | P1 |
| 22 | AnnotationActionSheet.tsx:453–455 | Label 10pt with 0.8 min scale → 8pt effective floor | Keep `typography.micro` (12) + `minimumFontScale={0.9}` | Legibility | P1 |
| 23 | ErrorBoundary.tsx:5, 24, 71, 98 | Fallback hardcodes `darkColors` — light users crash into dark screen | In `ErrorFallback`: `let colors = darkColors; try { colors = useTheme().colors } catch {}`; CTA → `accentPrimary`+`onAccent`, radius → `radius.lg`; wrap `t()` in try/catch with English literals as last resort (the one sanctioned hardcode) | Boundary must survive broken providers | P1 |
| 24 | PrivacyLockScreen.tsx:82–86 | `Dimensions.get` at module scope — keypad frozen at first-import size (camouflage-breaker on rotation/foldables) | `useWindowDimensions()` inside component | Layout only — calculator palette stays | P1 |
| 25 | PlaybackControls.tsx:686–719; AnnotationActionSheet:373–493; AudioFirstChapterCard:221 | Radius drift: 22/18/15/14 in one modal; 28/15/14; 28 | Adopt `radius.xl` (20) / `radius.xxl` (28) tokens; unify 15/14 → 14 | Concentric | P2 |
| 26 | Off-grid literals: AudioPlayerBar:180–227 (14/10/6); MiniPlayer:142–158; AudioFirstChapterCard:204–221 | 6/10/14/18 values | Map to spacing tokens (≤2px deltas) | 4pt grid | P2 |
| 27 | PlaybackControls.tsx:193–198; 483–496 | Loading = static hourglass; sleep-timer modal has no selected state | `ActivityIndicator small`; mirror speed modal's checkmark treatment | — | P2 |
| 28 | AudioProgressScrubber.tsx:50, 66–74 | `locationX` relative to child under finger → mid-drag jumps | Compute from `pageX` − measured container `pageX` | PanResponder gotcha | P2 |
| 29 | RootNavigator.tsx:33 | `notification: colors.accentGreen` legacy alias | → `colors.accentPrimary` | Canonical token | P2 |
| 30 | Press feedback: ReaderPlaybackDock:125–226 (3 Pressables, zero feedback); AudioReturnTab:61–100 | No pressed state | `({pressed}) => [... , {transform:[{scale: pressed ? 0.96 : 1}]}]` (scale beside existing rotate on ReturnTab) | 0.96 standard | P1/P2 |
| 31 | Dedup: formatTime ×2; ReaderPlaybackDock worklets ×2; AudioReturnTab magic −59/148 | Duplication/underived constants | `formatPlaybackTime` (§1.1); collapse worklets; derive `right: -((W−H)/2)` | — | P2 |
| 32 | TabNavigator.tsx:117–138 | `resolveActiveNestedRoute` ×3 per render per route | Hoist once in screenOptions callback | Perf | P2 |
| 33 | AudioReturnTab.tsx:62–63; AudioFirstChapterCard:146 | a11y label = reference only (no "return to playing" cue); artwork announces filename | `t('audio.returnToPlaying', {reference})`; artwork `accessible={false}` | — | P2 |

Already good: 5 stacks byte-identical; `useTabBarHeight` exemplary; ReaderPlaybackDock ring + collapse motion (gold standard); AnnotationActionSheet a11y + 0.96; AudioReturnTab entrance spring; skeleton pseudo-random widths; PrivacyLock hit targets + tabular display.

---

## 3. New i18n keys

Add to `en.ts` first, then `es.ts`, `ne.ts`, `hi.ts` (plural-aware where `{count}`). Existing keys referenced in Section 2 (`harvest.lessonNotFound`, `groups.leaveGroup`, `prayer.title`, `settings.theme*`, `bible.nextChapterHint`) are **not** re-listed.

**common:** `common.clear` "Clear" · `common.close` (verify exists) · `common.previous` "Previous" · `common.next` "Next" · `common.comingSoon` "Coming soon" · `common.shareApp` "Share App"

**bible:** `bible.fontsAndSettings` "Fonts & Settings" · `bible.allSettings` "All Settings" · `bible.previousChapterHint` "Goes to the previous chapter" · `bible.chapterActions` "More actions" · `bible.noSearchResults` "No results for \"{{query}}\"" · `bible.relatedVerses` "Related Verses"

**audio:** `audio.backgroundMusicTitle` "Music and sounds" · `audio.backgroundMusicSubtitle` "Choose a bundled background layer for offline scripture listening." · `audio.backgroundMusicA11y` "Background music: {{label}}" · `audio.repeatCycleHint` "Cycles repeat off, repeat chapter, and repeat book" · `audio.showText` "Show text" · `audio.shareHint` "Opens the audio sharing options for this chapter" · `audio.play` "Play" · `audio.pause` "Pause" · `audio.playChapter` "Play chapter audio" · `audio.pauseChapter` "Pause chapter audio" · `audio.seekBackward` "Skip back 10 seconds" · `audio.seekForward` "Skip forward 10 seconds" · `audio.sleepTimer` "Sleep timer" · `audio.returnToPlaying` "Return to {{reference}}, now playing" · `audio.timer.off` "Off" · `audio.timer.5min`…`audio.timer.1hour` (mirror `SLEEP_TIMER_OPTIONS`) · music option label/description keys mirroring `BACKGROUND_MUSIC_OPTIONS`

**readingPlans:** `readingPlans.start` "Start" · `readingPlans.durationDaysShort` "{{count}}d" · `readingPlans.deletePlanConfirmTitle/Body` · `readingPlans.unenrollTitle/Body` · `readingPlans.dayRowA11y` "Day {{day}}: {{refs}}" · `readingPlans.currentDayRowA11y` · `readingPlans.sessionActionA11y` "{{label}} for day {{day}}" · `readingPlans.dayA11y` · `readingPlans.daysCompleted` "{{done}} of {{total}} days completed" · `readingPlans.editRhythm` "Edit rhythm" · `readingPlans.rhythmAllDoneTitle/Body` · `readingPlans.category.*` (one per catalog category) · `readingPlans.rhythmComposer.*` block (~20 keys: anyTime, historicRoots, includes, notFound, heroTitle "Historic rhythms", heroSubtitle, heroBody, presetsCount "{{count}} presets", prayerAndScripture, tapToAdd, replaceTitle, replaceBody, timeOfDay, all, tradition, allTraditions, emptyTitle, emptyBody, replaceRhythm, addRhythm) · tradition label keys for `RHYTHM_PRESET_TRADITIONS` · preset title/description keys in `rhythmPresets.ts`

**harvest:** `harvest.percentComplete` "{{progress}}% complete" · `harvest.estimatedMinutes` "~{{minutes}} min" · `harvest.lessonCount` "{{count}} lessons" · `harvest.lessonProgress` "Lesson {{current}} of {{total}}" · `harvest.keyVerse` "Key Verse" · `harvest.discussionQuestions` "Discussion Questions" · `harvest.memberCount` "{{count}} members" · `harvest.shareTakeawayMessage`

**gather:** `gather.playbackAndText` "Playback & Text" · `gather.playbackSpeed` "Playback Speed" · `gather.noPassageText` "No passage text available" · `gather.listenAgain` "Listen to Story Again" · `gather.progressA11y` "{{done}} of {{total}} complete" · `gather.share` "Share"

**groups:** `groups.activeCount` "{{count}} active" · `groups.aboutSessionsTitle` "About Group Sessions" · `groups.aboutSessionsBody` + 3 bullet keys · `groups.shareInvite` "Join my discipleship group \"{{name}}\" in EveryBible!\n\nJoin code: {{code}}" · `groups.share` "Share"

**prayer:** `prayer.justNow` "just now" · `prayer.minutesAgo` "{{count}}m ago" · `prayer.hoursAgo` "{{count}}h ago" · `prayer.daysAgo` "{{count}}d ago" · `prayer.noPrayersPreview` "No prayer requests yet. Be the first to share." · `prayer.loadErrorTitle` "Couldn't load prayers" · `prayer.loadErrorBody` "Check your connection and try again." · `prayer.prayedWithCount` "Prayed ({{count}})" · `prayer.groupMember` (verify exists)

**auth:** `auth.showPassword` "Show password" · `auth.hidePassword` "Hide password"

**about:** `about.resources` "Resources" · `about.madeWithLove` "Made with love"

---

## 4. Prioritized execution plan for Opus

Work top-to-bottom. After each batch: `npm run lint && npm run typecheck`; after P0 and P1 complete: `npm run test:release`. Do **not** build until all batches land (per repo build-order rule).

### P0 — broken, high-visibility, rule violations (~1 session)

1. **onAccent sweep** (mechanical, ~15 files, zero layout risk). All anchors in §2 tables tagged "onAccent sweep": Home 1 · Plans 5+7 · Rhythm 6+3 · Learn 13 · Groups/Prayer ~16 · Profile/Annotations/ReadingActivity 5 · AnnotationActionSheet 1. FoundationDetail:444 must move color out of StyleSheet. Visual-check PracticeCard:107. **Verify:** midnight + light + parchment; every CTA/checkmark/badge readable.
2. **Auth pair:** invisible spinners (AuthScreen:399, ResetPassword:189) + Apple `WHITE_OUTLINE` on light. **Verify:** light theme sign-in sheet, spinner during submit.
3. **HomeScreen fake data** (161, 619) — decide wire-vs-remove; removing is the safe default. **Verify:** home card after reading a chapter.
4. **First-run tap bug:** LocaleSetupFlow:758 `keyboardShouldPersistTaps`. **Verify:** fresh install, search a language, first tap selects.
5. **Dead/broken affordances:** Settings dead touchable (1079); LessonBottomSheet dead rows; no-op Four Fields CTAs (after the reachability check in §2C — delete unreachable screens first); PrayerWall Android `Alert.prompt`; RhythmDetail disabled-button dark-on-dark; PrayerWall UUID avatars; GroupSession footer inset.
6. **i18n batch 1 — display strings:** RhythmComposer block (largest), PlansHome `"d"`+`.replace()`, reader theme labels + Fonts/All Settings, LessonDetail 6, GroupDetail 8 + share, FieldOverview templates, FourFieldsLessonView 7, FieldCard titles, PrayerWall relative time, ReadingPlanDetail book names + concatenated sentence, category chips, CourseDetail sample data, Settings AM/PM, PlaybackControls + option data files, CrossReferencePanel. All new keys ×4 locales in the same commits.
7. **i18n batch 2 — a11y strings:** PlanDetail, ReadingPlanDetail:335, PlaybackControls, ReaderPlaybackDock. **Verify:** switch device to Nepali; walk Plans, Gather lesson, reader font sheet, group detail — zero English.
8. **Hardcoded color singles:** TranslationPickerList:619 selection wash · HomeScreen:721/741 connector · LessonBottomSheet + LessonDetail + PlaybackControls overlays → `colors.overlay`. **Verify:** Sapphire palette + parchment.
9. **PrayerWall offline error-vs-empty** (§2D-1) + PlansHome tab-strip targets/roles.

### P1 — clear polish wins (~2 sessions, grouped to minimize file revisits)

1. **Foundations first:** `hexWithAlpha` + `formatPlaybackTime` helpers; `radius.xl/xxl` tokens; delete `src/constants/colors.ts` (after import check); Skeleton §1.5 fixes; `fourFieldsCourses.ts` palette resolver.
2. **Shared components:** `ScreenHeader`, `ProgressBar`, `InitialsAvatar` (§1.4) — then adopt while touching each file below.
3. **Touch-target + a11y sweep** (per-file anchors above): back buttons ×10, close/clear buttons ×6, scrubber (role adjustable + thumb + band), pills/chips, PlaybackControls transport labels, Settings switches, tab-strip roles.
4. **tabular-nums sweep** (~25 styles — every anchor tagged in §2).
5. **Haptics pass** (§1.3 map — completions, toggles, tab press, play/pause, verse select, destructive warns).
6. **Press-feedback normalization:** activeOpacity → 0.85/0.7/1; Pressable 0.96 scale (ReaderPlaybackDock ×3, AudioReturnTab, HighlightedVerseText); ReaderPlaybackDock pause-icon offset fix; play-triangle optical offsets.
7. **State coverage:** Bible search empty + keystroke spinner fix; TranslationPicker empty; Annotations loading/error; GroupList empty CTA + retry; PlansHome/PlanDetail error rows; ReadingPlanDetail failure alert + ring double-track fix; GroupDetail prayer-card offline; PrayerWall optimistic rollback + makeStyles hoist.
8. **Structural singles:** TabNavigator (haptic listener, padding math, absolute-position collapse — test collapse on Bible reader scroll); MiniPlayer delete; ErrorBoundary theming; PrivacyLock `useWindowDimensions` (verify calculator layout on rotation); Settings theme-picker rework; PrivacyPreferences KAV + input bg; Auth return-key chains + Google mark + button parity; TranslationBrowser header tokens; destructive confirms (PlansHome, ReadingPlanList); LessonBottomSheet handle + inset + share collapse; reader regression test for the no-skeleton rule (§2B-12).
9. **Token migrations** (mechanical, one commit per file): GroupList, GroupDetail, GroupSession, Settings, LocaleSetupFlow, CourseDetail, FourFieldsJourney.

### P2 — nice-to-have (backlog, opportunistic)

Grid nudges (gap 3/5/6/10/14/18 → tokens) · concentric radius fixes (PlansHome covers, CompanionCard, PlaybackControls modal) · fontWeight '800'→'700' (~12 sites) · dead code (statsPanel, savingPresetId, progressAnim, ellipsisText, durationBadge, language-chip styles ×2 files) · carousel edge-bleed + snap (CompanionSection, JourneyPath) · RTL logical props (PlanDetail floatingBack) · Dimensions→useWindowDimensions (ChapterSelector) · empty-copy corrections (RhythmDetail) · LocaleSetupFlow step dots + CTA tokens + 2-up grid · Settings picker scroll-to-selection · sleep-timer selected state · scrubber pageX fix · misc a11y roles/hints.

### Regression watchlist (check while executing)

| Change | Risk | Verify |
|---|---|---|
| TabNavigator absolute positioning | Content hidden behind bar on any screen not using `useTabBarHeight` | Scroll to bottom of all 5 tabs, both platforms |
| VersesSkeleton metrics | First-load layout | Fresh install first chapter open; confirm chapter-to-chapter still never skeletons |
| Legacy reader gutter 30→24 | Reading measure shift for legacy-mode users | Compare premium vs legacy side-by-side |
| FieldCard minHeight + palette resolver | JourneyPath snap + gradient look in all 4 palettes | Harvest tab, swipe cards, switch palettes |
| Settings theme-picker rework | 5 modes × 4 palettes × ne labels | Screenshot matrix |
| ErrorBoundary theming | Boundary must not throw when providers are broken | Force a render error in dev, light + dark |
| onAccent on accentSecondary fills | Tan fill contrast | PracticeCard scripture-check circle, all modes |
| i18n key additions | Missing-key fallback showing raw keys | Boot in es/ne/hi after each i18n commit |

**Definition of done per batch:** lint + typecheck clean · `npm run test:release` green · screenshots in midnight/light/parchment · large-font pass on touched screens · Nepali pass on touched screens · no skeleton during chapter-to-chapter navigation.
