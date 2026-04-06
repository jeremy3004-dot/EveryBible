---
date: "2026-04-06 10:59"
promoted: false
---

Implementing reading time tracking via anonymous analytics. Plan: (1) add reading_ended to AnonymousUsageEventName, (2) AppState listener + wall-clock math in BibleReaderScreen, (3) emit single reading_ended event on unmount. No UX changes, no intervals — pure AppState-gated duration math. Anon + auth users both tracked. See brainstorm in this session for full architecture.
