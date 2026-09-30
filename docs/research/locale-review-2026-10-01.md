# Locale review: interface strings added or changed since 2026-09-25

Date: 2026-10-01. Baseline: `5a2eddd1`, the last `origin/main` commit before 2026-09-25 00:00 +0545. Reviewed
on top of `origin/main` `5d3a33d4`.

## Scope

- 140 English keys (plural stems) changed or added in `src/i18n/locales/en.ts` since the baseline.
  16 keys were removed (the old Home ledger strings).
- I also reviewed the 8 older background-sound labels (`interface.music.{off,ambient,piano,soft-guitar,harp,flute,sitar,ocean-waves}.label`),
  because they appear next to the new ones in the Audio sheet's sound library. That makes 148 stems.
- All 20 non-English locales were reviewed, about 3,000 values in total, including every plural variant (`_few`/`_many` for ar/ru,
  `_many` for es/fr/pt).
- No locale value had changed since the baseline without a matching English change, so the English diff captures the full scope.
- Areas covered:
  - the Audio sheet and player bar (speed, voice/sound sliders, repeat, passage picker, Read Along, Selah, sleep timer)
  - all 24 background sound names
  - the verse-picture editor (tabs, 8 font style names, 16 colour names), plus the share and invite copy
  - the Home reading heatmap and lesson chip
  - the four daily rhythms (Common Prayer Psalter, The Week of Christ, The Lord's Prayer Week, The Gospels Every Month)
  - the 15 "Seasons of life" plan titles and descriptions and their category label
- Out of scope: Advent and Christmas keys, which another session is adding. Also out of scope: every key not in the list above.

Method: one native-quality reviewer per language group:

- hi/mr/ne
- ar/ur/tr
- pa/bn
- ta/te
- id/vi/zh/ja/ko
- de/es/fr/pt/ru

Each value was checked against:

- the English source
- the terms the same locale file already uses (book names, God, Jesus, prayer, Scripture, psalm, hymn)
- the vocabulary of that language's standard Christian Bible

The reviewers checked the Punjabi and Bengali "Selah" and verse forms against those Bibles on ebible.org. A guard script confirmed:

- only in-scope keys changed
- every `{{token}}` still matches English
- no key was added or removed

## Summary

101 values changed in 20 locales:

| ar  | bn  | de  | es  | fr  | hi  | id  | ja  | ko  | mr  | ne  | pa  | pt  | ru  | ta  | te  | tr  | ur  | vi  | zh  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 5   | 5   | 3   | 3   | 3   | 8   | 7   | 8   | 3   | 5   | 9   | 3   | 3   | 7   | 5   | 3   | 5   | 7   | 7   | 2   |

Findings by defect class:

- **Religious register.**
  - The **Fear** plan called the giants (Goliath and others) demons from Hindu mythology: hi दानवों, ne दैत्य. It now says "giant enemies".
  - The Tamil **Church bells** said ஆलय, which on its own reads as a Hindu temple. It now uses தேவாலய.
  - The Turkish **Stress** plan used Islamic-register _rızk_ for daily provision. It now says _gündelik ekmek_, as in the Kutsal Kitap Lord's Prayer.
  - Urdu now uses روز کی روٹی, from the Urdu Lord's Prayer, instead of the bureaucratic "supply".
  - Punjabi **Selah** was the Hindi form ਸੇਲਾ. It is now ਸਲਹ, as printed in the Punjabi Bible (Ps 3:2).
  - hi/ne now use प्रतिज्ञा for God's promise, not the everyday वादा.
  - mr/ne now say पवित्र शास्त्र for Scripture, not a bare शास्त्र/धर्मशास्त्र.
  - Bible name spellings now match each file's book list: ne रूत, bn রূৎ, and vi Giê-su in one string instead of Giê-xu.
  - No Sikh-register words (ਅਰਦਾਸ, ਵਾਹਿਗੁਰੂ, ਕੀਰਤਨ…) and no Islamic substitutions (عيسى/عیسیٰ/Isa, "Allah" in Turkish, নামাজ) were found anywhere in scope.
- **Inverted or shifted meanings.**
  - Urdu: the Common Prayer Psalter said "pray _to_ the Psalms". It now says "read all 150 psalms as prayer".
  - Russian: the **Depression** plan was titled Уныние. In Orthodox usage that is the deadly sin of despondency, so the title read as a rebuke to depressed readers. It is now Подавленность.
  - Turkish: **Depression** was titled "Keder" (grief), which duplicated the Loss plan.
  - Telugu: the Selah hint said the reading _stops_. It now says it _pauses_.
  - Telugu: "Text size" read as "verse size". It now says "letter size".
  - Nepali: "Seasons of life" was translated as weather seasons (मौसम).
  - German: "Seasons of life" read as "lifetimes" (Lebenszeiten). It is now Lebenslagen.
  - Arabic and Vietnamese: the Depression plan called the prophets "truthful" (true, not false, prophets) instead of prophets who speak honestly.
  - Indonesian: the Depression plan said "prophecies" instead of "prophets".
  - Bengali: the Anger plan read "seven days of mercy".
  - Bengali: the **Fireplace** sound used অগ্নিকুণ্ড, the Bengali Bible's word for Daniel's fiery furnace.
- **Silently dropped content.**
  - German "Not downloaded yet" had lost "yet".
  - Vietnamese lost "peace with God" and the object of "mercy that answers it".
  - Russian changed "the sea" to "storm".
  - Telugu lost God as the one who wipes away every tear, so the sentence could read as Job doing it.
- **Grammar and naturalness.**
  - The Pride plan's "washed feet" now has its article: es _lavó los pies_, fr _lavé les pieds_, pt _lavou os pés_.
  - fr _Élégante_ now agrees with the other feminine font names.
  - ar: "a day remembers" and a phrase that did not parse were rewritten.
  - tr: _Rab'bin Duası'nı edin_ was ungrammatical.
  - ja: one love-plan sentence was ungrammatical.
  - ko: the love-plan sentence was circular, and one string switched speech level mid-sentence.
  - id: two descriptions used informal _-mu_; the rest of the app uses formal _Anda_.
- **UI word choice.**
  - The **Block** font is Anton in all capitals, so es/fr/pt now say Mayúsculas/Capitales/Maiúsculas instead of the literal Bloque/Bloc/Bloco.
  - es _Cursiva_ means italic in Spanish UI; it is now _Caligráfica_.
  - The id/ja/ko editor label said "photo" for the whole verse picture; it now uses the app's "image" word.
  - Several colour names are fixed: ar sage, bn amber, mr sand/ink, ne रङ spelling, pt ink, ru forest, ta mint/forest, ur sand/mint.
- **Sound names (flagged for hi/ur/pa/te/ta/ne).**
  - hi: Harp is now वीणा, the Hindi Bible's word for David's harp. Ambient and Summer night were also fixed.
  - ne: Ambient and Rain were fixed.
  - ta: Church bells was fixed.
  - pa: Shore grammar was fixed.
  - ur: every name was checked and read naturally.
- **No problems found** in these areas:
  - plural keys: every locale has exactly the suffixes its language needs, and each form is grammatical for its number
  - `{{interpolation}}` tokens
  - mojibake
  - leftover English (the verification tests pass)
  - right-to-left rendering in ar/ur

## Follow-up decisions

The owner asked me to settle the open questions myself. These are the calls I made.

**Changed:**

| Locale | Key                                          | Old                                    | New                       | Why                                                                                                                                          |
| ------ | -------------------------------------------- | -------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| de     | `readingPlans.commonPrayerPsalter.title`     | Psalter nach dem Book of Common Prayer | Anglikanischer Psalter    | At 38 characters, the title could be cut off on the narrow two-line Home shelf cards. The description still names the Book of Common Prayer. |
| ru     | `readingPlans.lordsPrayerWeek.title`         | Неделя молитвы Господней               | Неделя молитвы «Отче наш» | Russian readers know the prayer by its opening words. The description keeps «молитвой Господней».                                            |
| ne     | `gather.wisdomLessons.anger.l1`              | काइनको …                               | कयिनको …                  | Cain now uses the Nepali Bible spelling, matching the new Anger plan. This is an older key, but the change is only for consistency.          |
| ja     | 8 older daily-rhythm descriptions and titles | 詩編                                   | 詩篇                      | This matches the book name 詩篇 used elsewhere in ja.ts. Every Psalms reference in the app now uses one spelling.                            |

**Kept, with the reason:**

- **te Harp** stays వీణ. The Hindi label now uses the matching वीणा, which is the Bible word there. The Telugu Bible's own harp word would collide with the separate Sitar sound.
- **ur Book of Common Prayer** stays مشترکہ دعا کی کتاب. That name is already used consistently in the file's older `historicRoots` strings, and switching would mean churning those too.
- **fr Selah** stays _Sélah_. A button labelled "Pause" next to play/pause would be confusing.
- **pa Depression** stays ਉਦਾਸੀ, the ordinary gentle word. ਮਾਯੂਸੀ means despair, which is a different idea.
- **hi Temptation** stays प्रलोभन, because परीक्षा also reads as "exam".
- **vi Lord's Prayer** and the **te Book of Common Prayer** name stay as they are. Both match their files and are understood.

## Verification

```bash
TSX_DISABLE_CACHE=1 node --test --import tsx src/i18n/locales/coverage.test.ts src/i18n/locales/coreLocaleCoverage.test.ts src/i18n/interfaceCoverage.test.ts src/i18n/interfaceRendering.test.ts   # 38/38 pass
npm run typecheck   # pass (tsc + typecheck:strict, 0 errors)
npm run lint        # pass
npx prettier --check src/i18n/locales/*.ts   # pass
```

## All changes

### Arabic (ar) — 5

| Key                                                  | Old                                                                                                            | New                                                                                                               | Why                                                                                                                                                                          |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bible.verseImage.colors.sage`                       | مريمي                                                                                                          | أخضر مريمي                                                                                                        | 'مريمي' alone is not a colour word in Arabic; 'sage green' is said 'أخضر مريمي'.                                                                                             |
| `audio.repeatOptionPassage`                          | مقطع                                                                                                           | المقطع                                                                                                            | Matches the other repeat options (الإصحاح / السفر), which all carry the definite article.                                                                                    |
| `readingPlans.weekOfChrist.description`              | يتذكّر كل يوم من أيام الأسبوع جزءًا من قصة يسوع: القيامة يوم الأحد، والخيانة يوم الأربعاء، والصليب يوم الجمعة. | في كل يوم من أيام الأسبوع نتذكّر جزءًا من قصة يسوع: القيامة يوم الأحد، والخيانة يوم الأربعاء، والصليب يوم الجمعة. | A day cannot 'remember' in Arabic; rephrased to 'on each day of the week we remember'.                                                                                       |
| `readingPlans.lifeSituations.depression.description` | سبعة أيام من مزامير وأنبياء صادقين لأوقات الظلمة، ومع الله الذي يلاقيك هناك.                                   | سبعة أيام مع مزامير وأنبياء يتكلمون بصدق عن أوقات الظلمة، ومع الله الذي يلاقيك هناك.                              | The old wording called the prophets themselves 'truthful' and the 'of ... and with' structure did not parse; now 'psalms and prophets that speak honestly about dark times'. |
| `readingPlans.lifeSituations.anger.description`      | سبعة أيام من قصص عن الغضب، من قايين إلى يونان، والرحمة التي تجيب عليه.                                         | سبعة أيام من قصص عن الغضب، من قايين إلى يونان، والرحمة التي تقابله.                                               | 'تجيب عليه' (replies to it) is a literal calque; 'تقابله' (meets it) is natural Arabic.                                                                                      |

### Bengali (bn) — 5

| Key                                             | Old                                                                  | New                                                                                   | Why                                                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `bible.verseImage.colors.amber`                 | অ্যামবার                                                             | অ্যাম্বার                                                                             | Standard Bengali spelling of the loanword 'amber'.                                                                             |
| `readingPlans.lifeSituations.loss.description`  | ...ইয়োব ও রূত থেকে...                                               | ...ইয়োব ও রূৎ থেকে...                                                                | Ruth's name must match the Bengali Bible and the book name in this file (রূৎ).                                                 |
| `readingPlans.lifeSituations.anger.description` | কয়িন থেকে যোনা পর্যন্ত ক্রোধের কাহিনি, আর তার উত্তরে দয়ার সাত দিন। | কয়িন থেকে যোনা পর্যন্ত ক্রোধের কাহিনি, আর যে দয়া তার উত্তর দেয় — তা নিয়ে সাত দিন। | The old wording read as 'seven days of mercy'; now it says seven days on anger stories and the mercy that answers it.          |
| `interface.music.fireplace.label`               | অগ্নিকুণ্ড                                                           | ফায়ারপ্লেস                                                                           | অগ্নিকুণ্ড means a blazing pit and is the Bengali Bible word for Daniel's fiery furnace, which is wrong for a cozy fire sound. |
| `interface.music.wilderness.label`              | প্রান্তর                                                             | অরণ্য                                                                                 | The sound is a still summer forest (catalog + tree icon); প্রান্তর means an open barren plain.                                 |

### German (de) — 3

| Key                                      | Old                       | New                                    | Why                                                                                                                                        |
| ---------------------------------------- | ------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `readingPlans.categoryLifeSituations`    | Lebenszeiten              | Lebenslagen                            | 'Lebenszeiten' means 'lifetimes'; 'Lebenslagen' is the natural German for life situations like loss, fear and stress.                      |
| `readingPlans.commonPrayerPsalter.title` | Psalter des Common Prayer | Psalter nach dem Book of Common Prayer | German Anglicans keep the full English name 'Book of Common Prayer' (as this file already does); 'des Common Prayer' is a broken fragment. |
| `audio.soundNotDownloaded`               | Nicht heruntergeladen     | Noch nicht heruntergeladen             | Restores the dropped 'yet', so it reads as a pending state rather than a failure.                                                          |

### Spanish (es) — 3

| Key                                             | Old                           | New                               | Why                                                                                                                                       |
| ----------------------------------------------- | ----------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `bible.verseImage.fonts.script`                 | Cursiva                       | Caligráfica                       | In Spanish UI 'Cursiva' is the italic button, which clashes with the separate italic 'Elegante' style; 'Caligráfica' names a script face. |
| `bible.verseImage.fonts.block`                  | Bloque                        | Mayúsculas                        | 'Bloque' is a literal calque, not a font-style word; the style is set in bold capitals, so 'Mayúsculas' is what users see.                |
| `readingPlans.lifeSituations.pride.description` | …el Rey siervo que lavó pies. | …el Rey siervo que lavó los pies. | Spanish needs the article: 'lavó los pies', not 'lavó pies'.                                                                              |

### French (fr) — 3

| Key                                             | Old                                     | New                                     | Why                                                                                                              |
| ----------------------------------------------- | --------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `bible.verseImage.fonts.elegant`                | Élégant                                 | Élégante                                | Agrees with the feminine 'police' like the other style names (Classique, Cursive, Manuscrite, Moderne).          |
| `bible.verseImage.fonts.block`                  | Bloc                                    | Capitales                               | 'Bloc' is not a French typographic word; the style is set in bold capitals, so 'Capitales' is the natural label. |
| `readingPlans.lifeSituations.pride.description` | …le Roi serviteur qui a lavé des pieds. | …le Roi serviteur qui a lavé les pieds. | 'lavé des pieds' sounds like 'washed some feet'; 'lavé les pieds' is the natural phrase.                         |

### Hindi (hi) — 8

| Key                                            | Old                                                                                                | New                                                                                                          | Why                                                                                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bible.verseImage.fonts.elegant`               | सुंदर                                                                                              | शालीन                                                                                                        | 'सुंदर' just means 'beautiful'; 'शालीन' is the usual Hindi word for 'elegant' and keeps it distinct from 'Classic'.                              |
| `readingPlans.lifeSituations.fear.description` | उन लोगों के साथ सात दिन जिन्होंने दानवों, आग और समुद्र का सामना किया और परमेश्वर को अपने साथ पाया। | उन लोगों के साथ सात दिन जिन्होंने विशालकाय शत्रुओं, आग और समुद्र का सामना किया और परमेश्वर को अपने साथ पाया। | 'दानव' reads as demons from Hindu myth to most readers; 'giant enemies' says what the English means.                                             |
| `audio.voiceVolume`                            | आवाज़                                                                                              | वाचन                                                                                                         | 'आवाज़' and 'ध्वनि' both mean 'sound', so the two sliders looked identical; 'वाचन' (the reading) matches how the file names narration elsewhere. |
| `readingPlans.lifeSituations.loss.description` | शोक के समय के लिए सात दिन, अय्यूब और रूत से लेकर उस वादे तक कि हर आँसू पोंछ दिया जाएगा।            | शोक के समय के लिए सात दिन, अय्यूब और रूत से लेकर उस प्रतिज्ञा तक कि हर आँसू पोंछ दिया जाएगा।                 | Church register: the Hindi Bible and the rest of this file say 'प्रतिज्ञा' for God's promise, not the everyday 'वादा'.                           |
| `readingPlans.lifeSituations.hope.description` | पूरे हुए वादों के सात दिन, अब्राहम और यूसुफ से लेकर उन सूखी हड्डियों तक जो फिर जी उठीं।            | पूरी हुई प्रतिज्ञाओं के सात दिन, अब्राहम और यूसुफ से लेकर उन सूखी हड्डियों तक जो फिर जी उठीं।                | Same church-register fix: 'प्रतिज्ञा' for God's promises, as in the Hindi Bible.                                                                 |
| `interface.music.ambient.label`                | परिवेशी                                                                                            | शांत परिवेश                                                                                                  | 'परिवेशी' is a technical adjective nobody uses for music; 'शांत परिवेश' (calm ambience) is a natural label.                                      |
| `interface.music.harp.label`                   | हार्प                                                                                              | वीणा                                                                                                         | The Hindi Bible calls David's harp 'वीणा' (e.g. Psalm 33:2); an English loanword is unnecessary.                                                 |
| `interface.music.summer-night.label`           | गर्मी की रात                                                                                       | गर्मियों की रात                                                                                              | 'गर्मी की रात' reads as 'a hot night'; 'गर्मियों की रात' is the idiomatic 'summer night'.                                                        |

### Indonesian (id) — 7

| Key                                                  | Old                                                                                                                                             | New                                                                                                                                             | Why                                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `bible.verseImage.tabsLabel`                         | Edit foto                                                                                                                                       | Edit gambar                                                                                                                                     | The label covers the whole verse image, which the app calls "Gambar" elsewhere, not just the background photo.           |
| `bible.verseImage.sizeMaxed`                         | Ukuran maksimal: kata-kata sudah memenuhi seluruh foto                                                                                          | Ukuran maksimal: kata-kata sudah memenuhi seluruh gambar                                                                                        | The words fill the whole composed image, not a photo; matches the app's "Gambar" wording.                                |
| `readingPlans.commonPrayerPsalter.description`       | Berdoalah dengan seluruh 150 Mazmur setiap bulan, pagi dan malam, menurut Buku Doa Umum.                                                        | Berdoalah dengan seluruh 150 Mazmur setiap bulan, pagi dan malam, sesuai pembagian dalam Buku Doa Umum.                                         | Restores "as appointed": the Psalms follow the Prayer Book's schedule, not just the book in general.                     |
| `readingPlans.weekOfChrist.description`              | Setiap hari dalam sepekan mengingat satu bagian kisah Yesus: Kebangkitan pada hari Minggu, pengkhianatan pada hari Rabu, salib pada hari Jumat. | Setiap hari dalam sepekan mengingat satu bagian kisah Yesus: Kebangkitan pada hari Minggu, pengkhianatan pada hari Rabu, Salib pada hari Jumat. | Capitalises "Salib" (the Cross) like "Kebangkitan" in the same sentence, as the English does.                            |
| `readingPlans.lifeSituations.depression.description` | Tujuh hari mazmur dan nubuat yang jujur untuk masa-masa gelap, dan Allah yang menjumpaimu di sana.                                              | Tujuh hari bersama mazmur dan para nabi yang jujur untuk masa-masa gelap, dan Allah yang menjumpai Anda di sana.                                | "Nubuat" means prophecies, not prophets; also uses the formal "Anda" the rest of the app uses instead of informal "-mu". |
| `readingPlans.lifeSituations.anxiety.description`    | Tujuh hari belajar percaya: curahkan isi hatimu, dan biarkan Tuhan menjagamu.                                                                   | Tujuh hari belajar percaya: curahkan isi hati Anda, dan biarkan Tuhan menjaga Anda.                                                             | Switches informal "-mu" to the formal "Anda" used everywhere else in the app's own voice.                                |
| `readingPlans.lifeSituations.love.description`       | Tujuh hari tentang kasih Allah yang tidak pernah melepaskan, dan bagaimana kasih itu mengajar kita mengasihi.                                   | Tujuh hari tentang kasih Allah yang tidak pernah melepaskan kita, dan bagaimana kasih itu mengajar kita mengasihi.                              | "Never lets go" had no object in Indonesian; adds "kita" (us) so the sentence is complete.                               |

### Japanese (ja) — 8

| Key                                                  | Old                                                                                            | New                                                                                                  | Why                                                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `bible.verseImage.tabsLabel`                         | 写真を編集                                                                                     | 画像を編集                                                                                           | The label covers the whole verse image, which the app calls "画像" elsewhere, not just the background photo.          |
| `bible.verseImage.sizeMaxed`                         | 最大サイズです：文字が写真いっぱいに広がっています                                             | 最大サイズです：文字が画像いっぱいに広がっています                                                   | The words fill the whole composed image, not a photo; matches the app's "画像" wording.                               |
| `readingPlans.weekOfChrist.description`              | 一週間の各日にイエスの物語の一部を覚えます。日曜日は復活、水曜日は裏切り、金曜日は十字架です。 | 一週間の各日にイエスの物語の一部を思い起こします。日曜日は復活、水曜日は裏切り、金曜日は十字架です。 | "覚えます" reads as "memorise"; "思い起こします" is the natural word for remembering events of Jesus' life.           |
| `readingPlans.lifeSituations.peace.description`      | イエスが与える平安について。神との平和、人との和解、静かな信頼を学ぶ七日間。                   | イエスが与えてくださる平安について。神との平和、人との和解、静かな信頼を学ぶ七日間。                 | Adds the honorific "てくださる" for Jesus, matching how the file speaks of God's actions elsewhere.                   |
| `readingPlans.lifeSituations.depression.description` | 暗い季節のための正直な詩編と預言者、そしてそこで出会ってくださる神との七日間。                 | 暗い季節のための正直な詩篇と預言者、そしてそこで出会ってくださる神との七日間。                       | Uses "詩篇", the Psalms book name used in this file, instead of the other spelling "詩編".                            |
| `readingPlans.lifeSituations.hope.description`       | 守られた約束の七日間。アブラハムやヨセフから、再び生きる枯れた骨まで。                         | 守られた約束の七日間。アブラハムやヨセフから、よみがえる枯れた骨まで。                               | "再び生きる" was a literal rendering; "よみがえる" is the natural Bible word for the dry bones coming to life.        |
| `readingPlans.lifeSituations.love.description`       | 決して離さない神の愛と、その愛が私たちに愛することを教える七日間。                             | 決して離さない神の愛と、その愛によって愛することを学ぶ七日間。                                       | The old sentence was ungrammatical (two clauses both hanging on "七日間"); now reads naturally with the same meaning. |
| `readingPlans.lifeSituations.temptation.description` | 堅く立つための七日間。荒れ野のイエス、逃げたヨセフ、倒れたダビデと共に。                       | 堅く立つための七日間。荒野のイエス、逃げたヨセフ、倒れたダビデと共に。                               | Uses "荒野", matching the Wilderness sound label and the rest of the file, instead of "荒れ野".                       |

### Korean (ko) — 3

| Key                                            | Old                                                                        | New                                                                       | Why                                                                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `bible.verseImage.tabsLabel`                   | 사진 편집                                                                  | 이미지 편집                                                               | The label covers the whole verse image, which the app calls "이미지" elsewhere, not just the background photo.    |
| `bible.verseImage.sizeMaxed`                   | 최대 크기입니다: 글자가 사진을 가득 채웠어요                               | 최대 크기입니다: 글자가 이미지를 가득 채웠습니다                          | Fixes a mixed speech level in one sentence (-습니다 then -어요) and uses "이미지" for the composed image.         |
| `readingPlans.lifeSituations.love.description` | 결코 놓지 않으시는 하나님의 사랑과, 그 사랑이 가르쳐 주는 사랑에 관한 7일. | 결코 놓지 않으시는 하나님의 사랑과, 그 사랑으로 사랑하는 법을 배우는 7일. | "그 사랑이 가르쳐 주는 사랑" was circular; now says we learn how to love through that love, as the English means. |

### Marathi (mr) — 5

| Key                                              | Old                                                                                | New                                                                                       | Why                                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `bible.verseImage.fonts.elegant`                 | सुंदर                                                                              | डौलदार                                                                                    | 'सुंदर' just means 'beautiful'; 'डौलदार' is the Marathi word for elegant, graceful lettering.                |
| `bible.verseImage.colors.sand`                   | रेताड                                                                              | वाळूसारखा                                                                                 | 'रेताड' describes sandy ground, not a colour; 'वाळूसारखा' means sand-coloured.                               |
| `bible.verseImage.colors.ink`                    | शाई सारखा                                                                          | शाईसारखा                                                                                  | Spelling: Marathi writes 'सारखा' joined to the noun.                                                         |
| `audio.readAlongNoTimings`                       | या ध्वनिमुद्रणात वचनांच्या वेळा नाहीत, त्यामुळे मजकूर ठळक होत नाही.                | या ध्वनिमुद्रणात वचनांच्या वेळा नाहीत, त्यामुळे मजकूर हायलाइट होत नाही.                   | 'ठळक' means bold; the rest of the file uses 'हायलाइट' for highlighting.                                      |
| `readingPlans.lifeSituations.family.description` | शास्त्रातील तुटलेली व पुन्हा जोडलेली कुटुंबे, आणि देवाचे कुटुंब यांविषयी सात दिवस. | पवित्र शास्त्रातील तुटलेली व पुन्हा जोडलेली कुटुंबे, आणि देवाचे कुटुंब यांविषयी सात दिवस. | Bare 'शास्त्र' can mean any scripture or science; the file consistently says 'पवित्र शास्त्र' for the Bible. |

### Nepali (ne) — 9

| Key                                              | Old                                                                               | New                                                                                   | Why                                                                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `interface.music.ambient.label`                  | वातावरणीय                                                                         | शान्त वातावरण                                                                         | 'वातावरणीय' is a stiff technical adjective; 'शान्त वातावरण' (calm atmosphere) is a natural Nepali label.                                 |
| `interface.music.rain.label`                     | वर्षा                                                                             | झरी                                                                                   | 'वर्षा' is bookish; 'झरी' is the everyday Nepali word for steady rain.                                                                   |
| `bible.verseImage.colors.sand`                   | बालुवा रंग                                                                        | बालुवा रङ                                                                             | Nepali spelling is 'रङ' (as in the Color tab); 'रंग' is the Hindi spelling.                                                              |
| `bible.verseImage.colors.mint`                   | पुदिना रंग                                                                        | पुदिना रङ                                                                             | Nepali spelling is 'रङ' (as in the Color tab); 'रंग' is the Hindi spelling.                                                              |
| `readingPlans.lifeSituations.fear.description`   | दैत्य, आगो र समुद्रको सामना गरी परमेश्वरलाई आफ्नो साथमा पाउनेहरूसँग सात दिन।      | विशालकाय शत्रु, आगो र समुद्रको सामना गरी परमेश्वरलाई आफ्नो साथमा पाउनेहरूसँग सात दिन। | 'दैत्य' is the Hindu-myth word for demons/asuras; 'giant enemies' is what the English means.                                             |
| `readingPlans.lifeSituations.loss.description`   | शोकको समयका लागि सात दिन, अय्यूब र रूथदेखि हरेक आँसु पुछिनेछ भन्ने प्रतिज्ञासम्म। | शोकको समयका लागि सात दिन, अय्यूब र रूतदेखि हरेक आँसु पुछिनेछ भन्ने प्रतिज्ञासम्म।     | The Nepali Bible (and this file's book list) spells Ruth 'रूत'.                                                                          |
| `readingPlans.commonPrayerPsalter.title`         | साझा प्रार्थनाको भजनसंग्रह                                                        | साझा प्रार्थनाको भजनसङ्ग्रह                                                           | Matches the Nepali Bible's book name 'भजनसङ्ग्रह' used everywhere else in the file.                                                      |
| `readingPlans.lifeSituations.family.description` | धर्मशास्त्रमा टुटेका र फेरि जोडिएका परिवार, र परमेश्वरको परिवारबारे सात दिन।      | पवित्र शास्त्रमा टुटेका र फेरि जोडिएका परिवार, र परमेश्वरको परिवारबारे सात दिन।       | The rest of the file says 'पवित्र शास्त्र' for Scripture; keeps one term throughout.                                                     |
| `readingPlans.categoryLifeSituations`            | जीवनका मौसमहरू                                                                    | जीवनका उतारचढाव                                                                       | 'मौसम' is weather; 'seasons of life' is an English idiom, and 'जीवनका उतारचढाव' (life's ups and downs) is the natural Nepali equivalent. |

### Punjabi (pa) — 3

| Key                                            | Old                                               | New                                             | Why                                                                             |
| ---------------------------------------------- | ------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `audio.playerBar.selah`                        | ਸੇਲਾ                                              | ਸਲਹ                                             | The Punjabi Bible (Psalm 3:2, 3:4) spells Selah as ਸਲਹ; ਸੇਲਾ is the Hindi form. |
| `interface.music.shore.label`                  | ਸਮੁੰਦਰ ਕੰਢਾ                                       | ਸਮੁੰਦਰੀ ਕੰਢਾ                                    | Grammar fix: 'seashore' needs the adjective form ਸਮੁੰਦਰੀ.                       |
| `readingPlans.lifeSituations.fear.description` | ...ਜਿਨ੍ਹਾਂ ਨੇ ਵੱਡੇ-ਵੱਡੇ ਵੈਰੀਆਂ, ਅੱਗ ਅਤੇ ਸਮੁੰਦਰ... | ...ਜਿਨ੍ਹਾਂ ਨੇ ਦਿਓ-ਕੱਦ ਵੈਰੀਆਂ, ਅੱਗ ਅਤੇ ਸਮੁੰਦਰ... | 'Big enemies' lost the idea of giants (Goliath); ਦਿਓ-ਕੱਦ means giant-sized.     |

### Portuguese (pt) — 3

| Key                                             | Old                         | New                            | Why                                                                                                          |
| ----------------------------------------------- | --------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `bible.verseImage.fonts.block`                  | Bloco                       | Maiúsculas                     | 'Bloco' is a literal calque, not a font-style word; the style is set in bold capitals.                       |
| `bible.verseImage.colors.ink`                   | Tinta                       | Nanquim                        | 'Tinta' in Brazilian Portuguese mostly means paint; the near-black ink colour is naturally called 'Nanquim'. |
| `readingPlans.lifeSituations.pride.description` | …o Rei servo que lavou pés. | …o Rei servo que lavou os pés. | Portuguese needs the article: 'lavou os pés'.                                                                |

### Russian (ru) — 7

| Key                                               | Old                                                            | New                                                                  | Why                                                                                                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readingPlans.commonPrayerPsalter.title`          | Псалтирь общей молитвы                                         | Псалтирь Книги общих молитв                                          | The Anglican Book of Common Prayer is 'Книга общих молитв' in Russian (as the description already says); the title now names it the same way.                        |
| `readingPlans.categoryLifeSituations`             | Времена жизни                                                  | Жизненные ситуации                                                   | 'Времена жизни' is a word-for-word calque that reads oddly; the category holds plans for loss, fear, stress, so 'Жизненные ситуации' is natural.                     |
| `bible.verseImage.fonts.slab`                     | Слэб                                                           | Брусковый                                                            | 'Брусковый' is the Russian typographic term for slab-serif; 'Слэб' is an English transliteration.                                                                    |
| `bible.verseImage.colors.forest`                  | Лесной зелёный                                                 | Тёмно-зелёный                                                        | 'Лесной зелёный' is a calque; 'Тёмно-зелёный' is the normal colour name and parallels 'Тёмно-синий' for navy.                                                        |
| `readingPlans.lifeSituations.depression.title`    | Уныние                                                         | Подавленность                                                        | In Orthodox usage 'уныние' names one of the eight deadly passions, so a plan for depressed readers titled that way sounds like a rebuke; 'Подавленность' is neutral. |
| `readingPlans.lifeSituations.fear.description`    | …которые встретили великанов, огонь и бурю и нашли Бога рядом. | …которые столкнулись с великанами, огнём и морем и нашли Бога рядом. | Restores 'the sea' (it had become 'storm') and uses the natural verb 'столкнулись' ('faced').                                                                        |
| `readingPlans.lifeSituations.anxiety.description` | Семь дней учимся доверять: изливайте…                          | Семь дней, чтобы научиться доверять: изливайте…                      | The old text mixed 'we are learning' with 'you pour out'; now it's one clean sentence in the file's 'вы' voice.                                                      |

### Tamil (ta) — 5

| Key                                  | Old                     | New                         | Why                                                                                                               |
| ------------------------------------ | ----------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `interface.music.church-bells.label` | ஆலய மணிகள்              | தேவாலய மணிகள்               | Plain ஆலயம் most often means a (Hindu) temple; தேவாலயம் is the standard Tamil word for a church.                  |
| `audio.soundNotDownloaded`           | இன்னும் பதிவிறக்கவில்லை | இன்னும் பதிவிறக்கப்படவில்லை | The old form reads as 'I/you haven't downloaded yet'; the passive states the item's status, matching the English. |
| `bible.verseImage.fonts.script`      | கர்சிவ்                 | கூட்டெழுத்து                | கூட்டெழுத்து is the ordinary Tamil word for cursive (joined) writing, instead of a transliterated English word.   |
| `bible.verseImage.colors.mint`       | மிண்ட் நிறம்            | புதினா பச்சை                | Native colour name ('mint green') instead of a transliteration of 'mint'.                                         |
| `bible.verseImage.colors.forest`     | காட்டு பச்சை            | காட்டுப் பச்சை              | Fixes the missing consonant doubling that Tamil grammar requires in this compound.                                |

### Telugu (te) — 3

| Key                                            | Old                                                                                       | New                                                                                              | Why                                                                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `audio.playerBar.selahHint`                    | పఠనాన్ని ఆపి, నేపథ్య ధ్వనిని కొనసాగిస్తుంది                                               | పఠనానికి విరామం ఇచ్చి, నేపథ్య ధ్వనిని కొనసాగిస్తుంది                                             | ఆపి means 'stops'; Selah only pauses, and విరామం is the word the file already uses for Pause.                                     |
| `bible.verseImage.size`                        | వచన పరిమాణం                                                                               | అక్షరాల పరిమాణం                                                                                  | వచనం means 'Bible verse' throughout this file, so the label read as 'verse size'; అక్షరాల పరిమాణం is the normal 'text size'.      |
| `readingPlans.lifeSituations.loss.description` | దుఃఖ సమయానికి ఏడు రోజులు; యోబు, రూతు నుండి ప్రతి కన్నీటిని తుడిచివేస్తాడనే వాగ్దానం వరకు. | దుఃఖ సమయానికి ఏడు రోజులు; యోబు, రూతు నుండి దేవుడు ప్రతి కన్నీటిని తుడిచివేస్తాడనే వాగ్దానం వరకు. | The verb 'he will wipe away' had no subject, so it could be read as Job wiping the tears; naming God (as Rev 21:4 does) fixes it. |

### Turkish (tr) — 5

| Key                                               | Old                                                                                                      | New                                                                                                         | Why                                                                                                                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readingPlans.lifeSituations.stress.description`  | Her şey fazla geldiğinde yedi gün: günlük rızk, paylaşılan yükler ve gerçek dinlenme.                    | Her şey fazla geldiğinde yedi gün: gündelik ekmek, paylaşılan yükler ve gerçek dinlenme.                    | 'Rızk' is Islamic-register (and misspelled; standard is rızık); Kutsal Kitap's Lord's Prayer says 'gündelik ekmek'.                                              |
| `readingPlans.lifeSituations.depression.title`    | Keder                                                                                                    | Depresyon                                                                                                   | 'Keder' means grief/sorrow, overlapping the 'Loss' plan; 'Depresyon' is the plain Turkish word for depression.                                                   |
| `readingPlans.lifeSituations.anxiety.description` | Güvenmeyi öğrenmek için yedi gün: yüreğinizi dökün ve Tanrı sizi korusun.                                | Güvenmeyi öğrenmek için yedi gün: yüreğinizi dökün ve bırakın Tanrı sizi korusun.                           | 'Tanrı sizi korusun' reads as the blessing 'God protect you'; 'bırakın' restores the meaning 'let God keep you'.                                                 |
| `readingPlans.lordsPrayerWeek.description`        | Her gün Rab’bin Duası’nı edin, sonra onun bir satırını açan bir bölüm okuyun.                            | Her gün Rab’bin Duası’yla dua edin, sonra duanın bir satırını açıklayan bir bölüm okuyun.                   | 'Duası'nı etmek' is ungrammatical and 'açan' (opens) is a literal calque; now 'pray with the Lord's Prayer, then read a passage that explains one of its lines'. |
| `readingPlans.weekOfChrist.description`           | Haftanın her günü İsa’nın öyküsünün bir bölümünü anar: Pazar günü diriliş, çarşamba ihanet, cuma çarmıh. | Haftanın her gününde İsa’nın öyküsünden bir bölüm anılır: pazar günü diriliş, çarşamba ihanet, cuma çarmıh. | More natural phrasing (a part is remembered on each day), and 'pazar' lowercased like the other day names.                                                       |

### Urdu (ur) — 7

| Key                                              | Old                                                                                                   | New                                                                                                 | Why                                                                                                                                                   |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readingPlans.commonPrayerPsalter.title`         | عام دعا کی کتاب کی زبور                                                                               | مشترکہ دعا کی کتاب کے زبور                                                                          | The rest of ur.ts calls the Book of Common Prayer 'مشترکہ دعا کی کتاب'; also fixes gender agreement (کے زبور, plural).                                |
| `readingPlans.commonPrayerPsalter.description`   | عام دعا کی کتاب کی ترتیب کے مطابق ہر مہینے صبح و شام تمام 150 مزامیر سے دعا کریں۔                     | مشترکہ دعا کی کتاب کی ترتیب کے مطابق ہر مہینے صبح و شام تمام 150 زبور دعا کے طور پر پڑھیں۔          | 'X سے دعا کریں' reads as 'pray to the Psalms'; now 'read all 150 psalms as prayer'. Also uses the file's established Psalms word (زبور) and BCP name. |
| `audio.passageFrom`                              | سے                                                                                                    | کہاں سے                                                                                             | This is a section heading; a bare postposition 'سے' is not a usable label in Urdu.                                                                    |
| `audio.passageTo`                                | تک                                                                                                    | کہاں تک                                                                                             | Same as above: bare 'تک' is not a usable heading; 'کہاں تک' is the natural 'To' label.                                                                |
| `bible.verseImage.colors.sand`                   | ریتلا                                                                                                 | ریتیلا                                                                                              | Spelling fix: the Urdu word for sandy is ریتیلا.                                                                                                      |
| `bible.verseImage.colors.mint`                   | پودینہ رنگ                                                                                            | پودینہ سبز                                                                                          | 'پودینہ رنگ' is ungrammatical as a colour label; 'پودینہ سبز' parallels 'خاکی سبز' used for Sage.                                                     |
| `readingPlans.lifeSituations.stress.description` | جب سب کچھ حد سے بڑھ جائے، اُس وقت کے لیے سات دن: روز کی فراہمی، مل کر اُٹھایا گیا بوجھ، اور سچا آرام۔ | جب سب کچھ حد سے بڑھ جائے، اُس وقت کے لیے سات دن: روز کی روٹی، مل کر اُٹھایا گیا بوجھ، اور سچا آرام۔ | 'فراہمی' is bureaucratic 'supply'; 'روز کی روٹی' is the Urdu Lord's Prayer phrase for daily provision.                                                |

### Vietnamese (vi) — 7

| Key                                                  | Old                                                                                                                                       | New                                                                                                                                       | Why                                                                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `readingPlans.weekOfChrist.description`              | Mỗi ngày trong tuần ghi nhớ một phần câu chuyện của Chúa Giê-xu: Chủ nhật là sự Phục sinh, thứ Tư là sự phản bội, thứ Sáu là thập tự giá. | Mỗi ngày trong tuần ghi nhớ một phần câu chuyện của Chúa Giê-su: Chủ nhật là sự Phục sinh, thứ Tư là sự phản bội, thứ Sáu là thập tự giá. | Uses "Giê-su", the spelling used 41 times elsewhere in the file, instead of the one-off "Giê-xu".                                  |
| `readingPlans.lifeSituations.peace.description`      | Bảy ngày về sự bình an Chúa Giê-su ban: hòa thuận với Đức Chúa Trời, với người khác, và tin cậy yên tĩnh.                                 | Bảy ngày về sự bình an Chúa Giê-su ban: bình an với Đức Chúa Trời, hòa thuận với người khác, và sự tin cậy lặng yên.                      | Restores "peace with God" and replaces the awkward "tin cậy yên tĩnh" with a natural phrase for quiet trust.                       |
| `readingPlans.lifeSituations.depression.title`       | Trầm uất                                                                                                                                  | Trầm cảm                                                                                                                                  | "Trầm cảm" is the standard Vietnamese word for depression; "trầm uất" is rare and literary.                                        |
| `readingPlans.lifeSituations.depression.description` | Bảy ngày với Thi Thiên và các tiên tri chân thật cho mùa tăm tối, và Đức Chúa Trời gặp bạn ở đó.                                          | Bảy ngày với những lời Thi Thiên và tiên tri thẳng thắn cho mùa tăm tối, và Đức Chúa Trời, Đấng gặp bạn ở đó.                             | "Các tiên tri chân thật" meant "true (not false) prophets"; the English means psalms and prophets that speak honestly.             |
| `readingPlans.lifeSituations.anger.description`      | Bảy ngày với những câu chuyện về cơn giận, từ Ca-in đến Giô-na, và lòng thương xót đáp lại.                                               | Bảy ngày với những câu chuyện về cơn giận, từ Ca-in đến Giô-na, và lòng thương xót đáp lại cơn giận ấy.                                   | Adds the missing object: mercy answers the anger itself.                                                                           |
| `readingPlans.lifeSituations.healing.description`    | Bảy ngày với Đức Chúa Trời chữa lành, từ Na-a-man và Ê-xê-chia đến sự chạm đến của Chúa Giê-su.                                           | Bảy ngày với Đức Chúa Trời chữa lành, từ Na-a-man và Ê-xê-chia đến cái chạm tay của Chúa Giê-su.                                          | "Đến sự chạm đến" repeated "đến" awkwardly; "cái chạm tay" is the natural phrase for Jesus' touch.                                 |
| `readingPlans.lordsPrayerWeek.description`           | Mỗi ngày cầu nguyện bằng Lời Cầu Nguyện Chúa Dạy, rồi đọc một đoạn giúp mở rộng một câu trong đó.                                         | Mỗi ngày cầu nguyện bằng Lời Cầu Nguyện Chúa Dạy, rồi đọc một đoạn Kinh Thánh giúp hiểu sâu hơn một câu trong bài cầu nguyện ấy.          | "Mở rộng" (expand) was a literal rendering of "opens up"; the meaning is a passage that helps you understand one line more deeply. |

### Chinese (Simplified) (zh) — 2

| Key                                            | Old                                                | New                                            | Why                                                                                                         |
| ---------------------------------------------- | -------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `readingPlans.lifeSituations.depression.title` | 忧郁                                               | 抑郁                                           | "抑郁" is the standard Mainland (Simplified Chinese) term for depression; "忧郁" reads as moody/melancholy. |
| `readingPlans.lifeSituations.hope.description` | 七天看神信守应许，从亚伯拉罕、约瑟到枯骨重新复活。 | 七天看神信守应许，从亚伯拉罕、约瑟到枯骨复生。 | "重新复活" is redundant (re- + rise again); "枯骨复生" is the natural phrase for Ezekiel's dry bones.       |
