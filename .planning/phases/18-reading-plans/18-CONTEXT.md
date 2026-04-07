# Phase 18: Reading Plans — Context

**Gathered:** 2026-04-07
**Status:** Ready for planning
**Source:** User session + YouVersion reference screenshots + codebase analysis

<domain>
## Phase Boundary

Add a dedicated **"Plans" tab** to the bottom navigation (between Gather and More) with a YouVersion-style reading plan discovery, enrollment, progress tracking, and activity calendar integration.

The tab surfaces reading plans prominently as a first-class feature. Users can browse plans by topic/category, enroll, track daily progress, save for later, and see completed plans. The reading activity calendar already in the app should be integrated here to show plan reading streaks.

Much of the backend and screen code is already built — this phase wires it together into a cohesive tab experience and fills the remaining gaps.

</domain>

<decisions>
## Implementation Decisions

### Tab Structure
- Add a 5th "Plans" tab between the Gather (Learn) tab and the More tab
- Tab label: "Plans" (`tabs.plans` i18n key), icon: `calendar` / `calendar-outline` (Ionicons)
- Tab hosts a `PlansStack` navigator
- The existing `ReadingPlanListScreen` and `ReadingPlanDetailScreen` in `src/screens/learn/` need to be migrated into a new `src/screens/plans/` folder OR repurposed as the Plans tab root (prefer repurpose with minimal move — Claude's discretion)

### Plans Home Screen — 4-tab segmented control
The Plans home screen has a segmented control at the top with 4 sections:
1. **My Plans** — enrolled plans with progress bar and cover image thumbnail; reading activity calendar strip below enrolled plans
2. **Find Plans** — discovery surface with: featured hero card (big image + plan-length badge), topic category chips (Love, Healing, Hope, Anxiety, Anger, Depression...), horizontal filter pills (New, Relationships, Listen & Watch, etc.), sectioned plan lists by topic with "See All" links
3. **Saved** — plans the user has saved for later without enrolling
4. **Completed** — plans the user has finished

### Plan Detail Screen — enhanced from existing
Existing `ReadingPlanDetailScreen` needs these additions:
- Cover image header (full-width, similar height to YouVersion hero)
- Completion count label (e.g. "Over 5,000 completions")
- CTA row: "Start Plan" (primary), "Save For Later" (secondary), "Sample" (tertiary)
- Plan description text block
- "Related Plans" horizontal scroll at the bottom
- The existing day-list + mark-complete behavior is kept

### Save For Later Feature
- New `user_saved_plans` Supabase table (user_id, plan_id, saved_at)
- Service functions: `savePlanForLater`, `unsavePlan`, `getSavedPlans`
- Saved plans appear in the "Saved" tab

### Reading Activity Calendar Integration
- The existing `ReadingActivityScreen` calendar (using `react-native-calendars` + `buildReadingActivityMonthView`) already tracks daily reading
- In the "My Plans" tab, show a compact version of this calendar below the enrolled plans list to surface reading streaks
- This is additive — do not change the existing `ReadingActivityScreen` in More tab

### Data Schema Additions
The existing `reading_plans` table needs these columns added (migration):
- `cover_image_url TEXT` — URL for plan cover art
- `featured BOOLEAN DEFAULT false` — marks plans shown in the Find Plans hero
- `completion_count INTEGER DEFAULT 0` — display-only completion counter

### Open-Source Reading Plan Data
User explicitly wants to use open-source reading plans from GitHub rather than building from scratch. Research should find available CSV/JSON plan datasets (e.g., OpenBible.info Bible Reading Plans) and use them to seed the `reading_plans` + `reading_plan_entries` tables. Preferred formats: JSON or CSV that can be transformed into SQL inserts.

### Navigation Migration
- `ReadingPlanList` and `ReadingPlanDetail` routes currently live in `LearnStack` — these should be removed from `LearnStack` and the "Reading Plans entry card" in `CourseListScreen` should be updated to cross-navigate to the Plans tab instead
- Plans tab needs its own `PlansStack` with: `PlansHome` (main screen) → `PlanDetail`

### i18n
Add translation keys to all 4 language files (en, es, ne, hi):
- `tabs.plans`
- `readingPlans.myPlans`, `readingPlans.findPlans`, `readingPlans.saved`, `readingPlans.completed`
- `readingPlans.featuredPlan`, `readingPlans.relatedPlans`, `readingPlans.saveForLater`, `readingPlans.sample`
- `readingPlans.startPlan` already exists — keep
- `readingPlans.completions` (e.g. "Over 5,000 completions")

### What Is Already Built (Do Not Re-implement)
- `src/screens/learn/ReadingPlanListScreen.tsx` — fully functional list with My Plans + Browse sections
- `src/screens/learn/ReadingPlanDetailScreen.tsx` — fully functional detail with progress ring + day list
- `src/services/plans/readingPlanService.ts` — full CRUD: list, entries, enroll, markDayComplete, progress, unenroll, assignToGroup, getGroupPlans, syncPlanProgress
- Supabase tables: `reading_plans`, `reading_plan_entries`, `user_reading_plan_progress`, `group_reading_plans`
- TypeScript types: `ReadingPlan`, `ReadingPlanEntry`, `UserReadingPlanProgress`, `GroupReadingPlan`
- `ReadingActivityScreen.tsx` in More tab — calendar showing daily reading dates

### Claude's Discretion
- Whether to move screen files to a new `src/screens/plans/` folder or keep in `src/screens/learn/` — prefer minimal file movement; reuse existing screens
- Exact Ionicons icon for Plans tab (calendar or bookmark-multiple or similar)
- Whether category chips in Find Plans use horizontal scroll or wrap grid
- Exact topic categories to seed (based on common Bible reading topics)
- Related Plans section: fetch by same category, limit 5

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Reading Plans Implementation
- `src/screens/learn/ReadingPlanListScreen.tsx` — existing list screen (already built)
- `src/screens/learn/ReadingPlanDetailScreen.tsx` — existing detail screen (already built)
- `src/services/plans/readingPlanService.ts` — existing service layer
- `src/services/supabase/types.ts` — ReadingPlan, ReadingPlanEntry, UserReadingPlanProgress types

### Navigation Architecture
- `src/navigation/TabNavigator.tsx` — bottom tab configuration (Plans tab goes here)
- `src/navigation/tabManifest.ts` — tab icon/label manifest
- `src/navigation/types.ts` — RootTabParamList + LearnStackParamList (Plans routes to be moved)
- `src/navigation/LearnStack.tsx` — ReadingPlan routes currently here (to be removed)

### Reading Activity Calendar
- `src/screens/more/ReadingActivityScreen.tsx` — existing calendar component
- `src/services/progress/readingActivity.ts` — calendar data model functions

### Database Schema
- `supabase/migrations/20260322140400_create_reading_plans.sql` — existing tables

### Design System
- `src/design/system.ts` — spacing, typography, radius, layout tokens
- `src/contexts/ThemeContext.tsx` — colors from useTheme()

### i18n
- `src/i18n/locales/en.ts` — English source (add keys here first)

</canonical_refs>

<specifics>
## Specific Ideas from User

From YouVersion reference screenshots:
1. **My Plans tab**: Shows enrolled plans as cards with cover thumbnail (left), plan title (right), and a progress bar. Plans include: "Psalms in One Month", "30 Day Shred", "Daily Habits Of Marital Intimacy - 10 Day", "Visioneering", "The Maxwell Leadership Reading Plan"
2. **Find Plans tab**:
   - Top: Large hero card with cover image + "50-DAY-PLAN" badge-style label + title below
   - Below hero: Category chips in a color grid — LOVE (red), HEALING (teal), HOPE (blue), ANXIETY (purple), ANGER (orange), DEPRESSION (dark)
   - Filter pills row: "New", "Relationships", "Listen & Watch", "New" (horizontal scroll)
   - Sectioned plan listings: "Lent & Easter — See All" with plan cards showing cover thumbnail, day count, star rating, and "Start" CTA button
3. **Plan Detail**: Full-width cover image, "Over 5,000 completions" badge, plan title, duration (14 Days), "Start Plan" (primary white rounded button), "Save For Later" and "Sample" (secondary dark pills), description paragraph, "Related Plans" horizontal section at bottom

</specifics>

<deferred>
## Deferred Ideas

- Audio plans / "Listen & Watch" filter (can show but plans would just be reading-only for now)
- Star ratings / user reviews on plans
- Group assignment UI within Plans tab (group assignment service already exists but UI is deferred to Phase 22 Gather tab work)
- Push notification reminders for daily plan readings (Phase 31 push notification work)
- Plan author/publisher attribution
- Plan cover image upload admin UI (cover_image_url can be seeded manually for now)

</deferred>

---

*Phase: 18-reading-plans*
*Context gathered: 2026-04-07 via user session + YouVersion reference screenshots*
