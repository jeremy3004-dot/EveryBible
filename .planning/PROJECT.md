# EveryBible

## What This Is

EveryBible is a mobile-first Scripture and discipleship product for people who need a dependable way to read, listen, reflect, and grow with others. It already has a credible v1 foundation: offline Bible access, audio, multilingual onboarding, discreet privacy controls, and early group-learning flows on Expo / React Native with Supabase-backed sync.

## Core Value

When someone opens the app, they should immediately know what to do next with God’s Word, be able to do it with low friction, and feel momentum building over time whether they are online or offline.

## Milestone Direction

### Milestone 1

- Build and harden the v1 baseline so startup, auth, sync, reading, audio, learn flows, and release behavior are trustworthy.
- Status: executed and release-shipped.

### Milestone 2

- Turn the stable v1 utility into a category-leading mobile experience with stronger habit loops, premium reading/audio UX, deeper discipleship surfaces, better group momentum, and platform-grade performance/analytics.
- Status: active.

## Requirements

### Validated Foundation

- ✓ Offline Scripture reading and local Bible search exist in the shipped codebase.
- ✓ Audio playback and offline audio download foundations exist.
- ✓ Email, Apple, and Google auth with persisted sessions exist.
- ✓ Locale, language, theme, reminder, and discreet-mode preference systems exist.
- ✓ Four Fields courses, lesson progress, and local group-study state exist.
- ✓ Native iOS release flow and alternate icon support now pass store-bound validation.

### Active Milestone 2 Goals

- [ ] Make the home experience a daily spiritual rhythm hub instead of a static utility screen.
- [ ] Elevate the Bible reader into a premium read/listen/study surface with stronger personalization and lower-friction controls.
- [ ] Add a lightweight chapter-quality feedback loop so real readers can flag what is working, what is broken, and what should be improved.
- [ ] Turn discipleship content into a guided journey with visible momentum, next steps, and group participation hooks.
- [ ] Strengthen backend-driven engagement loops such as push reminders, synced plans, shared study progress, and content lifecycle tooling.
- [ ] Add performance, accessibility, analytics, and operational guardrails so product growth does not degrade trust.

### Out of Scope For This Milestone

- Full web parity.
- Replacing Supabase with custom infrastructure.
- Generic social-feed or chat-first community features that distract from Scripture, habits, and discipleship.
- Large model-heavy AI features before the core experience and data contracts are mature.

## Product Strategy

EveryBible should win on a combination that most Scripture apps split apart:

- Offline-first reliability for reading and listening.
- A calm, premium daily-use interface that feels intentional instead of generic.
- Habit-forming guidance that lowers the “what should I do now?” burden.
- Lightweight but meaningful discipleship and group momentum.

The product does not need to out-social the largest Bible apps or out-produce the biggest content libraries immediately. It needs to become the app that most consistently helps a user return tomorrow, keep going today, and invite one more person into the journey.

## Research Signals

Recent product and design research used for this milestone points in a consistent direction:

- YouVersion’s strength is breadth, habit loops, plans, offline access, and friend/community reinforcement.
- Dwell’s strength is premium audio immersion, listening ritual, and meditative positioning.
- Glorify / Hallow-style faith products lean heavily on guided daily routines, emotional tone, and “one next action” clarity.
- Refero references from reading, learning, and settings apps reinforce a few UX patterns:
  - reader controls work best as focused bottom sheets over live content
  - home dashboards feel premium when they combine one primary action, visible momentum, and a small number of high-signal secondary actions
  - settings feel more trustworthy when grouped into clear, well-labeled blocks instead of long undifferentiated lists
  - learning journeys feel more valuable when progress is visual, staged, and anchored to the next unfinished step

## Context

This is still a brownfield Expo app. The right move is not to rebuild the foundation, but to reshape the highest-traffic surfaces and improve the systems behind them in deliberate phases.

The first Milestone 2 phase needs to balance product taste with platform leverage. Codebase audit and research both point to the same sequence: harden and speed bundled Scripture data first, then build the premium daily-rhythm home on top of that stronger layer. The current Home screen is too thin to carry habit formation, but the current Bible bootstrap is also too brittle and expensive to ignore. A combined Phase 6 lets the app improve perception and performance at the same time instead of forcing a false choice between “better UX” and “better foundation.”

## Constraints

- **Tech stack**: Stay on Expo / React Native / Supabase and extend the existing architecture.
- **Offline promise**: Reading must remain dependable without network access; new features cannot break this.
- **Brownfield safety**: Prefer additive and reversible product upgrades over large rewrites.
- **Release safety**: Native and Expo config must remain aligned for iOS and Android shipping.
- **Execution quality**: Each phase must leave behind tests, verification commands, and clear GSD state.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Treat Milestone 1 as complete and open a new milestone instead of stretching the v1 roadmap | The hardening roadmap solved a different class of problem than the current product ambition | ✓ Good |
| Focus Milestone 2 on daily habit formation and premium experience before adding broad new feature categories | Retention and perceived quality are the highest-leverage gaps after v1 stabilization | ✓ Good |
| Start Milestone 2 with a combined Scripture-data and home phase | Bible data readiness is the highest-leverage technical bottleneck, while Home is the clearest product-direction surface | ✓ Good |
| Use reference-driven design upgrades, not generic restyling | The app needs stronger product taste and clearer behavioral loops, not just prettier cards | ✓ Good |
| Keep local-first Scripture access as a non-negotiable product invariant | Reliability is still the app’s strongest trust asset | ✓ Good |
| Sequence backend/platform upgrades after the home, reader, and lesson surfaces begin demanding them | This keeps the roadmap product-led while still acknowledging the platform work required for scale | ✓ Good |

---
*Last updated: 2026-03-27 after adding chapter feedback planning scope*
