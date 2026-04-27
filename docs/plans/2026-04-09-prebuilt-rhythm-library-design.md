# Prebuilt Rhythm Library

Date: 2026-04-09

## Why this changed

The custom rhythm composer was still asking too much from the user. It made people design their own liturgy before they had even started reading. That is backwards.

The better product move is a curated library of prebuilt rhythms. The app should offer real starting points from historic Christian practice, then let the user add one in a couple of taps.

## Product decision

Replace the custom create flow with a preset catalog:

- `Create Rhythm` opens a curated library instead of a builder
- each preset is grounded in a recognizable tradition
- each preset maps to the existing rhythm model, so playback and detail screens keep working
- each preset is passage-based for the first release, avoiding enrollment and ownership issues with plan items
- edit mode becomes `replace this rhythm with a preset` instead of reopening the full builder

## Initial preset set

Ship 20 presets across seven traditions:

- Catholic
  - Catholic Morning Prayer
  - Catholic Daytime Prayer
  - Catholic Evening Prayer
  - Catholic Night Prayer
  - Catholic Lectio Divina
  - Ignatian Daily Examen
- Anglican
  - Anglican Morning Prayer
  - Anglican Noonday Prayer
  - Anglican Evening Prayer
  - Anglican Compline
- Orthodox
  - Orthodox Morning Rule
  - Orthodox Sixth Hour
  - Orthodox Vespers
  - Orthodox Small Compline
- Benedictine
  - Benedictine Sacred Reading
  - Benedictine Psalm and Work
- Taize
  - Taize Evening Prayer
- Lutheran
  - Lutheran Morning Devotion
  - Lutheran Close of Day
- Puritan
  - Puritan Family Worship

## UX shape

The screen should feel like picking from a strong bookstore shelf, not assembling a workflow.

- headline explains the shift: real traditions, not a blank form
- filter chips narrow by time of day: all, morning, midday, evening, any time
- second chip row narrows by tradition
- each preset card shows:
  - title
  - short description
  - tradition
  - time of day
  - historic roots
  - included passages
  - direct action button
- create mode uses `Add rhythm`
- edit mode uses `Replace rhythm`
- edit mode still keeps delete available

## Data model choice

Do not widen the rhythm schema for this release.

Each preset expands into ordinary `ReadingPlanRhythmItem[]`, mostly passage items. That keeps:

- storage stable
- detail screen stable
- playback sequence generation stable
- migration risk low

## Research notes

The preset set is inspired by these sources:

- Catholic Liturgy of the Hours and family psalter material from the USCCB:
  - https://www.usccb.org/resources/USCCB%20Family%20Psalter.pdf
  - https://www.usccb.org/resources/sharing-word-at-home.pdf
- Anglican Daily Office patterns from the Book of Common Prayer and Church of England daily prayer:
  - https://bcponline.org/
  - https://www.churchofengland.org/prayer-and-worship/join-us-service-daily-prayer
- Orthodox fixed-hour prayer and morning/evening rule material:
  - https://www.oca.org/orthodoxy/prayers
- Benedictine sacred reading and fixed-hour life from the Rule of Saint Benedict:
  - https://archive.osb.org/rb/Comp_Index_RB.pdf
- Taize common prayer with song, Scripture, and silence:
  - https://www.taize.fr/
- Lutheran daily prayer for individuals and families:
  - https://reporter.lcms.org/wp-content/uploads/2013/12/LWoct06.pdf
- Puritan family worship rhythms and private worship morning and evening:
  - https://opc.org/new_horizons/NH2020/NH2020Dec.pdf

## Follow-up ideas

Not for this pass:

- save favorites within the preset library
- add localizable preset copy
- let users duplicate a preset into a future lightweight editor
- add denomination explainer pages with fuller historical notes
