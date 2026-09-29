# Authoritative Store Screenshot Sets

This file is the single source of truth for store screenshot uploads. Upload
only the folders listed here, in the order listed.

The current look is the terracotta set: warm paper and dark-brown backgrounds,
"EVERY BIBLE" eyebrow, serif headline with a terracotta second line. The frames
are from 2026-09-25 (live on 1.0.9 and 1.0.10); on 2026-09-29 screens 1–5 were
refreshed with the current app (new Home, Seasons of life plans, reader, Gather).

## Apple App Store

| Slot                                           | Folder                      | Size      |
| ---------------------------------------------- | --------------------------- | --------- |
| `APP_IPHONE_67` (6.9"/6.7")                    | `ios/iphone-69-2026-09-29/` | 1320x2868 |
| `APP_IPHONE_65` (6.5")                         | `ios/iphone-65-2026-09-29/` | 1242x2688 |
| `APP_IPAD_PRO_3GEN_129` and `APP_IPAD_PRO_129` | `ios/ipad-129-2026-09-09/`  | 2048x2732 |

iPhone order (same in both iPhone folders):

1. `01-begin.jpg`
2. `02-light-dark.jpg`
3. `03-plans.jpg`
4. `04-highlight.jpg`
5. `05-gather.jpg`
6. `06-language.jpg`
7. `07-listen.jpg`

iPad order: `01-home.png`, `02-bible.png`, `03-gather.png`, `04-plans.png`.

When creating a new App Store version, check every screenshot set on it
(iPhone and both iPad slots). App Store Connect copies the previous version's
screenshots forward, so a stale set in any slot will go live again.

## Google Play

Folder: `google-play-2026-09-29/` (1080x2160 phone screenshots, same seven
headlines and order as the iPhone set, as `.jpg`), plus
`google-play-2026-09-29/feature-graphic.png`. `npm run play:publish-listing`
reads this folder.

## Retired — never upload

The old red "READ THE BIBLE OFFLINE" / "TRACK YOUR READING HABIT" sets from
March–April 2026 (maroon `#C0392B` background) were deleted from the repo on
2026-09-29, together with the scripts that generated them, after they were
re-uploaded to App Store version 1.0.11 by mistake. They must not come back:
`scripts/storeScreenshots.test.ts` fails if any of their folders or file names
reappear.

`ios/iphone-69-2026-08-28/` and `android/` are older designs kept for
reference only. Do not upload them either.
