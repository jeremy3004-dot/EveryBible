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

The kathismata are defined in Septuagint (Greek) psalm numbering. Our Bible text (BSB)
uses Hebrew/Masoretic numbering, which runs one number higher from Hebrew Ps 11 through
Ps 147 (LXX Ps 9 = Hebrew Ps 9+10). The ranges below are the **Hebrew/BSB** chapters that
correspond to each kathisma, so the readings show the correct psalms in-app.

| Kathisma | LXX (Orthodox) | Hebrew/BSB (used in app) |
|----------|----------------|--------------------------|
| 1 | 1-8 | 1-8 |
| 2 | 9-16 | 9-17 |
| 3 | 17-23 | 18-24 |
| 4 | 24-31 | 25-32 |
| 5 | 32-36 | 33-37 |
| 6 | 37-45 | 38-46 |
| 7 | 46-54 | 47-55 |
| 8 | 55-63 | 56-64 |
| 9 | 64-69 | 65-70 |
| 10 | 70-76 | 71-77 |
| 11 | 77-84 | 78-85 |
| 12 | 85-90 | 86-91 |
| 13 | 91-100 | 92-101 |
| 14 | 101-104 | 102-105 |
| 15 | 105-108 | 106-109 |
| 16 | 109-117 | 110-118 |
| 17 | 118 | 119 |
| 18 | 119-133 | 120-134 |
| 19 | 134-142 | 135-143 |
| 20 | 143-150 | 144-150 |

## Implementation notes

- Catalog metadata lives in `src/data/readingPlans.generated.ts`.
- Recurring cadence is flagged with `scheduleMode: 'calendar-day-of-week'`.
- Completion keys for this plan are stored by local date key (`YYYY-MM-DD`) instead of by weekday number.
- The plan uses the existing multi-session detail screen with `Morning Kathismata` and `Evening Kathismata` section titles.
