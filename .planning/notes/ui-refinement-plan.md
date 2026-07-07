# UI Refinement + Brand Red + New App Icon — Execution Plan

**Planned by:** Opus 4.8 · **Execute:** Sonnet · **Verify:** Opus (on-device)
**Goal:** Make the UI less oversized/bubbly, fix two Plans overflow bugs, correct the brand red to
match the new app icon, and set the new icon. Behavior unchanged; this is visual refinement.

House rules: `StyleSheet.create` only, theme colors via `useTheme()`, i18n keys, no `any`, don't break iOS.
After every change keep `npm run typecheck` + `npm run lint` + `npm run test:release` green — several
tests assert exact hex/style values, so UPDATE those test expectations in the same change.

---

## NEW BRAND RED = `#A11D1B`  (rgb 161,29,27)
Sampled from the icon's lit cover face (deeper crimson; current `#A23A2A` is too orange).
Lighter companion (replaces the salmon secondary): **`#C8463C`** (rgb 200,70,60).

### A1 — `src/constants/appearancePalettes.ts` (THE source of the live red — "ember" is the default)
- ember `primary: '#A23A2A'` → `'#A11D1B'`
- ember `secondary: '#D26A5C'` → `'#C8463C'`
- ember `tertiary: '#8F5A46'` → leave as-is
- Do NOT touch sapphire/teal/olive palettes.

### A2 — `src/constants/colors.ts` (legacy aliases; keep in sync)
- Every `#C0392B` → `#A11D1B` (accent, accentGreen, accentPrimary, tibetanMaroon, bibleAccent)
- `tibetanMaroonLight: '#A03025'` → `'#C8463C'`
- Update the `// ... Tibetan Maroon` comment to say the brand red now matches the app icon.

### A3 — stragglers (grep app-wide and update to the new family)
```
grep -rinE "C0392B|A23A2A|D26A5C|rgba\(210, ?106, ?92|rgba\(162, ?58, ?42|rgba\(192, ?57, ?43" src/
```
- `src/screens/bible/chapterSelectorModel.ts` (+ `chapterSelectorModel.test.ts`): `#C0392B` → `#A11D1B`
- `src/screens/plans/PlansHomeScreen.tsx`: `rgba(210, 106, 92, 0.12)` → `rgba(161, 29, 27, 0.12)`
- Any other hits → map old-primary→`#A11D1B`, old-secondary/salmon→`#C8463C`.
- Update any palette/theme/color **tests** that assert the old hexes (e.g. `themeColors.test.ts`,
  `themeDefaultSource.test.ts`, `designSystemSource.test.ts`, `chapterSelectorModel.test.ts`) to the new values.

---

## "LESS BUBBLY" — radius rule
**Rule:** large or text/rectangular buttons, cards, chips, pills → `borderRadius: radius.lg` (12)
instead of `radius.pill`. **KEEP `radius.pill` only on square icon-only buttons** (e.g. the 44×44 "+"
button, circular avatars) and genuinely circular dots. Use judgment per element; when unsure, a
rectangular thing with text inside → `radius.lg`.

Known `radius.pill` hotspots to convert (verify each is a text/rect button, not a circle):
- `src/screens/home/HomeScreen.tsx`: lines ~912, 927, 998, 1009, 1084, 1090, 1107
- `src/screens/plans/PlansHomeScreen.tsx`: lines ~168, 173, 319, 593, 605, 676, 701, 1024, 1036, and `borderRadius: 24` at ~969 → `radius.lg`
- Also sweep other screens (`grep -rn "radius.pill" src/screens src/components`) and apply the same rule to oversized text buttons there (Bible book hub, audio, etc.).

## "LESS BIG" — button sizing
### Home Listen/Read buttons — `src/screens/home/HomeScreen.tsx`
- `primaryPill` (~909): `minHeight: 56`→`48`, `borderRadius: radius.pill`→`radius.lg`, `paddingHorizontal: spacing.xl`→`spacing.lg`, `minWidth: 132`→remove (let content size it)
- `primaryPillText` (~919): `fontSize: 18`→`16`, `lineHeight: 24`→`20`
- `secondaryPill` (~924): `minHeight: 56`→`48`, `borderRadius: radius.pill`→`radius.lg`, `paddingHorizontal: spacing.xl`→`spacing.lg`, `minWidth: 124`→remove
- `secondaryPillText` (~935): `fontSize: 18`→`16`, `lineHeight: 24`→`20`
### Plans — `src/screens/plans/PlansHomeScreen.tsx`
- `sectionTitle` override `fontSize: 25 / lineHeight: 31` (~584) → `fontSize: 20 / lineHeight: 26` (less giant; also reduces header crowding)

---

## PLANS OVERFLOW FIX #1 — "Find Plans" tab gets cut off
**File:** `src/screens/plans/PlansHomeScreen.tsx` (`tabStrip` ~1266, `tabRow`/`tabPill` styles ~1382)
**Cause:** the 2-segment control is inside `<ScrollView horizontal>`, so `flex:1` can't bound it to
the screen → it overflows and the 2nd segment is clipped.
**Fix:**
1. In `tabStrip`, replace `<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}> ... </ScrollView>` with a plain `<View style={styles.tabRow}> ... </View>` (drop the ScrollView + its import if now unused).
2. `tabPill` style: remove `minWidth: 108` (or set `minWidth: 0`) and remove `flexShrink: 0`; KEEP `flex: 1`. Keep `numberOfLines={1}` on the label.
Result: a clean full-width segmented control that splits 50/50 and fits any screen — both labels visible.

## PLANS OVERFLOW FIX #2 — "+ Add your first plan" runs off-screen
**File:** `src/screens/plans/PlansHomeScreen.tsx` (My Plans section header ~482-512, styles ~575-620)
**Cause:** in the empty state, the labeled "+ Add your first plan" button is placed in a `space-between`
header row beside the (now 20px) "Daily Readings" title → it overflows the right edge.
**Fix:**
1. Section header: ALWAYS render the compact circular `iconButton` ("+" icon only) — remove the
   `activePlans.length === 0 ? styles.primaryButton(+label) : styles.iconButton` branching so the header
   button is always just the icon. (Keep `iconButton` but change its `borderRadius` to stay circular — it's 44×44, so `radius.pill` is correct here.)
2. Move the labeled CTA INTO the empty state. In the `emptyState` block (after `emptyBody`), add:
   ```tsx
   <TouchableOpacity
     onPress={onAddPlan}
     activeOpacity={0.8}
     style={styles.emptyCtaButton}
     accessibilityRole="button"
     accessibilityLabel={t('readingPlans.addFirstPlan')}
   >
     <Ionicons name="add" size={18} color={colors.onAccent} />
     <Text style={styles.emptyCtaLabel}>{t('readingPlans.addFirstPlan')}</Text>
   </TouchableOpacity>
   ```
   New styles (in the same StyleSheet):
   ```tsx
   emptyCtaButton: {
     flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
     gap: spacing.xs, alignSelf: 'center', maxWidth: 320,
     marginTop: spacing.sm, minHeight: 44,
     paddingHorizontal: spacing.lg, borderRadius: radius.lg,
     backgroundColor: colors.accentPrimary,
   },
   emptyCtaLabel: { ...typography.button, fontSize: 15, lineHeight: 20, color: colors.onAccent },
   ```
   Use `colors.onAccent` for the text/icon (theme's on-accent color). Keep existing `emptyState` centering.

---

## NEW APP ICON
**Source (high-res, confirmed = the red Bible):** `/Users/dev/Desktop/ig_0490fee54e0dc50d016a2bb8037fe081919162c62ad04ba145.png` (1254×1254)
1. Resize to exactly 1024×1024 and overwrite both icon assets:
   ```bash
   SRC="/Users/dev/Desktop/ig_0490fee54e0dc50d016a2bb8037fe081919162c62ad04ba145.png"
   sips --resampleHeightWidth 1024 1024 "$SRC" --out assets/icon.png
   sips --resampleHeightWidth 1024 1024 "$SRC" --out assets/adaptive-icon.png
   sips -g pixelWidth -g pixelHeight assets/icon.png   # must report 1024 x 1024
   ```
2. `app.json`: in `android.adaptiveIcon`, change `"backgroundColor": "#101113"` → `"#5E1212"` (deep red)
   so the Android round-mask edges blend with the icon's dark-red border. Leave the iOS `icon` as the file.
3. Leave `splash-icon.png` and the splash `backgroundColor` unchanged (out of scope).
**Caveat to record (not a blocker):** the icon is full-bleed, so Android's circular mask will crop the
corners slightly. Acceptable for now; a padded adaptive foreground can be a later polish.
**Note:** the launcher icon only changes after a rebuild — it won't show on the currently-installed app.

---

## VERIFICATION (Sonnet: report these; Opus re-checks + does the device pass)
- `npm run typecheck` exit 0 · `npm run lint` exit 0 · `npm run test:release` all pass (with updated hex test expectations).
- `grep -rinE "C0392B|A23A2A|D26A5C|rgba\(210, ?106, ?92" src/` → no remaining old-brand-red hits.
- `grep -rn "radius.pill" src/screens/home/HomeScreen.tsx src/screens/plans/PlansHomeScreen.tsx` → only circular icon buttons remain.
- `sips` confirms `assets/icon.png` is 1024×1024.
- Commit on a new branch `ui/refinement-red-icon` (do NOT touch unrelated working-tree changes); report a summary + the grep/test outputs.
