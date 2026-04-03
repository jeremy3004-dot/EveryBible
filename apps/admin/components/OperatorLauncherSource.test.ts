import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('admin shell exposes a floating operator launcher without quick links', async () => {
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
  assert.match(componentSource, /Read-only helper\./);
  assert.match(componentSource, /Chat is offline until OPENAI_API_KEY is set in Vercel/);
  assert.match(componentSource, /\/api\/operator\/chat/);
  assert.doesNotMatch(componentSource, /Open audit trail/);
  assert.doesNotMatch(componentSource, /Review health/);
  assert.doesNotMatch(componentSource, /Check translations/);
  assert.doesNotMatch(componentSource, /operator-launcher__links/);
  assert.doesNotMatch(componentSource, /DEFAULT_PROMPTS/);
  assert.doesNotMatch(componentSource, /operator-launcher__prompts/);
  assert.doesNotMatch(componentSource, /operator-launcher__mark/);
  assert.doesNotMatch(componentSource, /operator-launcher__eyebrow/);
  assert.match(routeSource, /OPENAI_API_KEY/);
  assert.match(chatSource, /chat\/completions/);
  assert.match(chatSource, /gpt-5\.4-mini/);
  assert.doesNotMatch(rootLayoutSource, /<OperatorLauncher \/>/);
  assert.match(dashboardLayoutSource, /<OperatorLauncher \/>/);
  assert.match(settingsSource, /id="operator-audit"/);
});
