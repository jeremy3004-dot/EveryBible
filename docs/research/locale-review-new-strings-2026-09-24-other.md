# Locale review: new strings, 2026-09-22 to 2026-09-24 (es, fr, pt, ru, id, de, ja, tr, vi, ko)

Scope: the 12 keys added or renamed in `en.ts` since 2026-09-22 (base 63ba5cf9):
`translatorQueue.notCoveredTitle/Body/None`, `translatorQueue.switchTo`, `translatorQueue.switchNeedsDownload`,
`bible.audioClipStart/End`, `audio.skipBackward/Forward`, `readingPlans.noActivePlansBody`,
`readingPlans.daysReadSummary`, `readingPlans.daysReadMissedSummary`. No `src/i18n/native/*.json` changes in the window.

Context checked in code: `{{days}}` in the tally strings is the already-formatted `readingPlans.durationDays`
("365 Tage", "365日間", "365 дней"), so it must read correctly as a nominative noun phrase. The "access code" in
`notCovered*` is the translator passcode entered in Settings (`settings.translatorAccessPlaceholder`).

All tokens, plural forms and address forms (tú, vous, você, вы, du, Anda) were already correct. fr needed no changes.

| Locale | Key | Old | New | Why |
|---|---|---|---|---|
| de | readingPlans.daysReadSummary | `{{read}} von {{days}}` | `{{read}}/{{days}}` | Rendered "12 von 365 Tage". *von* needs the dative *Tagen*, but `{{days}}` is nominative. |
| de | readingPlans.daysReadMissedSummary | `{{read}} von {{days}} · {{missed}} verpasst` | `{{read}}/{{days}} · {{missed}} verpasst` | Same case error. |
| de | audio.skipBackward | 10 Sekunden zurück | 10 Sekunden zurückspulen | Matches its pair, "10 Sekunden vorspulen". |
| de | translatorQueue.notCoveredBody | Er öffnet Rückmeldungen zu diesen Übersetzungen: | Er gibt Rückmeldungen zu diesen Übersetzungen frei: | "öffnet Rückmeldungen" is a literal calque. *freigeben* is the normal word for access. |
| de | translatorQueue.notCoveredNone | Er öffnet noch keine Übersetzung. … | Er gibt noch keine Übersetzung frei. … | Same. |
| es | translatorQueue.notCoveredBody | Abre los comentarios de estas traducciones: | Da acceso a los comentarios de estas traducciones: | "Abre" reads as a tú command ("Open the comments…"), so the sentence looked like an instruction. |
| es | translatorQueue.notCoveredNone | Todavía no abre ninguna traducción. … | Todavía no da acceso a ninguna traducción. … | Same literal "open". |
| pt | translatorQueue.notCoveredBody | Ele abre o feedback destas traduções: | Ele dá acesso ao feedback destas traduções: | "abre o feedback" is a literal calque. |
| pt | translatorQueue.notCoveredNone | Ele ainda não abre nenhuma tradução. Peça a quem lhe deu o código… | Ele ainda não dá acesso a nenhuma tradução. Peça a quem enviou o código… | Same calque. Also, "lhe" is stiff next to the file's plain *você* voice. |
| ru | translatorQueue.notCoveredBody | Он открывает отзывы для этих переводов: | Он открывает доступ к отзывам по этим переводам: | "открывает отзывы" reads as "opens the reviews". The code grants access. |
| ru | translatorQueue.notCoveredNone | Этот код пока не открывает ни одного перевода. … | Этот код пока не открывает доступ ни к одному переводу. … | Same. |
| id | translatorQueue.notCoveredTitle | Kode akses Anda… | Kode sandi Anda… | The settings screen calls this code "Kode sandi". |
| id | translatorQueue.notCoveredBody | Kode ini membuka masukan untuk… | Kode ini memberi akses ke masukan untuk… | "membuka masukan" is a literal calque. |
| id | translatorQueue.notCoveredNone | Kode ini belum membuka terjemahan apa pun. … | Kode ini belum memberi akses ke terjemahan apa pun. … | Same. |
| ja | translatorQueue.notCoveredTitle | このアクセスコードでは{{translation}}を確認できません | お使いのパスコードは{{translation}}に対応していません | Settings calls it パスコード. The old text also meant "can't review X" rather than "doesn't cover X". |
| ja | translatorQueue.switchNeedsDownload | 先に…ダウンロードしてから… | …ダウンロードしてから… | 先に and してから both say "first". Removed the extra one. |
| ja | readingPlans.daysReadSummary | `{{days}}中{{read}}日` | `{{days}}のうち{{read}}日` | Rendered "365日間中12日", which is awkward. "365日間のうち12日" reads naturally. |
| ja | readingPlans.daysReadMissedSummary | `{{days}}中{{read}}日 · …` | `{{days}}のうち{{read}}日 · …` | Same. |
| ko | translatorQueue.notCoveredTitle | 이 접근 코드로는 {{translation}}을(를) 볼 수 없습니다 | 사용 중인 암호는 {{translation}}에 적용되지 않습니다 | Settings calls it 암호. The old text meant "can't view", which is not what "doesn't cover" means. |
| ko | translatorQueue.notCoveredBody | 이 코드로… | 이 암호로… | Same term. |
| ko | translatorQueue.notCoveredNone | 이 코드로 … 코드를 준 사람에게… | 이 암호로 … 암호를 준 사람에게… | Same term. |
| vi | translatorQueue.notCoveredTitle | …không bao gồm {{translation}} | …không áp dụng cho {{translation}} | A code "applies to" a translation. It doesn't "include" it. |
| vi | translatorQueue.notCoveredBody | Mã này mở phản hồi cho các bản dịch sau: | Mã này cho phép xem phản hồi của các bản dịch sau: | "mở phản hồi" is a literal calque. |
| vi | translatorQueue.notCoveredNone | Mã này chưa mở được bản dịch nào. … | Mã này chưa áp dụng cho bản dịch nào. … | Same. |
| vi | readingPlans.daysReadMissedSummary | `… · {{missed}} đã bỏ lỡ` | `… · bỏ lỡ {{missed}}` | "3 đã bỏ lỡ" reads as "3 has missed", with the number as the subject. |
| tr | translatorQueue.notCoveredBody | Bu kod şu çevirilerin geri bildirimlerini açar: | Bu kod şu çevirilerin geri bildirimlerine erişim sağlar: | "açar" is a literal calque. *erişim sağlar* is the normal phrase. |
| tr | translatorQueue.notCoveredNone | Bu kod henüz hiçbir çeviriyi açmıyor. … | Bu kod henüz hiçbir çeviriye erişim sağlamıyor. … | Same. |

## Reviewed and left alone

- **ru tally** `{{days}}: прочитано {{read}}`: the translator put `{{days}}` first on purpose. "из {{days}}" would need the genitive, and that breaks for 1, 2–4 and 21 ("из 2 дня"). The current wording is grammatical for every count.
- **pt "Perdidos"**: *perder* is the normal verb for missing a day in Brazilian Portuguese.
- **es "Sin leer"**, **fr "Manqués"**, **tr "kaçırıldı"**, **ko "놓침"** and **id "terlewat"** were all fine.
- **Clip handle labels and skip labels** in all 10 locales were fine. They are consistent with each file's term for "portion/excerpt".
