// Server-side copy of the group session push, written in each recipient's interface language.
// The source of truth is `notifications.groupSessionTitle` / `groupSessionBody` in
// src/i18n/locales/*.ts; messages.test.ts fails when this copy drifts from it. The function
// composes the text itself so a caller can never choose what other members are sent.

export interface GroupSessionMessage {
  title: string;
  body: string;
}

const GROUP_SESSION_MESSAGES: Readonly<Record<string, GroupSessionMessage>> = {
  ar: { title: 'اكتملت جلسة المجموعة', body: 'تم تسجيل جلسة في {{groupName}}' },
  bn: { title: 'দলীয় সভা সম্পন্ন হয়েছে', body: '{{groupName}}-এ একটি সভা রেকর্ড করা হয়েছে' },
  de: {
    title: 'Gruppentreffen abgeschlossen',
    body: 'In {{groupName}} wurde ein Treffen festgehalten',
  },
  en: { title: 'Group Session Completed', body: 'A session was recorded in {{groupName}}' },
  es: { title: 'Sesión de grupo completada', body: 'Se registró una sesión en {{groupName}}' },
  fr: {
    title: 'Rencontre de groupe terminée',
    body: 'Une rencontre a été enregistrée dans {{groupName}}',
  },
  hi: { title: 'समूह सत्र पूरा हुआ', body: '{{groupName}} में एक सत्र दर्ज किया गया' },
  id: { title: 'Sesi kelompok selesai', body: 'Sebuah sesi dicatat di {{groupName}}' },
  ja: {
    title: 'グループセッションが完了しました',
    body: '{{groupName}}でセッションが記録されました',
  },
  ko: { title: '그룹 세션이 완료되었습니다', body: '{{groupName}}에 세션이 기록되었습니다' },
  mr: { title: 'गट सत्र पूर्ण झाले', body: '{{groupName}} मध्ये सत्र रेकॉर्ड केले गेले' },
  ne: { title: 'समूह सत्र सम्पन्न', body: '{{groupName}} मा सत्र रेकर्ड गरियो' },
  pa: { title: 'ਸਮੂਹ ਸੈਸ਼ਨ ਪੂਰਾ ਹੋਇਆ', body: '{{groupName}} ਵਿੱਚ ਇੱਕ ਸੈਸ਼ਨ ਦਰਜ ਕੀਤਾ ਗਿਆ' },
  pt: { title: 'Sessão de grupo concluída', body: 'Uma sessão foi registrada em {{groupName}}' },
  ru: { title: 'Групповая встреча завершена', body: 'Встреча записана в группе {{groupName}}' },
  ta: {
    title: 'குழு அமர்வு முடிந்தது',
    body: '{{groupName}} இல் ஒரு அமர்வு பதிவு செய்யப்பட்டது',
  },
  te: { title: 'బృంద సమావేశం పూర్తయింది', body: '{{groupName}} బృందంలో ఒక సమావేశం నమోదైంది' },
  tr: { title: 'Grup buluşması tamamlandı', body: '{{groupName}} grubunda bir buluşma kaydedildi' },
  ur: { title: 'گروپ کی نشست مکمل ہوئی', body: '{{groupName}} میں ایک نشست ریکارڈ ہوئی' },
  vi: {
    title: 'Đã hoàn tất buổi nhóm',
    body: 'Một buổi nhóm đã được ghi lại trong {{groupName}}',
  },
  zh: { title: '小组聚会已完成', body: '{{groupName}} 记录了一次聚会' },
};

export const GROUP_SESSION_MESSAGE_LANGUAGES = Object.keys(GROUP_SESSION_MESSAGES);

/** The database allows 80 characters; this also bounds whatever an older row might hold. */
const MAX_GROUP_NAME_LENGTH = 80;

/**
 * The group name is the only leader-chosen text in the push. Control and line-break
 * characters are flattened so it stays a single line, and its length is capped.
 */
export function cleanGroupName(name: unknown): string {
  if (typeof name !== 'string') return '';
  const flattened = name
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(flattened).slice(0, MAX_GROUP_NAME_LENGTH).join('').trim();
}

/** Unknown or missing languages (no saved preference) fall back to English. */
export function groupSessionMessage(language: unknown, groupName: string): GroupSessionMessage {
  const code = typeof language === 'string' ? language.trim().toLowerCase().split(/[-_]/)[0] : 'en';
  // Own keys only: the language is a member-chosen preference, and 'constructor' or
  // '__proto__' would otherwise resolve to an Object.prototype value, throw, and cancel the
  // push for the whole group.
  const message = Object.prototype.hasOwnProperty.call(GROUP_SESSION_MESSAGES, code)
    ? GROUP_SESSION_MESSAGES[code]
    : GROUP_SESSION_MESSAGES.en;
  return {
    title: message.title,
    body: message.body.replace('{{groupName}}', () => groupName),
  };
}
