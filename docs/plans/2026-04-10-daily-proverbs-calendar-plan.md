# Daily Proverbs Calendar Plan

## Decision

The existing `proverbs-31-days` bundled plan now behaves as a calendar-anchored recurring plan instead of a one-time sequential challenge.

## Intended behavior

- The visible plan title in English is `Daily Proverbs Chapter`.
- The active chapter is based on the local day of the month.
- In the Plans home screen, recurring calendar plans should surface under `Daily Rhythms` instead of the linear `Daily Readings` section.
- In `Find Plans`, recurring calendar plans should also surface in a `Daily Rhythms` section instead of only inside the normal category carousels.
- Examples:
  - April 5 -> Proverbs 5
  - December 2 -> Proverbs 2
- The plan repeats every month and should never move into the permanently completed state.

## Implementation notes

- Catalog metadata lives in `src/data/readingPlans.generated.ts`.
- Recurring cadence is flagged with `scheduleMode`, with `calendar-day-of-month` for Proverbs and `calendar-day-of-week` for weekly rhythms like Kathisma.
- Completion keys for this plan are stored by local date key (`YYYY-MM-DD`) instead of by plan day number.
- Plan detail and reader summaries still use the normal plan entry model, but day resolution comes from the calendar for this specific plan.

## Guardrails

- Do not remove the recurring cadence metadata from `proverbs-31-days` unless the product decision changes.
- Do not treat recurring completion records as evidence that the whole plan finished.
- Keep normal plans on the existing start-date-relative behavior.
