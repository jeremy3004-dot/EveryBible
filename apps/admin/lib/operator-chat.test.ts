import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('operator chat helper is Gemini-backed with read-only tool calling', async () => {
  const source = await readFile(path.join(repoRoot, 'apps/admin/lib/operator-chat.ts'), 'utf8');

  assert.match(source, /const DEFAULT_OPERATOR_CHAT_MODEL = 'gemini-2\.5-flash';/);
  assert.match(source, /generativelanguage\.googleapis\.com/);
  assert.match(source, /GEMINI_API_KEY/);
  assert.match(source, /function_declarations/);
  assert.match(source, /functionCall/);
  assert.match(source, /functionResponse/);
  assert.match(source, /sanitizeOperatorChatMessages/);
  // Must remain read-only: no OpenAI, no mutation wording.
  assert.doesNotMatch(source, /OPENAI_API_KEY/);
  assert.doesNotMatch(source, /gpt-4o/);
});

test('operator tools are read-only and cover the core admin data surfaces', async () => {
  const source = await readFile(path.join(repoRoot, 'apps/admin/lib/operator-tools.ts'), 'utf8');

  for (const tool of [
    'get_health_snapshot',
    'get_analytics_overview',
    'list_translations',
    'get_translation_detail',
    'list_chapter_feedback',
    'get_support_user',
    'list_audit_logs',
    'list_sync_runs',
  ]) {
    assert.match(source, new RegExp(tool), `tool ${tool} must be declared`);
  }
  // No mutating admin-data calls should be imported into the tool surface.
  assert.doesNotMatch(source, /Action|upsert|mark|update[A-Z]|delete/);
});
