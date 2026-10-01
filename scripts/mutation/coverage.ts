import ts from 'typescript';

// Coverage probes for scripts/mutate.ts. Before any mutant runs, each selected
// test file runs once against a copy of the module with a probe before every
// statement that holds a mutant. A test that never reached a mutant's statement
// runs the mutant exactly like the original, so it is skipped for that mutant;
// a mutant no test reaches is reported as uncovered without running anything.

export const HITS_FILE_ENV = 'MUTATION_HITS_FILE';

const PROBE_FUNCTION = '__mutationProbe';

// Plain JavaScript so it survives any transform. Appends one JSON line per
// process (a test file may load the module in more than one process).
const PROBE_HEADER =
  `var ${PROBE_FUNCTION} = (function () {` +
  ` var g = globalThis;` +
  ` if (!g.__mutationHits) {` +
  ` var hits = (g.__mutationHits = new Set());` +
  ` process.on('exit', function () {` +
  ` var file = process.env.${HITS_FILE_ENV};` +
  ` if (file) process.getBuiltinModule('node:fs').appendFileSync(file, JSON.stringify(Array.from(hits)) + '\\n');` +
  ` });` +
  ` }` +
  ` var set = g.__mutationHits;` +
  ` set.add(-1);` +
  ` return function (id) { set.add(id); };` +
  ` })();\n`;

function isListStatement(node: ts.Node): node is ts.Statement {
  const parent = node.parent;
  return (
    parent !== undefined &&
    (ts.isSourceFile(parent) ||
      ts.isBlock(parent) ||
      ts.isCaseClause(parent) ||
      ts.isDefaultClause(parent) ||
      ts.isModuleBlock(parent)) &&
    !ts.isImportDeclaration(node) &&
    !ts.isExportDeclaration(node)
  );
}

/** The innermost statement in a statement list that contains `offset`. */
function enclosingListStatement(source: ts.SourceFile, offset: number): ts.Statement | undefined {
  let found: ts.Statement | undefined;
  const visit = (node: ts.Node) => {
    if (offset < node.getStart(source) || offset >= node.getEnd()) return;
    if (isListStatement(node)) found = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

export interface InstrumentedSource {
  text: string;
  /** Probe id per anchor (same order as the input); -1 = reached whenever the module loads. */
  probes: number[];
}

export function instrumentForCoverage(
  sourceText: string,
  fileName: string,
  anchors: number[]
): InstrumentedSource {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const probeAt = new Map<number, number>();
  const probes = anchors.map((anchor) => {
    const statement = enclosingListStatement(source, anchor);
    if (!statement || ts.isSourceFile(statement.parent)) return -1;
    const position = statement.getStart(source);
    let id = probeAt.get(position);
    if (id === undefined) {
      id = probeAt.size;
      probeAt.set(position, id);
    }
    return id;
  });
  let text = sourceText;
  for (const [position, id] of [...probeAt].sort((a, b) => b[0] - a[0])) {
    text = `${text.slice(0, position)}${PROBE_FUNCTION}(${id}); ${text.slice(position)}`;
  }
  return { text: PROBE_HEADER + text, probes };
}

/** Probe ids recorded in a hits file written by instrumented processes. */
export function parseHits(contents: string): Set<number> {
  const hits = new Set<number>();
  for (const line of contents.split('\n')) {
    if (!line.trim()) continue;
    for (const id of JSON.parse(line) as number[]) hits.add(id);
  }
  return hits;
}
