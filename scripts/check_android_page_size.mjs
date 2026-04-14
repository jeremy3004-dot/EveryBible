#!/usr/bin/env node

import AdmZip from 'adm-zip';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const minimumAlignmentBytes = 16 * 1024;
const bundlePath = process.argv[2];

if (!bundlePath) {
  console.error('Usage: node scripts/check_android_page_size.mjs /absolute/path/to/app.aab');
  process.exit(1);
}

const absoluteBundlePath = path.resolve(bundlePath);

if (!fs.existsSync(absoluteBundlePath)) {
  console.error(`Bundle not found: ${absoluteBundlePath}`);
  process.exit(1);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'everybible-page-size-'));

const parseAlignmentToken = (token) => {
  if (token.startsWith('2**')) {
    return 2 ** Number(token.slice(3));
  }

  if (token.startsWith('0x')) {
    return Number.parseInt(token, 16);
  }

  return Number.parseInt(token, 10);
};

try {
  const zip = new AdmZip(absoluteBundlePath);
  const libraryEntries = zip
    .getEntries()
    .filter((entry) => /(^|\/)lib\/arm64-v8a\/.+\.so$/.test(entry.entryName));

  if (libraryEntries.length === 0) {
    console.error(`No arm64 native libraries found in ${absoluteBundlePath}`);
    process.exit(1);
  }

  const failures = [];

  for (const entry of libraryEntries) {
    const relativePath = entry.entryName;
    const extractedPath = path.join(tempDir, relativePath);

    fs.mkdirSync(path.dirname(extractedPath), { recursive: true });
    fs.writeFileSync(extractedPath, entry.getData());

    const objdumpOutput = execFileSync('objdump', ['-p', extractedPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const alignments = objdumpOutput
      .split('\n')
      .filter((line) => line.includes('LOAD'))
      .map((line) => line.trim().split(/\s+/).at(-1))
      .map(parseAlignmentToken);

    if (alignments.length === 0 || alignments.some((alignment) => !Number.isFinite(alignment))) {
      failures.push({
        library: relativePath,
        alignments: ['unparseable'],
      });
      continue;
    }

    if (alignments.some((alignment) => alignment < minimumAlignmentBytes)) {
      failures.push({
        library: relativePath,
        alignments,
      });
    }
  }

  if (failures.length > 0) {
    console.error('Found 16 KB-incompatible arm64 native libraries:');
    failures.forEach(({ library, alignments }) => {
      console.error(`- ${library}: ${alignments.join(', ')}`);
    });
    process.exit(1);
  }

  console.log(
    `Verified ${libraryEntries.length} arm64 native libraries in ${absoluteBundlePath} meet the 16 KB ELF alignment requirement.`
  );
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
