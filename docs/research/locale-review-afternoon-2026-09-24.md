# Locale review: interface strings changed on 2026-09-24 (afternoon pass)

Scope: every `en.ts` key added or changed since 2026-09-24 06:00 local
(`git log --since='2026-09-24 06:00' -- src/i18n/locales/en.ts`, base
`c0e587be`). That is 104 key stems, including plural variants: feedback inbox
tabs and filters, relative times, prayer-wall toasts, report/block/moderation,
translator queue and passcode coverage, offline/queued feedback, onboarding
catalog and download errors, blocked-notifications notice, password-reset
(PKCE) messages, group-sync copy, plan tallies, rhythm labels, streak and
ledger plurals, VOTD "Read in BSB", Learn passage retry, sleep/skip a11y,
translation queue.

All 20 non-English locales were read key by key for meaning, natural app
phrasing, terms matching the rest of the file (Bible, verse, chapter, prayer
wall, passcode, download, device), formal/informal address, Christian register,
`{{…}}` tokens and plural variants. Plurals were checked against how the app
uses them. `readingPlans.daysReadSummary` receives `{{days}}` already formatted
by `durationDays` ("365 days"), and every locale composes correctly with it.
Arabic and Russian relative-time, streak, ledger and chapter-count plurals are
correct. Arabic `streakUnitLabel_two` is pinned by `HomeScreen.render.test.tsx`
and was left alone. There was no mojibake and no untranslated English. Brand
names stay in Latin script as intended.

Most of these strings had already been reviewed natively. Commit `340aee0e`
and the earlier `locale-review-*-2026-09-24-*` reports cover them, so this
pass found only a small number of defects.

## Fixes

| Key | Locale | Old | New | Why |
| --- | --- | --- | --- | --- |
| `feedback.doneTab` | ar | منتهية | مكتملة | منتهية reads as "ended/expired". The tab holds reviewed (completed) feedback, so مكتملة ("completed") is correct and pairs with مفتوحة ("open"). |
| `bible.chapterFeedbackQueued` | mr | …या डिव्हाइसवर जतन… | …या उपकरणावर जतन… | The file uses उपकरण for "device" 28 times. This was the only डिव्हाइस. |
| `bible.chapterFeedbackQueued` | ne | …यो उपकरणमा सुरक्षित… | …यो यन्त्रमा सुरक्षित… | The file uses यन्त्र 31 times and उपकरण 4 times. Every other string added today says यन्त्र. |
| `onboarding.catalogUnavailableBody` | pa | …ਅਤੇ ਔਫਲਾਈਨ ਵੀ… | …ਅਤੇ ਆਫ਼ਲਾਈਨ ਵੀ… | This was a one-off spelling. The file spells "offline" ਆਫ਼ਲਾਈਨ (decomposed ਫ + ਼) everywhere else. |
| `groups.syncSession.savedLessonUnchanged` | zh | 聚会已保存，但小组未能进入下一节。 | 聚会已保存，但小组未能进入下一课。 | 节 is the verse/section counter. The groups namespace calls a lesson 课 (`nextLesson: 下一课：{{title}}`, `lessonsCompleted: 已完成 … 课`). |
| `home.borrowedPassageTitle` | tr | {{passage}}, {{translation}} içinde yok | {{passage}}, {{translation}} çevirisinde yok | "X içinde yok" sounds mechanical. The rest of the Turkish file names a translation as "{{translation}} çevirisi" (see `borrowedPassageBody` and `translatorQueue.switchTo`). |

## Checked and left as is

- **ar:** `*_two` forms use the singular after a digit ("2 يوم"). This is
  standard for numeral-first UI strings and matches `durationDays`.
- **hi, ur, mr, ne, pa:** `feedback.sourceFilter` ("Show feedback from these")
  works as a header above the Everyone/Community/Council chips.
- **ur:** `interface.highlightRemoved` (نمایاں ہٹا دیا گیا) matches the file's
  existing `annotations.removeHighlight` (نمایاں ہٹائیں).
- **es:** `interface.groupShareMessage` "Código de acceso" matches the in-app
  `groups.joinCode` label.
- **ko:** 댓글 in `feedback.plainPositive` matches `feedback.showComments`.
  Mixing 해요 toasts with 합니다 messages is already the file's pattern.
- **pa:** the verse term ਆਇਤ matches `bible.verse` and `verseOfTheDay`.
- **de, fr, es, pt:** the capitalised standalone relative times ("Vor…",
  "Il y a…", "Hace…", "Há…") are correct. `formatRelativeTime` renders them on
  their own. The `more.sync.relative*` variants are lowercase because they
  follow "synchronisiert"/"sincronizado".
