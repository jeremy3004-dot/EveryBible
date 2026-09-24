/* global require, module */

/**
 * Babel plugin: import icon components from their own modules instead of
 * through a package root that evaluates every icon the package ships.
 *
 *   import { Check } from 'lucide-react-native'
 *     -> import Check from 'lucide-react-native/icons/check'
 *   import { Ionicons } from '@expo/vector-icons'
 *     -> import Ionicons from '@expo/vector-icons/Ionicons'
 *
 * Why: Metro's inlineRequires is off on iOS and in every dev build, so a root
 * import evaluates everything the root re-exports on the startup path:
 * - lucide-react-native's root re-exports ~1,800 icon modules (~3 MB
 *   unminified), each calling `createLucideIcon` at module scope. The app
 *   draws about 50.
 * - @expo/vector-icons' root builds all 15 icon sets and their glyph maps
 *   (~0.5 MB of JSON). The app only uses Ionicons.
 *
 * The rewritten specifiers point at the same files the root re-exports, so
 * every component is the identical module instance. Lucide's name -> file map
 * is read from the package's own root entry, so aliases (`CheckCircle2` ->
 * `circle-check`, `Home` -> `house`) resolve exactly as the root would. Type
 * imports and anything that is not an icon (`LucideProvider`, `createIconSet`)
 * stay on the root import.
 */
const fs = require('node:fs');
const path = require('node:path');

const LUCIDE = 'lucide-react-native';
const VECTOR_ICONS = '@expo/vector-icons';
const LUCIDE_EXPORT_LINE = /^export \{ (.+) \} from '\.\/icons\/([a-z0-9-]+)\.mjs';$/gm;
const DEFAULT_ALIAS = /default as ([A-Za-z0-9_$]+)/g;
// Icon sets are the capitalised root-level entry files (Ionicons.js, ...);
// the lowercase ones are the createIconSet helpers.
const VECTOR_ICON_SET_FILE = /^([A-Z][A-Za-z0-9]*)\.js$/;

function readIconFiles(entrySource) {
  const iconFiles = new Map();
  for (const [, specifiers, file] of entrySource.matchAll(LUCIDE_EXPORT_LINE)) {
    for (const [, name] of specifiers.matchAll(DEFAULT_ALIAS)) {
      iconFiles.set(name, file);
    }
  }
  return iconFiles;
}

function readVectorIconSets(fileNames) {
  const sets = new Set();
  for (const fileName of fileNames) {
    const match = VECTOR_ICON_SET_FILE.exec(fileName);
    if (match) {
      sets.add(match[1]);
    }
  }
  return sets;
}

function packageRootOf(resolvedEntry, marker) {
  return resolvedEntry.slice(0, resolvedEntry.lastIndexOf(marker));
}

let cachedResolvers = null;

function loadResolvers() {
  if (!cachedResolvers) {
    // Neither package exports ./package.json, so locate each root from its
    // resolved CommonJS entry.
    const lucideRoot = packageRootOf(require.resolve(LUCIDE), `${path.sep}dist${path.sep}`);
    const iconFiles = readIconFiles(
      fs.readFileSync(path.join(lucideRoot, 'dist', 'esm', 'lucide-react-native.mjs'), 'utf8')
    );
    const vectorIconsRoot = packageRootOf(
      require.resolve(VECTOR_ICONS),
      `${path.sep}build${path.sep}`
    );
    const vectorIconSets = readVectorIconSets(fs.readdirSync(vectorIconsRoot));

    cachedResolvers = createResolvers(iconFiles, vectorIconSets);
  }
  return cachedResolvers;
}

function createResolvers(iconFiles, vectorIconSets) {
  return {
    [LUCIDE]: (name) => {
      const file = iconFiles.get(name);
      return file ? `${LUCIDE}/icons/${file}` : null;
    },
    [VECTOR_ICONS]: (name) => (vectorIconSets.has(name) ? `${VECTOR_ICONS}/${name}` : null),
  };
}

function iconDeepImports({ types: t }, options = {}) {
  const resolvers = options.resolvers || loadResolvers();

  function rewrite(declarationPath) {
    const { node } = declarationPath;
    const resolve = resolvers[node.source.value];
    if (!resolve || node.importKind === 'type') {
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
      const deepSpecifier = importedName ? resolve(importedName) : null;
      if (!deepSpecifier) {
        kept.push(specifier);
        continue;
      }
      deepImports.push(
        t.importDeclaration(
          [t.importDefaultSpecifier(t.identifier(specifier.local.name))],
          t.stringLiteral(deepSpecifier)
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
    name: 'icon-deep-imports',
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

module.exports = iconDeepImports;
module.exports.readIconFiles = readIconFiles;
module.exports.readVectorIconSets = readVectorIconSets;
module.exports.createResolvers = createResolvers;
