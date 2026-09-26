# App bug hunt — 2026-09-26, round eight

Base: `3d99cf85` on local `main`.

The primary agent mapped the flows, traced their state transitions, and reproduced
the failures before assigning implementation to GPT-6 Sol agents with high
reasoning. Primary integration review added an iOS modal handoff reproduction.

## Area map

| Area                            | Boundaries examined                                                                                                  | Confirmed failures                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Incoming links during startup   | App URL capture, locked/onboarding boot, lazy navigator import, parked links, navigation readiness                   | A Bible link received before the first navigator mount was lost                                                                               |
| Audio file and clip sharing     | Reader route and translation, chooser modal dismissal, dependency loading, download, trim, native sharing, unmount   | Work outlived its screen; failed trim-module loading escaped error handling; double taps duplicated work; iOS sharing raced chooser dismissal |
| Privacy lock and native prompts | AppState transitions, pending prompt grace, settlement tail, delayed icon alert, suspended timers, foreground return | An already-inactive iOS app could remain unlocked past the grace cap                                                                          |

## Confirmed bugs and corrections

### Links received before the first navigator mount were lost

The parked-link listener was installed when React Navigation first subscribed.
The app deliberately defers importing and mounting that navigator while locked
or onboarding. Its earlier URL listener handled authentication only, so a Bible
link received during that interval was not retained.

Startup and navigation now share a lightweight capture module. It retains the
latest link until a mounted navigator reports ready, including a cold start that
has not mounted navigation yet. Capture does not import the navigator or its
screen graph early. Cold-launch URL delivery remains once per runtime.

Primary failing evidence: `/tmp/everybible-round8-link-red.log`. The actual App
render regression failed with no link delivered after the initial lock.

### Audio preparation outlived the reader that requested it

An awaited chapter download could finish after Back or the privacy lock unmounted
the reader, then open native sharing above the new screen. Pending clip work had
the same ownership problem. The operation must still belong to the mounted
reader, its chapter/translation, and its draft before continuing or updating UI.

The hooks now invalidate stale operations and suppress their later native
presentations, draft changes, alerts, and busy-state writes. A previous operation
cannot clear a replacement operation's state.

### Audio trim loading bypassed error handling and the busy guard

The clip confirmation handler awaited the native trim module before entering its
try/catch or setting busy state. A missing module rejected a handler invoked with
`void` by the UI. Another tap while that import was pending started a second trim
and share.

Loading now belongs to the guarded operation. A synchronous guard blocks a second
request before React renders the disabled button; normal failures report an error
and leave the operation retryable.

Primary failing evidence for these three cases:
`/tmp/everybible-round8-audio-red.log` (three failures before implementation).

### iOS sharing could start before its chooser finished dismissing

Waiting for interactions or an arbitrary timeout did not establish that the
native chooser had finished fading out. The screen regression observed native
sharing before the chooser's dismissal callback. This is the same presentation
boundary already handled explicitly by verse-image sharing.

The handoff now uses the iOS modal dismissal callback, with the appropriate
Android path and stale-operation checks. The installed React Native 0.81 Modal
implementation and official documentation consulted through Context7 identify
`onDismiss` as the completion callback for dismissal on iOS.

Primary failing evidence: `/tmp/everybible-round8-audio-screen-red.log`.

### The iOS privacy grace cap was not enforced once inactive

If the app entered inactive state while its own prompt was inside the grace
window, the hook deferred locking but armed no iOS deadline. Staying inactive
past the cap, or returning after timers were suspended, did not lock. Earlier
tests only entered inactive state after the cap had already expired.

A bounded deadline now applies throughout that absence. It locks while away, or
checks the clock on return when JavaScript timers did not run. Prompt settlement
can shorten the deadline to the normal short tail; repeated events and additional
prompts cannot extend the same absence indefinitely. Returning before expiry or
unmounting cleans up the timer. Android's permission-prompt behavior remains
covered, and share sheets remain outside privacy grace.

Primary failing evidence: `/tmp/everybible-round8-privacy-red.log` (both timer and
suspended-timer cases failed before implementation).

## Verification

- Primary independent checks passed: 75 boot/link/startup tests, 64 privacy and
  related screen tests, and 55 reader/audio-sharing tests. Logs:
  `/tmp/everybible-round8-links-primary.log`,
  `/tmp/everybible-round8-privacy-primary.log`, and
  `/tmp/everybible-round8-audio-primary.log`.
- The combined review caught an App boot fixture missing the new privacy grace
  exports. It now uses the real lightweight grace functions; the existing test
  proving a failed runtime-effects host cannot disable the lock passes again.
- `npm run release:verify` passed: root/workspace lint, typechecks including the
  strict gate, all 8,801 tests with zero failures or skips, and Expo configuration
  validation. The existing admin custom-font lint warning remains unrelated.
  Evidence: `/tmp/everybible-round8-release-verify.log`.
- iOS and Android production exports passed at `/tmp/everybible-round8-export`.
- Changed-file Prettier and `git diff --check` passed.

The local commit contains only these changes, their regression coverage, and this
report. Unrelated workspace files remain untouched.

The automated tests exercise real app, screen, hook, and navigation code with
controlled native adapters. Actual UIKit presentation and operating-system
lifecycle timing still require phone testing. No release or push is included.
