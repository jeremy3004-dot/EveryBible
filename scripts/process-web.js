/**
 * Script to process the official eBible.org WEBPB VPL export into app-ready JSON.
 * Run with: node scripts/process-web.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const sourceUrl = 'https://eBible.org/Scriptures/engwebpb_vpl.zip';
const sourceEntry = 'engwebpb_vpl.sql';
const outputPath = path.join(__dirname, '../data/web_processed.json');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'everybible-web-'));
const archivePath = path.join(tempDir, 'engwebpb_vpl.zip');
const sqlPath = path.join(tempDir, sourceEntry);

console.log('Downloading WEB source from eBible.org...');
execFileSync('curl', ['-L', '--silent', '-o', archivePath, sourceUrl], { stdio: 'inherit' });

console.log('Extracting SQL export...');
const sqlOutput = fs.openSync(sqlPath, 'w');
execFileSync('unzip', ['-p', archivePath, sourceEntry], {
  stdio: ['ignore', sqlOutput, 'inherit'],
});
fs.closeSync(sqlOutput);
const sql = fs.readFileSync(sqlPath, 'utf8');
const lines = sql.replace(/^\uFEFF/, '').split(/\r?\n/);

const processedData = {
  translation: {
    id: 'WEB',
    name: 'World English Bible British Edition',
    totalVerses: 0,
  },
  verses: [],
};

const insertPattern =
  /^INSERT INTO engwebpb_vpl VALUES \("([^"]+)","([^"]+)","([^"]+)","([^"]+)","([^"]+)","([^"]+)","(.*)"\);$/;

for (const line of lines) {
  const match = line.match(insertPattern);
  if (!match) {
    continue;
  }

  const [, , , bookId, chapter, startVerse, endVerse, verseText] = match;
  if (startVerse !== endVerse) {
    throw new Error(
      `Unsupported verse range encountered: ${bookId} ${chapter}:${startVerse}-${endVerse}`
    );
  }

  processedData.verses.push({
    b: bookId,
    c: Number(chapter),
    v: Number(startVerse),
    t: verseText.trim(),
  });
}

processedData.translation.totalVerses = processedData.verses.length;

console.log(`Parsed ${processedData.translation.totalVerses} WEB verses.`);
fs.writeFileSync(outputPath, JSON.stringify(processedData));
const stats = fs.statSync(outputPath);
console.log(`Wrote ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
