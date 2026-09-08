# Mobile optimization implementation plan

Approved scope: improve translation selection, chapter navigation, personal translation organization, reader playback rendering, and Android startup. Use Astra with low reasoning for delegated work. Preserve downloads, privacy gates, current reading position, and existing work.

## Reviewable slices

1. Translation picker: build a reusable search index when the catalog changes, isolate row updates, and persist pin/hide preferences separately from text/audio installation. Hidden translations remain discoverable and restorable; the active translation remains available. Cover filtering and preference behavior with regression tests.
2. Chapter navigation: bounded recent-text cache with concurrent request sharing, retry after failure, and invalidation when database sources change. Prefetch the next chapter's local text after a successful reader load. Cover keys, bounds, failures, and invalidation with deterministic tests.
3. Reader playback: inspect existing memoization, then remove remaining unnecessary playback subscriptions/derivations while retaining accurate highlighting and seeking. Cover the actual selected behavior and integrate prefetch.
4. Startup: remove remaining broad imports from the Home entry path, add a Home interaction-ready measurement distinct from native activity display, and preserve auth/privacy initialization ordering. Verify import boundaries and measurement parsing.
5. Integration: review changes, run focused regressions then `npm run release:verify`, check formatting and diff, and perform available device/build checks. Record measured work reductions and distinguish these from physical-device speed claims.

No dependency upgrades, publishing, merge, or release is included.
