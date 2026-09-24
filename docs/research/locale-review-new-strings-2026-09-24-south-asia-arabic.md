# Locale review: new strings, 2026-09-24 (zh, hi, ar, bn, ur, pa, mr, te, ta, ne)

This is a second-opinion review of the interface strings added to `en.ts` since 2026-09-22 (commits
c0e587be, 8c8f5687, 20e9794d, 495a84dc, adb92126). No `src/i18n/native/*.json` files changed in that window.

I reviewed 12 keys:

- `bible.audioClipStart` and `bible.audioClipEnd` (screen-reader names for the clip handles)
- `audio.skipBackward` and `audio.skipForward`
- `translatorQueue.notCoveredTitle`, `notCoveredBody`, `notCoveredNone`, `switchTo` and `switchNeedsDownload`
- `readingPlans.noActivePlansBody`
- `readingPlans.daysReadSummary` and `daysReadMissedSummary`. Here `{{days}}` is the already-pluralised
  `durationDays` string (for example "365 दिन"), not a bare number.

None of these keys involves God, the Bible, prayer or church, so there were no religious-register issues.
Every `{{…}}` token is preserved. No key is pluralised. I found no mojibake. The Arabic and Urdu strings read
correctly right to left.

## Fixes

| Locale | Key | Old | New | Why |
|---|---|---|---|---|
| mr | `readingPlans.daysReadSummary` | `{{days}}पैकी {{read}}` | `{{read}}/{{days}}` | With `{{days}}` = "365 दिवस", this renders "365 दिवसपैकी", which is ungrammatical. The oblique form "दिवसांपैकी" is required, and the pluralised `{{days}}` string can't supply it. |
| mr | `readingPlans.daysReadMissedSummary` | `{{days}}पैकी {{read}} · {{missed}} चुकले` | `{{read}}/{{days}} · {{missed}} चुकले` | Same case error as above. |
| ar | `readingPlans.daysReadMissedSummary` | `… · {{missed}} فائت` | `… · فاتك {{missed}}` | A bare number followed by a masculine singular adjective ("3 فائت") isn't grammatical Arabic. "فاتك 3" ("you missed 3") is natural. |
| ta | `readingPlans.daysReadMissedSummary` | `… · {{missed}} தவறியது` | `… · தவறியவை: {{missed}}` | The singular "தவறியது" was used for a plural count. Changed to the neuter plural, in the same label style as te. |
| bn | `readingPlans.daysReadMissedSummary` | `… · {{missed}}টি বাদ` | `… · {{missed}} দিন বাদ` | "3টি বাদ" means "3 items skipped" and doesn't say what was counted, which is the problem commit adb92126 set out to fix. Days are counted with "দিন", not the "টি" classifier. |
| zh | `readingPlans.daysReadMissedSummary` | `… · 错过 {{missed}}` | `… · 漏读 {{missed}} 天` | A bare number with no measure word reads as unfinished. "漏读…天" says what was missed. |
| zh | `readingPlans.noActivePlansBody` | `浏览阅读计划，开始其中一个。` | `浏览阅读计划，选一个开始吧。` | "开始其中一个" is word-for-word translationese. The new wording is the natural empty-state invitation. |
| hi | `translatorQueue.notCoveredNone` | `…जिसने आपको कोड दिया है, उनसे…` | `…जिन्होंने आपको कोड दिया है, उनसे…` | The relative clause was singular ("जिसने") but the pronoun was honorific ("उनसे"). Made both honorific. |

## Reviewed and left unchanged

- **hi, ur, pa `daysReadSummary`:** "365 दिन में से 12" and its ur/pa equivalents use the direct form rather than
  the oblique plural (दिनों / دنوں / ਦਿਨਾਂ). This is common in speech and fine for a compact tally.
- **ne `daysReadSummary`:** "365 दिनमध्ये 12" is grammatical Nepali. The postposition attaches without an oblique form.
- **ar `daysReadSummary`:** "12 من 365 يومًا" follows the Arabic number–noun rules through `durationDays_many`,
  and the accusative after 11–99 is correct even after "من".
- **ur `translatorQueue.notCoveredNone`:** "جس نے … اس سے" is consistently singular. The sentence is grammatical, so I left it.
- **zh translatorQueue:** "访问码" differs from the "译者密码" used in settings. The English also differs ("access
  code" vs "passcode"), and both are natural, so I left it.
- All locales use Western digits in hard-coded numbers (for example "10 सेकंड"), which matches the rest of each file.
