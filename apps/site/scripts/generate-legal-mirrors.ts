// Regenerates legal/privacy.html and legal/delete-account.html from apps/site/lib/legal.
// Run after changing the legal text: npm run legal:mirrors -w @everybible/site
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderLegalMirrors } from '../lib/legal/legal-mirrors';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

for (const { file, html } of renderLegalMirrors()) {
  writeFileSync(path.join(repoRoot, file), html);
  console.log(`wrote ${file}`);
}
