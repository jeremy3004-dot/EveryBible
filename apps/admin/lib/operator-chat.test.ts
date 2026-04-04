import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('operator chat helper is grounded and uses the OpenAI chat endpoint', async () => {
  const source = await readFile(path.join(repoRoot, 'apps/admin/lib/operator-chat.ts'), 'utf8');

  assert.match(source, /const DEFAULT_OPERATOR_CHAT_MODEL = 'gpt-5\.4-mini';/);
  assert.match(source, /sanitizeOperatorChatMessages/);
  assert.match(source, /buildOperatorChatSystemPrompt/);
  assert.match(source, /chat\/completions/);
  assert.match(source, /OPENAI_API_KEY/);
  assert.match(source, /OpenAI returned an empty assistant response\./);
});
