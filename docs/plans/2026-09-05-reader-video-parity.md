# Reader controls and Liquid Glass parity

## Clone Brief

Scope: the existing reader play/pause control, previous/next chapter buttons,
scroll motion, and root tab bar. The second supplied September 5 recording is
the visual reference; the first shows the mismatch. Preserve EveryBible's
routes, theme choices, localized labels, Bible content, and audio behavior.

## Evidence Log

Both supplied recordings are 1320×2868 pixels, or 440×956 logical points.
`ScreenRecording_09-05-2026 10-38-39_1.MP4` is the current-app recording;
`ScreenRecording_09-05-2026 10-39-21_1.MP4` is the target.

Observed target measurements (approximately ±2 points):

| Surface | Expanded | Collapsed |
| --- | --- | --- |
| Tab capsule | x 21, y 874, width 398, height 60 | Translates down 132 |
| Selection | About 84×54, neutral translucent fill | Moves with capsule |
| Play circle | Diameter 64, center (220, 824), no visible progress ring | Center (220, 889), same diameter |
| Chapter arrows | Diameter 40, centers (44, 837)/(396, 837) | Translate down 132 |

The target collapse at approximately 0.45–0.60 seconds and reveal at 8.09–8.35
seconds show coordinated translation, without visible scale growth or a strong
fade. The current recording lets the play button descend behind a stationary
tab bar before hiding the bar. The target reveals controls deep in a chapter
when scrolling reverses.

## Reconstruction Spec

- One continuous UI-thread scroll calculation drives the local dock and root
  tab bar. Direction changes consume actual deltas, including slow drags.
- Tabs and arrows travel 132 points; the play circle travels 65. Their paths keep
  the play button clear of the tab bar throughout the transition.
- Clamp rubber-band offsets before calculating deltas. Reveal progressively
  near the first/last verse without changing the list's content padding.
- Keep each retained reader's offset; only the focused route may publish root
  tab progress. Owner-checked cleanup prevents stale readers changing it.
- Keep the smaller arrow artwork inside a 48-point interaction area; remove
  fully collapsed arrows from accessibility traversal.
- Reduced Motion keeps the complete reader controls stationary.
- Use native `expo-glass-effect` on supported iOS 26 builds, with the existing
  blur material on unsupported platforms. Never lower a native glass ancestor's
  opacity. Use one sliding neutral selection background.

## Feature / State Matrix

| State | Required behavior |
| --- | --- |
| Paused / playing | Actual transport state selects play/pause; same circle size |
| Loading | Busy accessibility state; prevent duplicate load taps |
| No previous/next chapter | Disabled, localized control |
| Scrolling / reversal | Continuous coordinated travel |
| Short chapter / end bounce | Complete controls stay available |
| Chapter change / retained reader | Reset only the correct chapter's offset |
| Plan reader / verse selection | Preserve existing explicit root-tab hiding |
| Other root tab | Ignore retained reader scroll progress |
| Offline | Bundled reading and existing cached audio behavior preserved |
| Reduced Motion | Stationary reader controls; direct selection changes |

## Unknowns

The recording does not demonstrate audio loading/failure, playback taps, tab
selection, VoiceOver, older iOS, or Android. Preserve their existing behavior
while validating the changed controls. Exact private easing and native control
implementation cannot be determined from the recording.

## Native dependency decision

Adopt Expo GlassEffect 0.1.10 (MIT), from the existing Expo SDK 54 dependency map.
It exposes Apple's native material and avoids a custom native bridge or a
navigation-library migration. The fastest and safest integration is a
childless native glass background behind the existing navigator's controls.

The package's Fabric child-mount overrides do not compile against this app's
legacy ExpoClassicView. `patches/expo-glass-effect+0.1.10.patch` guards those
overrides with `RCT_NEW_ARCH_ENABLED`; it preserves the native material and
existing architecture. Recheck the patch when upgrading Expo. Do not use the
patched legacy component as a container for content without validating child
mounting separately.

Sources: [Expo SDK 54 GlassEffect](https://docs.expo.dev/versions/v54.0.0/sdk/glass-effect/)
and the installed ExpoModulesCore/GlassEffect Swift implementations.

## Proposed GSD Phases

1. Evidence and geometry specification.
2. Shared motion, native material, and reader control implementation.
3. Regression checks and iPhone 17 Pro Max visual/interaction verification.

## Recommended Next Command

Selected workflow: `/gsd:quick --discuss --full Match reader controls and liquid glass tabs to September video`.
The existing React Native/Expo stack determines the implementation. The user
delegated visual decisions to the reference; no backend changes are needed.

Verification results are recorded in the corresponding quick-task summary.
