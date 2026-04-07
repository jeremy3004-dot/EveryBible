# Phase 18: Reading Plans - Research

**Researched:** 2026-04-07
**Domain:** React Native / Expo — tab navigation, reading plan data seeding, segmented UI, Supabase schema migration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Tab Structure**
- Add a 5th "Plans" tab between the Gather (Learn) tab and the More tab
- Tab label: "Plans" (`tabs.plans` i18n key), icon: `calendar` / `calendar-outline` (Ionicons)
- Tab hosts a `PlansStack` navigator
- The existing `ReadingPlanListScreen` and `ReadingPlanDetailScreen` in `src/screens/learn/` need to be migrated into a new `src/screens/plans/` folder OR repurposed as the Plans tab root (prefer repurpose with minimal file movement — Claude's discretion)

**Plans Home Screen — 4-tab segmented control**
The Plans home screen has a segmented control at the top with 4 sections:
1. My Plans — enrolled plans with progress bar and cover image thumbnail; reading activity calendar strip below enrolled plans
2. Find Plans — discovery surface with featured hero card (big image + plan-length badge), topic category chips (Love, Healing, Hope, Anxiety, Anger, Depression...), horizontal filter pills (New, Relationships, Listen & Watch, etc.), sectioned plan lists by topic with "See All" links
3. Saved — plans the user has saved for later without enrolling
4. Completed — plans the user has finished

**Plan Detail Screen — enhanced from existing**
- Cover image header (full-width, similar height to YouVersion hero)
- Completion count label (e.g. "Over 5,000 completions")
- CTA row: "Start Plan" (primary), "Save For Later" (secondary), "Sample" (tertiary)
- Plan description text block
- "Related Plans" horizontal scroll at the bottom
- The existing day-list + mark-complete behavior is kept

**Save For Later Feature**
- New `user_saved_plans` Supabase table (user_id, plan_id, saved_at)
- Service functions: `savePlanForLater`, `unsavePlan`, `getSavedPlans`
- Saved plans appear in the "Saved" tab

**Reading Activity Calendar Integration**
- The existing `ReadingActivityScreen` calendar using `react-native-calendars` + `buildReadingActivityMonthView` already tracks daily reading
- In the "My Plans" tab, show a compact version of this calendar below the enrolled plans list to surface reading streaks
- This is additive — do not change the existing `ReadingActivityScreen` in More tab

**Data Schema Additions**
The existing `reading_plans` table needs these columns added (migration):
- `cover_image_url TEXT` — URL for plan cover art
- `featured BOOLEAN DEFAULT false` — marks plans shown in the Find Plans hero
- `completion_count INTEGER DEFAULT 0` — display-only completion counter

**Open-Source Reading Plan Data**
User explicitly wants to use open-source reading plans from GitHub rather than building from scratch. Seed the `reading_plans` + `reading_plan_entries` tables from JSON/CSV datasets.

**Navigation Migration**
- `ReadingPlanList` and `ReadingPlanDetail` routes currently live in `LearnStack` — remove from `LearnStack`
- "Reading Plans entry card" in `CourseListScreen` should cross-navigate to the Plans tab instead
- Plans tab needs its own `PlansStack` with: `PlansHome` (main screen) → `PlanDetail`

**i18n**
Add translation keys to all 4 language files (en, es, ne, hi):
- `tabs.plans`
- `readingPlans.myPlans`, `readingPlans.findPlans`, `readingPlans.saved`, `readingPlans.completed`
- `readingPlans.featuredPlan`, `readingPlans.relatedPlans`, `readingPlans.saveForLater`, `readingPlans.sample`
- `readingPlans.startPlan` already exists — keep
- `readingPlans.completions` (e.g. "Over 5,000 completions")

### Claude's Discretion
- Whether to move screen files to a new `src/screens/plans/` folder or keep in `src/screens/learn/` — prefer minimal file movement; reuse existing screens
- Exact Ionicons icon for Plans tab (calendar or bookmark-multiple or similar)
- Whether category chips in Find Plans use horizontal scroll or wrap grid
- Exact topic categories to seed (based on common Bible reading topics)
- Related Plans section: fetch by same category, limit 5

### Deferred Ideas (OUT OF SCOPE)
- Audio plans / "Listen & Watch" filter (can show but plans would just be reading-only for now)
- Star ratings / user reviews on plans
- Group assignment UI within Plans tab (group assignment service already exists but UI is deferred to Phase 22 Gather tab work)
- Push notification reminders for daily plan readings (Phase 31 push notification work)
- Plan author/publisher attribution
- Plan cover image upload admin UI (cover_image_url can be seeded manually for now)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ENG-01 | User can view daily reading activity and streak progress in a calendar surface backed by existing reading data | Calendar strip integration in My Plans tab reuses `buildReadingActivityMonthView` from `readingActivity.ts` — already proven in `ReadingActivityScreen` |
| GROUP-01 | User can create, join, and manage study groups without losing existing local progress | Group assignment service (`assignPlanToGroup`, `getGroupPlans`) already built in `readingPlanService.ts`; group plan UI deferred to Phase 22 per CONTEXT.md |
</phase_requirements>

---

## Summary

Phase 18 is primarily a **wiring and enrichment** phase, not a greenfield build. The service layer, Supabase tables, TypeScript types, and both existing screens (`ReadingPlanListScreen`, `ReadingPlanDetailScreen`) are fully functional. The work is: (1) promote plans to a dedicated 5th bottom tab with a new `PlansStack`, (2) build a new `PlansHomeScreen` with the 4-tab segmented control pattern, (3) enhance `ReadingPlanDetailScreen` with a cover-image hero, related-plans section, and Save For Later CTA, (4) add a Supabase migration for three new columns, (5) add a new `user_saved_plans` table and service functions, and (6) seed real reading plan entry data from open-source JSON datasets.

The biggest implementation effort is the `PlansHomeScreen` itself — four content sections (My Plans, Find Plans, Saved, Completed) that need data from multiple Supabase queries, a compact calendar strip reused from `ReadingActivityScreen`, and a hero card with category chip grid for the Find Plans surface. The segmented control is a simple custom implementation using `TouchableOpacity` rows and `useState` — no extra dependency needed.

Open-source reading plan entry data is available from `khornberg/readingplans` on GitHub (11 plans in JSON with `data2` arrays of string references like `"Genesis 1"` per day). A transformation script is required to map those book-name strings to the app's 3-letter book IDs (GEN, MAT, PSA, etc.) and produce SQL `INSERT INTO reading_plan_entries` rows.

**Primary recommendation:** Build in this order — (1) DB migration + user_saved_plans table, (2) service additions, (3) navigation wiring, (4) PlansHomeScreen skeleton + segmented control, (5) My Plans section with calendar strip, (6) Find Plans section with hero + chips, (7) Saved + Completed sections, (8) PlanDetail enhancements, (9) data seed script + SQL, (10) i18n keys.

---

## Standard Stack

### Core (already in project — no new installs)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `@react-navigation/bottom-tabs` | ^7.x | Bottom tab navigator for 5th tab | Already installed |
| `@react-navigation/native-stack` | ^7.x | `PlansStack` navigator | Already installed |
| `react-native-calendars` | installed | Calendar strip in My Plans section | Already installed (used in ReadingActivityScreen) |
| `@expo/vector-icons` (Ionicons) | SDK 54 | `calendar` / `calendar-outline` tab icon | Already installed |
| `react-i18next` | ^16.x | i18n keys for all new strings | Already installed |
| `@supabase/supabase-js` | ^2.91.0 | Supabase queries for saved plans, new columns | Already installed |

### New Dependencies
None. This phase requires zero new npm packages.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom segmented control (TouchableOpacity) | `@react-native-segmented-control/segmented-control` | Native iOS-only look; custom gives consistent cross-platform and no new dep |
| picsum.photos placeholder URLs | bundled color gradients | Placeholder image URLs are simpler than bundled assets; gradient fallback in Image `onError` is a good safety net |

---

## Architecture Patterns

### Recommended Project Structure Changes

```
src/
├── navigation/
│   ├── TabNavigator.tsx         # ADD Plans tab between Learn and More
│   ├── tabManifest.ts           # ADD Plans entry
│   ├── types.ts                 # ADD PlansStackParamList, RootTabParamList Plans entry
│   ├── tabBarVisibility.ts      # ADD PlanDetail to hidden-tab-bar routes
│   └── PlansStack.tsx           # NEW — PlansHome + PlanDetail routes
├── screens/
│   └── plans/                   # NEW folder (or keep in learn/ — Claude's discretion)
│       └── PlansHomeScreen.tsx  # NEW — 4-tab segmented home
│   └── learn/
│       ├── ReadingPlanListScreen.tsx   # KEEP or repurpose as PlansHome base
│       └── ReadingPlanDetailScreen.tsx # ENHANCE with cover hero + related plans + save
├── services/
│   └── plans/
│       └── readingPlanService.ts  # ADD savePlanForLater, unsavePlan, getSavedPlans
└── supabase/
    └── migrations/
        └── 20260407_reading_plans_v2.sql  # ADD cover_image_url, featured, completion_count + user_saved_plans
```

### Pattern 1: Adding a 5th Bottom Tab

The current `TabNavigator.tsx` has 4 tabs: Home, Bible, Learn, More. The `RootTabParamList` in `types.ts` drives the type system. Both files need updating together.

**Tab order in TabNavigator.tsx** (plans goes between Learn and More):
```typescript
// In TabNavigator.tsx — after the Learn tab, before More
<Tab.Screen
  name="Plans"
  component={PlansStack}
  options={{ tabBarLabel: t('tabs.plans') }}
/>
```

**types.ts** — add `PlansStackParamList` and extend `RootTabParamList`:
```typescript
// New stack
export type PlansStackParamList = {
  PlansHome: undefined;
  PlanDetail: { planId: string };
};

// Update RootTabParamList
export type RootTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Bible: NavigatorScreenParams<BibleStackParamList>;
  Learn: NavigatorScreenParams<LearnStackParamList>;
  Plans: NavigatorScreenParams<PlansStackParamList>; // NEW
  More: NavigatorScreenParams<MoreStackParamList>;
};
```

**tabManifest.ts** — add Plans entry (must match `name` in RootTabParamList):
```typescript
{
  name: 'Plans',
  labelKey: 'tabs.plans',
  focusedIcon: 'calendar',
  unfocusedIcon: 'calendar-outline',
},
```

**tabBarVisibility.ts** — hide tab bar on PlanDetail (full-screen detail):
```typescript
export function shouldHideTabBarOnNestedRoute(routeName?: string): boolean {
  return routeName === 'BiblePicker' || routeName === 'LessonDetail' || routeName === 'PlanDetail';
}
```

Also update the `shouldHideNestedBibleScreen` check in TabNavigator's `tabBarStyle` to include `'Plans'` in the route name check.

### Pattern 2: PlansStack Navigator

Create `src/navigation/PlansStack.tsx` following the exact same pattern as `LearnStack.tsx` (lazy `getComponent` pattern):

```typescript
// src/navigation/PlansStack.tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PlansStackParamList } from './types';
import { useTheme } from '../contexts/ThemeContext';

const Stack = createNativeStackNavigator<PlansStackParamList>();

export function PlansStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="PlansHome"
        getComponent={() => require('../screens/plans/PlansHomeScreen').PlansHomeScreen}
      />
      <Stack.Screen
        name="PlanDetail"
        getComponent={() => require('../screens/plans/PlanDetailScreen').PlanDetailScreen}
      />
    </Stack.Navigator>
  );
}
```

### Pattern 3: 4-Tab Segmented Control (No Extra Dependency)

Use a custom tab row with `TouchableOpacity` + `useState`. This matches the existing project pattern (no new dependencies). The existing `ReadingPlanListScreen` already uses a 2-section FlatList; the new `PlansHomeScreen` wraps content in a single FlatList or ScrollView with a pinned header row.

```typescript
// Minimal segmented control pattern used in this project
type PlanTab = 'my-plans' | 'find-plans' | 'saved' | 'completed';

const [activeTab, setActiveTab] = useState<PlanTab>('my-plans');

const tabs: { key: PlanTab; labelKey: string }[] = [
  { key: 'my-plans', labelKey: 'readingPlans.myPlans' },
  { key: 'find-plans', labelKey: 'readingPlans.findPlans' },
  { key: 'saved', labelKey: 'readingPlans.saved' },
  { key: 'completed', labelKey: 'readingPlans.completed' },
];

// Render as horizontal ScrollView row of TouchableOpacity pills
// Active tab: backgroundColor accentPrimary, text cardBackground
// Inactive: borderColor cardBorder, text secondaryText
```

### Pattern 4: LearnStack Migration

Remove the two ReadingPlan routes from `LearnStackParamList` and `LearnStack.tsx`. Update `CourseListScreen` to cross-navigate to the Plans tab:

```typescript
// In CourseListScreen.tsx — replace navigation.navigate('ReadingPlanList')
// with cross-tab navigation using rootNavigationRef
import { rootNavigationRef } from '../../navigation/rootNavigation';

// onPress handler:
rootNavigationRef.navigate('Plans', { screen: 'PlansHome' });
```

The `ReadingPlanDetailScreen` type declarations (`ReadingPlanListScreenProps`, `ReadingPlanDetailScreenProps`) in `types.ts` should be updated to reference `PlansStackParamList` instead of `LearnStackParamList`.

### Pattern 5: Compact Calendar Strip in My Plans

The `ReadingActivityScreen` uses `react-native-calendars` `<Calendar>` component with `buildReadingActivityMonthView`. For the compact strip in My Plans, use the **same data model** (`summarizeReadingActivity` from `readingActivity.ts`) but render a simpler 7-column row of day circles (current week only) or a month-grid compacted to 60–80px height. Do not import `Calendar` from `react-native-calendars` for the strip — build a lightweight custom strip to avoid the full calendar bundle cost in this context.

```typescript
// Compact streak strip approach:
// Show last 14 days as small dots (filled = has activity)
// Tap opens full ReadingActivity screen in More tab
const last14Days = Array.from({ length: 14 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (13 - i));
  return formatLocalDateKey(d);
});
```

### Anti-Patterns to Avoid

- **Do not re-implement `readingPlanService.ts`** — all existing service functions are correct. Only add the three new functions (`savePlanForLater`, `unsavePlan`, `getSavedPlans`).
- **Do not use navigation.goBack() for the Plans tab root** — `PlansHomeScreen` is a tab root, it has no back button. Remove the `backButton` pattern from the adopted `ReadingPlanListScreen` layout.
- **Do not hardcode category colors** — use `colors.accentPrimary`, `colors.accentSecondary`, etc. from `useTheme()`. Topic chip colors can use a small predefined palette array mapped by index.
- **Do not add a loading skeleton between tab switches** — switching between My Plans / Find Plans / Saved / Completed should be instant (data is loaded once on mount). Cache all four sections' data in state upfront.
- **Do not use `eas build` or cloud builds** — irrelevant to this phase (code only), but CLAUDE.md forbids cloud EAS builds.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reading activity calendar data | Custom date tracking | `summarizeReadingActivity` from `readingActivity.ts` | Already proven, tested, returns `daysByDateKey` map |
| Plan enrollment tracking | Custom enrollment table | Existing `user_reading_plan_progress` table + `enrollInPlan` | Already handles upsert, conflict, completion |
| Mark day complete | Custom day-tracking logic | Existing `markDayComplete` in `readingPlanService.ts` | Already merges entries, advances `current_day`, checks completion |
| Segmented tab control | Third-party package | Simple `TouchableOpacity` + `useState` | Zero dependencies, consistent with project style |
| Plan entry data transformation | Manual entry creation | Node.js seed script that fetches `khornberg/readingplans` JSON and maps book names to 3-letter IDs | Automated, reproducible, handles 365-day plans in seconds |

---

## Built vs Missing — Complete Inventory

### Already Built (Do Not Re-implement)

| Item | Location | State |
|------|----------|-------|
| `ReadingPlanListScreen` | `src/screens/learn/ReadingPlanListScreen.tsx` | Fully functional — 2-section FlatList (My Plans + Browse); progress bars; enroll CTA |
| `ReadingPlanDetailScreen` | `src/screens/learn/ReadingPlanDetailScreen.tsx` | Fully functional — progress ring, day list, mark-complete button, chapter navigation |
| `readingPlanService.ts` | `src/services/plans/readingPlanService.ts` | 9 functions: list, entries, enroll, markDayComplete, progress, unenroll, assignGroup, getGroupPlans, syncProgress |
| `reading_plans` table | migration `20260322140400` | Exists with: slug, title_key, description_key, duration_days, category, is_active, sort_order |
| `reading_plan_entries` table | migration `20260322140400` | Exists with: plan_id, day_number, book, chapter_start, chapter_end |
| `user_reading_plan_progress` table | migration `20260322140400` | Exists: user_id, plan_id, started_at, completed_entries (JSONB), current_day, is_completed |
| `group_reading_plans` table | migration `20260322140400` | Exists: group_id, plan_id, assigned_by |
| `ReadingPlan` TypeScript type | `src/services/supabase/types.ts` | Exists |
| `ReadingPlanEntry` TypeScript type | `src/services/supabase/types.ts` | Exists |
| `UserReadingPlanProgress` TypeScript type | `src/services/supabase/types.ts` | Exists |
| `GroupReadingPlan` TypeScript type | `src/services/supabase/types.ts` | Exists |
| `readingActivity.ts` | `src/services/progress/readingActivity.ts` | `summarizeReadingActivity`, `buildReadingActivityMonthView` |
| Plan metadata seed | migration `20260322140400` | 8 plans seeded (metadata only — NO entries) |
| i18n keys `readingPlans.*` | `src/i18n/locales/en.ts` | startPlan, enrolled, dayOf, markComplete, completed, progress, noPlans, noActivePlans, plus all plan title/description keys |

### Missing — Must Build in Phase 18

| Item | Type | Notes |
|------|------|-------|
| `user_saved_plans` Supabase table | DB migration | user_id, plan_id, saved_at; RLS own-only |
| `cover_image_url`, `featured`, `completion_count` columns | DB migration | ALTER TABLE reading_plans ADD COLUMN |
| `savePlanForLater`, `unsavePlan`, `getSavedPlans` | Service functions | Append to `readingPlanService.ts` |
| `UserSavedPlan` TypeScript type | Type | Add to `types.ts` |
| `PlansStack.tsx` | Navigation file | New stack navigator |
| `PlansStack` entry in `TabNavigator.tsx` | Navigation wire | 5th tab between Learn and More |
| `Plans` entry in `RootTabParamList` | Type update | `types.ts` |
| `PlansStackParamList` | Type | `PlansHome` + `PlanDetail` routes |
| Plans entry in `tabManifest.ts` | Navigation file | calendar / calendar-outline |
| `PlansHomeScreen.tsx` | New screen | 4-section segmented home; entirely new |
| `PlanDetailScreen.tsx` | New screen | Enhanced from existing `ReadingPlanDetailScreen` with cover hero, related plans, save CTA |
| Compact calendar strip component | Sub-component | Used in My Plans section; lightweight 14-day dot strip |
| Hero card component | Sub-component | Featured plan card for Find Plans |
| Category chip grid component | Sub-component | 6-8 topic chips in Find Plans |
| Remove `ReadingPlanList`/`ReadingPlanDetail` from `LearnStack` | Navigation change | Remove routes + update CourseListScreen cross-nav |
| Reading plan entry seed data | SQL migration or script | Transform khornberg/readingplans JSON → SQL inserts |
| i18n keys: `tabs.plans`, `readingPlans.findPlans`, `readingPlans.saved`, `readingPlans.completions`, `readingPlans.saveForLater`, `readingPlans.sample`, `readingPlans.featuredPlan`, `readingPlans.relatedPlans` | i18n | Add to en/es/ne/hi |

---

## Open-Source Reading Plan Data

### Source: khornberg/readingplans (GitHub)

**Confidence:** MEDIUM (structure confirmed via GitHub API + file inspection)

**URL:** https://github.com/khornberg/readingplans

**Available plans:**
- `mcheyne.json` — M'Cheyne 365-day plan, 4 readings per day (Gen + NT + Psalms/Proverbs tracks)
- `oneyearchronological.json` — One Year Chronological 365-day
- `backtothebiblechronological.json` — Back to the Bible Chronological
- `esvthroughthebible.json` — ESV Through the Bible (365-day)
- `heartlightotandnt.json` — Heartlight OT + NT
- `esveverydayinword.json` — ESV Everyday in the Word
- Several topical/focused plans (Gospels, Epistles, Psalms, etc.)

**JSON format per plan:**
```json
{
  "id": "mcheyne",
  "name": "M'Cheyne",
  "abbv": "m",
  "info": "...",
  "data": ["Genesis 1", "Matthew 1", ...],       // flat array
  "data2": [                                       // indexed by day
    ["Genesis 1", "Matthew 1", "Ezra 1", "Acts 1"],  // day 1
    ["Genesis 2", "Matthew 2", "Ezra 2", "Acts 2"],  // day 2
    ...
  ]
}
```

**Transformation needed:**
- Parse `data2[dayIndex]` as an array of strings like `"Genesis 1"` or `"Genesis 9-10"`
- Split on last space to get book name and chapter(s)
- Map book name → 3-letter app ID using a lookup table built from `src/constants/books.ts` (all 66 IDs confirmed, e.g. GEN, MAT, PSA, PRO, ACT)
- Parse chapter ranges: `"Genesis 9-10"` → `chapter_start: 9, chapter_end: 10`
- Output: `INSERT INTO reading_plan_entries (plan_id, day_number, book, chapter_start, chapter_end) VALUES ...`

**Recommended seed plans** (select 5-6 that match the 8 already-seeded plan slugs):

| App slug | khornberg file | Duration | Match |
|----------|----------------|----------|-------|
| `bible-in-1-year` | `esvthroughthebible.json` | 365 | Good match |
| `genesis-to-revelation-chronological` | `oneyearchronological.json` | 365 | Good match |
| `psalms-30-days` | Hand-build: PSA 1-5 per day, 30 days | 30 | Simple, hand-buildable |
| `proverbs-31-days` | Hand-build: PRO 1-31, 1 per day | 31 | Simple, hand-buildable |
| `sermon-on-the-mount-7-days` | Hand-build: MAT 5, 6, 7 across days | 7 | Simple, hand-buildable |
| `gospels-60-days` | Build: MAT 28 + MRK 16 + LUK 24 + JHN 21 = 89 chapters, ~1.5/day | 60 | Hand-buildable |
| `new-testament-90-days` | Build: 260 NT chapters / 90 = ~2.9/day | 90 | Hand-buildable |
| `epistles-30-days` | Build: ROM–JUD epistles = ~92 chapters / 30 ≈ 3/day | 30 | Hand-buildable |

**License note:** `khornberg/readingplans` has no explicit license in the repository. The underlying plans (M'Cheyne, ESV reading plans) are derived from public-domain or widely published plans. M'Cheyne's plan (1842) is in the public domain. The simple chronological chapter sequences are also facts (not copyrightable). LOW confidence on license compliance for ESV-branded plans — prefer to use M'Cheyne and the non-ESV plans, or hand-build entries directly from chapter counts.

**Recommendation:** Hand-build entry data for all 8 seeded plans as a SQL seed file. This avoids any license ambiguity, keeps the seed deterministic, and is straightforward since all plans follow simple sequential chapter patterns. The entry count across all 8 plans is approximately: 365 + 365 + 90 + 60 + 31 + 30 + 30 + 7 = ~978 rows — small enough for a single SQL file.

---

## Database Changes Required

### Migration 1: Add columns to `reading_plans`

```sql
ALTER TABLE reading_plans
  ADD COLUMN cover_image_url TEXT,
  ADD COLUMN featured BOOLEAN DEFAULT false,
  ADD COLUMN completion_count INTEGER DEFAULT 0;

-- Set featured for the first plan (hero in Find Plans)
UPDATE reading_plans SET featured = true WHERE slug = 'bible-in-1-year';
-- Seed cover image URLs (picsum.photos as placeholder, seeded by slug hash)
UPDATE reading_plans SET cover_image_url = 'https://picsum.photos/seed/bible1year/800/400' WHERE slug = 'bible-in-1-year';
-- (continue for each plan with unique seed)
```

### Migration 2: New `user_saved_plans` table

```sql
CREATE TABLE IF NOT EXISTS user_saved_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES reading_plans(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, plan_id)
);

CREATE INDEX idx_user_saved_plans_user ON user_saved_plans(user_id);

ALTER TABLE user_saved_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_plans_select_own" ON user_saved_plans
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

CREATE POLICY "saved_plans_insert_own" ON user_saved_plans
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "saved_plans_delete_own" ON user_saved_plans
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));
```

### TypeScript type additions

```typescript
// Add to src/services/supabase/types.ts
export interface ReadingPlan {
  // existing fields...
  cover_image_url: string | null;    // NEW
  featured: boolean;                  // NEW
  completion_count: number;           // NEW
}

export interface UserSavedPlan {     // NEW type
  id: string;
  user_id: string;
  plan_id: string;
  saved_at: string;
}
```

---

## Navigation Change Details

### Changes to `LearnStackParamList` in `types.ts`

Remove these two routes:
```typescript
// DELETE from LearnStackParamList:
ReadingPlanList: undefined;
ReadingPlanDetail: { planId: string };
```

Remove these two screen props helpers:
```typescript
// DELETE:
export type ReadingPlanListScreenProps = ...
export type ReadingPlanDetailScreenProps = ...
```

Add new types for PlansStack:
```typescript
export type PlansHomeScreenProps = NativeStackScreenProps<PlansStackParamList, 'PlansHome'>;
export type PlanDetailScreenProps = NativeStackScreenProps<PlansStackParamList, 'PlanDetail'>;
export type PlansTabProps = BottomTabScreenProps<RootTabParamList, 'Plans'>;
```

### Changes to `LearnStack.tsx`

Remove:
```typescript
// DELETE these two Stack.Screen entries:
<Stack.Screen name="ReadingPlanList" getComponent={() => require('../screens/learn/ReadingPlanListScreen').ReadingPlanListScreen} />
<Stack.Screen name="ReadingPlanDetail" getComponent={() => require('../screens/learn/ReadingPlanDetailScreen').ReadingPlanDetailScreen} />
```

### Changes to `CourseListScreen.tsx`

The existing entry card navigates `navigation.navigate('ReadingPlanList')`. Change to:
```typescript
import { rootNavigationRef } from '../../navigation/rootNavigation';

// onPress:
if (rootNavigationRef.isReady()) {
  rootNavigationRef.navigate('Plans', { screen: 'PlansHome' });
}
```

### Changes to `TabNavigator.tsx`

The `shouldHideNestedBibleScreen` check currently only checks `route.name === 'Bible' || route.name === 'Learn'`. Extend to also handle `'Plans'`:

```typescript
const shouldHideNestedBibleScreen =
  (route.name === 'Bible' || route.name === 'Learn' || route.name === 'Plans') &&
  shouldHideTabBarOnNestedRoute(getFocusedRouteNameFromRoute(route));
```

---

## i18n Keys — Complete List

### Keys that ALREADY exist in `en.ts` (do not duplicate):
- `readingPlans.title`, `readingPlans.browsePlans`, `readingPlans.myPlans`
- `readingPlans.startPlan`, `readingPlans.enrolled`, `readingPlans.dayOf`
- `readingPlans.markComplete`, `readingPlans.completed`, `readingPlans.progress`
- `readingPlans.noPlans`, `readingPlans.noActivePlans`
- All plan title/description keys (`readingPlans.bibleIn1Year.title`, etc.)

### Keys to ADD (to all 4 locale files):
```typescript
// In tabs section:
tabs: {
  // existing: home, bible, harvest, gather, more
  plans: 'Plans',  // NEW
}

// In readingPlans section:
readingPlans: {
  // existing keys remain...
  findPlans: 'Find Plans',        // NEW (was 'browsePlans' before — keep both)
  saved: 'Saved',                  // NEW
  completions: 'Over {{count}} completions',  // NEW
  saveForLater: 'Save for Later',  // NEW
  sample: 'Sample',                // NEW
  featuredPlan: 'Featured Plan',   // NEW
  relatedPlans: 'Related Plans',   // NEW
  noSavedPlans: 'No saved plans yet', // NEW
  noCompletedPlans: 'No completed plans yet', // NEW
}
```

Note: `readingPlans.myPlans` already exists. `readingPlans.completed` already exists (used for "Completed" badge). The "Completed" tab label can reuse `readingPlans.completed` or a new key — use the existing one to minimize additions.

---

## Common Pitfalls

### Pitfall 1: RootTabParamList Type — Missing Plans Entry
**What goes wrong:** TypeScript error "Argument of type 'Plans' is not assignable" when navigating to Plans tab or rendering the 5th tab.
**Why it happens:** `RootTabParamList` in `types.ts` drives both navigation typing and the global `ReactNavigation.RootParamList` declaration. If `Plans` is not in `RootTabParamList`, all cross-tab navigation calls fail type checking.
**How to avoid:** Add `Plans: NavigatorScreenParams<PlansStackParamList>` to `RootTabParamList` before writing any navigation code. The `declare global` block at bottom of `types.ts` propagates this automatically.

### Pitfall 2: Reading Plan Entry `book` Field — Name vs ID Mismatch
**What goes wrong:** Entries seeded with "Genesis" instead of "GEN" cause `getBookById('Genesis')` to return `undefined`; chapter titles show raw strings instead of formatted names.
**Why it happens:** The `reading_plan_entries.book` column is used by `getBookById(entry.book)` in `ReadingPlanDetailScreen` (line 39). That function expects 3-letter IDs like "GEN", "MAT", "PSA".
**How to avoid:** When writing the seed SQL or transformation script, always convert book names to 3-letter IDs. The full mapping is in `src/constants/books.ts` (all 66 books confirmed with IDs).

### Pitfall 3: Tab Bar Hidden on PlanDetail But Not Updated in TabNavigator
**What goes wrong:** Tab bar stays visible on `PlanDetail` screen (detail pages should be full-screen without tab bar).
**Why it happens:** `shouldHideTabBarOnNestedRoute` only checks `BiblePicker` and `LessonDetail` currently. The `tabBarStyle` condition in `TabNavigator` only checks `route.name === 'Bible' || route.name === 'Learn'`.
**How to avoid:** Update both: (1) add `'PlanDetail'` to `shouldHideTabBarOnNestedRoute`, and (2) add `|| route.name === 'Plans'` to the `tabBarStyle` `shouldHideNestedBibleScreen` condition.

### Pitfall 4: PlansHomeScreen Loading All 4 Sections Simultaneously
**What goes wrong:** App makes 4–5 Supabase calls on PlansHome mount causing UI jank and waterfall latency.
**Why it happens:** Each tab section needs different data: enrolled plans + progress, all plans for Find Plans, saved plans, completed plans. If all fetched in `useEffect` sequentially, the screen feels slow.
**How to avoid:** Use `Promise.all` to fetch all data simultaneously on mount. Cache in a single state object. Tab switching is instant since data is already loaded.

### Pitfall 5: Removing LearnStack Routes Before Plans Tab Is Registered
**What goes wrong:** App crashes with "The action 'NAVIGATE' with payload was not handled by any navigator" when navigating to Reading Plans from CourseListScreen after removing the routes from LearnStack.
**Why it happens:** If the migration plan removes LearnStack routes first and the PlansStack is added in a later task, there's a gap where no navigator handles the routes.
**How to avoid:** Register PlansStack in TabNavigator in the same task/wave as removing routes from LearnStack. These changes must be atomic.

### Pitfall 6: Cover Image URL — Network Dependency in Offline Mode
**What goes wrong:** Plan cards render with broken image placeholders in offline mode because `cover_image_url` points to remote URLs (picsum.photos).
**Why it happens:** `Image` component with remote `source` fails silently (or shows a broken icon) when network is unavailable.
**How to avoid:** Always render an `Image` with an `onError` fallback to a color block (use `backgroundColor: colors.accentPrimary` on the image container, so if the image fails, the colored background shows through). Do not gate plan features on image availability.

---

## Find Plans — Category Topics

Based on common YouVersion Bible reading plan categories and the existing `category` field in `reading_plans` (which uses: chronological, topical, book-study, devotional, custom):

**Recommended topic chips for Find Plans UI:**
```
Love | Healing | Hope | Anxiety | Anger | Depression | Faith | Prayer
```

These are UI-only labels derived from `category` field mappings or plan descriptions. They do not require a new DB column since the `category` field (chronological / topical / book-study / devotional) provides the grouping basis.

For the MVP, map topic chips to categories:
- "Topical" plans → show under Healing, Hope, Anxiety, Anger chips
- "Devotional" plans → show under Love, Faith, Prayer chips
- "Book-study" plans → show under general browseable list
- "Chronological" plans → show under Bible overview section

If more granular topic filtering is needed later, a `topic_tags TEXT[]` column can be added to `reading_plans`.

**Chip color approach:** Use a fixed palette array of 6–8 colors from existing theme tokens (`accentPrimary`, `accentSecondary`, `accentTertiary`, `success`, `warning`) cycled by chip index. This avoids hardcoding hex values.

---

## Code Examples

### Service Addition: savePlanForLater

```typescript
// Append to src/services/plans/readingPlanService.ts
export async function savePlanForLater(
  planId: string
): Promise<PlanServiceResult<UserSavedPlan>> {
  const { user, error: authError } = await requireSignedInUser('save a plan for later');
  if (!user) return { success: false, error: authError ?? undefined };

  try {
    const { data, error } = await supabase
      .from('user_saved_plans')
      .upsert(
        { user_id: user.id, plan_id: planId, saved_at: new Date().toISOString() },
        { onConflict: 'user_id,plan_id' }
      )
      .select('*')
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as UserSavedPlan };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function getSavedPlans(): Promise<PlanServiceResult<UserSavedPlan[]>> {
  const { user, error: authError } = await requireSignedInUser('fetch saved plans');
  if (!user) return { success: false, error: authError ?? undefined };

  try {
    const { data, error } = await supabase
      .from('user_saved_plans')
      .select('*')
      .eq('user_id', user.id)
      .order('saved_at', { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as UserSavedPlan[] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
```

### PlansHomeScreen Skeleton Pattern

```typescript
// src/screens/plans/PlansHomeScreen.tsx
export function PlansHomeScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<PlansStackParamList, 'PlansHome'>>();

  // Load all data simultaneously on mount
  const [state, setState] = useState({
    plans: [] as ReadingPlan[],
    progressList: [] as UserReadingPlanProgress[],
    savedPlanIds: new Set<string>(),
    loading: true,
    error: null as string | null,
  });

  useEffect(() => {
    Promise.all([listReadingPlans(), getUserPlanProgress(), getSavedPlans()])
      .then(([plansResult, progressResult, savedResult]) => {
        setState({
          plans: plansResult.data ?? [],
          progressList: progressResult.data ?? [],
          savedPlanIds: new Set((savedResult.data ?? []).map(s => s.plan_id)),
          loading: false,
          error: plansResult.error ?? null,
        });
      });
  }, []);

  // Tab state
  const [activeTab, setActiveTab] = useState<PlanTab>('my-plans');

  // Derived lists
  const enrolledPlans = state.plans.filter(p =>
    state.progressList.some(pr => pr.plan_id === p.id && !pr.is_completed)
  );
  const completedPlans = state.plans.filter(p =>
    state.progressList.some(pr => pr.plan_id === p.id && pr.is_completed)
  );
  const savedPlans = state.plans.filter(p => state.savedPlanIds.has(p.id));

  // Navigate to detail
  const openPlan = (planId: string) => navigation.navigate('PlanDetail', { planId });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Segmented tab row */}
      <SegmentedTabRow tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} />
      {/* Content per tab */}
      {activeTab === 'my-plans' && <MyPlansSection ... />}
      {activeTab === 'find-plans' && <FindPlansSection ... />}
      {activeTab === 'saved' && <SavedSection ... />}
      {activeTab === 'completed' && <CompletedSection ... />}
    </SafeAreaView>
  );
}
```

### Cover Image Hero Pattern (PlanDetail)

```typescript
// Full-width cover image with graceful fallback
<View style={styles.heroContainer}>
  {plan.cover_image_url ? (
    <Image
      source={{ uri: plan.cover_image_url }}
      style={styles.heroImage}
      onError={() => setImageFailed(true)}
    />
  ) : null}
  {(!plan.cover_image_url || imageFailed) ? (
    <View style={[styles.heroFallback, { backgroundColor: colors.accentPrimary }]} />
  ) : null}
</View>

const styles = StyleSheet.create({
  heroContainer: { width: '100%', height: 220, overflow: 'hidden' },
  heroImage: { width: '100%', height: 220, resizeMode: 'cover' },
  heroFallback: { width: '100%', height: 220 },
});
```

---

## Environment Availability

Step 2.6: SKIPPED — this phase is code and migration changes only. No new external tools, CLIs, runtimes, or services beyond Supabase (already configured) and existing npm packages.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest + React Native Testing Library (as mentioned in CLAUDE.md future plans) |
| Config file | No test config detected — `npm run test:release` is the release regression suite |
| Quick run command | `npm run test:release` |
| Full suite command | `npm run release:verify` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ENG-01 | Calendar strip shows daily reading activity in My Plans | Manual | verify on device — `readingActivity.ts` model is pure functions, already covered | Existing model logic — no new test file needed |
| GROUP-01 | Group plan assignment service functions work | Manual | Group plan service exists; UI deferred to Phase 22 | No new automated test file required |

**Plan-specific manual checks:**
1. PlansHomeScreen shows all 4 tabs and switching is instant
2. My Plans shows enrolled plans with progress bars and cover thumbnails
3. Find Plans shows hero card, category chips, and plan sections
4. Saved tab shows plans saved via "Save For Later" CTA
5. Completed tab shows plans where `is_completed = true`
6. PlanDetail shows cover image (or fallback), completions count, Save/Sample CTAs, related plans
7. Tab bar hides on PlanDetail screen
8. Cross-navigation from CourseListScreen card goes to Plans tab, not LearnStack
9. Reading activity calendar strip correctly shows active days

### Wave 0 Gaps
None — no automated test infrastructure additions are needed for this phase. The phase is primarily navigation wiring and UI screens. The existing `npm run test:release` release regression suite covers critical reading paths. Manual device verification is the primary quality gate for new UI screens.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Reading Plans buried in Learn tab as a card | Dedicated 5th "Plans" bottom tab | Massively increases discoverability; users can access plans without going through Gather flow |
| Plan list: two sections in FlatList | 4-section segmented home (My Plans, Find, Saved, Completed) | Matches YouVersion UX model that users are familiar with |
| No cover images on plans | `cover_image_url` column + hero image in PlanDetail | Visual richness; matches YouVersion aesthetic |
| No "Save for Later" | `user_saved_plans` table + service | Non-enrollment interest tracking |
| Plan entries: seeded metadata only, NO reading entries | Full chapter entry rows for all 8 plans | Plans are actually usable — day list renders correctly |

---

## Open Questions

1. **Screen file location (Claude's discretion)**
   - What we know: CONTEXT.md prefers minimal file movement; existing screens are in `src/screens/learn/`
   - What's unclear: Whether `PlansHomeScreen` should go in `src/screens/plans/` (new folder) or `src/screens/learn/`
   - Recommendation: Create `src/screens/plans/` for `PlansHomeScreen.tsx` and `PlanDetailScreen.tsx` (new screens); leave `ReadingPlanListScreen.tsx` and `ReadingPlanDetailScreen.tsx` in `learn/` as dead code or delete them once `PlanDetailScreen` replaces them

2. **Category chip layout: horizontal scroll vs wrap grid**
   - What we know: YouVersion uses a color grid (2 rows of 3 chips); CONTEXT.md says Claude's discretion
   - Recommendation: Horizontal scroll row (single row) for initial implementation — simpler, avoids complex grid layout, consistent with existing filter pill patterns in the codebase

3. **picsum.photos placeholder image stability**
   - What we know: picsum.photos serves real photos, CDN-backed, seeded URLs are stable
   - What's unclear: Whether picsum.photos URLs will be available in target markets (Nepal, India)
   - Recommendation: Use picsum.photos for seed data only; document that real cover art should replace these before major marketing push

4. **M'Cheyne plan format — multiple readings per day**
   - What we know: M'Cheyne has 4 readings per day (4 rows in `reading_plan_entries` for each `day_number`)
   - What's unclear: Whether the existing `ReadingPlanDetailScreen` handles multiple entries per day correctly
   - Looking at the code: Yes — `groupEntriesByDay()` on line 48 already groups multiple entries per day into a map, and `DayRow` renders `entries.map(formatChapterRef).join(', ')`. Multiple entries per day are fully supported.

---

## Sources

### Primary (HIGH confidence)
- Direct file reads: `ReadingPlanListScreen.tsx`, `ReadingPlanDetailScreen.tsx`, `readingPlanService.ts`, `TabNavigator.tsx`, `types.ts`, `tabManifest.ts`, `LearnStack.tsx`, `20260322140400_create_reading_plans.sql`, `readingActivity.ts`, `en.ts`, `books.ts` constants — all exact current state
- GitHub API: `github.com/khornberg/readingplans` contents listing (11 JSON files confirmed)
- GitHub: `BibleReadingPlans/bible-reading-plan-schema/mccheyne.json` — M'Cheyne JSON structure confirmed

### Secondary (MEDIUM confidence)
- khornberg/readingplans JSON structure: confirmed via mcheyne.json file inspection (day entries as arrays of "Book Chapter" strings)
- picsum.photos as placeholder CDN: Expo documentation example uses picsum.photos with seeded URLs

### Tertiary (LOW confidence — flag for validation)
- khornberg/readingplans license status: No explicit license found; M'Cheyne plan content is public domain (1842), but unclear for ESV-branded plans — recommend hand-building seed data to avoid ambiguity

---

## Project Constraints (from CLAUDE.md)

- TypeScript strict mode enabled — all new types must be fully typed, no `any`
- Never commit `.env` file
- Always use barrel exports (`index.ts`) — new screen files should be exported via `src/screens/plans/index.ts`
- Theme context for all colors — use `useTheme()`, never hardcode hex
- Translation keys for ALL user-facing text — use `t()` for every string
- Use Zustand stores for global state — if plan progress needs to be cached globally, use or extend existing stores (do not create a new Context)
- Offline-first architecture — plan browse works without auth (unauthenticated can browse plans); enrollment requires auth
- Test on both iOS and Android
- Use Expo's native modules only
- React Navigation v7 patterns

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all libraries already in project, zero new installs
- Architecture patterns: HIGH — verified against actual source files
- Data seeding approach: MEDIUM — khornberg/readingplans format confirmed but license unclear; hand-building seed SQL recommended
- Pitfalls: HIGH — based on direct code analysis of existing navigation patterns and service layer

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable libraries, no fast-moving dependencies)
