#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '../src/constants/languages';
import * as locales from '../src/i18n/locales';

type TranslationValue = string | { [key: string]: TranslationValue };
type TranslationTree = Record<string, TranslationValue>;

const DEFAULT_OUT_DIR = path.join('tmp', 'tolgee-export');

interface ExportOptions {
  outDir: string;
  help: boolean;
}

const usage = `Usage: tsx scripts/export-i18n-tolgee.ts [--out tmp/tolgee-export]

Exports bundled TypeScript locale resources to nested JSON for Tolgee import.

Options:
  --out, -o <dir>  Directory for {code}.json files (default: tmp/tolgee-export)
  --help, -h       Show this help message
`;

const readOptionValue = (argv: string[], index: number, flag: string): string => {
  const value = argv[index + 1];

  if (!value || value.startsWith('-')) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
};

const parseArgs = (argv: string[]): ExportOptions => {
  const options: ExportOptions = {
    outDir: DEFAULT_OUT_DIR,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--out' || arg === '-o') {
      options.outDir = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith('--out=')) {
      options.outDir = arg.slice('--out='.length);
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
};

const getLocaleTree = (code: LanguageCode): TranslationTree => {
  const locale = locales[code] as TranslationTree | undefined;

  if (!locale || typeof locale !== 'object' || Array.isArray(locale)) {
    throw new Error(`Locale ${code} is missing from src/i18n/locales/index.ts`);
  }

  return locale;
};

const exportLocales = async ({ outDir }: ExportOptions): Promise<void> => {
  const absoluteOutDir = path.resolve(process.cwd(), outDir);
  await mkdir(absoluteOutDir, { recursive: true });

  for (const language of SUPPORTED_LANGUAGES) {
    const jsonPath = path.join(absoluteOutDir, `${language.code}.json`);
    const json = `${JSON.stringify(getLocaleTree(language.code), null, 2)}\n`;
    await writeFile(jsonPath, json, 'utf8');
  }

  console.log(`Exported ${SUPPORTED_LANGUAGES.length} locale files to ${absoluteOutDir}`);
};

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(usage);
    return;
  }

  await exportLocales(options);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
