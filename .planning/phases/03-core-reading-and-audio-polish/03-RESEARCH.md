# Phase 3: Core Reading And Audio Polish - Research

**Researched:** 2026-03-11
**Domain:** Expo / React Native Bible browsing, local SQLite scripture access, daily scripture presentation, audio playback and offline downloads
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

No user constraints - all decisions at Claude's discretion.
</user_constraints>

<research_summary>
## Summary

Phase 3 should finish the read/listen loop by building on existing foundations rather than replacing them. The repo already has an offline Bible database in [`src/services/bible/bibleDatabase.ts`](/Users/dev/Projects/EveryBible/src/services/bible/bibleDatabase.ts), a persisted reading position in [`src/stores/bibleStore.ts`](/Users/dev/Projects/EveryBible/src/stores/bibleStore.ts), daily scripture degradation logic in [`src/services/bible/dailyScripture.ts`](/Users/dev/Projects/EveryBible/src/services/bible/dailyScripture.ts) and [`src/services/bible/presentation.ts`](/Users/dev/Projects/EveryBible/src/services/bible/presentation.ts), plus a real audio stack across [`useAudioPlayer.ts`](/Users/dev/Projects/EveryBible/src/hooks/useAudioPlayer.ts), [`audioService.ts`](/Users/dev/Projects/EveryBible/src/services/audio/audioService.ts), and the browser/download UI in [`BibleBrowserScreen.tsx`](/Users/dev/Projects/EveryBible/src/screens/bible/BibleBrowserScreen.tsx).

The biggest reading gap is that local scripture search exists in code through [`searchBible()`](/Users/dev/Projects/EveryBible/src/services/bible/bibleService.ts) but is not exposed anywhere in the live UI. That leaves READ-02 materially unmet even though the underlying offline data path exists. On the audio side, the clearest reliability gap is availability gating: the reader, home screen, and browser currently treat "translation has audio" as enough to expose audio-first or download affordances, even when the remote Bible.is API is not configured and no offline download exists yet. That creates avoidable false promises around streaming and offline audio.

**Primary recommendation:** Use `03-01` to expose local Bible search in the live browse/read flow without disturbing the existing reader shell, then use `03-02` to harden audio availability gating so the app only advertises audio when it can actually play or download it.
</research_summary>

<standard_stack>
## Standard Stack

For this phase, the standard stack is the repo's current SQLite + service-layer + Zustand setup with small pure helpers around UI decisions.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `expo-sqlite` | repo version | Offline Bible text storage and search | Already powers chapter reads and local search capability |
| `zustand` | repo version | Persisted reading position and audio settings | Existing source of truth for reader/audio state |
| `expo-av` | repo version | Audio playback | Current playback implementation already uses it |
| `expo-file-system/legacy` | repo version | Offline audio storage | Existing download path for chapter audio |
| `node:test` + `tsx` | repo versions | Fast pure-logic coverage for search/audio decision helpers | Best fit for the repo's test harness |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React Navigation native stack | repo version | Opening search results into the reader | Reuse the current Bible stack instead of adding a new navigator |
| Current Bible presentation helpers | repo current | Daily scripture and audio-first presentation | Preserve the current behavior and avoid rewriting presentation files unless a concrete bug requires it |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Search inside the existing Bible browser screen | Separate dedicated Bible search screen | More navigation overhead than the current app needs |
| Pure helpers for search/audio affordance decisions | Component integration tests | Current repo test harness is much stronger for pure logic than for mounted RN screens |
| Audio availability based on remote-or-offline reality | Continue using `translation.hasAudio` alone | Simpler, but it keeps surfacing broken CTAs when API config is missing |
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Pattern 1: Thin screen, pure decision helper
**What:** Keep UI state in the screen, but move query gating, result mapping, or audio-affordance decisions into small pure helpers.  
**When to use:** Local Bible search presentation and audio availability logic.  
**App fit:** This matches existing repo patterns like [`localeSetupModel.ts`](/Users/dev/Projects/EveryBible/src/screens/onboarding/localeSetupModel.ts) and the newer Phase 2 reminder/privacy helpers.

### Pattern 2: Offline-first read path
**What:** Prefer local DB or downloaded audio when available; only depend on remote services when necessary.  
**When to use:** Scripture search/open and audio playback/download affordances.  
**App fit:** [`bibleService.ts`](/Users/dev/Projects/EveryBible/src/services/bible/bibleService.ts) and [`audioService.ts`](/Users/dev/Projects/EveryBible/src/services/audio/audioService.ts) already implement the right data flow; the gap is in exposing and gating that flow correctly in screens.

### Pattern 3: Conservative feature exposure
**What:** Only show audio controls, audio-first cards, or download actions when the app can actually satisfy them either remotely or from offline assets.  
**When to use:** Reader/home/browser audio affordances.  
**App fit:** [`audioRemote.ts`](/Users/dev/Projects/EveryBible/src/services/audio/audioRemote.ts) already knows when remote audio is truly configured; Phase 3 should thread that reality into UI decisions.

### Anti-Patterns To Avoid
- **Rewriting the reader shell:** The current Bible browser, chapter selector, reader, and continue-reading loop already provide a good structure.
- **Touching user-modified presentation files unnecessarily:** [`src/services/bible/presentation.ts`](/Users/dev/Projects/EveryBible/src/services/bible/presentation.ts) and related files are currently dirty in the worktree and should only be edited if a concrete Phase 3 requirement truly demands it.
- **Advertising audio because it exists "in theory":** `hasAudio` alone is not enough if remote configuration is absent and offline assets are missing.
- **Adding translation-key churn for small search affordances unless clearly needed:** Reuse current copy where practical to keep Phase 3 focused.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Offline scripture search | New search index or remote search backend | Existing SQLite `searchVerses()` path in [`bibleDatabase.ts`](/Users/dev/Projects/EveryBible/src/services/bible/bibleDatabase.ts) | The data and query path already exist locally |
| Reader position persistence | New reading-progress subsystem | Current `bibleStore` + `progressStore` | Phase 3 should polish, not replace |
| Audio download storage | Custom file registry | Existing `audioDownloadService.ts` + `audioDownloadStorage.ts` | The repo already stores chapter files and tracks downloaded books |
| Playback capability checks | Ad hoc UI booleans scattered across screens | One explicit audio-availability helper | Keeps browser, home, and reader consistent |

**Key insight:** Phase 3 is mostly a cohesion phase. The product already contains most of the required read/listen infrastructure; the work is to expose it correctly and stop overpromising where the environment cannot support it.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Assuming offline search is "done" because the query function exists
**What goes wrong:** READ-02 still fails in practice because users cannot access search from the live UI.  
**Why it happens:** It is easy to mistake service-layer capability for product completeness.  
**How to avoid:** Add the smallest possible local-search surface directly to the Bible browser flow and route results back into the current reader.  
**Warning signs:** `searchBible()` exists but no screen imports or calls it.

### Pitfall 2: Audio UI claims availability that runtime cannot satisfy
**What goes wrong:** Audio-first cards, play CTAs, or download affordances appear even when the Bible.is API key is missing and no chapter has been downloaded offline.  
**Why it happens:** Current screens mostly gate on `translation.hasAudio`, not actual remote-or-offline availability.  
**How to avoid:** Centralize availability checks and use them across home, reader, and browser surfaces.  
**Warning signs:** User taps play or download and immediately gets a generic unavailable error.

### Pitfall 3: Search or audio polish collides with unrelated dirty worktree changes
**What goes wrong:** A Phase 3 implementation accidentally overwrites user edits in daily-scripture presentation or audio card files.  
**Why it happens:** Some Phase 3-adjacent files are already dirty in the repo.  
**How to avoid:** Prefer untouched files first, and only edit dirty files after carefully reading and integrating the existing local changes.  
**Warning signs:** Git diff shows user-modified files in `src/services/bible/presentation.*` or `src/components/audio/AudioFirstChapterCard.tsx`.
</common_pitfalls>

<validation_architecture>
## Validation Architecture

Phase 3 needs fast logic coverage for new helper modules plus regression runs against the existing reading/audio test suites.

### Automated focus
- Bible browser row and search helper coverage near the Bible browse surface
- Existing daily scripture/presentation tests in [`src/services/bible/dailyScripture.test.ts`](/Users/dev/Projects/EveryBible/src/services/bible/dailyScripture.test.ts) and [`src/services/bible/presentation.test.ts`](/Users/dev/Projects/EveryBible/src/services/bible/presentation.test.ts)
- Existing audio-source/download tests in [`src/services/audio/audioSource.test.ts`](/Users/dev/Projects/EveryBible/src/services/audio/audioSource.test.ts) and [`src/services/audio/audioDownloadService.test.ts`](/Users/dev/Projects/EveryBible/src/services/audio/audioDownloadService.test.ts)
- New search model tests for query gating/result mapping
- New audio availability tests for remote/offline capability decisions

### Manual focus
- Search for a local verse offline and open the correct chapter from results
- Continue reading after relaunch and verify the expected current book/chapter path
- Daily scripture card behavior with and without text/audio config
- Audio playback and offline download behavior on a device with and without the Bible.is API configured

### Planning implication
`03-01` should give the live Bible surface an actual local search path and verify it against the current reader shell. `03-02` should harden audio availability and download/playback affordances without rewriting the full audio stack.
</validation_architecture>

<open_questions>
## Open Questions

1. **Should search live inline in the browser or behind a separate screen?**
   - What we know: there is no Bible search UI today, and the current Bible stack is intentionally small.
   - What's unclear: whether product intent prefers a dedicated search experience.
   - Recommendation: Start inline inside the browser for the lowest-risk, fastest reversible path.

2. **How much of daily scripture polish actually needs code changes versus verification?**
   - What we know: the repo already has tests proving daily scripture falls back between text, section audio, verse audio, and empty states.
   - What's unclear: whether the live UI still has small presentation gaps that are not visible in those tests.
   - Recommendation: Avoid editing the currently dirty presentation files unless a failing test or manual read uncovers a concrete issue.

3. **Should offline-downloaded audio count as "available" even when remote audio is not configured?**
   - What we know: `audioService.ts` can prefer a local downloaded URI over remote audio, so offline playback is possible without remote access for downloaded chapters.
   - What's unclear: whether every surface should explicitly represent that distinction.
   - Recommendation: Yes for chapter-specific reader/browser surfaces; keep home/daily surfaces conservative if book-specific offline state is hard to derive there.
</open_questions>

<sources>
## Sources

### Repo-grounded sources
- [`src/screens/bible/BibleBrowserScreen.tsx`](/Users/dev/Projects/EveryBible/src/screens/bible/BibleBrowserScreen.tsx)
- [`src/screens/bible/BibleReaderScreen.tsx`](/Users/dev/Projects/EveryBible/src/screens/bible/BibleReaderScreen.tsx)
- [`src/screens/bible/ChapterSelectorScreen.tsx`](/Users/dev/Projects/EveryBible/src/screens/bible/ChapterSelectorScreen.tsx)
- [`src/screens/home/HomeScreen.tsx`](/Users/dev/Projects/EveryBible/src/screens/home/HomeScreen.tsx)
- [`src/services/bible/bibleService.ts`](/Users/dev/Projects/EveryBible/src/services/bible/bibleService.ts)
- [`src/services/bible/bibleDatabase.ts`](/Users/dev/Projects/EveryBible/src/services/bible/bibleDatabase.ts)
- [`src/services/bible/dailyScripture.ts`](/Users/dev/Projects/EveryBible/src/services/bible/dailyScripture.ts)
- [`src/services/bible/presentation.ts`](/Users/dev/Projects/EveryBible/src/services/bible/presentation.ts)
- [`src/hooks/useAudioPlayer.ts`](/Users/dev/Projects/EveryBible/src/hooks/useAudioPlayer.ts)
- [`src/services/audio/audioService.ts`](/Users/dev/Projects/EveryBible/src/services/audio/audioService.ts)
- [`src/services/audio/audioRemote.ts`](/Users/dev/Projects/EveryBible/src/services/audio/audioRemote.ts)
- [`src/services/audio/audioDownloadService.ts`](/Users/dev/Projects/EveryBible/src/services/audio/audioDownloadService.ts)
- [`src/stores/bibleStore.ts`](/Users/dev/Projects/EveryBible/src/stores/bibleStore.ts)
- [`src/stores/progressStore.ts`](/Users/dev/Projects/EveryBible/src/stores/progressStore.ts)
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: offline SQLite Bible access, daily scripture logic, Expo AV playback, offline chapter downloads
- Patterns: thin screens around pure helpers, offline-first data access, conservative feature exposure
- Pitfalls: missing live search surface, overpromised audio affordances, dirty-worktree overlap in presentation files

**Confidence breakdown:**
- Reader/browse architecture: HIGH - clear and already structured in source
- Search gap diagnosis: HIGH - service exists with no live consumer
- Audio gating diagnosis: HIGH - current screens use coarse availability checks
- Daily scripture polish needs: MEDIUM - core logic is covered, live UI may need little or no code

**Research date:** 2026-03-11
**Valid until:** 2026-04-10
</metadata>

---

*Phase: 03-core-reading-and-audio-polish*
*Research completed: 2026-03-11*
*Ready for planning: yes*
