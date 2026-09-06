# Public language atlas and Field branding implementation plan

**Goal:** Make the interactive language atlas the first experience on EveryBible's public website, in Field's dark branding, and apply that branding to the admin atlas.

**Architecture:** Reuse the existing MapLibre component and pure atlas helpers through relative imports. Serve a separate, explicitly projected public snapshot from the site. Admin evidence shards and authentication remain independent. The public homepage owns discovery, profiles, and app downloads.

**Tech stack:** Next.js 15, React 19, MapLibre 5.21, existing Field CSS tokens; no new mapping provider.

## Reference and constraints

- Live Field dashboard inspected on 2026-09-05. Use `packages/brand/tokens.css`: warm charcoal surfaces, cream text, blue accents; Bricolage Grotesque, Archivo, JetBrains Mono.
- Preserve initial/reset camera 65°E, 25°N at zoom 2.75. Default globe and individual dots. Keep map/cluster switches, search, hover summaries, and selection accessible.
- Keep Full Bible, NT, portions, no Scripture, and unknown distinct. Never promote parent language status to dialect-specific coverage.
- Public atlas records are research identities, not a count of translations offered in the app.
- The primary public map, search, and collection combine language and dialect/variety records.
  People-group research remains in the snapshot for a future separate overlay and is not shown in
  the primary public atlas.
- User confirmed existing Joshua Project permission covers public republication. Retain linked attribution. No source media or long copyrighted biographies are copied into the public projection.
- Existing smart download QR and verified store URLs remain canonical; retain `#download` destination for desktop routing.
- Preserve unrelated main-checkout work. Separate existing deployment task exclusively owns main integration and both Vercel releases.

## Reviewable slices

- [x] Sol High: replace admin atlas neutral overrides with Field tokens; align map and semantic swatches; check light/dark/high-contrast modes.
- [x] Astra builder: map-first responsive public homepage, dark default, summary profiles, search/filter/list controls, source attribution and app-download QR; reuse map engine without admin server imports.
- [x] Root: whitelist public record/location/source fields into deterministic gzip snapshot, streaming public endpoint, boundary/regeneration tests, documentation.
- [x] Root: review source, desktop/mobile browser interactions, initial camera, QR destination, public/admin access separation, artifact tracing; run workspace verification and both production builds.
- [ ] Deployment owner: integrate exact reviewed commit into local main, preserve WIP, deploy site and admin, verify both live targets and report exact revisions.
