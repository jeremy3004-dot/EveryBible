# Locale review of 2026-09-24 strings: es, fr, pt, ru, id, de, ja, tr, vi, ko

Scope: all 98 English keys (108 values, plural forms included) added or changed in
`src/i18n/locales/en.ts` since `7272e37` (the last en.ts commit before today; all 28
en.ts commits after it are dated 2026-09-24). Each key was compared in the 10 locales,
along with locale-only plural variants (`_few`, `_many`).

Checks: meaning, natural phrasing, form of address (es tú, fr vous, pt-BR você, ru вы,
de du, tr siz, id Anda, vi bạn), Christian terms (prayer request, prayer wall, answered
prayer), `{{…}}` tokens, plural forms, mojibake, English left in place, and the same
concept worded the same way across today's keys.

Overall: the tokens and plural forms were all correct. The problems were uneven terms,
one locale drifting into a different regional variant, and a few literal translations.
There was no mojibake or English left in place.

## Cross-locale

| Key | Old | New | Why |
|---|---|---|---|
| `settings.notificationsBlockedNotice` (en + all 10) | `EveryBible` | `Every Bible` | Today's display-name pass (20575fd2) missed this new key. **The other 10 locales (ar, bn, hi, mr, ne, pa, ta, te, ur, zh) still say `EveryBible`.** |
| `interface.prayerYouEncouraged` (es, fr, pt, de, tr, vi, ko) | "you encouraged this request" | "you encouraged this person" / "sent encouragement" | Encourage verbs take a person. "Encouraging a request" reads as an error. |

## pt (Brazilian Portuguese; the rest of the file uses você, salvar, acessar)

| Key | Old | New | Why |
|---|---|---|---|
| `feedback.waiting` | A aguardar a sua decisão: {{count}} | Aguardando sua decisão: {{count}} | European Portuguese construction |
| `feedback.skip` | Ignorar por agora | Pular por enquanto | European Portuguese; "Ignorar" reads as "ignore" |
| `feedback.statusFilter` | Estado da revisão | Status da revisão | Brazilian Portuguese uses "status" |
| `common.shareMessage` | Confira Every Bible! | Confira o Every Bible! | The file uses the article everywhere else ("Sobre o Every Bible") |
| `interface.prayerYouEncouraged` | Você encorajou este pedido | Você encorajou esta pessoa | see cross-locale |
| `feedback.councilAccessBody` (pre-existing) | Introduza o código… | Digite o código… | Same screen as today's inbox. Its European Portuguese text clashed with the new keys |
| `feedback.submittingCommunity/Council` (pre-existing) | A enviar como… | Enviando como… | same |
| `feedback.complete / reviewFeedback / markReviewed / reviewed / reviewPositive / bulkConfirm` (pre-existing) | revistos / Rever / revisto / Revisto / revistas | revisados / Revisar / revisado / Revisado / revisadas | same |
| `feedback.needsReview / awaitingReview` (pre-existing) | A aguardar revisão | Aguardando revisão | same |
| `feedback.noChange` (pre-existing) | Não é necessária alteração | Nenhuma alteração necessária | same |

## fr

| Key | Old | New | Why |
|---|---|---|---|
| `home.ledgerThisMonth_one` | {{active}}/{{count}} jours | {{active}}/{{count}} jour | `_one` covers a count of 0 or 1, so the plural "jours" was wrong |
| `readingActivity.legendProgress_one` | {{read}}/{{count}} jours | {{read}}/{{count}} jour | same |
| `prayer.moreActions`, `prayer.reportBody`, `prayer.blockBody`, `prayer.underReview` | `'` | `’` | The file uses typographic apostrophes (279 vs 4) |
| `interface.prayerYouEncouraged` | …encouragé cette demande | …encouragé cette personne | see cross-locale |

## ru

| Key | Old | New | Why |
|---|---|---|---|
| `interface.prayerYouPrayed` | …об этой просьбе | …об этой нужде | The file's term for a prayer request is молитвенная нужда |
| `interface.prayerYouEncouraged` | …эту просьбу | …эту нужду | same |
| `readingPlans.chapterCount_one/_few/_many/_other` | {{count}} гл. (all forms) | глава / главы / глав / главы | Abbreviated in every form even though the plural keys exist; the other locales write the word out |
| `groups.syncedProgress` | Успехи группы появятся… | Прогресс группы появится… | The file uses "прогресс" 9 times and "успехи" only here |
| `groups.syncedGroupPreviewBody` | …за успехами этой группы | …за прогрессом этой группы | same |
| `feedback.skip` | Пропустить пока | Пока пропустить | Natural word order |
| `common.shareMessage` | Посмотрите Every Bible! | Попробуйте Every Bible! | "Посмотрите" means "look at"; this is an invitation to try the app |

## de

| Key | Old | New | Why |
|---|---|---|---|
| `interface.prayerYouEncouraged` | Du hast diese Bitte ermutigt | Du hast diese Person ermutigt | "Bitte" differs from the file's "Anliegen", and "ermutigen" takes a person |
| `interface.daysAgo_one/_other` | Vor {{count}} T. | Vor {{count}} Tag / Tagen | "T." is not a normal German abbreviation for days, and the keys are already plural-aware |
| `more.sync.relativeDays_one/_other` | vor {{count}} T. | vor {{count}} Tag / Tagen | same |

## ja

| Key | Old | New | Why |
|---|---|---|---|
| `prayer.report`, `reportTitle`, `reportSend`, `reportRateLimited` | 報告 | 通報 | 通報 is the standard word for reporting abuse in Japanese apps; 報告 means a general report |
| `feedback.everyone` | 全員 | すべて | Matches `feedback.all` (すべて) in the same filter set |
| `groups.syncSession.backendUnavailable`, `groups.syncedGroupPreviewBody` | 集まりの記録 | セッション記録 | The file calls group sessions セッション (17 uses), including today's `savedLessonUnchanged` |
| `groups.syncedProgress`, `groups.syncedGroupPreviewBody` | 進み具合 | 進捗 | 進捗 is the file's usual word for progress |

## ko

| Key | Old | New | Why |
|---|---|---|---|
| `feedback.everyone` | 모든 사람 | 전체 | Filter option. Matches `feedback.all` (전체) |
| `feedback.sourceFilter` | 의견 보기 대상 | 의견 작성자 | The old text was awkward. The options are Everyone, Council and Community, so "author" fits |
| `prayer.moreActions` | 더 보기 | 기타 작업 | "더 보기" means "see more", which is wrong for a screen reader announcing an actions menu |
| `interface.prayerYouEncouraged` | 이 기도 제목을 격려했어요 | 이 기도 제목에 격려를 보냈어요 | 격려하다 takes a person |
| `groups.syncSession.backendUnavailable`, `groups.syncedGroupPreviewBody` | 모임 기록 | 세션 기록 | The file uses 세션 for group sessions (18 uses), including today's `savedLessonUnchanged`. 모임 is the Gather tab |

## tr

| Key | Old | New | Why |
|---|---|---|---|
| `prayer.contentRejected`, `prayer.postingBlocked` | Duvarı'nda | Duvarı’nda | The file uses ’ for suffix apostrophes everywhere else |
| `interface.prayerYouEncouraged` | Bu isteği yüreklendirdiniz | Bu kişiyi yüreklendirdiniz | yüreklendirmek takes a person |

## vi

| Key | Old | New | Why |
|---|---|---|---|
| `interface.prayerYouPrayed` | …cho lời cầu xin này | …cho điều này | The file's term for a prayer request is "điều cần cầu nguyện", not "lời cầu xin" |
| `interface.prayerYouEncouraged` | Bạn đã khích lệ lời cầu xin này | Bạn đã khích lệ người này | same, and khích lệ takes a person |

## id

| Key | Old | New | Why |
|---|---|---|---|
| `onboarding.catalogUnavailableTitle` | Tidak dapat menjangkau pustaka Alkitab | Tidak dapat terhubung ke pustaka Alkitab | "menjangkau" is a literal "reach". Connection errors use "terhubung", as `auth.serviceUnavailable` already does |

## es

Only the cross-locale `prayerYouEncouraged` fix: "Animaste esta petición" became "Animaste a esta persona".

## Checked and left as they are

- The ru plural forms for "N of M days" (`из 1 дня`, `из 2 дней`, `из 5 дней`) are correct.
- The fr and es `_many` forms ("{{count}} de chapitres") are correct for the CLDR "many" category, which covers millions.
- For the `daysReadSummary` keys, `{{days}}` is already a formatted "365 days" string, so ja `{{days}}のうち{{read}}日` and ko `{{days}} 중 {{read}}일` read correctly.
- ko mixes 해요체 in the prayer and screen-reader announcements with 합니다체 elsewhere. That was the case before today, and the new keys follow the neighbouring keys.

## Open English-side issues, not fixed here

- en `translatorQueue.notCoveredTitle` says "access code", but the rest of the English file says "passcode". The locales already use one term throughout.

## Verification

- `node --test --import tsx src/i18n/locales/coverage.test.ts src/i18n/locales/coreLocaleCoverage.test.ts src/i18n/interfaceCoverage.test.ts src/i18n/interfaceRendering.test.ts`: 38/38 pass
- `npm run typecheck`: clean
- `npm run i18n:native:check`: current for 21 languages
