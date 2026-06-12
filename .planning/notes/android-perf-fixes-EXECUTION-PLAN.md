# Android Performance Fixes P1–P6 — Execution Plan (hand-off spec)

**Audience:** an executor model that does EXACT find-and-replace only. Do not design, infer,
refactor beyond what is written, or "improve" anything. If a **Find** block does not match the
file byte-for-byte, **STOP and report** — do not approximate or search for a "close" match.

**Goal:** Fix the six confirmed Android-performance issues in the EveryBible app (Expo SDK 54,
RN 0.81, TypeScript strict, old RN architecture / `newArchEnabled=false`) without changing any
user-visible behavior or breaking iOS.

---

## 0. EXECUTOR OPERATING RULES (read before touching anything)

1. **Exact edits only.** Every edit below is `Find (exact current code)` → `Replace with`. Match
   verbatim. If it doesn't match, STOP and report which edit + what you actually found.
2. **House rules (never violate):** styles go through `StyleSheet.create` (no inline style
   objects except the few explicitly written here), colors come from `useTheme()` (`colors.*`),
   user-facing text uses `t('...')` i18n keys, Zustand is accessed with discrete selectors. Do
   NOT add `any`. Do NOT flip `newArchEnabled`.
3. **Do not touch unrelated regions.** Each task names its files and regions. Stay inside them.
4. **Verify after every task** with the task's own acceptance criteria + `npm run typecheck`.
   Do not start the next task until the current one is green.
5. **One file is shared by three tasks.** `src/screens/bible/BibleReaderScreen.tsx` is edited by
   P1, P3, and P6. You MUST apply them **sequentially in this order: P1 → P3 → P6**. NEVER run
   these three in parallel and never let two agents edit this file at once.
6. **TypeScript is your safety net.** Several edits are designed so a missed sub-edit becomes a
   compile error. Trust `npm run typecheck` — a green typecheck after a task means the edits are
   structurally consistent.
7. **Source-assertion tests exist.** Files named `*Source.test.ts` / `*.test.ts` grep the source
   for exact strings. Where an edit changes an asserted string, the matching test edit is included
   in the same task. Run the listed tests after the task.

### Recommended order (lowest-risk first; the BibleReader trio is strictly ordered)

| Step | Task | File(s) | Independent? |
|------|------|---------|--------------|
| 1 | **P4** | `src/screens/plans/PlanDetailScreen.tsx` | yes |
| 2 | **P5** | `src/components/fourfields/FieldCard.tsx` | yes |
| 3 | **P1** | `BibleReaderScreen.tsx`, `useAudioPosition.ts` (new), `hooks/index.ts`, `HighlightedVerseText.tsx`, `AudioPlayerBar.tsx` | starts the shared-file trio |
| 4 | **P3** | `BibleReaderScreen.tsx`, `ReaderPlaybackDock.tsx`, 2 test files | after P1 |
| 5 | **P6** | `BibleReaderScreen.tsx`, 1 test file | after P3 |
| 6 | **P2** | `app.json`, `package.json` (+ device build) | yes — do LAST; its device smoke test validates 1–5 too |

### Pre-flight (run once, confirm clean baseline)
```bash
cd /Users/dev/Projects/EveryBible
npm run typecheck   # must already be green before you start
git status          # note: working tree has unrelated changes; do NOT revert or commit them
```

---

# TASK P4 — Virtualize the PlanDetailScreen day list

**Why:** A fixed-length plan ("Bible in a Year") renders up to 365 `DayRow`s at once inside a
plain `<ScrollView>` — nothing is virtualized. Replace with `FlashList` (already a dependency),
move the cover/header into `ListHeaderComponent` and related-plans into `ListFooterComponent`,
memoize `DayRow`, and feed it a memoized array of pre-derived day view-models.

**File:** `src/screens/plans/PlanDetailScreen.tsx`

**Risk notes:** Keep the substring `visibleDayNumbers.map((dayNumber) => {` verbatim — a test greps
for it. Keep `DayRow`'s props/styles/JSX byte-for-byte (only add a `React.memo` wrapper). FlashList
has no per-row `gap`, so a separator reproduces the old spacing; the content container's horizontal
padding requires the negative-margin corrections in P4.6–P4.7 to stay pixel-identical. iOS unchanged.

### Edit P4.1 — Add FlashList import
**Find:**
```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
```
**Replace with:**
```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
```

### Edit P4.2 — Remove now-unused `ScrollView` from the react-native import
**Find:**
```tsx
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
```
**Replace with:**
```tsx
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
```

### Edit P4.3 — Wrap `DayRow` in `React.memo`
**Find:**
```tsx
function DayRow({
  dayNumber,
  dateLabel,
  entries,
  launchSessionKey,
  isCompleted,
  isCurrent,
  sessionBadges = [],
  sessionActions = [],
  onPress,
}: DayRowProps) {
```
**Replace with:**
```tsx
const DayRow = React.memo(function DayRow({
  dayNumber,
  dateLabel,
  entries,
  launchSessionKey,
  isCompleted,
  isCurrent,
  sessionBadges = [],
  sessionActions = [],
  onPress,
}: DayRowProps) {
```
Then close the memo wrapper. **Find** (end of `DayRow`, immediately before `const dayRowStyles`):
```tsx
      ) : null}
    </View>
  );
}

const dayRowStyles = StyleSheet.create({
```
**Replace with:**
```tsx
      ) : null}
    </View>
  );
});

const dayRowStyles = StyleSheet.create({
```

### Edit P4.4 — Define a `PlanDayViewModel` type
**Find:**
```tsx
export const CURRENT_PLAN_DAY_ROW_TEST_ID = 'plan-detail-current-day-row';
```
**Replace with:**
```tsx
export const CURRENT_PLAN_DAY_ROW_TEST_ID = 'plan-detail-current-day-row';

interface PlanDayViewModel {
  dayNumber: number;
  dateLabel: string | null;
  entries: ReadingPlanEntry[];
  launchSessionKey?: PlanSessionKey;
  isCompleted: boolean;
  isCurrent: boolean;
  sessionBadges: Array<{ label: string; state: 'done' | 'next' | 'upcoming' | 'available' }>;
  sessionActions: Array<{
    sessionKey: PlanSessionKey;
    label: string;
    state: 'done' | 'next' | 'upcoming' | 'available';
  }>;
}
```

### Edit P4.5 — Build memoized view-models + header/footer, then swap ScrollView → FlashList

**Step A — insert the memoized builder + header/footer.** This goes immediately BEFORE the
`if (loading) {` early-return. The `visibleDayNumbers.map((dayNumber) => {` text is preserved.

**Find:**
```tsx
  const planTitle = plan
    ? t(plan.title_key as Parameters<typeof t>[0], { defaultValue: plan.title_key })
    : t('readingPlans.title');
  const heroCoverSource = plan ? getReadingPlanCoverSource(plan) : null;

  if (loading) {
```
**Replace with:**
```tsx
  const planTitle = plan
    ? t(plan.title_key as Parameters<typeof t>[0], { defaultValue: plan.title_key })
    : t('readingPlans.title');
  const heroCoverSource = plan ? getReadingPlanCoverSource(plan) : null;

  const dayViewModels = React.useMemo<PlanDayViewModel[]>(() => {
    return visibleDayNumbers.map((dayNumber) => {
      const dayEntries = entriesByDay.get(dayNumber) ?? [];
      const daySessionGroups = multiSessionPlan ? getDaySessionEntries(entries, dayNumber) : [];
      const isCompleted = progress
        ? isRecurringPlan(plan)
          ? dayNumber === currentDay &&
            Boolean(
              (currentDaySummary?.dateKey &&
                currentDaySummary.dateKey in progress.completed_entries) ||
                currentDaySummary?.isComplete
            )
          : String(dayNumber) in progress.completed_entries ||
            (dayNumber === currentDay && Boolean(currentDaySummary?.isComplete))
        : false;
      const isCurrent = dayNumber === currentDay;
      const dateLabel =
        progress && !isRecurringPlan(plan)
          ? formatScheduledPlanDayLabel(progress.started_at, dayNumber)
          : null;
      const launchSessionKey = multiSessionPlan
        ? isCurrent && isEnrolled
          ? currentDaySummary?.nextIncompleteSessionKey ?? daySessionGroups[0]?.sessionKey
          : daySessionGroups[0]?.sessionKey
        : undefined;
      const sessionBadges = daySessionGroups.map((group) => {
        const matchingSummary =
          isCurrent && isEnrolled
            ? currentDaySummary?.sessionSummaries.find(
                (session) => session.sessionKey === group.sessionKey
              ) ?? null
            : null;
        const state =
          !isCurrent || !isEnrolled
            ? 'available'
            : matchingSummary?.isComplete
              ? 'done'
              : currentDaySummary?.nextIncompleteSessionKey === group.sessionKey
                ? 'next'
                : 'upcoming';

        return {
          label: group.title,
          state,
        } as const;
      });
      const sessionActions = daySessionGroups.map((group) => {
        const matchingSummary =
          isCurrent && isEnrolled
            ? currentDaySummary?.sessionSummaries.find(
                (session) => session.sessionKey === group.sessionKey
              ) ?? null
            : null;
        const state =
          !isCurrent || !isEnrolled
            ? 'available'
            : matchingSummary?.isComplete
              ? 'done'
              : currentDaySummary?.nextIncompleteSessionKey === group.sessionKey
                ? 'next'
                : 'upcoming';

        return {
          sessionKey: group.sessionKey,
          label: group.title,
          state,
        } as const;
      });

      return {
        dayNumber,
        dateLabel,
        entries: dayEntries,
        launchSessionKey,
        isCompleted,
        isCurrent: isCurrent && isEnrolled,
        sessionBadges,
        sessionActions,
      };
    });
  }, [
    currentDay,
    currentDaySummary,
    entries,
    entriesByDay,
    isEnrolled,
    multiSessionPlan,
    plan,
    progress,
    visibleDayNumbers,
  ]);

  const renderDayRow = useCallback(
    ({ item }: { item: PlanDayViewModel }) => (
      <DayRow
        dayNumber={item.dayNumber}
        dateLabel={item.dateLabel}
        entries={item.entries}
        launchSessionKey={item.launchSessionKey}
        isCompleted={item.isCompleted}
        isCurrent={item.isCurrent}
        sessionBadges={item.sessionBadges}
        sessionActions={item.sessionActions}
        onPress={handleOpenChapter}
      />
    ),
    [handleOpenChapter]
  );

  const keyExtractorDay = useCallback((item: PlanDayViewModel) => String(item.dayNumber), []);

  const renderDaySeparator = useCallback(() => <View style={styles.daySeparator} />, []);

  const listHeader = (
    <View>
      {/* ------------------------------------------------------------------ */}
      {/* Cover image header                                                  */}
      {/* ------------------------------------------------------------------ */}
      <View style={styles.coverContainer}>
        {heroCoverSource ? (
          <Image
            source={heroCoverSource}
            style={styles.coverImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.coverImage, { backgroundColor: colors.accentSecondary }]}>
            <Ionicons name="book-outline" size={60} color={colors.secondaryText} />
          </View>
        )}

        {/* Gradient overlay at bottom of cover for readability */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.5)']}
          style={styles.coverGradient}
        />

        <View style={styles.coverTitleWrap}>
          <Text style={styles.coverTitle} numberOfLines={3}>
            {planTitle}
          </Text>
        </View>

        {/* Floating back button */}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[
            styles.floatingBack,
            {
              top: insets.top + spacing.sm,
              backgroundColor: 'rgba(0,0,0,0.4)',
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* CTA row: Start Plan                                                 */}
      {/* ------------------------------------------------------------------ */}
      {!isEnrolled ? (
        <View style={styles.ctaRow}>
          <TouchableOpacity
            onPress={handleStartPlan}
            disabled={enrolling}
            style={[styles.ctaPrimary, { backgroundColor: colors.accentPrimary }]}
            accessibilityRole="button"
            accessibilityLabel={t('readingPlans.startPlan')}
          >
            {enrolling ? (
              <ActivityIndicator size="small" color={colors.cardBackground} />
            ) : (
              <Text style={[styles.ctaPrimaryText, { color: colors.cardBackground }]}>
                {t('readingPlans.startPlan')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Plan description                                                    */}
      {/* ------------------------------------------------------------------ */}
      {plan?.description_key ? (
        <Text style={[styles.description, { color: colors.secondaryText }]}>
          {t(plan.description_key as Parameters<typeof t>[0], { defaultValue: plan.description_key })}
        </Text>
      ) : null}

      {/* Progress card (only if enrolled) */}
      {plan && isEnrolled ? (
        <View style={styles.headerProgressCardWrap}>
          <ProgressCard
            plan={plan}
            progress={progress}
            currentDaySummary={currentDaySummary}
          />
        </View>
      ) : null}
    </View>
  );

  const listFooter = (
    <View>
      {/* ------------------------------------------------------------------ */}
      {/* Related Plans                                                       */}
      {/* ------------------------------------------------------------------ */}
      {relatedPlans.length > 0 ? (
        <View style={styles.relatedSection}>
          <Text style={[styles.relatedTitle, { color: colors.primaryText }]}>
            {t('readingPlans.relatedPlans')}
          </Text>
          <FlatList
            data={relatedPlans}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.relatedList}
            ItemSeparatorComponent={() => <View style={styles.relatedSeparator} />}
            renderItem={({ item }) => (
              <RelatedPlanCard plan={item} onPress={handleRelatedPlanPress} />
            )}
          />
        </View>
      ) : null}

      {/* Bottom breathing room */}
      <View style={{ height: spacing.xxxl }} />
    </View>
  );

  if (loading) {
```

**Step B — replace the render return.** **Find** (the whole final return, from `  return (` after
the `error` early-return through the `}` closing the component):
```tsx
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ------------------------------------------------------------------ */}
        {/* Cover image header                                                  */}
        {/* ------------------------------------------------------------------ */}
        <View style={styles.coverContainer}>
          {heroCoverSource ? (
            <Image
              source={heroCoverSource}
              style={styles.coverImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.coverImage, { backgroundColor: colors.accentSecondary }]}>
              <Ionicons name="book-outline" size={60} color={colors.secondaryText} />
            </View>
          )}

          {/* Gradient overlay at bottom of cover for readability */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.5)']}
            style={styles.coverGradient}
          />

          <View style={styles.coverTitleWrap}>
            <Text style={styles.coverTitle} numberOfLines={3}>
              {planTitle}
            </Text>
          </View>

          {/* Floating back button */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[
              styles.floatingBack,
              {
                top: insets.top + spacing.sm,
                backgroundColor: 'rgba(0,0,0,0.4)',
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <Ionicons name="arrow-back" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* CTA row: Start Plan                                                 */}
        {/* ------------------------------------------------------------------ */}
        {!isEnrolled ? (
          <View style={styles.ctaRow}>
            <TouchableOpacity
              onPress={handleStartPlan}
              disabled={enrolling}
              style={[styles.ctaPrimary, { backgroundColor: colors.accentPrimary }]}
              accessibilityRole="button"
              accessibilityLabel={t('readingPlans.startPlan')}
            >
              {enrolling ? (
                <ActivityIndicator size="small" color={colors.cardBackground} />
              ) : (
                <Text style={[styles.ctaPrimaryText, { color: colors.cardBackground }]}>
                  {t('readingPlans.startPlan')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ------------------------------------------------------------------ */}
        {/* Plan description                                                    */}
        {/* ------------------------------------------------------------------ */}
        {plan?.description_key ? (
          <Text style={[styles.description, { color: colors.secondaryText }]}>
            {t(plan.description_key as Parameters<typeof t>[0], { defaultValue: plan.description_key })}
          </Text>
        ) : null}

        {/* ------------------------------------------------------------------ */}
        {/* Day list                                                            */}
        {/* ------------------------------------------------------------------ */}
        <View style={styles.dayListSection}>
          {/* Progress card (only if enrolled) */}
          {plan && isEnrolled ? (
            <ProgressCard
              plan={plan}
              progress={progress}
              currentDaySummary={currentDaySummary}
            />
          ) : null}

          {/* Day rows */}
          {visibleDayNumbers.map((dayNumber) => {
            const dayEntries = entriesByDay.get(dayNumber) ?? [];
            const daySessionGroups = multiSessionPlan ? getDaySessionEntries(entries, dayNumber) : [];
            const isCompleted = progress
              ? isRecurringPlan(plan)
                ? dayNumber === currentDay &&
                  Boolean(
                    (currentDaySummary?.dateKey &&
                      currentDaySummary.dateKey in progress.completed_entries) ||
                      currentDaySummary?.isComplete
                  )
                : String(dayNumber) in progress.completed_entries ||
                  (dayNumber === currentDay && Boolean(currentDaySummary?.isComplete))
              : false;
            const isCurrent = dayNumber === currentDay;
            const dateLabel =
              progress && !isRecurringPlan(plan)
                ? formatScheduledPlanDayLabel(progress.started_at, dayNumber)
                : null;
            const launchSessionKey = multiSessionPlan
              ? isCurrent && isEnrolled
                ? currentDaySummary?.nextIncompleteSessionKey ?? daySessionGroups[0]?.sessionKey
                : daySessionGroups[0]?.sessionKey
              : undefined;
            const sessionBadges = daySessionGroups.map((group) => {
              const matchingSummary =
                isCurrent && isEnrolled
                  ? currentDaySummary?.sessionSummaries.find(
                      (session) => session.sessionKey === group.sessionKey
                    ) ?? null
                  : null;
              const state =
                !isCurrent || !isEnrolled
                  ? 'available'
                  : matchingSummary?.isComplete
                    ? 'done'
                    : currentDaySummary?.nextIncompleteSessionKey === group.sessionKey
                      ? 'next'
                      : 'upcoming';

              return {
                label: group.title,
                state,
              } as const;
            });
            const sessionActions = daySessionGroups.map((group) => {
              const matchingSummary =
                isCurrent && isEnrolled
                  ? currentDaySummary?.sessionSummaries.find(
                      (session) => session.sessionKey === group.sessionKey
                    ) ?? null
                  : null;
              const state =
                !isCurrent || !isEnrolled
                  ? 'available'
                  : matchingSummary?.isComplete
                    ? 'done'
                    : currentDaySummary?.nextIncompleteSessionKey === group.sessionKey
                      ? 'next'
                      : 'upcoming';

              return {
                sessionKey: group.sessionKey,
                label: group.title,
                state,
              } as const;
            });
            return (
              <DayRow
                key={dayNumber}
                dayNumber={dayNumber}
                dateLabel={dateLabel}
                entries={dayEntries}
                launchSessionKey={launchSessionKey}
                isCompleted={isCompleted}
                isCurrent={isCurrent && isEnrolled}
                sessionBadges={sessionBadges}
                sessionActions={sessionActions}
                onPress={handleOpenChapter}
              />
            );
          })}
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* Related Plans                                                       */}
        {/* ------------------------------------------------------------------ */}
        {relatedPlans.length > 0 ? (
          <View style={styles.relatedSection}>
            <Text style={[styles.relatedTitle, { color: colors.primaryText }]}>
              {t('readingPlans.relatedPlans')}
            </Text>
            <FlatList
              data={relatedPlans}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.relatedList}
              ItemSeparatorComponent={() => <View style={styles.relatedSeparator} />}
              renderItem={({ item }) => (
                <RelatedPlanCard plan={item} onPress={handleRelatedPlanPress} />
              )}
            />
          </View>
        ) : null}

        {/* Bottom breathing room */}
        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}
```
**Replace with:**
```tsx
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlashList
        data={dayViewModels}
        renderItem={renderDayRow}
        keyExtractor={keyExtractorDay}
        ItemSeparatorComponent={renderDaySeparator}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerStyle={styles.dayListContent}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={96}
        extraData={colors}
      />
    </View>
  );
}
```

### Edit P4.6 — Swap `scroll`/`scrollContent`/`dayListSection` styles for FlashList-friendly ones
**Find:**
```tsx
  scroll: {
    flex: 1,
  },
  scrollContent: {
    // No horizontal padding here — cover image is edge-to-edge
  },
```
**Replace with:**
```tsx
  dayListContent: {
    // Horizontal padding applies to the virtualized day rows and the
    // header/footer content. Cover image overrides this with negative
    // margins so it stays edge-to-edge.
    paddingHorizontal: layout.screenPadding,
  },
```
**Find:**
```tsx
  // Day list section
  dayListSection: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
```
**Replace with:**
```tsx
  // Day list section
  daySeparator: {
    height: spacing.md,
  },
  headerProgressCardWrap: {
    paddingTop: spacing.sm,
    marginBottom: spacing.md,
  },
```

### Edit P4.7 — Correct padding for full-bleed/own-padded sections under the new content container
**Find:**
```tsx
  // Cover image
  coverContainer: {
    height: COVER_HEIGHT,
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
```
**Replace with:**
```tsx
  // Cover image
  coverContainer: {
    height: COVER_HEIGHT,
    marginHorizontal: -layout.screenPadding,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
```
**Find:**
```tsx
  // CTA row
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
  },
```
**Replace with:**
```tsx
  // CTA row
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingTop: spacing.lg,
  },
```
**Find:**
```tsx
  // Description
  description: {
    ...typography.body,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    paddingHorizontal: layout.screenPadding,
  },
```
**Replace with:**
```tsx
  // Description
  description: {
    ...typography.body,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
```
**Find:**
```tsx
  // Related plans
  relatedSection: {
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  relatedTitle: {
    ...typography.sectionTitle,
    paddingHorizontal: layout.screenPadding,
  },
  relatedList: {
    paddingHorizontal: layout.screenPadding,
  },
```
**Replace with:**
```tsx
  // Related plans
  relatedSection: {
    marginHorizontal: -layout.screenPadding,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  relatedTitle: {
    ...typography.sectionTitle,
    paddingHorizontal: layout.screenPadding,
  },
  relatedList: {
    paddingHorizontal: layout.screenPadding,
  },
```

### P4 acceptance
- [ ] `grep -c "ScrollView" src/screens/plans/PlanDetailScreen.tsx` → `0`
- [ ] `grep -n "<FlashList" src/screens/plans/PlanDetailScreen.tsx` → 1 match
- [ ] `grep -n "visibleDayNumbers.map((dayNumber) => {" src/screens/plans/PlanDetailScreen.tsx` → 1 match
- [ ] `grep -n "const DayRow = React.memo(function DayRow" src/screens/plans/PlanDetailScreen.tsx` → 1 match
- [ ] `grep -n "estimatedItemSize={96}" src/screens/plans/PlanDetailScreen.tsx` → 1 match
- [ ] `npm run typecheck` exits 0
- [ ] `node --test --import tsx src/screens/plans/planDetailSource.test.ts` exits 0 (if the runner differs, use the project's test command for that file)

---

# TASK P5 — FieldCard overdraw + native-driver glow

**Why:** Each Harvest "FieldCard" stacks ≥5 `LinearGradient` layers + 8 shadow-casting dots across
~5 cards in a horizontal scroll, and the current card runs an infinite `Animated.loop` with
`useNativeDriver: false` — bridging a value every frame forever while the Harvest hub is mounted.

**File:** `src/components/fourfields/FieldCard.tsx`

**Risk notes:** iOS keeps the gradient look; only Android swaps to a flat translucent fill via
`Platform.select`/`Platform.OS`. `progressAnim` is never bound to an animated style (only feeds a JS
calc), so native driver is safe. Adds a loop `stop()` cleanup. No new i18n/colors.

### Edit P5.1 — Import `Platform`
**Find:**
```tsx
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
```
**Replace with:**
```tsx
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
```

### Edit P5.2 — Mount spring + glow loop to native driver (+ cleanup)
**Find:**
```tsx
  useEffect(() => {
    // Animate progress on mount/change
    Animated.spring(progressAnim, {
      toValue: progress,
      useNativeDriver: false,
      tension: 40,
      friction: 8,
    }).start();

    // Pulse animation for current field
    if (isCurrent) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: false,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: false,
          }),
        ])
      ).start();
    }
  }, [glowAnim, isCurrent, progress, progressAnim]);
```
**Replace with:**
```tsx
  useEffect(() => {
    // Animate progress on mount/change. progressAnim drives only the JS-side
    // filledSegments calculation, never an animated style, so the native
    // driver is safe and avoids bridging a value the layout never reads.
    Animated.spring(progressAnim, {
      toValue: progress,
      useNativeDriver: true,
      tension: 40,
      friction: 8,
    }).start();

    // Pulse animation for current field — animates opacity only, so the
    // native driver keeps the loop off the JS thread for the lifetime of the
    // Harvest hub.
    if (isCurrent) {
      const glowLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      );
      glowLoop.start();
      return () => {
        glowLoop.stop();
      };
    }
  }, [glowAnim, isCurrent, progress, progressAnim]);
```

### Edit P5.3 — Android-flat glass overlay (iOS unchanged)
**Find:**
```tsx
          {/* Glassmorphism overlay */}
          <View style={styles.glassOverlay}>
            <LinearGradient
              colors={[
                'rgba(255,255,255,0.08)',
                'rgba(255,255,255,0.02)',
                'rgba(0,0,0,0.05)',
              ]}
              style={styles.glassGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
          </View>
```
**Replace with:**
```tsx
          {/* Glassmorphism overlay — iOS keeps the layered gradient; Android
              uses a single flat translucent fill to cut overdraw. */}
          {Platform.OS === 'android' ? (
            <View style={[styles.glassOverlay, styles.glassFlatAndroid]} />
          ) : (
            <View style={styles.glassOverlay}>
              <LinearGradient
                colors={[
                  'rgba(255,255,255,0.08)',
                  'rgba(255,255,255,0.02)',
                  'rgba(0,0,0,0.05)',
                ]}
                style={styles.glassGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
            </View>
          )}
```

### Edit P5.4 — Android-flat accent glow (iOS unchanged)
**Find:**
```tsx
          {/* Accent glow at top */}
          <View style={styles.accentGlowContainer}>
            <LinearGradient
              colors={[field.color + '40', field.color + '10', 'transparent']}
              style={styles.accentGlow}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
            />
          </View>
```
**Replace with:**
```tsx
          {/* Accent glow at top — iOS keeps the gradient; Android uses a
              single flat translucent tint to avoid stacked gradient layers. */}
          {Platform.OS === 'android' ? (
            <View
              style={[styles.accentGlowContainer, { backgroundColor: field.color + '14' }]}
            />
          ) : (
            <View style={styles.accentGlowContainer}>
              <LinearGradient
                colors={[field.color + '40', field.color + '10', 'transparent']}
                style={styles.accentGlow}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
              />
            </View>
          )}
```

### Edit P5.5 — Drop per-dot shadow props (state shown by color only)
**Find:**
```tsx
                    <View
                      style={[
                        styles.segmentDot,
                        {
                          backgroundColor: isFilled
                            ? isComplete
                              ? colors.success
                              : field.color
                            : colors.cardBorder,
                          shadowColor: isFilled ? field.color : 'transparent',
                          shadowOpacity: isFilled ? 0.8 : 0,
                          shadowRadius: isFilled ? 4 : 0,
                        },
                      ]}
                    />
```
**Replace with:**
```tsx
                    <View
                      style={[
                        styles.segmentDot,
                        {
                          backgroundColor: isFilled
                            ? isComplete
                              ? colors.success
                              : field.color
                            : colors.cardBorder,
                        },
                      ]}
                    />
```
**Find:**
```tsx
  segmentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
```
**Replace with:**
```tsx
  segmentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
```

### Edit P5.6 — Add the Android-only style key
**Find:**
```tsx
  glassGradient: {
    flex: 1,
  },
```
**Replace with:**
```tsx
  glassGradient: {
    flex: 1,
  },
  glassFlatAndroid: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
```

### P5 acceptance
- [ ] `grep -c "useNativeDriver: false" src/components/fourfields/FieldCard.tsx` → `0` (authoritative check)
- [ ] `grep -n "Platform.OS === 'android'" src/components/fourfields/FieldCard.tsx` → 2 matches
- [ ] `grep -c "shadowColor" src/components/fourfields/FieldCard.tsx` → `0`; same for `shadowOpacity`, `shadowRadius`, `shadowOffset`
- [ ] `grep -n "glowLoop.stop()" src/components/fourfields/FieldCard.tsx` → 1 match
- [ ] `npm run typecheck` exits 0

---

# TASK P1 — Kill the audio-position render storm in the Bible reader

**Why:** `useAudioPlayer` includes `currentPosition` in its selector; `audioStore.setPosition`
fires every ~250ms while playing, so every consumer re-renders 4–8×/sec. `BibleReaderScreen`
(~5,800 lines) is the worst, and its inline `renderItem`/`renderParagraph` (no `React.memo`) makes
every verse paragraph re-reconcile each tick. Fix = isolate live position into a leaf hook, memoize
`HighlightedVerseText`, and gate the paragraph cells with a `React.memo` block that re-renders only
when the paragraph, a non-position render-signature, or active-verse membership actually changes.

**Files:** `src/hooks/useAudioPosition.ts` (NEW), `src/hooks/index.ts`,
`src/components/bible/HighlightedVerseText.tsx`, `src/components/audio/AudioPlayerBar.tsx`,
`src/screens/bible/BibleReaderScreen.tsx`.

**Risk notes (important):**
- This is a behavior-preserving perf refactor. DO NOT change any follow-along math, the monotonic
  clamp refs (`lastFollowAlongVerseRef`, `previousFollowAlongPositionRef`,
  `previousFollowAlongTrackKeyRef`), `getEstimatedFollowAlongVerse`, scroll effects, or audio logic.
- There is already an `interface ReaderParagraph` (data type) — a test asserts it exists. DO NOT
  rename it. The new memo component is `ReaderParagraphBlock` (different name).
- DO NOT remove `currentPosition`/`duration` from `useAudioPlayer`. Only `AudioPlayerBar` switches
  its live-position read to the new leaf hook.
- This is the highest-value but most intricate task. After it, the live follow-along highlight MUST
  still work — that is verified on-device in the P2 smoke test.

### Edit P1.1 — Create the leaf position hook
**Create file:** `src/hooks/useAudioPosition.ts`
```tsx
import { useShallow } from 'zustand/react/shallow';
import { useAudioStore } from '../stores/audioStore';

/**
 * Leaf hook that subscribes ONLY to the live audio position fields.
 *
 * `audioStore.setPosition` fires every ~250ms while playing (interpolation tick)
 * plus on every real poll, so any component that needs the continuously-updating
 * position/duration (progress rings, scrubbers) should consume this hook in
 * isolation. Keeping it separate from `useAudioPlayer` means the broad set of
 * screens that consume `useAudioPlayer` for transport controls do not re-render
 * on every position tick.
 */
export function useAudioPosition() {
  return useAudioStore(
    useShallow((state) => ({
      currentPosition: state.currentPosition,
      duration: state.duration,
    }))
  );
}
```

### Edit P1.2 — Export it from the hooks barrel
**Find:**
```tsx
export { useAudioPlayer } from './useAudioPlayer';
```
**Replace with:**
```tsx
export { useAudioPlayer } from './useAudioPlayer';
export { useAudioPosition } from './useAudioPosition';
```
> If that exact line is NOT in `src/hooks/index.ts`, STOP and report the file's actual contents.

### Edit P1.3 — Memoize `HighlightedVerseText`
**Find:**
```tsx
import { useState } from 'react';
```
**Replace with:**
```tsx
import { memo, useState } from 'react';
```
**Find:**
```tsx
export function HighlightedVerseText({
  verseNumber,
  verseText,
  verseTextStyle,
  verseNumberStyle,
  selectedStyle,
  highlightColor,
  onPress,
}: HighlightedVerseTextProps) {
```
**Replace with:**
```tsx
function HighlightedVerseTextComponent({
  verseNumber,
  verseText,
  verseTextStyle,
  verseNumberStyle,
  selectedStyle,
  highlightColor,
  onPress,
}: HighlightedVerseTextProps) {
```
**Find** (component close immediately before its StyleSheet):
```tsx
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  highlightVerse: {
```
**Replace with:**
```tsx
      )}
    </Pressable>
  );
}

export const HighlightedVerseText = memo(HighlightedVerseTextComponent);

const styles = StyleSheet.create({
  highlightVerse: {
```

### Edit P1.4 — Route `AudioPlayerBar` live position through the leaf hook
**Find:**
```tsx
import { useTheme } from '../../contexts/ThemeContext';
import { useAudioPlayer } from '../../hooks';
import { getBookById } from '../../constants';
```
**Replace with:**
```tsx
import { useTheme } from '../../contexts/ThemeContext';
import { useAudioPlayer, useAudioPosition } from '../../hooks';
import { getBookById } from '../../constants';
```
**Find:**
```tsx
  const {
    status,
    currentTranslationId,
    currentBookId,
    currentChapter,
    currentPosition,
    duration,
    error,
    playbackRate,
    repeatMode,
    sleepTimerRemaining,
    backgroundMusicChoice,
    playChapter,
    togglePlayPause,
    previousChapter,
    nextChapter,
    seekTo,
    skipBackward,
    skipForward,
    changePlaybackRate,
    cycleRepeatMode,
    startSleepTimer,
    changeBackgroundMusicChoice,
    setShowPlayer,
  } = useAudioPlayer(currentTranslation);
```
**Replace with:**
```tsx
  const {
    status,
    currentTranslationId,
    currentBookId,
    currentChapter,
    error,
    playbackRate,
    repeatMode,
    sleepTimerRemaining,
    backgroundMusicChoice,
    playChapter,
    togglePlayPause,
    previousChapter,
    nextChapter,
    seekTo,
    skipBackward,
    skipForward,
    changePlaybackRate,
    cycleRepeatMode,
    startSleepTimer,
    changeBackgroundMusicChoice,
    setShowPlayer,
  } = useAudioPlayer(currentTranslation);
  const { currentPosition, duration } = useAudioPosition();
```

### Edit P1.5a — `BibleReaderScreen.tsx`: add `memo` + `ReactElement` to imports
**Find:**
```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
```
**Replace with:**
```tsx
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ReactElement } from 'react';
```

### Edit P1.5b — Insert the module-scope memoized paragraph cell
Insert immediately AFTER the `buildReaderParagraphs` function (it ends with the unique
`  return paragraphs;` followed by `}`). This `return paragraphs;` occurs exactly once in the file.
**Find:**
```tsx
  return paragraphs;
}
```
**Replace with:**
```tsx
  return paragraphs;
}

interface ReaderParagraphBlockProps {
  paragraph: ReaderParagraph;
  index: number;
  /**
   * A render signature that changes whenever anything affecting this paragraph's
   * visual output changes EXCEPT the raw audio position (theme/fontsize/selection
   * version, etc.), plus the active follow-along verse. This lets the cell skip
   * re-rendering on the ~250ms position ticks that do not move the highlight.
   */
  renderSignature: string;
  activeVerse: number | null;
  renderParagraphRef: RefObject<(paragraph: ReaderParagraph, index: number) => ReactElement>;
}

function readerParagraphBlockPropsAreEqual(
  prev: ReaderParagraphBlockProps,
  next: ReaderParagraphBlockProps
): boolean {
  if (
    prev.paragraph !== next.paragraph ||
    prev.index !== next.index ||
    prev.renderSignature !== next.renderSignature
  ) {
    return false;
  }

  // Only the paragraph that gains or loses the active verse must re-render.
  const prevHasActive =
    prev.activeVerse != null && prev.paragraph.verses.some((v) => v.verse === prev.activeVerse);
  const nextHasActive =
    next.activeVerse != null && next.paragraph.verses.some((v) => v.verse === next.activeVerse);
  return prevHasActive === nextHasActive;
}

const ReaderParagraphBlock = memo(function ReaderParagraphBlock({
  paragraph,
  index,
  renderParagraphRef,
}: ReaderParagraphBlockProps) {
  // The render closure is read from a ref so prop identity stays stable across
  // position ticks; the comparator above gates actual re-renders.
  return renderParagraphRef.current(paragraph, index);
}, readerParagraphBlockPropsAreEqual);
```

### Edit P1.5c — Add the screen-scope ref to the latest render closure
**Find:**
```tsx
  const verseOffsetsRef = useRef<Record<number, number>>({});
```
**Replace with:**
```tsx
  const verseOffsetsRef = useRef<Record<number, number>>({});
  const renderParagraphRef =
    useRef<(paragraph: ReaderParagraph, index: number) => ReactElement>(() => null as never);
```

### Edit P1.5d — Annotate `renderParagraph`'s return type
**Find:**
```tsx
    const renderParagraph = (paragraph: ReaderParagraph, _pIndex: number) => (
          <View
            key={paragraph.key}
```
**Replace with:**
```tsx
    const renderParagraph = (paragraph: ReaderParagraph, _pIndex: number): ReactElement => (
          <View
            key={paragraph.key}
```

### Edit P1.5e — Wire both render paths to the memoized cell
**Find:**
```tsx
          </View>
    );

    if (renderVirtualized) {
      return (
        <Animated.FlatList
          ref={premiumReaderListRef}
          data={paragraphs}
          keyExtractor={(paragraph) => paragraph.key}
          renderItem={({ item, index }) => renderParagraph(item, index)}
```
**Replace with:**
```tsx
          </View>
    );

    renderParagraphRef.current = renderParagraph;
    // Signature of every non-position input that affects paragraph output. When
    // this changes we let memoized cells re-render; raw position ticks are absent
    // here, so ticks alone never invalidate cells.
    const paragraphRenderSignature = [
      usePremiumTypography ? '1' : '0',
      verseFontSize,
      verseLineHeight,
      verseNumberSize,
      headingFontSize,
      colors.biblePrimaryText,
      colors.bibleAccent,
      selectedVerseSet.size,
      annotations.length,
    ].join('|');
    const renderParagraphBlock = ({
      item,
      index,
    }: {
      item: ReaderParagraph;
      index: number;
    }): ReactElement => (
      <ReaderParagraphBlock
        paragraph={item}
        index={index}
        renderSignature={paragraphRenderSignature}
        activeVerse={readerInlineActiveVerse}
        renderParagraphRef={renderParagraphRef}
      />
    );

    if (renderVirtualized) {
      return (
        <Animated.FlatList
          ref={premiumReaderListRef}
          data={paragraphs}
          keyExtractor={(paragraph) => paragraph.key}
          renderItem={renderParagraphBlock}
```
**Find:**
```tsx
      <View style={[styles.readerColumn, usePremiumTypography ? styles.premiumReaderColumn : null]}>
        {paragraphs.map((paragraph, pIndex) => renderParagraph(paragraph, pIndex))}
      </View>
```
**Replace with:**
```tsx
      <View style={[styles.readerColumn, usePremiumTypography ? styles.premiumReaderColumn : null]}>
        {paragraphs.map((paragraph, pIndex) => (
          <ReaderParagraphBlock
            key={paragraph.key}
            paragraph={paragraph}
            index={pIndex}
            renderSignature={paragraphRenderSignature}
            activeVerse={readerInlineActiveVerse}
            renderParagraphRef={renderParagraphRef}
          />
        ))}
      </View>
```
> If `npm run typecheck` reports that any of `usePremiumTypography`, `verseFontSize`,
> `verseLineHeight`, `verseNumberSize`, `headingFontSize`, `colors.biblePrimaryText`,
> `colors.bibleAccent`, `selectedVerseSet`, `annotations`, or `readerInlineActiveVerse` is not in
> scope at the signature site, STOP and report — do not invent replacements. (They were confirmed in
> scope during spec authoring; a type error here means an earlier edit drifted.)

### P1 acceptance
- [ ] `test -f src/hooks/useAudioPosition.ts && grep -n "export function useAudioPosition" src/hooks/useAudioPosition.ts` → match
- [ ] `grep -n "useAudioPosition" src/hooks/index.ts` → match
- [ ] `grep -n "export const HighlightedVerseText = memo(HighlightedVerseTextComponent)" src/components/bible/HighlightedVerseText.tsx` → match
- [ ] `grep -n "const { currentPosition, duration } = useAudioPosition();" src/components/audio/AudioPlayerBar.tsx` → match
- [ ] `grep -n "const ReaderParagraphBlock = memo(" src/screens/bible/BibleReaderScreen.tsx` → match
- [ ] `grep -c "renderParagraphRef={renderParagraphRef}" src/screens/bible/BibleReaderScreen.tsx` → `2` (both render paths)
- [ ] `grep -n "renderItem={renderParagraphBlock}" src/screens/bible/BibleReaderScreen.tsx` → match (no inline arrow remains)
- [ ] `grep -n "interface ReaderParagraph {" src/screens/bible/BibleReaderScreen.tsx` → still present (untouched)
- [ ] `npm run typecheck` exits 0 · `npm run lint` exits 0
- [ ] Run the reader/audio source tests (they must stay green): `node --test src/screens/bible/bibleReaderChromeSource.test.ts` (use the project's runner if different)

---

# TASK P3 — Move the scroll-collapse chrome off the JS thread (do AFTER P1)

**Why:** `ReaderPlaybackDock` receives the React `useState` number (not the SharedValue), so its
worklets only update on re-render — and the scroll handler `setReaderBottomChromeProgress` fires
~50×/collapse, plus `setOptions`/`setParams`/`LayoutAnimation` fire per ~0.02 step (tens of tab
reconciliations/collapse). Drive the dock from the existing `readerBottomChromeProgressShared`
SharedValue on the UI thread; delete the per-step state path; gate the tab-bar sync to the discrete
collapsed↔expanded flip.

**Files:** `src/components/audio/ReaderPlaybackDock.tsx`, `src/screens/bible/BibleReaderScreen.tsx`,
`src/components/audio/readerPlaybackDockSource.test.ts`, `src/screens/bible/bibleReaderChromeSource.test.ts`.

**Risk notes:** Do NOT touch the P1 region (hook/destructure, `renderParagraph`, verse FlatList
`renderItem`, `HighlightedVerseText`). Keep the `isCollapsed` boolean prop and
`isReadBottomChromeCollapsed` state (genuine discrete value driving `pointerEvents`). Do NOT remove
the `useState` import from BibleReaderScreen (other `useState` calls remain). **Safety net:** once
the dock prop becomes `SharedValue<number>`, any worklet `collapseProgress` reference you forget to
change to `collapseProgress.value` is a TYPE ERROR — `npm run typecheck` will catch it.

### Edit P3.1 — ReaderPlaybackDock: import `SharedValue` type
**Find:**
```tsx
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
```
**Replace with:**
```tsx
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
```

### Edit P3.2 — ReaderPlaybackDock: prop type
**Find:**
```tsx
interface ReaderPlaybackDockProps {
  collapseProgress: number;
```
**Replace with:**
```tsx
interface ReaderPlaybackDockProps {
  collapseProgress: SharedValue<number>;
```

### Edit P3.3 — ReaderPlaybackDock: left worklet reads `.value`
**Find:**
```tsx
  const leftTransportAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(collapseProgress, [0, 0.72, 1], [1, 0.18, 0], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(collapseProgress, [0, 1], [1, 0.82], Extrapolation.CLAMP),
      },
      {
        translateY: interpolate(collapseProgress, [0, 1], [0, 34], Extrapolation.CLAMP),
      },
    ],
  }));
```
**Replace with:**
```tsx
  const leftTransportAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(collapseProgress.value, [0, 0.72, 1], [1, 0.18, 0], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(collapseProgress.value, [0, 1], [1, 0.82], Extrapolation.CLAMP),
      },
      {
        translateY: interpolate(collapseProgress.value, [0, 1], [0, 34], Extrapolation.CLAMP),
      },
    ],
  }));
```

### Edit P3.4 — ReaderPlaybackDock: right worklet reads `.value`
**Find:**
```tsx
  const rightTransportAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(collapseProgress, [0, 0.72, 1], [1, 0.18, 0], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(collapseProgress, [0, 1], [1, 0.82], Extrapolation.CLAMP),
      },
      {
        translateY: interpolate(collapseProgress, [0, 1], [0, 34], Extrapolation.CLAMP),
      },
    ],
  }));
```
**Replace with:**
```tsx
  const rightTransportAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(collapseProgress.value, [0, 0.72, 1], [1, 0.18, 0], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(collapseProgress.value, [0, 1], [1, 0.82], Extrapolation.CLAMP),
      },
      {
        translateY: interpolate(collapseProgress.value, [0, 1], [0, 34], Extrapolation.CLAMP),
      },
    ],
  }));
```

### Edit P3.5 — ReaderPlaybackDock: center worklet reads `.value`
**Find:**
```tsx
  const centerTransportAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(collapseProgress, [0, 1], [0, 12], Extrapolation.CLAMP),
      },
      {
        scale: interpolate(collapseProgress, [0, 1], [1, 1.02], Extrapolation.CLAMP),
      },
    ],
  }));
```
**Replace with:**
```tsx
  const centerTransportAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(collapseProgress.value, [0, 1], [0, 12], Extrapolation.CLAMP),
      },
      {
        scale: interpolate(collapseProgress.value, [0, 1], [1, 1.02], Extrapolation.CLAMP),
      },
    ],
  }));
```
> After P3.3–P3.5, `grep -c "collapseProgress.value" src/components/audio/ReaderPlaybackDock.tsx`
> MUST equal `8`. If `npm run typecheck` still flags a bare `collapseProgress` used in `interpolate`,
> there is another worklet — change it the same way (`collapseProgress` → `collapseProgress.value`).

### Edit P3.6 — BibleReaderScreen: delete the dock-only number state + gating ref
**Find:**
```tsx
  const [readerBottomChromeProgress, setReaderBottomChromeProgress] = useState(0);
  const [isReadBottomChromeCollapsed, setIsReadBottomChromeCollapsed] = useState(false);
  const chapterLoadRequestIdRef = useRef(0);
  const annotationLoadRequestIdRef = useRef(0);
  const lastStableSessionModeRef = useRef(chapterSessionMode);
  const readerBottomChromeProgressRef = useRef(0);
  const readerBottomChromeCollapsedRef = useRef(false);
```
**Replace with:**
```tsx
  const [isReadBottomChromeCollapsed, setIsReadBottomChromeCollapsed] = useState(false);
  const chapterLoadRequestIdRef = useRef(0);
  const annotationLoadRequestIdRef = useRef(0);
  const lastStableSessionModeRef = useRef(chapterSessionMode);
  const readerBottomChromeCollapsedRef = useRef(false);
```

### Edit P3.7 — BibleReaderScreen: remove per-step state write in `updateReaderBottomChromeState`
**Find:**
```tsx
      const shouldRevealReaderDock = isAtBottom || readerRevealTabBarOnUpScrollRef.current;
      const nextProgress =
        showPremiumReadMode && !shouldRevealReaderDock
          ? getReaderChromeAnimationProgress(offsetY, READER_BOTTOM_CHROME_COLLAPSE_DISTANCE)
          : 0;
      if (
        Math.abs(nextProgress - readerBottomChromeProgressRef.current) >= 0.02 ||
        (nextProgress === 0 && readerBottomChromeProgressRef.current !== 0) ||
        (nextProgress === 1 && readerBottomChromeProgressRef.current !== 1)
      ) {
        readerBottomChromeProgressRef.current = nextProgress;
        setReaderBottomChromeProgress(nextProgress);
      }
      readerBottomChromeProgressShared.value = nextProgress;

      const nextCollapsed =
        showPremiumReadMode && !shouldRevealReaderDock && isReaderChromeCollapsed(offsetY);
      if (nextCollapsed !== readerBottomChromeCollapsedRef.current) {
        readerBottomChromeCollapsedRef.current = nextCollapsed;
        setIsReadBottomChromeCollapsed(nextCollapsed);
      }
```
**Replace with:**
```tsx
      const shouldRevealReaderDock = isAtBottom || readerRevealTabBarOnUpScrollRef.current;
      const nextProgress =
        showPremiumReadMode && !shouldRevealReaderDock
          ? getReaderChromeAnimationProgress(offsetY, READER_BOTTOM_CHROME_COLLAPSE_DISTANCE)
          : 0;
      readerBottomChromeProgressShared.value = nextProgress;

      const nextCollapsed =
        showPremiumReadMode && !shouldRevealReaderDock && isReaderChromeCollapsed(offsetY);
      if (nextCollapsed !== readerBottomChromeCollapsedRef.current) {
        readerBottomChromeCollapsedRef.current = nextCollapsed;
        setIsReadBottomChromeCollapsed(nextCollapsed);
      }
```

### Edit P3.8 — BibleReaderScreen: gate tab-bar reconciliation to the collapsed↔expanded flip
**Find:**
```tsx
      const nextCollapsed =
        showPremiumReadMode && !shouldRevealReaderDock && isReaderChromeCollapsed(offsetY);
      if (nextCollapsed !== readerBottomChromeCollapsedRef.current) {
        readerBottomChromeCollapsedRef.current = nextCollapsed;
        setIsReadBottomChromeCollapsed(nextCollapsed);
      }

      if (shouldForceHideRootTabBar) {
        syncRootTabBarVisibility(false);
        syncRootTabBarCollapseProgress(1);
        return;
      }

      syncRootTabBarVisibility(true);
      syncRootTabBarCollapseProgress(
        showPremiumReadMode &&
          !shouldRevealReaderDock &&
          !readerRevealTabBarOnUpScrollRef.current &&
          offsetY > READER_TAB_BAR_RESTORE_TOP_THRESHOLD
          ? nextProgress
          : 0
      );
    },
```
**Replace with:**
```tsx
      const nextCollapsed =
        showPremiumReadMode && !shouldRevealReaderDock && isReaderChromeCollapsed(offsetY);
      const didCollapsedFlip = nextCollapsed !== readerBottomChromeCollapsedRef.current;
      if (didCollapsedFlip) {
        readerBottomChromeCollapsedRef.current = nextCollapsed;
        setIsReadBottomChromeCollapsed(nextCollapsed);
      }

      if (shouldForceHideRootTabBar) {
        syncRootTabBarVisibility(false);
        syncRootTabBarCollapseProgress(1);
        return;
      }

      const shouldCollapseRootTabBar =
        showPremiumReadMode &&
        !shouldRevealReaderDock &&
        !readerRevealTabBarOnUpScrollRef.current &&
        offsetY > READER_TAB_BAR_RESTORE_TOP_THRESHOLD &&
        nextCollapsed;
      const nextRootTabBarProgress = shouldCollapseRootTabBar ? 1 : 0;
      if (
        didCollapsedFlip ||
        nextRootTabBarProgress !== rootTabBarCollapseProgressRef.current
      ) {
        syncRootTabBarVisibility(true);
        syncRootTabBarCollapseProgress(nextRootTabBarProgress);
      }
    },
```

### Edit P3.9 — BibleReaderScreen: chapter-reset effect drops the removed state/ref
**Find:**
```tsx
    readerBottomChromeProgressRef.current = 0;
    readerBottomChromeCollapsedRef.current = false;
    rootTabBarCollapseProgressRef.current = 0;
    readerLastScrollOffsetYRef.current = 0;
    readerRevealTabBarOnUpScrollRef.current = false;
    readerBottomChromeProgressShared.value = 0;
    setReaderBottomChromeProgress(0);
    setIsReadBottomChromeCollapsed(false);
```
**Replace with:**
```tsx
    readerBottomChromeCollapsedRef.current = false;
    rootTabBarCollapseProgressRef.current = 0;
    readerLastScrollOffsetYRef.current = 0;
    readerRevealTabBarOnUpScrollRef.current = false;
    readerBottomChromeProgressShared.value = 0;
    setIsReadBottomChromeCollapsed(false);
```

### Edit P3.10 — BibleReaderScreen: pass the SharedValue to the dock
**Find:**
```tsx
            <ReaderPlaybackDock
              collapseProgress={readerBottomChromeProgress}
              isCollapsed={isReadBottomChromeCollapsed}
```
**Replace with:**
```tsx
            <ReaderPlaybackDock
              collapseProgress={readerBottomChromeProgressShared}
              isCollapsed={isReadBottomChromeCollapsed}
```

### Edit P3.11 — Test: dock prop type assertion
**File:** `src/components/audio/readerPlaybackDockSource.test.ts`
**Find:**
```ts
  assert.match(
    source,
    /collapseProgress:\s*number;/,
    'ReaderPlaybackDock should accept the reader collapse progress from the premium scroll chrome'
  );
```
**Replace with:**
```ts
  assert.match(
    source,
    /collapseProgress:\s*SharedValue<number>;/,
    'ReaderPlaybackDock should accept the reader collapse progress as a SharedValue so the dock animates on the UI thread'
  );
```

### Edit P3.12 — Test: dock prop wiring assertion
**File:** `src/screens/bible/bibleReaderChromeSource.test.ts`
**Find:**
```ts
  assert.equal(
    source.includes('styles.floatingReaderChapterNavOverlay') &&
      source.includes('bottomDockAnimatedStyle') &&
      source.includes('translateY: interpolate(') &&
      source.includes('[layout.tabBarBaseHeight + spacing.xxl, safeInsets.bottom + spacing.xl]') &&
      source.includes('<ReaderPlaybackDock') &&
      source.includes('collapseProgress={readerBottomChromeProgress}') &&
      source.includes('isCollapsed={isReadBottomChromeCollapsed}') &&
      source.includes('onPlayPause={handlePlayDisplayedChapter}'),
    true,
    'BibleReaderScreen should pass the scroll-driven collapse state and chapter play action into ReaderPlaybackDock'
  );
```
**Replace with:**
```ts
  assert.equal(
    source.includes('styles.floatingReaderChapterNavOverlay') &&
      source.includes('bottomDockAnimatedStyle') &&
      source.includes('translateY: interpolate(') &&
      source.includes('<ReaderPlaybackDock') &&
      source.includes('collapseProgress={readerBottomChromeProgressShared}') &&
      source.includes('isCollapsed={isReadBottomChromeCollapsed}') &&
      source.includes('onPlayPause={handlePlayDisplayedChapter}'),
    true,
    'BibleReaderScreen should pass the shared collapse progress and chapter play action into ReaderPlaybackDock'
  );
```

### Edit P3.13 — Test: dock worklets now read `.value`
**File:** `src/screens/bible/bibleReaderChromeSource.test.ts`
**Find:**
```ts
  assert.match(
    source,
    /translateY:\s*interpolate\(collapseProgress,\s*\[0,\s*1\],\s*\[0,\s*34\]/,
    'ReaderPlaybackDock should push the side arrows farther downward as the reader chrome collapses'
  );

  assert.match(
    source,
    /translateY:\s*interpolate\(collapseProgress,\s*\[0,\s*1\],\s*\[0,\s*12\]/,
    'ReaderPlaybackDock should only nudge the center play button downward so it stays visible'
  );
```
**Replace with:**
```ts
  assert.match(
    source,
    /translateY:\s*interpolate\(collapseProgress\.value,\s*\[0,\s*1\],\s*\[0,\s*34\]/,
    'ReaderPlaybackDock should push the side arrows farther downward as the reader chrome collapses'
  );

  assert.match(
    source,
    /translateY:\s*interpolate\(collapseProgress\.value,\s*\[0,\s*1\],\s*\[0,\s*12\]/,
    'ReaderPlaybackDock should only nudge the center play button downward so it stays visible'
  );
```

### P3 acceptance
- [ ] `grep -c "setReaderBottomChromeProgress" src/screens/bible/BibleReaderScreen.tsx` → `0`
- [ ] `grep -c "readerBottomChromeProgressRef" src/screens/bible/BibleReaderScreen.tsx` → `0`
- [ ] `grep -n "collapseProgress={readerBottomChromeProgressShared}" src/screens/bible/BibleReaderScreen.tsx` → 1 match
- [ ] `grep -c "collapseProgress.value" src/components/audio/ReaderPlaybackDock.tsx` → `8`
- [ ] `grep -n "collapseProgress: SharedValue<number>;" src/components/audio/ReaderPlaybackDock.tsx` → 1 match
- [ ] `grep -n "isReadBottomChromeCollapsed" src/screens/bible/BibleReaderScreen.tsx` → still present (3 matches)
- [ ] `npm run typecheck` exits 0
- [ ] `node --test src/components/audio/readerPlaybackDockSource.test.ts src/screens/bible/bibleReaderChromeSource.test.ts` passes

---

# TASK P6 — Animate transform, not layout `bottom` (do AFTER P3)

**Why:** `bottomDockAnimatedStyle` interpolates the `bottom` LAYOUT property (forces a Yoga layout
pass each frame on old arch). A `translateY` transform is already applied alongside it, so the
`bottom` shift is redundant — express the entire motion as a transform, set the base `bottom` once.

**Files:** `src/screens/bible/BibleReaderScreen.tsx`, `src/screens/bible/bibleReaderChromeSource.test.ts`.

**Risk notes:** Geometry must be preserved exactly. Confirmed constants: `layout.tabBarBaseHeight=52`,
`spacing.xxl=32`, `spacing.xl=24`, `spacing.xs=4`. New static base bottom = `84`; collapsed
translateY = `84 - (safeInsets.bottom + 24) + 4`. `safeInsets`, `layout`, `spacing` are in scope at
both sites. Do NOT touch `topChromeAnimatedStyle` or other animated styles.

### Edit P6.1 — Replace the animated `bottom` with a transform-only worklet
**Find:**
```tsx
  const bottomDockAnimatedStyle = useAnimatedStyle(() => ({
    bottom: interpolate(
      readerBottomChromeProgressShared.value,
      [0, 1],
      [layout.tabBarBaseHeight + spacing.xxl, safeInsets.bottom + spacing.xl],
      Extrapolation.CLAMP
    ),
    transform: [
      {
        translateY: interpolate(
          readerBottomChromeProgressShared.value,
          [0, 1],
          [0, spacing.xs],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));
```
**Replace with:**
```tsx
  const readerDockBaseBottom = layout.tabBarBaseHeight + spacing.xxl;
  const readerDockCollapsedTranslateY =
    readerDockBaseBottom - (safeInsets.bottom + spacing.xl) + spacing.xs;
  const bottomDockAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          readerBottomChromeProgressShared.value,
          [0, 1],
          [0, readerDockCollapsedTranslateY],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));
```

### Edit P6.2 — Apply the static base bottom at the overlay render site
**Find:**
```tsx
          <Animated.View
            pointerEvents="box-none"
            style={[styles.floatingReaderChapterNavOverlay, bottomDockAnimatedStyle]}
          >
```
**Replace with:**
```tsx
          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.floatingReaderChapterNavOverlay,
              { bottom: readerDockBaseBottom },
              bottomDockAnimatedStyle,
            ]}
          >
```

### Edit P6.3 — Test: assert transform-only bottom dock
**File:** `src/screens/bible/bibleReaderChromeSource.test.ts`
**Find:**
```ts
  assert.match(
    source,
    /const bottomDockAnimatedStyle = useAnimatedStyle\(\(\) => \(\{[\s\S]*bottom:\s*interpolate\(/s,
    'BibleReaderScreen should animate the bottom dock between the visible tab bar and the collapsed no-tab state'
  );
```
**Replace with:**
```ts
  assert.match(
    source,
    /const bottomDockAnimatedStyle = useAnimatedStyle\(\(\) => \(\{[\s\S]*transform:\s*\[[\s\S]*translateY:\s*interpolate\(/s,
    'BibleReaderScreen should animate the bottom dock with a translateY transform so no layout bottom reflows each frame'
  );

  assert.doesNotMatch(
    source,
    /const bottomDockAnimatedStyle = useAnimatedStyle\(\(\) => \(\{[\s\S]*bottom:\s*interpolate\(/s,
    'BibleReaderScreen should not interpolate the layout bottom property of the dock'
  );
```

### P6 acceptance
- [ ] `grep -c "bottom: interpolate" src/screens/bible/BibleReaderScreen.tsx` → `0`
- [ ] `grep -c "readerDockBaseBottom" src/screens/bible/BibleReaderScreen.tsx` → `2`
- [ ] `grep -c "readerDockCollapsedTranslateY" src/screens/bible/BibleReaderScreen.tsx` → `2`
- [ ] `npm run typecheck` exits 0
- [ ] `node --test src/screens/bible/bibleReaderChromeSource.test.ts` passes

---

# TASK P2 — Enable Android R8/ProGuard + resource shrinking (do LAST)

**Why:** No `expo-build-properties` plugin → R8/ProGuard and `shrinkResources` default OFF, so the
production AAB ships unminified/untree-shaken (bigger install, slower class loading, more RAM).

**Files:** `package.json` (via install command), `app.json` (one new plugin entry).

**Risk notes:** Minification can strip reflection/JNI-used classes → a runtime
`ClassNotFoundException`/`NoSuchMethodError` that does NOT appear at build time. **Step P2.4 smoke
test is MANDATORY and STOP-ON-FAILURE.** Do NOT flip `newArchEnabled`. Do NOT create a committed
`android/app/proguard-rules.pro` — `android/` is gitignored & regenerated by prebuild, so rules MUST
be inline via `extraProguardRules`. EAS LOCAL builds only (never cloud — user is out of credits).

### Step P2.1 — Install the plugin
```bash
cd /Users/dev/Projects/EveryBible
npx expo install expo-build-properties
```
**Acceptance:** `grep -n "expo-build-properties" package.json` shows it under dependencies.

### Edit P2.2 — app.json: append the plugin (note: a comma is added after the google-signin entry)
**Find:**
```json
      "expo-image-picker",
      "expo-localization",
      "./plugins/withBrandedSplashAsset",
      "@react-native-google-signin/google-signin"
    ],
```
**Replace with:**
```json
      "expo-image-picker",
      "expo-localization",
      "./plugins/withBrandedSplashAsset",
      "@react-native-google-signin/google-signin",
      [
        "expo-build-properties",
        {
          "android": {
            "enableProguardInReleaseBuilds": true,
            "enableShrinkResourcesInReleaseBuilds": true,
            "hermesEnabled": true,
            "extraProguardRules": "# === EveryBible P2 keep rules (reflection/JNI-based libs) ===\n\n# react-native-reanimated\n-keep class com.swmansion.reanimated.** { *; }\n-keep class com.facebook.react.turbomodule.** { *; }\n\n# react-native-gesture-handler\n-keep class com.swmansion.gesturehandler.** { *; }\n\n# react-native-svg\n-keep public class com.horcrux.svg.** { *; }\n\n# react-native-mmkv\n-keep class com.tencent.mmkv.** { *; }\n-keep class com.reactnativemmkv.** { *; }\n\n# @shopify/flash-list\n-keep class com.shopify.reactnative.flash_list.** { *; }\n\n# react-native-screens\n-keep class com.swmansion.rnscreens.** { *; }\n\n# react-native-video-trim\n-keep class com.reactnativevideotrim.** { *; }\n\n# react-native-view-shot\n-keep class fr.greweb.reactnativeviewshot.** { *; }\n\n# @react-native-google-signin/google-signin (Google Play Services reflection)\n-keep class com.google.android.gms.** { *; }\n-dontwarn com.google.android.gms.**\n-keep class com.google.android.libraries.** { *; }\n\n# expo-av / ExoPlayer media playback\n-keep class com.google.android.exoplayer2.** { *; }\n-dontwarn com.google.android.exoplayer2.**\n\n# expo-notifications\n-keep class expo.modules.notifications.** { *; }\n\n# @kesha-antonov/react-native-background-downloader\n-keep class com.eko.** { *; }\n\n# Hermes / React Native core JNI surfaces\n-keep class com.facebook.jni.** { *; }\n-keep class com.facebook.react.bridge.** { *; }\n-keep class com.facebook.hermes.** { *; }\n-keep class com.facebook.react.turbomodule.core.** { *; }\n\n# Expo modules core (autolinking + reflection)\n-keep class expo.modules.** { *; }\n-dontwarn expo.modules.**\n\n# OkHttp / Okio (used by Supabase fetch + networking) — suppress optional-dependency warnings\n-dontwarn okhttp3.**\n-dontwarn okio.**\n-dontwarn org.conscrypt.**\n\n# Keep annotations and signatures so reflection/generics survive\n-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod\n"
          }
        }
      ]
    ],
```
> The keep rules cover every reflection/JNI lib present in this repo's package.json. If the smoke
> test (P2.4) reveals a missing class, add `-keep class <that.package>.** { *; }` to this same
> `extraProguardRules` string and rebuild.

### Step P2.3 — Validate JSON
```bash
python3 -c "import json; json.load(open('app.json'))" && echo "app.json OK"
```

### Step P2.4 — REQUIRED smoke test (STOP ON FAILURE)
Minification failures only surface at runtime. If any crash appears, STOP and report.
```bash
cd /Users/dev/Projects/EveryBible
# 1) Local production AAB (LOCAL only — never cloud):
eas build --platform android --profile production --local
# (exit 0 + an .aab on disk is required; an R8 error here means a missing keep rule)

# 2) AAB -> universal APK -> install on a running device/emulator:
adb devices                                   # must show a "device" (not "offline")
AAB=$(ls -t /Users/dev/Projects/EveryBible/*.aab | head -1); echo "Using $AAB"
npx bundletool build-apks --bundle="$AAB" --output=/tmp/everybible-release.apks --mode=universal --overwrite
npx bundletool install-apks --apks=/tmp/everybible-release.apks
# (if npx bundletool is unavailable: `brew install bundletool` then drop the `npx`)

# 3) Launch + watch for minification crashes:
adb logcat -c
adb shell monkey -p com.everybible.app -c android.intent.category.LAUNCHER 1
adb logcat | grep -iE "AndroidRuntime|ClassNotFound|NoSuchMethod"
```
Then manually exercise (each touches a keep-ruled lib): open a Bible chapter and scroll
(FlashList + Reanimated), play chapter audio (ExoPlayer), download a chapter (background-downloader),
tap Google sign-in (Play Services), open a screen with SVG icons (react-native-svg). This pass also
validates P1 (follow-along highlight while playing), P3/P6 (scroll-collapse feel), P4 (plan scroll),
and P5 (Harvest cards).

**PASS:** cold-launches to home, all flows work, logcat shows NO `FATAL EXCEPTION`/
`ClassNotFoundException`/`NoSuchMethodError`.
**FAIL:** read the missing class from logcat, add a `-keep` rule to `extraProguardRules`, re-run from
build. Do NOT submit or mark P2 done on failure.

### P2 acceptance
- [ ] `grep -n "expo-build-properties" package.json` → under dependencies
- [ ] `grep -c "enableProguardInReleaseBuilds" app.json` → `1` (value `true`)
- [ ] `grep -c "enableShrinkResourcesInReleaseBuilds" app.json` → `1` (value `true`)
- [ ] `grep -c "extraProguardRules" app.json` → `1`
- [ ] `grep -c "newArchEnabled" app.json` → `1` and value still `false`
- [ ] `python3 -c "import json; json.load(open('app.json'))"` exits 0
- [ ] Release AAB installs, cold-launches, and the 5 smoke flows run with no minification crash

---

## FINAL VERIFICATION GATE (after all tasks)
```bash
cd /Users/dev/Projects/EveryBible
npm run typecheck
npm run lint
npm run test:release      # focused release regression suite
# Plus the per-task source tests already run above.
```
All must be green. Then the P2.4 on-device smoke pass is the behavioral sign-off for P1/P3/P4/P5/P6.

## Risk register (the two things a human must eyeball)
1. **P1 follow-along highlight** — the memoized paragraph cell skips re-renders on position ticks.
   Confirm on device that, during audio with follow-along, the highlighted verse still advances and
   that scrolling/selection/bookmarking still update visibly. (If a paragraph ever looks "stale,"
   the `paragraphRenderSignature` in P1.5e is missing an input — report it; do not guess.)
2. **P2 minification** — only the on-device smoke test proves no reflection class was stripped. Never
   ship the AAB if any flow crashes.
