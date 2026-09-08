# Mobile optimization — September 8, 2026

This pass covers the five approved improvements without changing dependencies or publishing a build.

## Behavior

- Translation search normalizes catalog fields once per catalog change, then reuses that index for typed queries. Translation cards are memoized and subscribe to download progress for their own ID; text-download progress no longer invalidates the whole picker.
- Pin moves a translation into My Translations and orders pinned entries first. Unpin restores automatic membership for locally readable translations. Hide removes an inactive translation from that section while preserving downloaded text/audio. Hidden entries remain searchable and Pin restores them. The active translation stays available. Preferences persist locally in a separate MMKV key; all 21 interface locales include the controls.
- An eight-entry in-memory chapter cache shares concurrent reads and retains recently viewed text. Translation, database source, book and chapter all form the key. Database replacement, source changes and verse writes invalidate the cache; pending reads cannot reintroduce old text. Returned formatting/verse objects are independent copies.
- After a reader chapter loads and interactions settle, a cancellable task prefetches the next canonical chapter's local text. Superseded loads and unmounts cancel pending work. Only one speculative read runs at a time. Prefetch adds no network or audio download, autoplay or reading-progress event.
- Audio transport consumers no longer subscribe to five-second resume checkpoints. Resume reads the current saved offset when pressed. Reader progress subscribes to the displayed track, so playback of another chapter cannot drive progress redraws. Matching-track progress, seeking and highlighting retain their existing cadence.
- Home imports specific components/hooks/constants instead of four broad barrels. A diagnostic marker records its first layout followed by completed interactions and an animation-frame callback. Privacy/auth gates are unchanged.

## Deterministic evidence

| Probe | Previous work | Current work |
| --- | ---: | ---: |
| Catalog name reads/normalization, 1,000 entries and five typed queries | 5,000 | 1,000 |
| Three concurrent/repeated reads of one chapter | 3 database calls | 1 database call |
| Current chapter, prefetched next chapter, next chapter, previous chapter | 4 database calls without reuse | 2 database calls |
| Resume-checkpoint changes to transport selector per simulated minute | 12 | 0 |
| Other-track changes to reader progress selector per simulated minute | 240 | 0 |

These are reduced operations and selector changes, not measured device latency or React render counts. Exact active-track progress remains covered separately.

## Verification

- `npm run release:verify` on Node 22.23.2: 1,947 tests passed, zero failures/skips, workspace lint and typechecks and Expo config passed. The existing admin custom-font warning remains.
- Python startup-metric tests: three passed. The parser rejects missing Home readiness and runtime failures rather than reporting activity-display time as usable Home time.
- Production iOS and Android exports passed with Hermes bytecode and assets. The existing `@noble/hashes/crypto.js` package-exports fallback warning remains. Output: `/tmp/eb-mobile-optimization-export`; log: `/tmp/eb-mobile-optimization-export.log`.
- Final mobile typecheck and `git diff --check` passed. Full gate log: `/tmp/eb-mobile-optimization-gate.log`.

No Android device was attached, so physical-device startup, frame smoothness and the new pin/hide UI still need device verification. Production exports establish bundle compatibility, not installed-app interaction proof.

## Measure startup on a device

Install the intended release build, complete onboarding and unlock the app, then run:

```sh
npm run perf:android:startup -- --serial DEVICE_SERIAL --label REVISION --output /tmp/android-startup.json
python3 -m unittest discover -s scripts -p test_android_startup_metrics.py
```

The probe reports `homeInteractionReadyMs` separately from native activity display and module evaluation. It waits up to 15 seconds for readiness. Home readiness is a layout/JS scheduling proxy; verify actual taps separately. Verse content readiness is also separate. The probe does not install builds, clear data, reset emulators or unlock privacy controls.
