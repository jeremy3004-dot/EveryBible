/**
 * Fixes pre-existing Bible book name bugs found by audit:
 *   ko — removes __CTX_성경_책__ artifact, fixes JAS transliteration
 *   ur — removes spurious | pipe prefixes
 *   zh — fixes machine-translated apostle names and 2TH label
 *   ar/bn/fr/ja/mr/pa/vi — fixes MRK (Mark the apostle, not "mark/label/sign")
 *   vi — fixes ACT (Acts, not "law") and HEB (Hebrews, not "Hebrew language")
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const LOCALES = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/i18n/locales');

function patch(lang, replacements) {
  const file = path.join(LOCALES, `${lang}.ts`);
  let content = fs.readFileSync(file, 'utf8');
  let changed = 0;
  for (const [from, to] of replacements) {
    const next = content.replace(from, to);
    if (next !== content) { changed++; content = next; }
    else console.warn(`  ⚠️  [${lang}] pattern not found: ${String(from).slice(0, 60)}`);
  }
  fs.writeFileSync(file, content);
  console.log(`  ✅ ${lang}.ts — ${changed}/${replacements.length} replacements applied`);
}

// ── Korean: strip __CTX_성경_책__ artifact, fix JAS transliteration ──────────
console.log('\nko.ts');
patch('ko', [
  [/"GEN": "창세기 __CTX_성경_책__"/, '"GEN": "창세기"'],
  [/"EXO": "출애굽기 __CTX_성경_책__"/, '"EXO": "출애굽기"'],
  [/"1KI": "열왕기상 __CTX_성경_책__"/, '"1KI": "열왕기상"'],
  [/"JOB": "욥기 __CTX_성경_책__"/, '"JOB": "욥기"'],
  [/"ISA": "이사야 __CTX_성경_책__"/, '"ISA": "이사야"'],
  [/"MRK": "마가 __CTX_성경_책__"/, '"MRK": "마가복음"'],
  [/"JHN": "요한 __CTX_성경_책__"/, '"JHN": "요한복음"'],
  [/"ACT": "사도행전 __CTX_성경_책__"/, '"ACT": "사도행전"'],
  // "제임스" is the English name James transliterated; standard Korean is 야고보서
  [/"JAS": "제임스 __CTX_성경_책__"/, '"JAS": "야고보서"'],
]);

// ── Urdu: remove spurious leading "| " from 9 book entries ───────────────────
console.log('\nur.ts');
patch('ur', [
  [/"LEV": "\| احبار"/, '"LEV": "احبار"'],
  [/"ISA": "\| یسعیاہ"/, '"ISA": "یسعیاہ"'],
  [/"EZK": "\| حزقی ایل"/, '"EZK": "حزقی ایل"'],
  [/"HOS": "\| ہوسیع"/, '"HOS": "ہوسیع"'],
  [/"AMO": "\| عاموس"/, '"AMO": "عاموس"'],
  [/"HAG": "\| حجی"/, '"HAG": "حجی"'],
  [/"GAL": "\| گلتیوں"/, '"GAL": "گلتیوں"'],
  [/"TIT": "\| ططس"/, '"TIT": "ططس"'],
  [/"PHM": "\| فلیمون"/, '"PHM": "فلیمون"'],
]);

// ── Chinese: fix apostle names machine-translated as English names, fix 2TH ──
console.log('\nzh.ts');
patch('zh', [
  // "马修" is a transliteration of "Matthew" — standard Chinese Bible: 马太福音
  [/"MAT": "马修"/, '"MAT": "马太福音"'],
  // "标记" = "label/mark" (verb) — standard: 马可福音
  [/"MRK": "标记"/, '"MRK": "马可福音"'],
  // "卢克" is transliteration of "Luke" — standard: 路加福音
  [/"LUK": "卢克"/, '"LUK": "路加福音"'],
  // "2 帖撒罗尼迦前书" → 后书 (前=first, 后=second)
  [/"2TH": "2 帖撒罗尼迦前书"/, '"2TH": "帖撒罗尼迦后书"'],
  // "詹姆斯" is transliteration of "James" — standard: 雅各书
  [/"JAS": "詹姆斯"/, '"JAS": "雅各书"'],
  // "裘德" is transliteration of "Jude" — standard: 犹大书
  [/"JUD": "裘德"/, '"JUD": "犹大书"'],
]);

// ── Arabic: MRK was "علامة" (sign/mark noun) — correct: مَرْقُس (Marqos) ────
console.log('\nar.ts');
patch('ar', [
  [/"MRK": "علامة"/, '"MRK": "مرقس"'],
]);

// ── Bengali: MRK was "চিহ্নিত করুন" (to mark, imperative) — correct: মার্ক ──
console.log('\nbn.ts');
patch('bn', [
  [/"MRK": "চিহ্নিত করুন"/, '"MRK": "মার্ক"'],
]);

// ── French: MRK was "Marque" (brand/mark noun) — correct: Marc ───────────────
console.log('\nfr.ts');
patch('fr', [
  [/"MRK": "Marque"/, '"MRK": "Marc"'],
]);

// ── Japanese: MRK was "をマーク" (to mark, object particle form) — correct: マルコ
console.log('\nja.ts');
patch('ja', [
  [/"MRK": "をマーク"/, '"MRK": "マルコ"'],
]);

// ── Marathi: MRK was "चिन्हांकित करा" (imperative "mark this") — correct: मार्क
console.log('\nmr.ts');
patch('mr', [
  [/"MRK": "चिन्हांकित करा"/, '"MRK": "मार्क"'],
]);

// ── Punjabi: MRK was "ਨਿਸ਼ਾਨ" (sign/mark noun) — correct: ਮਰਕੁਸ (Markus) ───
console.log('\npa.ts');
patch('pa', [
  [/"MRK": "ਨਿਸ਼ਾਨ"/, '"MRK": "ਮਰਕੁਸ"'],
]);

// ── Vietnamese: MRK, ACT, HEB all machine-translated as common nouns ─────────
console.log('\nvi.ts');
patch('vi', [
  // "Đánh dấu" = "to mark/bookmark" — correct Vietnamese Bible: Mác
  [/"MRK": "Đánh dấu"/, '"MRK": "Mác"'],
  // "Đạo luật" = "legislation/statute" — correct: Công Vụ Các Sứ Đồ → Công vụ
  [/"ACT": "Đạo luật"/, '"ACT": "Công vụ"'],
  // "Tiếng Do Thái" = "Hebrew language" — correct: Hê-bơ-rơ
  [/"HEB": "Tiếng Do Thái"/, '"HEB": "Hê-bơ-rơ"'],
]);

console.log('\n=== Done ===');
