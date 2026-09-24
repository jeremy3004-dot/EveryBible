import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual Settings handlers with controlled React setters and a deferred
// network response. This catches late-success activation after Cancel without
// needing a native renderer in the Node suite.
const source = ts.createSourceFile(
  'SettingsScreen.tsx',
  readFileSync(new URL('./SettingsScreen.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
function initializer(name: string): string {
  let found = '';
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) {
      found = node.initializer.getText(source);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(found, `Missing real Settings handler ${name}`);
  return ts.transpileModule(`globalThis.${name} = ${found}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function harness(role: 'translator' | 'scripture_council') {
  type Validation = {
    success: boolean;
    error?: string;
    translationIds?: string[];
    coversTranslation?: boolean;
  };
  let complete!: (value: Validation) => void;
  const response = new Promise<Validation>((resolve) => {
    complete = resolve;
  });
  const modalVisibility: boolean[] = [];
  const coverage: (string[] | null)[] = [];
  const changes: string[] = [];
  const errors: (string | null)[] = [];
  const preferences: object[] = [];
  const context = vm.createContext({
    accessAttempt: { current: 0 },
    accessKind: role,
    isCheckingTranslatorAccess: false,
    translatorAccessPasscode: 'entered-code',
    currentTranslation: 'BSB',
    t: (key: string) => key,
    validateScriptureCouncilPasscode: () => response,
    validateTranslatorReviewPasscode: () => response,
    setIsCheckingTranslatorAccess: () => {},
    setShowTranslatorAccessModal: (visible: boolean) => modalVisibility.push(visible),
    setTranslatorAccessCoverage: (value: string[] | null) => coverage.push(value),
    setTranslatorAccessPasscode: () => {},
    setTranslatorAccessError: (value: string | null) => errors.push(value),
    setPreferences: (value: object) => preferences.push(value),
    syncPreferences: async () => {},
    enableTranslatorReviewMode: () => {
      changes.push('translator');
      return true;
    },
    useTranslatorReviewStore: {
      getState: () => ({
        enableCouncilWithPasscode: () => {
          changes.push('scripture_council');
          return true;
        },
      }),
    },
  });
  vm.runInContext(initializer('handleTranslatorAccessSubmit'), context);
  vm.runInContext(initializer('closeTranslatorAccessModal'), context);
  return {
    submit: context.handleTranslatorAccessSubmit as () => Promise<void>,
    cancel: context.closeTranslatorAccessModal as () => void,
    complete,
    changes,
    errors,
    preferences,
    modalVisibility,
    coverage,
  };
}

test('a team code that does not cover the open translation unlocks and lists what it covers', async () => {
  const h = harness('translator');
  const pending = h.submit();
  h.complete({ success: true, translationIds: ['npiulb'], coversTranslation: false });
  await pending;

  assert.deepEqual(h.changes, ['translator']);
  // The dialog stays open to say which translations the code opens and offer to switch.
  assert.deepEqual(h.coverage.at(-1), ['npiulb']);
  assert.ok(!h.modalVisibility.includes(false));
});

test('a code that covers the open translation closes the dialog as before', async () => {
  const h = harness('translator');
  const pending = h.submit();
  h.complete({ success: true, translationIds: ['bsb'], coversTranslation: true });
  await pending;

  assert.deepEqual(h.changes, ['translator']);
  assert.ok(h.modalVisibility.includes(false));
  assert.ok(!h.coverage.some((value) => value !== null));
});

for (const role of ['translator', 'scripture_council'] as const) {
  test(`${role} changes mode only after successful validation`, async () => {
    const h = harness(role);
    const pending = h.submit();
    assert.deepEqual(h.changes, []);
    h.complete({ success: true });
    await pending;
    assert.deepEqual(h.changes, [role]);
    assert.equal(h.preferences.length, 1);
  });
  test(`${role} rejection and connection failure preserve participation`, async () => {
    for (const error of ['Council access denied', 'Network request failed']) {
      const h = harness(role);
      const pending = h.submit();
      h.complete({ success: false, error });
      await pending;
      assert.deepEqual(h.changes, []);
      assert.deepEqual(h.preferences, []);
      assert.ok(h.errors.some(Boolean));
    }
  });
  test(`${role} cancellation ignores a successful response arriving later`, async () => {
    const h = harness(role);
    const pending = h.submit();
    h.cancel();
    h.complete({ success: true });
    await pending;
    assert.deepEqual(h.changes, []);
    assert.deepEqual(h.preferences, []);
  });
}
