import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { SUPPORTED_LANGUAGES } = require('../src/constants/languages.ts');
const configPath = path.join(root, 'app.json');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const check = process.argv.includes('--check');
const locales = {};
const files = [];

for (const { code } of SUPPORTED_LANGUAGES) {
  const module = await import(
    pathToFileURL(path.join(root, 'src/i18n/locales', `${code}.ts`)).href
  );
  const locale = module[code] ?? module.default?.[code];
  const permissions = locale.interface.nativePermissions;
  const nativeCode = code === 'zh' ? 'zh-Hans' : code;
  const relative = `./src/i18n/native/${code}.json`;
  locales[nativeCode] = relative;
  files.push([path.join(root, relative), `${JSON.stringify({ ios: permissions }, null, 2)}\n`]);
  // Escape OpenStep strings before comparing/writing the native resources.
  const strings = Object.entries(permissions)
    .map(([key, value]) => `${key} = ${JSON.stringify(value)};`)
    .join('\n');
  files.push([
    path.join(root, 'ios/EveryBible/Supporting', `${nativeCode}.lproj`, 'InfoPlist.strings'),
    strings,
  ]);
}

if (check) {
  const stale = [];
  if (JSON.stringify(config.expo.locales) !== JSON.stringify(locales))
    stale.push('app.json locales');
  if (!config.expo.ios.infoPlist.CFBundleAllowMixedLocalizations)
    stale.push('app.json mixed localizations');
  for (const [file, expected] of files) {
    const actual = await fs.readFile(file, 'utf8').catch(() => null);
    if (actual !== expected) stale.push(path.relative(root, file));
  }
  if (stale.length) {
    console.error(`Native translations need regeneration:\n${stale.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Native permission translations are current for ${SUPPORTED_LANGUAGES.length} languages.`
    );
  }
} else {
  config.expo.locales = locales;
  config.expo.ios.infoPlist.CFBundleAllowMixedLocalizations = true;
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  for (const [file, content] of files) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  }
  // Apply only Expo's locale resource mod, preserving signing, build numbers, and other WIP.
  const { setLocalesAsync } = require('@expo/config-plugins/build/ios/Locales');
  const xcode = require('xcode');
  const projectPath = path.join(root, 'ios/EveryBible.xcodeproj/project.pbxproj');
  const project = xcode.project(projectPath);
  project.parseSync();
  await setLocalesAsync(config.expo, { projectRoot: root, project });
  // The SDK 54 generator does not escape values. Keep the checked native files safely escaped.
  for (const [file, content] of files.filter(([file]) => file.endsWith('.strings')))
    await fs.writeFile(file, content);
  // Omit the optional field when Expo/xcode has no explicit file type.
  for (const reference of Object.values(project.pbxFileReferenceSection())) {
    if (
      typeof reference === 'object' &&
      String(reference.path).includes('.lproj/InfoPlist.strings') &&
      (reference.explicitFileType === undefined || reference.explicitFileType === 'undefined')
    ) {
      delete reference.explicitFileType;
    }
  }
  await fs.writeFile(projectPath, project.writeSync());
  console.log(
    `Generated native permission translations for ${SUPPORTED_LANGUAGES.length} languages.`
  );
}
