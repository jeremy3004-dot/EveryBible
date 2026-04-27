# Rhythm-First Plans Surface

## Goal

Make `Rhythms` a first-class surface inside the Plans tab instead of a subsection under `My Plans`, while expanding rhythms from "ordered plan IDs" into a true sequence builder that can mix:

- reading plan content
- individual chapters
- chapter ranges

The intended experience is devotional and liturgical, not just checklist-based. A user should be able to build rhythms like:

1. Psalms 1-3
2. Proverbs 4
3. Matthew 5-7
4. Today's entry from an enrolled New Testament plan

Then continue through that rhythm in one uninterrupted read/listen flow.

## UX Shape

### Top-level topic switcher

The Plans screen should open with two primary topics:

- `Reading Plans`
- `Rhythms`

`Reading Plans` keeps the catalog and progress structure people already understand. `Rhythms` gets its own home instead of being buried under `My Plans`.

### Reading Plans section

Inside `Reading Plans`, keep the existing organizational model, but move it one level down:

- `My Plans`
- `Find Plans`
- `Completed`

This preserves the current discovery and enrollment work while making room for rhythms as a separate destination.

### Rhythms section

The rhythms home should focus on repeatable routines:

- named rhythms like `Morning`, `Afternoon`, `Evening`
- each rhythm shown as an ordered sequence preview
- a clear `Continue Rhythm` action
- a composer that supports adding both plan-based items and manual passages

## Data Model

### Existing problem

Current rhythms only store `planIds[]`. That works for "continue multiple plans together," but it cannot express a routine like "three Psalms, one Proverb, one New Testament chapter."

### New model

Each rhythm should store ordered mixed items:

- `plan` item: references one enrolled plan and resolves to that plan's current active day
- `passage` item: references a manual book/chapter or chapter range

This keeps plan progress intact while allowing custom scripture blocks to sit between plan items.

### Compatibility

Persisted legacy rhythms built from `planIds[]` should auto-migrate into `plan` items on load so existing users do not lose their saved rhythms.

## Reader Behavior

The reader already supports flattened playback sequences with rhythm session context. Extend that same pipeline so:

- plan items produce "today's plan segment"
- passage items produce their manual chapter sequence
- `Next chapter` stays inside the same flattened rhythm until the full rhythm is done

Important behavior:

- passage items are repeatable rhythm content, not one-time completion objects
- plan items continue to respect plan progress and completion state
- when a rhythm is reopened, manual passage items remain present and plan items resolve from current progress

## Scope For This Pass

### In

- top-level `Reading Plans` / `Rhythms` topic switcher
- mixed rhythm items
- manual passage support in rhythm composer
- drag/reorder-equivalent explicit ordering controls
- reader/listener continuation through mixed rhythm sequences

### Out

- verse-level passage slicing
- visual drag-and-drop gesture reordering
- server sync for custom rhythms
- liturgical calendar logic
- Orthodox-specific naming/rules engine

## Assumptions

- Manual rhythm passages are chapter-based, not arbitrary verse snippets.
- Range items are same-book chapter ranges for now.
- Reordering can ship with explicit move controls in this pass instead of gesture drag-and-drop.
