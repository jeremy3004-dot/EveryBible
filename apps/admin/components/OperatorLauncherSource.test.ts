import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('admin shell exposes a floating operator launcher without extra chrome', async () => {
  const componentSource = await readFile(
    path.join(repoRoot, 'apps/admin/components/OperatorLauncher.tsx'),
    'utf8'
  );
  const routeSource = await readFile(
    path.join(repoRoot, 'apps/admin/app/api/operator/chat/route.ts'),
    'utf8'
  );
  const chatSource = await readFile(
    path.join(repoRoot, 'apps/admin/lib/operator-chat.ts'),
    'utf8'
  );
  const rootLayoutSource = await readFile(path.join(repoRoot, 'apps/admin/app/layout.tsx'), 'utf8');
  const dashboardLayoutSource = await readFile(
    path.join(repoRoot, 'apps/admin/app/(dashboard)/layout.tsx'),
    'utf8'
  );
  const settingsSource = await readFile(
    path.join(repoRoot, 'apps/admin/app/(dashboard)/settings/page.tsx'),
    'utf8'
  );

  assert.match(componentSource, /const \[isOpen, setIsOpen\] = useState\(false\);/);
  assert.match(componentSource, /aria-expanded=\{isOpen\}/);
  assert.match(componentSource, /Read-only answers grounded in live admin data\./);
  assert.match(componentSource, /Ask me about admin health, audit trail, or translations\./);
  assert.match(componentSource, /\/api\/operator\/chat/);
  assert.doesNotMatch(componentSource, /Open audit trail/);
  assert.doesNotMatch(componentSource, /Review health/);
  assert.doesNotMatch(componentSource, /Check translations/);
  assert.doesNotMatch(componentSource, /New chat/);
  assert.doesNotMatch(componentSource, /Read-only helper/);
  assert.doesNotMatch(componentSource, /Live chat is ready/);
  assert.doesNotMatch(componentSource, /Chat is offline until OPENAI_API_KEY/);
  assert.doesNotMatch(componentSource, /StatusPill/);
  assert.doesNotMatch(componentSource, /operator-launcher__toggle-status/);
  assert.doesNotMatch(componentSource, /operator-launcher__header-actions/);
  assert.doesNotMatch(componentSource, /operator-launcher__reset/);
  assert.doesNotMatch(componentSource, /operator-launcher__status/);
  assert.doesNotMatch(componentSource, /operator-launcher__note/);
  assert.doesNotMatch(componentSource, /operator-launcher__toggle-eyebrow/);
  assert.doesNotMatch(componentSource, /operator-launcher__links/);
  assert.doesNotMatch(componentSource, /DEFAULT_PROMPTS/);
  assert.doesNotMatch(componentSource, /operator-launcher__prompts/);
  assert.doesNotMatch(componentSource, /operator-launcher__mark/);
  assert.match(routeSource, /OPENAI_API_KEY/);
  assert.match(chatSource, /chat\/completions/);
  assert.match(chatSource, /gpt-5\.4-mini/);
  assert.doesNotMatch(rootLayoutSource, /<OperatorLauncher \/>/);
  assert.match(dashboardLayoutSource, /<OperatorLauncher \/>/);
  assert.match(settingsSource, /id="operator-audit"/);
});
