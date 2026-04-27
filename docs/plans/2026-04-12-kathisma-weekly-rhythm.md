# Kathisma Weekly Rhythm

## Decision

The bundled `kathisma-weekly` plan is a recurring weekly rhythm that resolves by local weekday instead of by plan start date.

## Intended behavior

- The visible English title is `Kathisma`.
- The plan appears in `Daily Rhythms` in both `My Plans` and `Find Plans`.
- The active readings are based on the local day of the week.
- Sunday only shows a morning section.
- Monday through Saturday can show both morning and evening sections.
- The plan repeats every week and should never move into the permanently completed state.

## Weekly schedule

| Day | Morning Kathismata | Evening Kathismata |
| --- | --- | --- |
| Sun | 2, 3 | — |
| Mon | 4, 5 | 6 |
| Tue | 7, 8 | 9 |
| Wed | 10, 11 | 12 |
| Thu | 13, 14 | 15 |
| Fri | 19, 20 | 18 |
| Sat | 16, 17 | 1 |

## Kathisma mapping

- 1 -> Psalms 1-8
- 2 -> Psalms 9-16
- 3 -> Psalms 18-24
- 4 -> Psalms 25-32
- 5 -> Psalms 33-37
- 6 -> Psalms 38-45
- 7 -> Psalms 46-54
- 8 -> Psalms 55-63
- 9 -> Psalms 64-69
- 10 -> Psalms 70-76
- 11 -> Psalms 77-84
- 12 -> Psalms 85-90
- 13 -> Psalms 91-100
- 14 -> Psalms 101-104
- 15 -> Psalms 105-108
- 16 -> Psalms 109-117
- 17 -> Psalm 118
- 18 -> Psalms 119-133
- 19 -> Psalms 134-142
- 20 -> Psalms 143-150

## Implementation notes

- Catalog metadata lives in `src/data/readingPlans.generated.ts`.
- Recurring cadence is flagged with `scheduleMode: 'calendar-day-of-week'`.
- Completion keys for this plan are stored by local date key (`YYYY-MM-DD`) instead of by weekday number.
- The plan uses the existing multi-session detail screen with `Morning Kathismata` and `Evening Kathismata` section titles.
