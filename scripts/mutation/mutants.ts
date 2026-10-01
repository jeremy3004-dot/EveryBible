import ts from 'typescript';

// Mutant generation for scripts/mutate.ts. Each mutant is one text edit to a
// source file; the edits are chosen so that a mutant which survives the tests
// is a behaviour change nobody would notice.

export type MutantOperator =
  | 'relational-boundary'
  | 'equality-flip'
  | 'logical-swap'
  | 'nullish-drop-default'
  | 'arithmetic-swap'
  | 'negate-condition'
  | 'remove-negation'
  | 'update-swap'
  | 'boolean-literal'
  | 'number-literal'
  | 'string-literal'
  | 'math-swap'
  | 'method-swap'
  | 'remove-statement'
  | 'early-return';

export interface Mutant {
  id: number;
  operator: MutantOperator;
  start: number;
  end: number;
  original: string;
  replacement: string;
  line: number;
  column: number;
  lineText: string;
  /** Stable across unrelated edits to the file: used by the equivalents list. */
  key: string;
  /** Source offset whose execution means the mutant ran (for coverage probes). */
  anchor: number;
}

const RELATIONAL_BOUNDARY: Partial<Record<ts.SyntaxKind, string>> = {
  [ts.SyntaxKind.LessThanToken]: '<=',
  [ts.SyntaxKind.LessThanEqualsToken]: '<',
  [ts.SyntaxKind.GreaterThanToken]: '>=',
  [ts.SyntaxKind.GreaterThanEqualsToken]: '>',
};

const EQUALITY_FLIP: Partial<Record<ts.SyntaxKind, string>> = {
  [ts.SyntaxKind.EqualsEqualsEqualsToken]: '!==',
  [ts.SyntaxKind.ExclamationEqualsEqualsToken]: '===',
  [ts.SyntaxKind.EqualsEqualsToken]: '!=',
  [ts.SyntaxKind.ExclamationEqualsToken]: '==',
};

const LOGICAL_SWAP: Partial<Record<ts.SyntaxKind, string>> = {
  [ts.SyntaxKind.AmpersandAmpersandToken]: '||',
  [ts.SyntaxKind.BarBarToken]: '&&',
};

const ARITHMETIC_SWAP: Partial<Record<ts.SyntaxKind, string>> = {
  [ts.SyntaxKind.PlusToken]: '-',
  [ts.SyntaxKind.MinusToken]: '+',
  [ts.SyntaxKind.AsteriskToken]: '/',
  [ts.SyntaxKind.SlashToken]: '*',
  [ts.SyntaxKind.PercentToken]: '*',
  [ts.SyntaxKind.PlusEqualsToken]: '-=',
  [ts.SyntaxKind.MinusEqualsToken]: '+=',
};

const MATH_SWAP: Record<string, string> = {
  max: 'min',
  min: 'max',
  floor: 'ceil',
  ceil: 'floor',
};

const METHOD_SWAP: Record<string, string> = {
  some: 'every',
  every: 'some',
  startsWith: 'endsWith',
  endsWith: 'startsWith',
  toLowerCase: 'toUpperCase',
  toUpperCase: 'toLowerCase',
};

// Calls whose arguments are diagnostics only. Mutating them can't change what a
// user sees, so they would only add equivalent mutants.
const LOGGING_CALLEES = new Set([
  'log',
  'warn',
  'error',
  'info',
  'debug',
  'trace',
  'logError',
  'logWarning',
  'reportError',
  'captureException',
  'addBreadcrumb',
  'recordError',
  'reportAppError',
]);

function calleeName(call: ts.CallExpression | ts.NewExpression): string | undefined {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return undefined;
}

function isLoggingCall(node: ts.Node): boolean {
  if (ts.isCallExpression(node)) {
    const name = calleeName(node);
    return name !== undefined && LOGGING_CALLEES.has(name);
  }
  if (ts.isNewExpression(node)) {
    const name = calleeName(node);
    return name !== undefined && /Error$/.test(name);
  }
  return false;
}

function mentionsDevFlag(node: ts.Node, source: ts.SourceFile): boolean {
  return /\b__DEV__\b/.test(node.getText(source));
}

/** Nodes whose whole subtree is never mutated. */
function isSkippedSubtree(node: ts.Node, source: ts.SourceFile): boolean {
  if (ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node)) return true;
  if (
    ts.isImportDeclaration(node) ||
    ts.isExportDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isModuleDeclaration(node) ||
    ts.isDecorator(node)
  ) {
    return true;
  }
  if (isLoggingCall(node)) return true;
  if (ts.isIfStatement(node) && mentionsDevFlag(node.expression, source)) return true;
  return false;
}

function containsValueReturn(body: ts.Block): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (found || ts.isFunctionLike(node) || ts.isClassLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return found;
}

function isStringContext(node: ts.BinaryExpression): boolean {
  const isStringy = (side: ts.Expression) =>
    ts.isStringLiteral(side) ||
    ts.isNoSubstitutionTemplateLiteral(side) ||
    ts.isTemplateExpression(side);
  return isStringy(node.left) || isStringy(node.right);
}

function isPropertyNamePosition(node: ts.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  return (
    ((ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertySignature(parent)) &&
      parent.name === node) ||
    ts.isLiteralTypeNode(parent) ||
    ts.isExternalModuleReference(parent)
  );
}

function isRequireOrImportArgument(node: ts.Node): boolean {
  const parent = node.parent;
  if (!parent || !ts.isCallExpression(parent)) return false;
  return (
    parent.expression.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(parent.expression) && parent.expression.text === 'require')
  );
}

function isComparisonOperand(node: ts.Node): boolean {
  let current = node;
  while (current.parent && ts.isPrefixUnaryExpression(current.parent)) current = current.parent;
  const parent = current.parent;
  if (!parent || !ts.isBinaryExpression(parent)) return false;
  const kind = parent.operatorToken.kind;
  return (
    RELATIONAL_BOUNDARY[kind] !== undefined ||
    EQUALITY_FLIP[kind] !== undefined ||
    kind === ts.SyntaxKind.PlusToken ||
    kind === ts.SyntaxKind.MinusToken
  );
}

function numberReplacements(text: string, node: ts.NumericLiteral): string[] {
  const value = Number(text.replace(/_/g, ''));
  if (!Number.isFinite(value)) return [];
  // Small integers are indices, counts and boundaries. Large constants
  // (timeouts, sizes) are only mutated where they are compared or offset.
  if (!Number.isInteger(value)) return [];
  if (Math.abs(value) > 10 && !isComparisonOperand(node)) return [];
  return value === 0 ? ['1'] : [String(value + 1), String(value - 1)];
}

function isStatementDeletable(statement: ts.Statement): boolean {
  if (ts.isExpressionStatement(statement)) {
    let expression: ts.Expression = statement.expression;
    while (ts.isAwaitExpression(expression) || ts.isVoidExpression(expression)) {
      expression = expression.expression;
    }
    if (ts.isCallExpression(expression)) return !isLoggingCall(expression);
    if (ts.isBinaryExpression(expression)) {
      const kind = expression.operatorToken.kind;
      return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
    }
    return ts.isPostfixUnaryExpression(expression) || ts.isPrefixUnaryExpression(expression);
  }
  return (
    ts.isReturnStatement(statement) ||
    ts.isThrowStatement(statement) ||
    ts.isContinueStatement(statement) ||
    ts.isBreakStatement(statement)
  );
}

function isInsideIfBody(statement: ts.Statement): boolean {
  const parent = statement.parent;
  if (ts.isIfStatement(parent)) return parent.expression !== statement;
  return ts.isBlock(parent) && ts.isIfStatement(parent.parent);
}

export function generateMutants(sourceText: string, fileName: string): Mutant[] {
  const source = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const lines = sourceText.split('\n');
  const drafts: Omit<Mutant, 'id' | 'key' | 'line' | 'column' | 'lineText'>[] = [];
  const add = (
    operator: MutantOperator,
    start: number,
    end: number,
    replacement: string,
    anchor = start
  ): void => {
    const original = sourceText.slice(start, end);
    if (original !== replacement) {
      drafts.push({ operator, start, end, original, replacement, anchor });
    }
  };
  const negate = (expression: ts.Expression) =>
    add(
      'negate-condition',
      expression.getStart(source),
      expression.getEnd(),
      `!(${expression.getText(source)})`
    );

  const visit = (node: ts.Node): void => {
    if (isSkippedSubtree(node, source)) return;

    if (ts.isBinaryExpression(node)) {
      const token = node.operatorToken;
      const kind = token.kind;
      const tokenStart = token.getStart(source);
      const tokenEnd = token.getEnd();
      const boundary = RELATIONAL_BOUNDARY[kind];
      if (boundary) add('relational-boundary', tokenStart, tokenEnd, boundary);
      const flipped = EQUALITY_FLIP[kind];
      if (flipped) add('equality-flip', tokenStart, tokenEnd, flipped);
      const logical = LOGICAL_SWAP[kind];
      if (logical) add('logical-swap', tokenStart, tokenEnd, logical);
      if (kind === ts.SyntaxKind.QuestionQuestionToken) {
        add(
          'nullish-drop-default',
          node.getStart(source),
          node.getEnd(),
          node.left.getText(source)
        );
      }
      const arithmetic = ARITHMETIC_SWAP[kind];
      if (arithmetic && !isStringContext(node)) {
        add('arithmetic-swap', tokenStart, tokenEnd, arithmetic);
      }
    }

    if (
      ts.isIfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isConditionalExpression(node)
    ) {
      const condition = ts.isConditionalExpression(node) ? node.condition : node.expression;
      // `!x` and `a === b` already get remove-negation / equality-flip, which
      // are the same mutant as negating them.
      const redundant =
        (ts.isPrefixUnaryExpression(condition) &&
          condition.operator === ts.SyntaxKind.ExclamationToken) ||
        (ts.isBinaryExpression(condition) &&
          EQUALITY_FLIP[condition.operatorToken.kind] !== undefined);
      if (!redundant) negate(condition);
    }

    if (ts.isPrefixUnaryExpression(node)) {
      if (node.operator === ts.SyntaxKind.ExclamationToken) {
        add('remove-negation', node.getStart(source), node.getEnd(), node.operand.getText(source));
      }
      if (node.operator === ts.SyntaxKind.PlusPlusToken) {
        add('update-swap', node.getStart(source), node.getStart(source) + 2, '--');
      }
      if (node.operator === ts.SyntaxKind.MinusMinusToken) {
        add('update-swap', node.getStart(source), node.getStart(source) + 2, '++');
      }
    }
    if (ts.isPostfixUnaryExpression(node)) {
      const opStart = node.getEnd() - 2;
      if (node.operator === ts.SyntaxKind.PlusPlusToken)
        add('update-swap', opStart, node.getEnd(), '--');
      if (node.operator === ts.SyntaxKind.MinusMinusToken)
        add('update-swap', opStart, node.getEnd(), '++');
    }

    if (node.kind === ts.SyntaxKind.TrueKeyword) {
      add('boolean-literal', node.getStart(source), node.getEnd(), 'false');
    }
    if (node.kind === ts.SyntaxKind.FalseKeyword) {
      add('boolean-literal', node.getStart(source), node.getEnd(), 'true');
    }

    if (ts.isNumericLiteral(node) && !isPropertyNamePosition(node)) {
      for (const replacement of numberReplacements(node.text, node)) {
        add('number-literal', node.getStart(source), node.getEnd(), replacement);
      }
    }

    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      !isPropertyNamePosition(node) &&
      !isRequireOrImportArgument(node) &&
      !(ts.isExpressionStatement(node.parent) && node.text === 'use strict')
    ) {
      add(
        'string-literal',
        node.getStart(source),
        node.getEnd(),
        node.text.length > 0 ? "''" : "'__mutant__'"
      );
    }

    if (ts.isPropertyAccessExpression(node)) {
      const name = node.name.text;
      if (ts.isIdentifier(node.expression) && node.expression.text === 'Math' && MATH_SWAP[name]) {
        add('math-swap', node.name.getStart(source), node.name.getEnd(), MATH_SWAP[name]);
      } else if (METHOD_SWAP[name] && ts.isCallExpression(node.parent)) {
        add('method-swap', node.name.getStart(source), node.name.getEnd(), METHOD_SWAP[name]);
      }
    }

    if (ts.isExpressionStatement(node) || ts.isReturnStatement(node) || ts.isThrowStatement(node)) {
      const isFreeStatement = ts.isExpressionStatement(node);
      if (isStatementDeletable(node) && (isFreeStatement || isInsideIfBody(node))) {
        add('remove-statement', node.getStart(source), node.getEnd(), ';');
      }
    } else if (
      (ts.isContinueStatement(node) || ts.isBreakStatement(node)) &&
      isInsideIfBody(node)
    ) {
      add('remove-statement', node.getStart(source), node.getEnd(), ';');
    }

    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node)) &&
      node.body &&
      ts.isBlock(node.body) &&
      node.body.statements.length > 0 &&
      // A one-statement body already gets remove-statement for that statement.
      !(node.body.statements.length === 1 && ts.isExpressionStatement(node.body.statements[0]!)) &&
      !node.asteriskToken &&
      !containsValueReturn(node.body)
    ) {
      const bodyStart = node.body.getStart(source) + 1;
      const firstStatement = node.body.statements[0];
      add(
        'early-return',
        bodyStart,
        bodyStart,
        ' return;',
        firstStatement ? firstStatement.getStart(source) : bodyStart
      );
    }

    ts.forEachChild(node, visit);
  };
  visit(source);

  drafts.sort((a, b) => a.start - b.start || a.end - b.end);
  const seen = new Map<string, number>();
  return drafts.map((draft, index) => {
    const before = sourceText.slice(0, draft.start);
    const line = before.split('\n').length;
    const column = draft.start - before.lastIndexOf('\n');
    const lineText = (lines[line - 1] ?? '').trim();
    const base = `${draft.operator}|${draft.original}|${draft.replacement}|${lineText}`;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return {
      ...draft,
      id: index + 1,
      line,
      column,
      lineText,
      key: occurrence === 0 ? base : `${base}#${occurrence}`,
    };
  });
}

export function applyMutant(sourceText: string, mutant: Mutant): string {
  return sourceText.slice(0, mutant.start) + mutant.replacement + sourceText.slice(mutant.end);
}

/** A mutant that no longer parses would be "killed" by a syntax error, not by a test. */
export function isSyntacticallyValid(text: string, fileName: string): boolean {
  const output = ts.transpileModule(text, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  });
  return (output.diagnostics ?? []).length === 0;
}
