# Locale review: strings added or changed on 2026-09-24 (South Asia + Arabic + Chinese)

Scope: every interface key in `src/i18n/locales/en.ts` whose English value was added or changed
on 2026-09-24 after 05:00 +0545. The baseline was commit `7e5a7115`, the last commit before 05:00.
There were 108 changed English keys, or 98 plural stems. The stems cover reminders, offline and
download errors, prayer wall report/block/moderation, password-reset (PKCE) messages,
screen-reader labels and announcements, Learn retry, the blocked-notifications notice, the
translator feedback queue, synced-group copy and the "Every Bible" display-name change.

Locales reviewed: zh, hi, ar, bn, ur, pa, mr, te, ta, ne. Every plural variant (`_zero`, `_two`,
`_few` and `_many` for Arabic) was compared with the English source and with each locale's existing
terms. Those terms are the prayer wall, prayer request, answered, passcode, device, passage, verse
and discipleship. For keys whose English changed today, the check also covered whether the
locale value had been updated. Keys where only the English capitalisation changed ("Sign Up" to
"Sign up") needed nothing in these scripts.

## Summary

- 52 values fixed across all 10 locales. Two rounds:
  - The review below found 33.
  - Follow-up work from the coordinator changed 19 more:
    - `settings.notificationsBlockedNotice` now says "Every Bible" (the display name) in all 10
      locales.
    - `interface.prayerYouEncouraged` now names the person being encouraged in 9 locales. It had
      made the request the thing encouraged. Arabic already said "صاحب هذا الطلب" (the person who
      posted this request).
- The worst problems:
  - **Stale translations.** `harvest.groupSyncReady` was reworded in English today, from "once
    rollout begins" to "as soon as they're available". In bn, ur, mr, te and ne it still carried
    the old "after launch/start" meaning, or said the account is ready only *after* launch. Most
    versions also had a present/future tense clash.
  - **"Skip for now" became "skip right now"** (`feedback.skip`) in hi, ar, bn, ur and mr.
  - **A second name for one passcode.** The new translator queue called the translator passcode an
    "access code" (访问码 / رمز الدخول / رسائی کوڈ). Settings already calls it 译者密码 /
    رمز المرور / پاس کوڈ. The Indic locales already used प्रवेश कोड etc. for both screens, so they
    were consistent.
  - **Wrong Telugu plural.** In the Telugu one-forms, a count of 1 took a plural noun (అధ్యాయాలు,
    రోజులు).
  - **Mixed "device" words.** ur (آلہ vs ڈیوائس), mr (डिव्हाइस vs उपकरण) and ne (उपकरण vs यन्त्र)
    each had a device word used only in today's keys.
  - **Missing or garbled words.** The Urdu WEB description had no word for "text". The Hindi one
    had broken genitive chains.
- No mojibake, untranslated English, broken `{{…}}` tokens or RTL problems were found in ar/ur.
  Latin brand names sit correctly inside RTL sentences, and ar uses «» quotes.
- Arabic plurals: `_two`, `_zero` and `_other` use the numeral with a singular noun, e.g.
  "{{count}} يوم". The `_few` forms use أيام / إصحاحات and the `_many` forms use يومًا /
  إصحاحًا. This is the convention the rest of `ar.ts` uses (20 existing `_two` keys), so it was
  left alone.

## Fixes

### Chinese (zh) (7)

| Key | Old | New | Why |
|---|---|---|---|
| `translatorQueue.notCoveredTitle` | 你的访问码不包括{{translation}} | 你的译者密码不适用于{{translation}} | Same code the Settings screen calls 译者密码 (translatorAccessBody/Placeholder); 访问码 introduced a second name for one passcode. |
| `translatorQueue.notCoveredBody` | 这个访问码可以查看以下译本的反馈： | 这个密码可以查看以下译本的反馈： | Passcode term consistency (密码). |
| `translatorQueue.notCoveredNone` | 这个访问码目前还不能查看任何译本。请让给你访问码的人核实一下。 | 这个密码目前还不能查看任何译本。请让给你密码的人核实一下。 | Passcode term consistency (密码). |
| `bible.audioClipStart` | 片段开始 | 片段起点 | These label the draggable clip handles; 开始/结束 read as the events "clip starts/ends", 起点/终点 name the handle positions. |
| `bible.audioClipEnd` | 片段结束 | 片段终点 | Same as clip start: handle position, not an event. |
| `settings.notificationsBlockedNotice` | 设备设置中已关闭 EveryBible 的通知，因此此提醒无法显示。 | 设备设置中已关闭 Every Bible 的通知，因此此提醒无法显示。 | Brand form: the app's display name is "Every Bible" everywhere else in the locale. |
| `interface.prayerYouEncouraged` | 你已鼓励此代祷事项 | 你已鼓励对方 | "Encouraged this prayer request" gave the verb a thing as its object; encouragement goes to the person (对方 = the person who posted). |

### Hindi (hi) (5)

| Key | Old | New | Why |
|---|---|---|---|
| `feedback.skip` | अभी छोड़ें | फ़िलहाल छोड़ें | English is "Skip for now"; अभी छोड़ें reads "skip right now" and loses the "come back later" sense. |
| `harvest.groupSyncReady` | सिंक किए गए समूह उपलब्ध होते ही आपका खाता उनके लिए तैयार है। | सिंक किए गए समूह उपलब्ध होते ही आपका खाता उनके लिए तैयार रहेगा। | Present tense (तैयार है) clashed with the future condition (उपलब्ध होते ही); future तैयार रहेगा is grammatical. |
| `interface.translationDescriptions.web` | Every Bible पुस्तकालय का सार्वजनिक स्वामित्व वाला ब्रिटिश संस्करण का पाठ और अध्याय ऑडियो | Every Bible पुस्तकालय से ब्रिटिश संस्करण का सार्वजनिक स्वामित्व वाला पाठ और अध्याय ऑडियो | Stacked का…वाला…का genitives were ungrammatical and made the library the owner; English says the text comes *from* the library. |
| `settings.notificationsBlockedNotice` | आपके डिवाइस की सेटिंग में EveryBible की सूचनाएँ बंद हैं, इसलिए यह अनुस्मारक दिखाई नहीं दे सकता। | आपके डिवाइस की सेटिंग में Every Bible की सूचनाएँ बंद हैं, इसलिए यह अनुस्मारक दिखाई नहीं दे सकता। | Brand form "Every Bible". |
| `interface.prayerYouEncouraged` | आपने इसे प्रोत्साहित किया | आपने उन्हें प्रोत्साहित किया | इसे ("this") made the request the one encouraged; उन्हें (respectful "them") names the person. |

### Arabic (ar) (4)

| Key | Old | New | Why |
|---|---|---|---|
| `feedback.skip` | تخطَّ الآن | تخطَّ مؤقتًا | "تخطَّ الآن" means "skip now"; English "Skip for now" means skip temporarily. |
| `translatorQueue.notCoveredTitle` | رمز الدخول الخاص بك لا يشمل {{translation}} | رمز المرور الخاص بك لا يشمل {{translation}} | The same translator passcode is رمز المرور in Settings; رمز الدخول introduced a second name. |
| `prayer.postingBlocked` | لا يمكنك مشاركة الطلبات على حائط الصلاة حاليًا. | لا يمكنك مشاركة طلبات الصلاة على حائط الصلاة حاليًا. | English says "prayer requests"; bare الطلبات ("the requests/orders") dropped the prayer sense. |
| `settings.notificationsBlockedNotice` | إشعارات EveryBible متوقفة في إعدادات جهازك، لذلك لا يمكن أن يظهر هذا التذكير. | إشعارات Every Bible متوقفة في إعدادات جهازك، لذلك لا يمكن أن يظهر هذا التذكير. | Brand form "Every Bible". |

### Bengali (bn) (4)

| Key | Old | New | Why |
|---|---|---|---|
| `feedback.skip` | এখন বাদ দিন | আপাতত বাদ দিন | "এখন" = right now; আপাতত = for now, matching "Skip for now". |
| `harvest.groupSyncReady` | চালু হওয়ার পরে সিঙ্ক করা দলের জন্য আপনার অ্যাকাউন্ট প্রস্তুত। | সিঙ্ক করা দল উপলব্ধ হলেই আপনার অ্যাকাউন্ট সেগুলোর জন্য প্রস্তুত থাকবে। | Stale: English changed today from "once rollout begins" to "as soon as they're available"; old text still said "after launch" and was left untranslated for the new wording. |
| `settings.notificationsBlockedNotice` | আপনার ডিভাইসের সেটিংসে EveryBible-এর বিজ্ঞপ্তি বন্ধ আছে, তাই এই অনুস্মারক দেখা যাবে না। | আপনার ডিভাইসের সেটিংসে Every Bible-এর বিজ্ঞপ্তি বন্ধ আছে, তাই এই অনুস্মারক দেখা যাবে না। | Brand form "Every Bible" (with the same -এর suffix as auth.backendNotConfigured). |
| `interface.prayerYouEncouraged` | আপনি এতে উৎসাহ দিয়েছেন | আপনি তাঁকে উৎসাহ দিয়েছেন | এতে ("in/to this") pointed at the request; তাঁকে (respectful him/her) is the person encouraged. |

### Urdu (ur) (7)

| Key | Old | New | Why |
|---|---|---|---|
| `feedback.skip` | ابھی چھوڑ دیں | فی الحال چھوڑ دیں | ابھی = right now; فی الحال = for now. |
| `translatorQueue.notCoveredTitle` | آپ کے رسائی کوڈ میں {{translation}} شامل نہیں ہے | آپ کے پاس کوڈ میں {{translation}} شامل نہیں ہے | The Settings screen calls this same translator code پاس کوڈ. |
| `harvest.groupSyncReady` | ہم آہنگ گروپ شروع ہوتے ہی آپ کا اکاؤنٹ تیار ہے۔ | ہم آہنگ گروپ دستیاب ہوتے ہی آپ کا اکاؤنٹ ان کے لیے تیار ہوگا۔ | Stale vs today's English ("as soon as they're available"); tense mismatch (تیار ہے with a future condition) and no object for "ready for". |
| `auth.resetLinkWrongDevice` | یہ ری سیٹ لنک صرف اسی آلے پر کام کرتا ہے جس سے آپ نے اسے منگوایا تھا۔ اسے وہیں کھولیں، یا اس آلے سے نیا لنک بھیجیں۔ | یہ ری سیٹ لنک صرف اسی ڈیوائس پر کام کرتا ہے جس سے آپ نے اسے منگوایا تھا۔ اسے وہیں کھولیں، یا اس ڈیوائس سے نیا لنک بھیجیں۔ | Urdu locale says ڈیوائس ~24 times; آلہ appeared only here. |
| `interface.translationDescriptions.web` | Every Bible لائبریری سے عوامی ملکیت کا برطانوی ایڈیشن اور باب آڈیو | عوامی ملکیت میں برطانوی ایڈیشن کا متن اور باب آڈیو، Every Bible لائبریری سے | The word "text" (متن) was missing, so it read "British edition and chapter audio". |
| `settings.notificationsBlockedNotice` | آپ کی ڈیوائس کی ترتیبات میں EveryBible کی اطلاعات بند ہیں، اس لیے یہ یاد دہانی ظاہر نہیں ہو سکتی۔ | آپ کی ڈیوائس کی ترتیبات میں Every Bible کی اطلاعات بند ہیں، اس لیے یہ یاد دہانی ظاہر نہیں ہو سکتی۔ | Brand form "Every Bible". |
| `interface.prayerYouEncouraged` | آپ نے اس کا حوصلہ بڑھایا | آپ نے ان کا حوصلہ بڑھایا | اس is ambiguous with "this" (the request); respectful ان clearly means the person. |

### Punjabi (pa) (5)

| Key | Old | New | Why |
|---|---|---|---|
| `groups.syncSession.savedLessonUnchanged` | ਸੈਸ਼ਨ ਸੰਭਾਲ ਲਿਆ ਗਿਆ, ਪਰ ਸਮੂਹ ਨੂੰ ਅਗਲੇ ਪਾਠ 'ਤੇ ਨਹੀਂ ਲਿਜਾਇਆ ਜਾ ਸਕਿਆ। | ਸੈਸ਼ਨ ਸੰਭਾਲ ਲਿਆ ਗਿਆ, ਪਰ ਸਮੂਹ ਨੂੰ ਅਗਲੇ ਪਾਠ ’ਤੇ ਨਹੀਂ ਲਿਜਾਇਆ ਜਾ ਸਕਿਆ। | Today's keys mixed ’ਤੇ and 'ਤੇ; standardised on the typographic apostrophe used by switchTo/resetLinkWrongDevice. |
| `prayer.contentRejected` | ਇਸ ਬੇਨਤੀ ਵਿੱਚ ਅਜਿਹੀ ਭਾਸ਼ਾ ਹੈ ਜਿਸ ਦੀ ਪ੍ਰਾਰਥਨਾ ਬੋਰਡ 'ਤੇ ਇਜਾਜ਼ਤ ਨਹੀਂ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਇਸ ਨੂੰ ਬਦਲ ਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ। | ਇਸ ਬੇਨਤੀ ਵਿੱਚ ਅਜਿਹੀ ਭਾਸ਼ਾ ਹੈ ਜਿਸ ਦੀ ਪ੍ਰਾਰਥਨਾ ਬੋਰਡ ’ਤੇ ਇਜਾਜ਼ਤ ਨਹੀਂ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਇਸ ਨੂੰ ਬਦਲ ਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ। | Apostrophe consistency (’ਤੇ). |
| `prayer.postingBlocked` | ਤੁਸੀਂ ਇਸ ਵੇਲੇ ਪ੍ਰਾਰਥਨਾ ਬੋਰਡ 'ਤੇ ਬੇਨਤੀਆਂ ਸਾਂਝੀਆਂ ਨਹੀਂ ਕਰ ਸਕਦੇ। | ਤੁਸੀਂ ਇਸ ਵੇਲੇ ਪ੍ਰਾਰਥਨਾ ਬੋਰਡ ’ਤੇ ਪ੍ਰਾਰਥਨਾ ਬੇਨਤੀਆਂ ਸਾਂਝੀਆਂ ਨਹੀਂ ਕਰ ਸਕਦੇ। | Apostrophe consistency, and "prayer requests" (ਪ੍ਰਾਰਥਨਾ ਬੇਨਤੀਆਂ) as in English and in rateLimited/blockBody. |
| `settings.notificationsBlockedNotice` | ਤੁਹਾਡੀ ਡਿਵਾਈਸ ਦੀਆਂ ਸੈਟਿੰਗਾਂ ਵਿੱਚ EveryBible ਦੀਆਂ ਸੂਚਨਾਵਾਂ ਬੰਦ ਹਨ, ਇਸ ਲਈ ਇਹ ਰੀਮਾਈਂਡਰ ਦਿਖਾਈ ਨਹੀਂ ਦੇ ਸਕਦਾ। | ਤੁਹਾਡੀ ਡਿਵਾਈਸ ਦੀਆਂ ਸੈਟਿੰਗਾਂ ਵਿੱਚ Every Bible ਦੀਆਂ ਸੂਚਨਾਵਾਂ ਬੰਦ ਹਨ, ਇਸ ਲਈ ਇਹ ਰੀਮਾਈਂਡਰ ਦਿਖਾਈ ਨਹੀਂ ਦੇ ਸਕਦਾ। | Brand form "Every Bible". |
| `interface.prayerYouEncouraged` | ਤੁਸੀਂ ਇਸ ਨੂੰ ਉਤਸ਼ਾਹਿਤ ਕੀਤਾ | ਤੁਸੀਂ ਉਨ੍ਹਾਂ ਨੂੰ ਉਤਸ਼ਾਹਿਤ ਕੀਤਾ | ਇਸ ਨੂੰ ("this") pointed at the request; ਉਨ੍ਹਾਂ ਨੂੰ is the person. |

### Marathi (mr) (6)

| Key | Old | New | Why |
|---|---|---|---|
| `feedback.skip` | आत्ता वगळा | सध्या वगळा | आत्ता = right now; सध्या = for now. |
| `onboarding.catalogUnavailableBody` | तुमचे इंटरनेट कनेक्शन तपासा आणि पुन्हा प्रयत्न करा. खालील बायबल आधीपासून या डिव्हाइसवर आहेत आणि ऑफलाइनही चालतात. | तुमचे इंटरनेट कनेक्शन तपासा आणि पुन्हा प्रयत्न करा. खालील बायबल आधीपासून या उपकरणावर आहेत आणि ऑफलाइनही चालतात. | Marathi locale uses उपकरण for "device" (23x); डिव्हाइस appeared only in two of today's keys. |
| `auth.resetLinkWrongDevice` | ही रीसेट लिंक फक्त ज्या डिव्हाइसवरून तुम्ही ती मागवली त्याच डिव्हाइसवर चालते. ती तिथेच उघडा, किंवा या डिव्हाइसवरून नवीन लिंक पाठवा. | ही रीसेट लिंक फक्त ज्या उपकरणावरून तुम्ही ती मागवली त्याच उपकरणावर चालते. ती तिथेच उघडा, किंवा या उपकरणावरून नवीन लिंक पाठवा. | Device term consistency (उपकरण). |
| `harvest.groupSyncReady` | समक्रमित गट सुरू होताच तुमचे खाते त्यासाठी तयार आहे. | समक्रमित गट उपलब्ध होताच तुमचे खाते त्यासाठी तयार असेल. | Stale vs today's English ("as soon as they're available", not "start"); tense fixed to future. |
| `settings.notificationsBlockedNotice` | तुमच्या उपकरणाच्या सेटिंग्जमध्ये EveryBible च्या सूचना बंद आहेत, त्यामुळे हे स्मरणपत्र दिसू शकत नाही. | तुमच्या उपकरणाच्या सेटिंग्जमध्ये Every Bible च्या सूचना बंद आहेत, त्यामुळे हे स्मरणपत्र दिसू शकत नाही. | Brand form "Every Bible". |
| `interface.prayerYouEncouraged` | तुम्ही याला प्रोत्साहन दिले | तुम्ही त्यांना प्रोत्साहन दिले | याला ("to this") pointed at the request; त्यांना is the person (respectful). |

### Telugu (te) (7)

| Key | Old | New | Why |
|---|---|---|---|
| `translatorQueue.pendingCount_one` | సమీక్షించాల్సిన అధ్యాయాలు: {{count}} | సమీక్షించాల్సిన {{count}} అధ్యాయం | The one-form used the plural అధ్యాయాలు ("1 chapters"); now singular and in natural word order. |
| `translatorQueue.pendingCount_other` | సమీక్షించాల్సిన అధ్యాయాలు: {{count}} | సమీక్షించాల్సిన {{count}} అధ్యాయాలు | Natural word order, matching the fixed one-form. |
| `readingActivity.legendProgress_one` | {{read}}/{{count}} రోజులు | {{read}}/{{count}} రోజు | One-form used plural రోజులు for a count of 1. |
| `home.ledgerThisMonth_one` | {{month}} · {{active}}/{{count}} రోజులు | {{month}} · {{active}}/{{count}} రోజు | One-form used plural రోజులు for a count of 1. |
| `harvest.groupSyncReady` | సమకాలీకరణ ప్రారంభమైన వెంటనే మీ ఖాతా బృందాల కోసం సిద్ధంగా ఉంటుంది. | సమకాలీకరించిన బృందాలు అందుబాటులోకి వచ్చిన వెంటనే మీ ఖాతా వాటి కోసం సిద్ధంగా ఉంటుంది. | Stale vs today's English; now "as soon as synced groups are available" and uses the same అందుబాటులోకి వచ్చాక phrasing as the sibling keys. |
| `settings.notificationsBlockedNotice` | మీ పరికర సెట్టింగ్‌లలో EveryBible నోటిఫికేషన్‌లు ఆఫ్ చేయబడ్డాయి, కాబట్టి ఈ రిమైండర్ కనిపించదు. | మీ పరికర సెట్టింగ్‌లలో Every Bible నోటిఫికేషన్‌లు ఆఫ్ చేయబడ్డాయి, కాబట్టి ఈ రిమైండర్ కనిపించదు. | Brand form "Every Bible". |
| `interface.prayerYouEncouraged` | మీరు దీనిని ప్రోత్సహించారు | మీరు వారిని ప్రోత్సహించారు | దీనిని ("this thing") pointed at the request; వారిని is the person (respectful). |

### Tamil (ta) (3)

| Key | Old | New | Why |
|---|---|---|---|
| `feedback.progress` | {{total}} இல் {{current}} | {{total}}-இல் {{current}} | Same "X of Y" pattern as tabs.accessibilityPosition ({{total}}-இல்); spaced இல் after a numeral reads as a separate word. |
| `settings.notificationsBlockedNotice` | உங்கள் சாதன அமைப்புகளில் EveryBible அறிவிப்புகள் முடக்கப்பட்டுள்ளன, எனவே இந்த நினைவூட்டல் தோன்றாது. | உங்கள் சாதன அமைப்புகளில் Every Bible அறிவிப்புகள் முடக்கப்பட்டுள்ளன, எனவே இந்த நினைவூட்டல் தோன்றாது. | Brand form "Every Bible". |
| `interface.prayerYouEncouraged` | நீங்கள் இதற்கு ஊக்கமளித்தீர்கள் | நீங்கள் இவருக்கு ஊக்கமளித்தீர்கள் | இதற்கு ("to this thing") pointed at the request; இவருக்கு is the person, matching prayer.blockBody's இவர். |

### Nepali (ne) (4)

| Key | Old | New | Why |
|---|---|---|---|
| `auth.resetLinkWrongDevice` | यो रिसेट लिङ्क तपाईंले अनुरोध गरेको उपकरणमा मात्र काम गर्छ। त्यहीँ खोल्नुहोस्, वा यो उपकरणबाट नयाँ लिङ्क पठाउनुहोस्। | यो रिसेट लिङ्क तपाईंले अनुरोध गरेको यन्त्रमा मात्र काम गर्छ। त्यहीँ खोल्नुहोस्, वा यो यन्त्रबाट नयाँ लिङ्क पठाउनुहोस्। | Nepali locale says यन्त्र for device (28x, incl. today's onboarding/settings keys); उपकरण is used elsewhere for "tools". |
| `harvest.groupSyncReady` | सिंक गरिएका समूह सुरु भएपछि तपाईंको खाता तयार छ। | सिंक गरिएका समूह उपलब्ध हुनासाथ तपाईंको खाता तिनका लागि तयार हुनेछ। | Stale vs today's English; old text implied the account is only ready *after* launch. |
| `settings.notificationsBlockedNotice` | तपाईंको यन्त्रको सेटिङमा EveryBible का सूचनाहरू बन्द छन्, त्यसैले यो रिमाइन्डर देखिन सक्दैन। | तपाईंको यन्त्रको सेटिङमा Every Bible का सूचनाहरू बन्द छन्, त्यसैले यो रिमाइन्डर देखिन सक्दैन। | Brand form "Every Bible". |
| `interface.prayerYouEncouraged` | तपाईंले यसलाई प्रोत्साहन दिनुभयो | तपाईंले उहाँलाई प्रोत्साहन दिनुभयो | यसलाई ("to this") pointed at the request; उहाँलाई is the person, matching prayer.blockBody's उहाँ. |

## Flagged, not changed

These are English-side issues. They are outside this locale-only pass, and changing them affects
all 21 locales.

- In this branch, the English `settings.notificationsBlockedNotice` still says **EveryBible**. The
  coordinator is changing the English in another branch. The 10 locales here already use
  **Every Bible**.
- `translatorQueue.notCoveredTitle` says "access code", but Settings calls the same credential
  "translator passcode". The locales above now use their passcode term. The English should
  probably say "Your passcode doesn't cover {{translation}}".
- `interface.prayerMarkedAnswered` in hi and pa ("उत्तर मिला चिह्नित किया गया", "ਜਵਾਬ ਮਿਲਿਆ
  ਨਿਸ਼ਾਨ ਲਗਾਇਆ ਗਿਆ") reads stiffly. It exactly mirrors the existing `prayer.markAnswered`
  button, so it was kept consistent. If one changes, both should.

## Verification

- `node --test --import tsx src/i18n/locales/coverage.test.ts src/i18n/locales/coreLocaleCoverage.test.ts src/i18n/interfaceCoverage.test.ts src/i18n/interfaceRendering.test.ts` passed 38 of 38.
- `npm run typecheck` passed.
- `npm run i18n:native:check` passed ("Native permission translations are current for 21 languages").
