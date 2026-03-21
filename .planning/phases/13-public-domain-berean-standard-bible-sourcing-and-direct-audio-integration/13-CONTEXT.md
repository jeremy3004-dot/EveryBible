# Phase 13: Public-domain Berean Standard Bible sourcing and direct audio integration - Context

**Gathered:** 2026-03-21
**Status:** Plan 01 complete, Plan 02 pending

<domain>
## Phase Boundary

Make the app's built-in BSB experience line up with the official Berean licensing and distribution story.

This phase covers:
- replacing the runtime BSB audio dependency on `Bible.is` with direct public chapter MP3s
- normalizing in-repo licensing and source documentation around the official Berean public-domain terms
- planning the follow-up work to refresh bundled BSB text artifacts from official Berean downloads

This phase does not force a full Bible data-layer rewrite. The heavier text-import cleanup is deliberately separated into plan 02.

</domain>

<decisions>
## Implementation Decisions

### Locked
- Keep `translationId='bsb'` stable so existing reading state, search, bookmarks, and translation preferences do not migrate unnecessarily.
- Treat official Berean pages as the source of truth:
  - text public domain as of April 30, 2023
  - narrated BSB audio dedicated to the public domain under CC0 1.0
- Use the same direct-public-source pattern already proven for WEB audio instead of introducing a new backend or proxy.

### Claude's Discretion
- Pick one stable public BSB narrator/source for the current runtime slice and leave multi-voice support as future optional work.
- Keep plan 01 limited to runtime audio + licensing/docs if the text-refresh pipeline would meaningfully increase scope or risk.

</decisions>

<specifics>
## Specific Ideas

- Runtime audio source selected for plan 01: Bob Souer chapter MP3s exposed through the public BSB audio pages and hosted on `openbible.com`.
- Official BSB text downloads already exist on `bereanbible.com`, including `bsb.txt`, `bsb_usfm.zip`, `bsb_usj.zip`, and `bsb_usx.zip`.
- Plan 02 should prefer official first-party text downloads with structure-rich content, likely `bsb_usx.zip`, so headings and richer metadata can be preserved.

</specifics>

<deferred>
## Deferred Ideas

- Multi-narrator or in-app BSB voice selection
- Gilbert music/non-music variants
- Full BSB text regeneration pipeline from first-party downloads
- Provenance assertions around the regenerated bundled SQLite asset

</deferred>

---

*Phase: 13-public-domain-berean-standard-bible-sourcing-and-direct-audio-integration*
*Context gathered: 2026-03-21*
