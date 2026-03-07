/**
 * Script to process BSB JSON into a simpler format for the app
 * Run with: node scripts/process-bsb.js
 */

const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '../data/bsb_complete.json');
const outputPath = path.join(__dirname, '../data/bsb_processed.json');

console.log('Reading BSB data...');
const bsbData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

function extractVerseText(content) {
  const parts = [];

  for (const item of content) {
    if (typeof item === 'string') {
      parts.push(item);
    } else if (item && typeof item === 'object') {
      // Handle poetry format: { text: "...", poem: 1 }
      if (item.text) {
        parts.push(item.text);
      }
      // Handle other text formats
      if (item.value) {
        parts.push(item.value);
      }
    }
  }

  return parts
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

console.log('Processing verses...');

const processedData = {
  translation: {
    id: 'BSB',
    name: 'Berean Standard Bible',
    totalVerses: 0,
  },
  verses: [],
};

let totalVerses = 0;
let currentHeading = null;

for (const book of bsbData.books) {
  let bookVerseCount = 0;

  for (const chapterData of book.chapters) {
    const chapterNum = chapterData.chapter.number;
    currentHeading = null;

    for (const item of chapterData.chapter.content) {
      if (item.type === 'heading') {
        currentHeading = item.content.join(' ');
      } else if (item.type === 'hebrew_subtitle') {
        // Include Hebrew subtitles as headings for Psalms
        if (!currentHeading) {
          currentHeading = item.content.join(' ');
        }
      } else if (item.type === 'verse') {
        const text = extractVerseText(item.content);

        if (text) {
          processedData.verses.push({
            b: book.id,      // bookId
            c: chapterNum,   // chapter
            v: item.number,  // verse
            t: text,         // text
            ...(currentHeading && { h: currentHeading }), // heading (optional)
          });
          totalVerses++;
          bookVerseCount++;
          currentHeading = null; // Only apply heading to first verse after it
        }
      }
    }
  }
  console.log(`  Processed ${book.name}: ${book.chapters.length} chapters, ${bookVerseCount} verses`);
}

processedData.translation.totalVerses = totalVerses;

console.log(`\nTotal verses processed: ${totalVerses}`);
console.log('Writing processed data...');

fs.writeFileSync(outputPath, JSON.stringify(processedData));

const stats = fs.statSync(outputPath);
console.log(`Output file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
console.log('Done!');
