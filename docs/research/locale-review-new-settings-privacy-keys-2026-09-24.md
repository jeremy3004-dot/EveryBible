# Locale review: settings, discreet-mode and search keys (2026-09-24, evening)

Scope: `en.ts` keys added after the afternoon pass (`26f8dd27`, which covered
everything up to `98b259d6`):

- `settings.notificationsNotAllowedNotice`, `settings.allowNotifications` (`36538d0c`)
- `privacy.discreetNotificationTitle`, `privacy.discreetNotificationBody`,
  `privacy.discreetNotificationChannel` (`b65cda52`)
- `bible.searchNoResults` (`f179f998`)

No other `en.ts` keys changed after the afternoon pass.

All 20 non-English locales were read against neighbouring keys
(`settings.notifications`, `dailyReminder`, `enableNotifications`,
`notificationsBlockedNotice`, `openDeviceSettings`,
`notifications.channelDailyReminder`, `bible.verse`, `bible.searchUnavailable`)
for meaning, natural phrasing, consistent terms, address register, tokens
(none in scope), plurals (none in scope) and RTL (ar/ur start with native script,
brand name stays Latin mid-sentence; the discreet strings contain no Latin).

## Discreet-mode strings

Every locale's title, body and Android channel name is neutral: a plain
"reminder / you have a reminder today / reminders". None mentions the Bible,
church, God, prayer, verses, faith, reading or the app name. Korean uses 알림
(the file's word for the daily reminder) which is equally generic.

## Fixes

| Key                                                                                                            | Locale | Old                                                                            | New                                                                                                               | Why                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `settings.notificationsNotAllowedNotice`                                                                       | es     | …notificaciones en este dispositivo para que este recordatorio pueda aparecer. | Para que este recordatorio aparezca, Every Bible necesita permiso para enviar notificaciones en este dispositivo. | Removed the clumsy "para … para que" chain.                                                                                                                                                                          |
| `settings.notificationsNotAllowedNotice`                                                                       | pt     | …neste dispositivo para que este lembrete possa aparecer.                      | Para que este lembrete apareça, o Every Bible precisa de permissão para enviar notificações neste dispositivo.    | Same "para … para que" chain.                                                                                                                                                                                        |
| `settings.notificationsNotAllowedNotice`                                                                       | ur     | یہ یاد دہانی ظاہر ہونے کے لیے…                                                 | اس یاد دہانی کے ظاہر ہونے کے لیے…                                                                                 | Ungrammatical subject (needs the oblique case + کے before the infinitive).                                                                                                                                           |
| `settings.notificationsNotAllowedNotice`, `settings.allowNotifications`, `settings.notificationsBlockedNotice` | de     | Mitteilungen … / Mitteilungen erlauben                                         | Benachrichtigungen … / Benachrichtigungen erlauben                                                                | The Settings section header, `enableNotifications` and every other string in `de.ts` say "Benachrichtigungen"; only this notice pair used the iOS-only "Mitteilungen", so the section mixed two words for one thing. |
| `privacy.discreetNotificationBody`                                                                             | id     | Anda punya pengingat untuk hari ini.                                           | Ada pengingat untuk Anda hari ini.                                                                                | Casual "punya" next to formal "Anda"; the new form reads like a standard system reminder.                                                                                                                            |
| `privacy.discreetNotificationBody`                                                                             | vi     | Bạn có một nhắc nhở cho hôm nay.                                               | Bạn có một lời nhắc cho hôm nay.                                                                                  | "một nhắc nhở" is unidiomatic as a countable noun; the file already uses "lời nhắc" for a single reminder.                                                                                                           |

Everything else in scope was already correct and was left unchanged.

## Verification

- `TSX_DISABLE_CACHE=1 node --test --import tsx src/i18n/locales/coverage.test.ts src/i18n/locales/coreLocaleCoverage.test.ts src/i18n/interfaceCoverage.test.ts src/i18n/interfaceRendering.test.ts` passed (38/38).
- `npm run typecheck` passed (tsc + strict: 0 errors).
- `npm run format:check` passed.
