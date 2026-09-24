// Type-checks the non-UI code under the stricter options in tsconfig.strict.json.
//
// TypeScript has no per-file compiler options: every module an included file imports
// joins the program and is checked under the same flags. Running `tsc -p` on the
// strict config would therefore also fail on screens, test fakes and the modules
// listed in its `exclude` (other work is in flight there). This runner checks the same
// program but only fails on diagnostics in files the config selects (`include` minus
// `exclude`); diagnostics elsewhere are counted and reported as deferred, so moving a
// directory into the strict set is a one-line config change.
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const projectRoot = path.resolve(import.meta.dirname, '..');
const configPath = path.join(projectRoot, 'tsconfig.strict.json');
const listDeferred = process.argv.includes('--list-deferred');

const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) {
  console.error(ts.formatDiagnostic(configFile.error, formatHost()));
  process.exit(1);
}

const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectRoot);
if (parsed.errors.length > 0) {
  console.error(ts.formatDiagnostics(parsed.errors, formatHost()));
  process.exit(1);
}

const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
const enforcedFiles = new Set(parsed.fileNames.map((fileName) => path.resolve(fileName)));

const enforced = [];
const deferredByFile = new Map();
for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
  const fileName = diagnostic.file ? path.resolve(diagnostic.file.fileName) : null;
  if (fileName === null || enforcedFiles.has(fileName)) {
    enforced.push(diagnostic);
  } else {
    deferredByFile.set(fileName, (deferredByFile.get(fileName) ?? 0) + 1);
  }
}

const deferredCount = [...deferredByFile.values()].reduce((sum, count) => sum + count, 0);
if (listDeferred) {
  for (const [fileName, count] of [...deferredByFile].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`${String(count).padStart(4)}  ${path.relative(projectRoot, fileName)}`);
  }
}

if (enforced.length > 0) {
  console.error(ts.formatDiagnosticsWithColorAndContext(enforced, formatHost()));
}
console.log(
  `typecheck:strict: ${enforced.length} error(s) in ${enforcedFiles.size} strict files; ` +
    `${deferredCount} deferred diagnostic(s) in ${deferredByFile.size} files outside the strict set` +
    (listDeferred || deferredCount === 0 ? '.' : ' (--list-deferred to show them).')
);
process.exit(enforced.length > 0 ? 1 : 0);

function formatHost() {
  return {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => projectRoot,
    getNewLine: () => ts.sys.newLine,
  };
}
