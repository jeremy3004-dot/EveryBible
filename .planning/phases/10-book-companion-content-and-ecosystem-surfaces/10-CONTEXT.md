# Phase 10: Book Companion Content And Ecosystem Surfaces - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning
**Source:** User request in active session, screenshot comparison against Dwell, and codebase audit

<domain>
## Phase Boundary

Attach Dwell-style companion modules to the book hub so each book can surface related passages, devotionals, figures, plans, and playlists without turning the Bible tab into a brittle content maze.

Scope includes:
- a reusable schema for optional book companion content
- reusable hub sections for figures, passages, plans, devotionals, and playlists
- offline/loading/error behavior for content modules
- navigation that returns users to the book hub or chapter session without losing context

Out of scope:
- inventing a full CMS if static/local data solves the first rollout
- replacing existing Learn or Harvest experiences wholesale
- broad social/community features beyond the screenshots provided
</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- Companion content must be modular and optional per book.
- Missing modules should collapse cleanly instead of leaving broken placeholders.
- The core Bible open/play path must remain fast even when companion data is absent or slow.

### Claude's Discretion
- Whether the first content source is local JSON, Supabase tables, or a mixed strategy.
- Which book modules ship first if the content inventory is incomplete.
- The exact card/list/carousel treatment for each module family.
</decisions>

<specifics>
## Specific Ideas

- The Dwell screenshots show these modules as adjacent discovery surfaces, not as replacements for the main book CTA.
- Use one section contract so the hub layout can stay consistent while content types differ.
- Plan verification should cover both populated books and sparse books, because content availability will vary.
</specifics>

<deferred>
## Deferred Ideas

- Personalized recommendations beyond the currently open book
- User-generated notes or highlights inside companion modules
- Back-office editorial tooling unless the chosen source requires it immediately
</deferred>

---

*Phase: 10-book-companion-content-and-ecosystem-surfaces*
*Context gathered: 2026-03-20 via user request, screenshots, and code audit*
