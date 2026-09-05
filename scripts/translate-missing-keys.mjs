/**
 * Translates missing i18n keys into all core locale files using the Gemini API.
 * Usage: node scripts/translate-missing-keys.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, '../src/i18n/locales');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';

const LANGUAGE_NAMES = {
  bn: 'Bengali',
  de: 'German',
  fr: 'French',
  id: 'Indonesian',
  ja: 'Japanese',
  ko: 'Korean',
  mr: 'Marathi',
  pa: 'Punjabi',
  pt: 'Portuguese',
  ta: 'Tamil',
  te: 'Telugu',
  tr: 'Turkish',
  ur: 'Urdu',
  vi: 'Vietnamese',
  zh: 'Chinese (Simplified)',
};

// Missing keys with their English values and insertion context
const MISSING_KEYS = [
  // home section - insert after "goodEvening"
  { path: ['home', 'greetingWithName'], value: '{{greeting}}, {{name}}', insertAfter: 'goodEvening' },
  { path: ['home', 'guestName'], value: 'friend', insertAfter: 'greetingWithName' },
  { path: ['home', 'beginToday'], value: 'Begin today', insertAfter: 'welcome' },
  { path: ['home', 'todaysScripture'], value: "Today's Scripture", insertAfter: 'beginToday' },
  { path: ['home', 'sharePrompt'], value: 'Share light. Encourage someone today.', insertAfter: 'continueReading' },
  { path: ['home', 'plan'], value: 'Plan', insertAfter: 'sharePrompt' },
  { path: ['home', 'minutesLeft'], value: '{{count}} min left', insertAfter: 'plan' },
  { path: ['home', 'percentComplete'], value: '{{percent}}%', insertAfter: 'minutesLeft' },
  { path: ['home', 'fieldLabel'], value: 'Field {{number}}', insertAfter: 'percentComplete' },
  { path: ['home', 'notificationSettings'], value: 'Notification settings', insertAfter: 'fieldLabel' },
  // settings section - insert after "reading"
  { path: ['settings', 'hidePlayButtonFromReadingTab'], value: 'Hide play button from reading tab', insertAfter: 'reading' },
  // readingPlans section
  { path: ['readingPlans', 'dailyReadings'], value: 'Daily Readings', insertAfter: 'dailyRhythms' },
  { path: ['readingPlans', 'dailyRhythms'], value: 'Daily Rhythms', insertAfter: 'browsePlans' },
  // readingPlans.kathisma subsection — entire object is missing
  { path: ['readingPlans', 'kathisma'], value: null, insertAfter: 'proverbs31', isObject: true,
    children: {
      title: 'Kathisma',
      description: 'Read the appointed morning and evening kathismata for each weekday, repeating every week.',
    }
  },
];

async function callGemini(prompt) {
  if (!GEMINI_API_KEY) throw new Error('Set GEMINI_API_KEY before running translations.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No text in Gemini response: ' + JSON.stringify(data));
  return JSON.parse(text);
}

async function translateForLanguage(lang) {
  const langName = LANGUAGE_NAMES[lang];
  console.log(`\nTranslating for ${langName} (${lang})...`);

  // Build translation request - skip template-only strings and objects
  const toTranslate = {};
  for (const key of MISSING_KEYS) {
    const flatKey = key.path.join('.');
    if (key.isObject) {
      // Translate each child
      for (const [childKey, childVal] of Object.entries(key.children)) {
        toTranslate[`${flatKey}.${childKey}`] = childVal;
      }
    } else {
      toTranslate[flatKey] = key.value;
    }
  }

  const prompt = `You are a professional app translator. Translate the following UI strings from English to ${langName}.

RULES:
- Keep placeholder tokens like {{greeting}}, {{name}}, {{count}}, {{percent}}, {{number}} EXACTLY as-is (do not translate them)
- "kathisma" is a proper noun (Orthodox liturgical term) — keep it as "Kathisma" in all languages
- "EveryBible" and "Every Bible" are product names — keep them as-is
- Return ONLY valid JSON with the same keys, values translated to ${langName}
- Do not add explanations or markdown

English strings to translate:
${JSON.stringify(toTranslate, null, 2)}

Return JSON object with the exact same keys, values in ${langName}:`;

  return await callGemini(prompt);
}

function insertKeyAfter(content, section, insertAfterKey, newKey, newValue) {
  // Find the section block
  // For quoted keys (locale files use double-quotes)
  const sectionPattern = new RegExp(`"${section}":\\s*\\{`);
  const sectionMatch = sectionPattern.exec(content);
  if (!sectionMatch) {
    console.warn(`  ⚠️  Section "${section}" not found`);
    return content;
  }

  // Within the section, find insertAfterKey line
  const afterPattern = new RegExp(`([ \\t]*"${insertAfterKey}":\\s*"[^"]*",?)\\n`);
  const sectionContent = content.slice(sectionMatch.index);
  const afterMatch = afterPattern.exec(sectionContent);
  if (!afterMatch) {
    console.warn(`  ⚠️  Insert-after key "${insertAfterKey}" not found in section "${section}"`);
    return content;
  }

  const indent = '    '; // 4 spaces (locale files use 4-space indent inside sections)
  const insertion = `${indent}"${newKey}": "${newValue}",\n`;
  const insertAt = sectionMatch.index + afterMatch.index + afterMatch[0].length;
  return content.slice(0, insertAt) + insertion + content.slice(insertAt);
}

function insertObjectAfter(content, section, insertAfterKey, objectKey, objectValue) {
  const sectionPattern = new RegExp(`"${section}":\\s*\\{`);
  const sectionMatch = sectionPattern.exec(content);
  if (!sectionMatch) {
    console.warn(`  ⚠️  Section "${section}" not found`);
    return content;
  }

  // Match the block after insertAfterKey — a multi-line object ending with },
  const afterBlockPattern = new RegExp(
    `([ \\t]*"${insertAfterKey}":\\s*\\{[^}]*\\},?)\\n`,
    's'
  );
  const sectionContent = content.slice(sectionMatch.index);
  const afterMatch = afterBlockPattern.exec(sectionContent);
  if (!afterMatch) {
    console.warn(`  ⚠️  Insert-after block "${insertAfterKey}" not found in section "${section}"`);
    return content;
  }

  const indent = '    ';
  const childIndent = '      ';
  const entries = Object.entries(objectValue)
    .map(([k, v]) => `${childIndent}"${k}": "${v}"`)
    .join(',\n');
  const block = `${indent}"${objectKey}": {\n${entries}\n${indent}},\n`;
  const insertAt = sectionMatch.index + afterMatch.index + afterMatch[0].length;
  return content.slice(0, insertAt) + block + content.slice(insertAt);
}

async function patchLocaleFile(lang, translations) {
  const filePath = path.join(LOCALES_DIR, `${lang}.ts`);
  let content = fs.readFileSync(filePath, 'utf8');

  // Process insertions in the correct order (bottom-up to preserve offsets...
  // actually we re-read after each insert so order just needs to be logical)
  for (const key of MISSING_KEYS) {
    const flatKey = key.path.join('.');
    const section = key.path[0];
    const keyName = key.path[key.path.length - 1];

    if (key.isObject) {
      // Check if already present
      if (content.includes(`"${keyName}"`)) {
        console.log(`  ✓ ${flatKey} already present`);
        continue;
      }
      // Build translated object
      const translatedChildren = {};
      for (const childKey of Object.keys(key.children)) {
        const fullKey = `${flatKey}.${childKey}`;
        translatedChildren[childKey] = translations[fullKey] ?? key.children[childKey];
      }
      content = insertObjectAfter(content, section, key.insertAfter, keyName, translatedChildren);
      console.log(`  + inserted ${flatKey} object`);
    } else {
      // Check if already present
      if (content.includes(`"${keyName}"`)) {
        console.log(`  ✓ ${flatKey} already present`);
        continue;
      }
      const translatedValue = translations[flatKey] ?? key.value;
      // Escape double quotes in value
      const escaped = String(translatedValue).replace(/"/g, '\\"');
      content = insertKeyAfter(content, section, key.insertAfterKey ?? key.insertAfter, keyName, escaped);
      console.log(`  + inserted ${flatKey}: "${translatedValue}"`);
    }
  }

  fs.writeFileSync(filePath, content);
  console.log(`  ✅ ${lang}.ts updated`);
}

async function main() {
  console.log('=== EveryBible i18n Gap Filler ===');
  console.log(`Languages: ${Object.keys(LANGUAGE_NAMES).join(', ')}`);
  console.log(`Missing keys: ${MISSING_KEYS.length}`);

  const allTranslations = {};

  // Translate in parallel
  const results = await Promise.allSettled(
    Object.keys(LANGUAGE_NAMES).map(async (lang) => {
      const t = await translateForLanguage(lang);
      allTranslations[lang] = t;
      return lang;
    })
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Translation failed:', result.reason);
    }
  }

  // Patch files
  console.log('\n=== Patching locale files ===');
  for (const lang of Object.keys(LANGUAGE_NAMES)) {
    if (!allTranslations[lang]) {
      console.error(`Skipping ${lang} — no translations`);
      continue;
    }
    console.log(`\nPatching ${lang}.ts...`);
    console.log('  Translations:', JSON.stringify(allTranslations[lang], null, 2));
    await patchLocaleFile(lang, allTranslations[lang]);
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
