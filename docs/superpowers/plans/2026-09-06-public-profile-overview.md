# Public language profile overview implementation plan

> **For agentic workers:** Use the approved task slices below with the executing-plans workflow. Luna xhigh agents implement; the primary agent reviews integration and browser verification.

**Goal:** Make public language and dialect popups easier to understand with concise identity copy, where spoken with country flags, and supported speaker counts.

**Architecture:** Retain the existing public snapshot boundary and profile component. Derive concise identity and country display from existing public fields, with an explicitly allowlisted optional spokenLocations field for exact GRN regional labels. Keep exact-variety and parent Scripture statuses separate without the declined explanatory disclaimer or related-record links.

**Tech Stack:** Existing Next.js/React/TypeScript, CSS and Python atlas importer; no new dependencies.

## Global constraints

- User-approved scope: short overview; where spoken; speaker count when supported; national flags beside country names.
- Exclude the proposed expanded Scripture-access section, related-language explorer, language-use information, writing/listening information, community perspective, and source/legend restructuring.
- Do not add “We have not established whether that translation serves Momveda speakers,” its equivalent disclaimer, or an Explore Pagibete section.
- Keep source attribution, identifiers, map behavior and current status colors. Do not infer dialect Scripture coverage or population from its parent.
- No invented regions, population estimates, cultural copy or source review dates. Missing speaker counts must remain unreported.
- Preserve existing unrelated WIP; no commits or deployment in this task.

## Task 1: Profile implementation

**Ownership:** `apps/site/components/atlas/PublicAtlasDetails.tsx`, `apps/site/app/atlas.css`, optional small `apps/site/lib/public-atlas-profile.ts` helper and its tests, and `docs/public-language-atlas.md`.

- [x] Derive short identity copy from `kind`, `name`, resolved `parentId`, and country associations. Momveda should be described as a variety of Pagibete, not as a Glottolog database entry. Avoid repeating the status banner in the biography.
- [x] Present country names with flags in a wrapping, accessible Where spoken area. Use existing country flag utilities if applicable. Omit invalid flags and preserve names.
- [x] Put supported `population` values in the overview with accurate population wording. Missing values must not render as zero or inherited counts; only use “speakers” if source semantics support it.
- [x] Keep a short, explicitly parent-scoped Scripture sentence if a known parent status exists; omit the declined caveat and navigation. Preserve unconfirmed exact-variety status and current colors.
- [x] Keep approximate placement clear in a compact note. Preserve existing identifiers, source links, reference locations and map legend.
- [x] Add focused tests for dialect vs parent scope, unsupported population, multi-country/invalid-code flags and concise copy; run the relevant Node tests.
- [x] Document final behavior and remaining data limits.

## Task 2: Existing source data audit

**Ownership:** Investigation of `scripts/language-atlas`, atlas source metadata and selected source records; after primary review, implementation of exact GRN spoken-location enrichment in importer, shared type, public allowlist, tests and regenerated snapshots.

- [x] Determine whether existing imported sources contain reliable language/dialect speaker counts or named sub-country locations currently omitted by the importer.
- [x] Distinguish people-group population from language speakers and exact-variety location from parent approximations.
- [x] Report exact source fields and example evidence, or establish that no suitable values are available. Do not fetch new bulk data or expand the public snapshot without review.
- [x] Audit decision: retain null language/dialect populations; existing aggregate and people-group numbers cannot safely become speaker counts.
- [x] Populate optional `spokenLocations: {label: string; countryCode: string | null; sourceId: string}[]` from exact GRN ROLV `LocationName` and mapped `CountryCode` only. Preserve source label, canonical merge attachment, and source attribution; never inherit parent locations.
- [x] Explicitly allowlist this field into the public projection, regenerate offline, and test exact-variety mapping, merge preservation, no parent inheritance and unchanged record counts.
- [x] Display those labels compactly inside the existing Where spoken section, only when present.

## Task 3: Review and verification

**Ownership:** Primary integration review; an independent Luna review after implementation. Review is read-only unless a concrete fix is assigned.

- [x] Review the diff against all user exclusions and data-scope requirements.
- [x] Run site lint, site typecheck, relevant atlas/site tests and site production build. Run importer checks if data code changes.
- [x] Verify Momveda and a language with multiple countries in the managed browser at desktop and mobile sizes; check flag display, scrolling, close/search behavior and absence of the declined content.
- [x] Report completed changes, fresh verification evidence, data limits and deployment state.


## Verification result

- Final site lint and typecheck pass; admin lint/typecheck pass with one existing custom-font warning in admin/app/layout.tsx.
- All 1,888 workspace tests and 22 Python atlas tests pass. Both deterministic atlas snapshot checks pass.
- Site production build passes in an isolated temporary copy; final profile source, CSS, schema and snapshot match the working tree.
- Public API build trace includes only the public atlas snapshot, with no admin evidence shards.
- Every original snapshot record field and all counts are unchanged; 12,403 exact GRN dialect records gain spoken-location labels. No population values were promoted.
- Browser checks: desktop 1440x960, mobile 390x844 and 320x740; Momveda overview and Congo flag; Alumu-Tesu: Alumu Nigeria/Nassarawa location; English's 166-country disclosure; profile dismissal and horizontal fit. Final nested-dialect regression verifies Algaden references Tigre's Bible status while retaining its own unknown status.
- Independent review findings addressed: correct language ancestor for parent Scripture attribution, omit unknown-country flags, and refresh current snapshot hash documentation.
- Local production preview: http://127.0.0.1:3102 from /private/tmp/everybible-profile-check-w3o856v0. Existing server on 3100 remains untouched. No commits or deployment performed.
