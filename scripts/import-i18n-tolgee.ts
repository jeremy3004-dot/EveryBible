#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '../src/constants/languages';

type TranslationValue = string | { [key: string]: TranslationValue };
type TranslationTree = Record<string, TranslationValue>;

const DEFAULT_IN_DIR = path.join('tmp', 'tolgee-import');
const DEFAULT_OUT_DIR = path.join('tmp', 'tolgee-generated');

interface ImportOptions {
  inDir: string;
  outDir: string;
  help: boolean;
}

const usage = `Usage: tsx scripts/import-i18n-tolgee.ts [--in tmp/tolgee-import] [--out tmp/tolgee-generated]

Generates TypeScript locale files from Tolgee-exported nested JSON.
By default this writes to tmp/tolgee-generated, never src/i18n/locales.
Pass --out src/i18n/locales explicitly only after reviewing the generated diff.

Options:
  --in, -i <dir>   Directory containing {code}.json files (default: tmp/tolgee-import)
  --out, -o <dir>  Directory for generated {code}.ts files (default: tmp/tolgee-generated)
  --help, -h       Show this help message
`;

const readOptionValue = (argv: string[], index: number, flag: string): string => {
  const value = argv[index + 1];

  if (!value || value.startsWith('-')) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
};

const parseArgs = (argv: string[]): ImportOptions => {
  const options: ImportOptions = {
    inDir: DEFAULT_IN_DIR,
    outDir: DEFAULT_OUT_DIR,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--in' || arg === '-i') {
      options.inDir = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith('--in=')) {
      options.inDir = arg.slice('--in='.length);
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

const assertTranslationTree = (value: unknown, label: string): TranslationTree => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a nested JSON object`);
  }

  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string') {
      continue;
    }

    assertTranslationTree(child, `${label}.${key}`);
  }

  return value as TranslationTree;
};

const readLocaleJson = async (inDir: string, code: LanguageCode): Promise<TranslationTree> => {
  const jsonPath = path.join(inDir, `${code}.json`);
  const source = await readFile(jsonPath, 'utf8');

  try {
    return assertTranslationTree(JSON.parse(source), `${code}.json`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${jsonPath}: ${message}`);
  }
};

const localeTsSource = (code: LanguageCode, tree: TranslationTree): string => {
  const json = JSON.stringify(tree, null, 2);
  const translationKeysExport =
    code === 'en' ? `\n\nexport type TranslationKeys = typeof ${code};` : '';

  return `export const ${code} = ${json} as const;${translationKeysExport}\n`;
};

const importLocales = async ({ inDir, outDir }: ImportOptions): Promise<void> => {
  const absoluteInDir = path.resolve(process.cwd(), inDir);
  const absoluteOutDir = path.resolve(process.cwd(), outDir);

  await mkdir(absoluteOutDir, { recursive: true });

  for (const language of SUPPORTED_LANGUAGES) {
    const tree = await readLocaleJson(absoluteInDir, language.code);
    const tsPath = path.join(absoluteOutDir, `${language.code}.ts`);
    await writeFile(tsPath, localeTsSource(language.code, tree), 'utf8');
  }

  console.log(`Generated ${SUPPORTED_LANGUAGES.length} locale files in ${absoluteOutDir}`);
};

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(usage);
    return;
  }

  await importLocales(options);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
