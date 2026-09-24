/* global require, module */

/**
 * Babel plugin: rewrite `import { Check } from 'lucide-react-native'` into
 * `import Check from 'lucide-react-native/icons/check'`.
 *
 * Why: the package root re-exports every icon (~1,800 modules, ~3 MB of
 * unminified bundle). Metro evaluates each re-exported module the first time
 * the root is required, and each one calls `createLucideIcon` at module scope.
 * TabNavigator imports the root, so every cold start paid for all of them
 * before Home could render, while the app draws about 50 icons.
 *
 * The name -> file map is read from the package's own root entry, so aliases
 * (`CheckCircle2` -> `circle-check`, `Home` -> `house`) resolve to exactly the
 * module the root export would have given. Names that are not icons
 * (`LucideProvider`, `createLucideIcon`, types) stay on the root import.
 */
const fs = require('node:fs');
const path = require('node:path');

const PACKAGE = 'lucide-react-native';
const EXPORT_LINE = /^export \{ (.+) \} from '\.\/icons\/([a-z0-9-]+)\.mjs';$/gm;
const DEFAULT_ALIAS = /default as ([A-Za-z0-9_$]+)/g;

let cachedIconFiles = null;

function readIconFiles(entrySource) {
  const iconFiles = new Map();
  for (const [, specifiers, file] of entrySource.matchAll(EXPORT_LINE)) {
    for (const [, name] of specifiers.matchAll(DEFAULT_ALIAS)) {
      iconFiles.set(name, file);
    }
  }
  return iconFiles;
}

function loadIconFiles() {
  if (!cachedIconFiles) {
    // The package does not export ./package.json; resolve its CommonJS entry
    // and read the ESM entry that Metro's `react-native` condition selects.
    const cjsEntry = require.resolve(PACKAGE);
    const packageRoot = cjsEntry.slice(0, cjsEntry.lastIndexOf(`${path.sep}dist${path.sep}`));
    const entryPath = path.join(packageRoot, 'dist', 'esm', 'lucide-react-native.mjs');
    cachedIconFiles = readIconFiles(fs.readFileSync(entryPath, 'utf8'));
  }
  return cachedIconFiles;
}

function lucideDeepImports({ types: t }, options = {}) {
  const iconFiles = options.iconFiles || loadIconFiles();

  function rewrite(declarationPath) {
    const { node } = declarationPath;
    if (node.source.value !== PACKAGE || node.importKind === 'type') {
      return false;
    }

    const kept = [];
    const deepImports = [];
    for (const specifier of node.specifiers) {
      const importedName =
        t.isImportSpecifier(specifier) && specifier.importKind !== 'type'
          ? t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.imported.value
          : null;
      const file = importedName ? iconFiles.get(importedName) : undefined;
      if (!file) {
        kept.push(specifier);
        continue;
      }
      deepImports.push(
        t.importDeclaration(
          [t.importDefaultSpecifier(t.identifier(specifier.local.name))],
          t.stringLiteral(`${PACKAGE}/icons/${file}`)
        )
      );
    }

    if (deepImports.length === 0) {
      return false;
    }

    if (kept.length > 0) {
      node.specifiers = kept;
      declarationPath.insertAfter(deepImports);
    } else {
      declarationPath.replaceWithMultiple(deepImports);
    }
    return true;
  }

  return {
    name: 'lucide-deep-imports',
    visitor: {
      // Rewrite on Program entry, before the TypeScript and module transforms
      // read the import declarations, then rebuild bindings once so later
      // plugins see the new default imports rather than stale specifiers.
      Program: {
        enter(programPath) {
          let changed = false;
          for (const statementPath of programPath.get('body')) {
            if (statementPath.isImportDeclaration() && rewrite(statementPath)) {
              changed = true;
            }
          }
          if (changed) {
            programPath.scope.crawl();
          }
        },
      },
    },
  };
}

module.exports = lucideDeepImports;
module.exports.readIconFiles = readIconFiles;
