# Translation Picker Keyboard Occlusion Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When the user types in the translation-picker search box, list rows hidden behind the on-screen keyboard must become reachable (scrollable above the keyboard), and dragging the list must dismiss the keyboard.

**Architecture:** The shared `TranslationPickerList` component owns the search box and the FlashList in all three entry points (Bible reader modal, Bible browser modal, More → TranslationBrowserScreen). We fix it once, inside the shared component: a new `useKeyboardBottomInset` hook reports the keyboard height on iOS (0 on Android, where the window already resizes), the FlashList gets that height added to its bottom content padding so every row can scroll above the keyboard, and `keyboardDismissMode="on-drag"` lets a scroll gesture dismiss the keyboard.

**Tech Stack:** React Native 0.81 (`Keyboard` API), Expo SDK 54, `@shopify/flash-list` v1.8, TypeScript strict, node:test source-text tests run via `node --test --import tsx`.

---

## Background / Root Cause (read before coding)

**Symptom:** On the translation picker, focusing the search `TextInput` opens the keyboard, which covers the bottom of the list. Rows behind the keyboard cannot be tapped, the list cannot be scrolled far enough to reveal them, and there is no way to dismiss the keyboard except the return key.

**Why it happens:**

1. **The picker sheet is a plain RN `Modal`** — in `BibleReaderScreen.tsx` (~line 6336) the picker renders inside `<Modal transparent animationType="slide">` with `modalContent: { height: '78%' }` anchored to the bottom (`modalOverlay: { justifyContent: 'flex-end' }`). RN `Modal` does **not** resize or avoid the keyboard on iOS, and there is no `KeyboardAvoidingView` in this path. `BibleBrowserScreen.tsx` has an equivalent Modal wrapper; `TranslationBrowserScreen.tsx` (More stack) is a full-screen `SafeAreaView`, same problem at the screen bottom.
2. **The FlashList gets no keyboard inset** — in `src/screens/bible/TranslationPickerList.tsx` (~line 949) the FlashList uses a static `contentContainerStyle={styles.translationListContent}` (`paddingBottom: layout.sectionGap`, a small constant). When the keyboard opens, the scrollable extent doesn't grow, so the last ~keyboard-height worth of rows physically cannot be scrolled into view. (`automaticallyAdjustKeyboardInsets` is NOT a viable alternative: it is unreliable inside RN `Modal` on iOS, and two of the three entry points are Modals.)
3. **No dismiss affordance** — the FlashList sets `keyboardShouldPersistTaps="handled"` (good — row taps register) but no `keyboardDismissMode`, so dragging the list never dismisses the keyboard, and every visible surface is either the input or a tappable row, so there's nothing "blank" to tap to blur.

**Why the fix lives in `TranslationPickerList`, not the Modal wrappers:** there are three wrappers (two Modals + one screen) but exactly one shared list component. Padding the list by the keyboard height fixes all three at once with no layout jumps to the sheets themselves.

**Android note:** Expo's default `android.softwareKeyboardLayoutMode` is `resize` (nothing overrides it in `app.json`/`app.config.js`), so the window itself shrinks and extra padding would double-compensate. That's why the hook returns `0` on Android. `keyboardDismissMode="on-drag"` is applied on both platforms.

**Do not** add `react-native-keyboard-controller` or any new native dependency — managed workflow, Expo modules only (project rule #9).

---

### Task 1: `useKeyboardBottomInset` hook — failing test first

**Files:**
- Test: `src/hooks/useKeyboardBottomInsetSource.test.ts` (create)

This repo's convention for hooks/screens is **source-text tests** (see `src/hooks/useTabBarHeightSource.test.ts` for the exact pattern). Node's test runner has no React renderer here — we assert the source encodes the right decisions.

**Step 1: Write the failing test**

Create `src/hooks/useKeyboardBottomInsetSource.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('useKeyboardBottomInset tracks the iOS keyboard frame and stays inert on Android', () => {
  const source = readRelativeSource('./useKeyboardBottomInset.ts');

  assert.match(
    source,
    /import \{ Keyboard, Platform \} from 'react-native';/,
    'useKeyboardBottomInset should use the built-in Keyboard API — no new native keyboard dependency in the managed workflow'
  );

  assert.match(
    source,
    /Platform\.OS !== 'ios'/,
    "useKeyboardBottomInset should return 0 on Android, where softwareKeyboardLayoutMode=resize already shrinks the window and extra padding would double-compensate"
  );

  assert.match(
    source,
    /keyboardWillShow/,
    'useKeyboardBottomInset should listen to keyboardWillShow on iOS so the inset lands before the keyboard finishes animating'
  );

  assert.match(
    source,
    /keyboardWillHide/,
    'useKeyboardBottomInset should reset the inset when the keyboard hides'
  );

  assert.match(
    source,
    /endCoordinates\.height/,
    'useKeyboardBottomInset should read the keyboard height from the event end coordinates'
  );

  assert.match(
    source,
    /showSubscription\.remove\(\);[\s\S]*hideSubscription\.remove\(\);/,
    'useKeyboardBottomInset should remove both keyboard listeners on unmount'
  );
});
```

**Step 2: Run test to verify it fails**

Run: `node --test --import tsx src/hooks/useKeyboardBottomInsetSource.test.ts`
Expected: FAIL — `ENOENT ... useKeyboardBottomInset.ts` (the hook file doesn't exist yet).

**Step 3: Write the hook**

Create `src/hooks/useKeyboardBottomInset.ts`:

```typescript
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// Reports how much of the current window the on-screen keyboard covers, so
// scrollable content can grow its bottom padding and keep every row reachable.
// Android returns 0: softwareKeyboardLayoutMode defaults to resize, so the
// window itself shrinks and extra padding would double-compensate.
export function useKeyboardBottomInset(): number {
  const [bottomInset, setBottomInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }

    const showSubscription = Keyboard.addListener('keyboardWillShow', (event) => {
      setBottomInset(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener('keyboardWillHide', () => {
      setBottomInset(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return bottomInset;
}
```

**Step 4: Run test to verify it passes**

Run: `node --test --import tsx src/hooks/useKeyboardBottomInsetSource.test.ts`
Expected: PASS (1 test).

**Step 5: Export from the hooks barrel**

Modify `src/hooks/index.ts` — add one line (keep alphabetical-ish grouping with the other hooks):

```typescript
export { useKeyboardBottomInset } from './useKeyboardBottomInset';
```

**Step 6: Commit**

```bash
git add src/hooks/useKeyboardBottomInset.ts src/hooks/useKeyboardBottomInsetSource.test.ts src/hooks/index.ts
git commit -m "feat(hooks): add useKeyboardBottomInset for keyboard-aware scroll padding"
```

---

### Task 2: Wire the inset + drag-to-dismiss into `TranslationPickerList` — failing test first

**Files:**
- Modify: `src/screens/bible/TranslationPickerList.tsx` (imports ~line 1–30; FlashList JSX ~lines 949–968)
- Test: `src/screens/bible/translationPickerListSource.test.ts` (append a new `test(...)` block at the end)

**Step 1: Write the failing test**

Append to `src/screens/bible/translationPickerListSource.test.ts` (after the last existing `test(...)` block, ~line 425):

```typescript
test('translation picker keeps search results reachable above the on-screen keyboard', () => {
  const source = readRelativeSource('./TranslationPickerList.tsx');

  assert.match(
    source,
    /import \{ useKeyboardBottomInset \} from '\.\.\/\.\.\/hooks';/,
    'TranslationPickerList should read the live keyboard inset so list padding can grow while the search keyboard is open'
  );

  assert.match(
    source,
    /keyboardDismissMode="on-drag"/,
    'TranslationPickerList should dismiss the keyboard when the user drags the translation list'
  );

  assert.match(
    source,
    /paddingBottom:\s*layout\.sectionGap \+ keyboardBottomInset/,
    'TranslationPickerList should extend the FlashList bottom padding by the keyboard height so rows behind the keyboard can scroll into view'
  );

  assert.match(
    source,
    /keyboardShouldPersistTaps="handled"/,
    'TranslationPickerList should keep single-tap row activation while the keyboard is up'
  );
});
```

**Step 2: Run test to verify it fails**

Run: `node --test --import tsx src/screens/bible/translationPickerListSource.test.ts`
Expected: FAIL on the three new assertions (`useKeyboardBottomInset`, `keyboardDismissMode`, `paddingBottom: layout.sectionGap + keyboardBottomInset`). The pre-existing tests must still pass.

**Step 3: Implement**

In `src/screens/bible/TranslationPickerList.tsx`:

**(a)** Add the hook import next to the other internal imports (there is an existing hooks import path pattern in the file's import block — match it; the file lives at `src/screens/bible/`, so the barrel path is `../../hooks`):

```typescript
import { useKeyboardBottomInset } from '../../hooks';
```

**(b)** Inside the component body, near the other hook calls at the top of the component (search for the first `useState`/`useMemo` cluster):

```typescript
const keyboardBottomInset = useKeyboardBottomInset();

// FlashList v1 wants a plain object (ContentStyle), not a StyleSheet array,
// so the keyboard-aware padding is computed here instead of in styles.
const translationListContentStyle = useMemo(
  () => ({
    paddingTop: spacing.sm,
    paddingBottom: layout.sectionGap + keyboardBottomInset,
  }),
  [keyboardBottomInset]
);
```

Note: `spacing` and `layout` are already imported in this file (they're used by `styles`). `useMemo` is already imported from React.

**(c)** Update the FlashList (currently ~line 949) — swap the static content style for the memoized one and add the dismiss mode. Change ONLY these props; leave everything else (data, renderItem, extraData, etc.) untouched:

```tsx
<FlashList
  style={styles.translationList}
  data={translationRows}
  renderItem={renderTranslationRow}
  keyExtractor={(item) => item.id}
  contentContainerStyle={translationListContentStyle}
  showsVerticalScrollIndicator={false}
  estimatedItemSize={TRANSLATION_PICKER_ROW_ESTIMATED_SIZE}
  getItemType={(item) => item.type}
  keyboardShouldPersistTaps="handled"
  keyboardDismissMode="on-drag"
  extraData={{
    activeAudioDownloadKey,
    colors,
    currentTranslation,
    downloadProgress,
    isHydratingRuntimeCatalog,
    resolvedPreferredLanguage,
    searchQuery,
  }}
/>
```

**IMPORTANT — do not delete `styles.translationListContent`.** The two plain `ScrollView`s in this file (languages mode ~line 895, audio-manager modal ~line 1011) still use it, and an existing source test (~line 169) asserts `translationListContent:[\s\S]*paddingBottom:\s*layout\.sectionGap` is present. Those ScrollViews have no text input, so they don't need the keyboard inset.

**Step 4: Run test to verify it passes**

Run: `node --test --import tsx src/screens/bible/translationPickerListSource.test.ts`
Expected: PASS — all tests in the file, including all pre-existing ones (5 old + 1 new).

**Step 5: Commit**

```bash
git add src/screens/bible/TranslationPickerList.tsx src/screens/bible/translationPickerListSource.test.ts
git commit -m "fix(bible): keep translation search results reachable above the keyboard"
```

---

### Task 3: Full verification

**Step 1: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no errors. (Watch for the FlashList `contentContainerStyle` type — v1 expects `ContentStyle`; the plain memoized object satisfies it. If TS complains about extra keys, keep the object to exactly `paddingTop`/`paddingBottom`.)

**Step 2: Lint**

Run: `npm run lint`
Expected: exit 0 (warnings ok if pre-existing; no new errors).

**Step 3: Full test suite**

Run: `npm test`
Expected: PASS. Pay attention to `translationPickerListSource.test.ts` — it is also part of `npm run test:release`.

**Step 4: Release regression suite**

Run: `npm run test:release`
Expected: PASS.

**Step 5: Commit (only if anything changed in steps 1–4)**

```bash
git add -A
git commit -m "chore: verification fixes for keyboard occlusion work"
```

---

### Task 4: Manual QA on simulator (verification, no code)

The occlusion bug is a runtime/layout behavior; the source tests only pin the decisions. Verify on device/simulator:

**Step 1: Launch the dev build** (never `expo start --ios` — it opens Expo Go):

```bash
npx expo run:ios --device "iPhone 17 Pro"
```

(Check Metro is serving from THIS worktree — verify the bundler cwd on :8081 before trusting on-device behavior.)

**Step 2: Reader modal path (primary repro)**
1. Bible tab → open the reader → tap the translation name to open the translation sheet.
2. Tap the search box → keyboard opens. Type a query with many results (e.g. `bible` or `ne`).
3. **Verify:** you can scroll the results list all the way to its last row, and the last row sits fully above the keyboard (the new bottom padding = keyboard height).
4. **Verify:** dragging the list downward dismisses the keyboard (`on-drag`).
5. **Verify:** with the keyboard up, tapping a visible result row activates it on the first tap (persistTaps still `handled`).

**Step 3: Other entry points**
- Bible browser screen's translation modal: repeat step 2.
- More → Translations (TranslationBrowserScreen): repeat step 2.

**Step 4: Android sanity check**

```bash
npx expo run:android
```

- Open the picker, focus search: the window should resize (default `adjustResize`), rows reachable, and drag-to-dismiss works. **Verify there is no doubled blank gap** at the list bottom while the keyboard is open (this is the case the Android `return 0` in the hook protects; if a doubled gap appears anyway, the modal path isn't resizing and the `Platform.OS !== 'ios'` early-return in `useKeyboardBottomInset.ts` should be removed — that is the single switch to flip).

**Step 5: Report** — screenshots of the picker with keyboard open showing the last search result reachable, both platforms.

---

## Out of scope (deliberately)

- No `KeyboardAvoidingView` around the Modal sheets — the shared-component fix covers all three surfaces; resizing the sheets would add motion/layout churn for no extra reachability.
- No `react-native-keyboard-controller` or other new native deps (managed workflow rule).
- No changes to the languages-mode ScrollView or the audio-download modal (no text inputs there).
- The Bhujel duplicate-translation question from earlier in this session is separate and untouched.
