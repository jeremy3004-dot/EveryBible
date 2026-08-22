import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// The marketing site carries the Every Language design system: a vellum paper
// canvas, ONE EL blue accent, and Bricolage Grotesque / Archivo / JetBrains
// Mono. apps/site and apps/admin deploy as separate Vercel projects with
// different root directories, so each mirrors packages/brand/tokens.css rather
// than importing it. These assertions fail loudly if the mirror drifts, or if
// the retired ember "Illuminated" palette creeps back in.

const readSiteCss = () => readFile(path.join(repoRoot, 'apps/site/app/globals.css'), 'utf8');

test('site globals.css defines the EL blue accent on the vellum paper canvas', async () => {
  const css = await readSiteCss();

  assert.match(css, /--primary:\s*200 100% 45%;/, 'accent must be EL blue hsl(200 100% 45%)');
  assert.match(
    css,
    /--primary-deep:\s*200 100% 28%;/,
    'accent text-on-paper must be hsl(200 100% 28%)'
  );
  assert.match(css, /--vellum:\s*40 26% 92%;/, 'canvas must be vellum hsl(40 26% 92%)');
  assert.match(css, /--vellum-lit:\s*44 40% 97%;/, 'panels must be lit paper hsl(44 40% 97%)');
  assert.match(css, /--ink:\s*48 13% 9%;/, 'ink must be the warm off-black hsl(48 13% 9%)');
  assert.match(css, /--accent:\s*204 87% 92%;/, 'hover/selected surface must be pale blue');
});

test('site globals.css uses the three EL type families', async () => {
  const css = await readSiteCss();

  assert.match(css, /--font-display:\s*'Bricolage Grotesque'/, 'display font is Bricolage Grotesque');
  assert.match(css, /--font-ui:\s*'Archivo'/, 'UI and reading font is Archivo');
  assert.match(css, /--font-mono:\s*'JetBrains Mono'/, 'mono font is JetBrains Mono');
  assert.ok(
    css.includes('fonts.googleapis.com/css2?family=Bricolage+Grotesque'),
    'the three families must be loaded from Google Fonts'
  );
});

test('site globals.css ships the paper materiality and both theme scopes', async () => {
  const css = await readSiteCss();

  assert.match(css, /--grain-opacity:\s*0\.035;/, 'grain sits at 3.5% in light');
  assert.match(css, /--edge-light:\s*inset 0 1\.5px 0 #ffffffb3;/, 'paper carries the edge light');
  assert.ok(css.includes('.dark {'), 'the dark theme scope must ship');
  assert.ok(css.includes('.hc {'), 'the high-contrast scope must ship');
  assert.ok(css.includes('.atlas-paper'), 'the paper surface utility must ship');
});

test('site globals.css no longer references the retired ember Illuminated palette', async () => {
  const css = await readSiteCss();

  for (const retired of [
    '#d96c57',
    '#e08573',
    '#b85441',
    '#8f3d2e',
    '#ece6da',
    '#faf6ed',
    '217, 108, 87',
    'Fraunces',
    'DM Sans',
  ]) {
    assert.equal(
      css.toLowerCase().includes(retired.toLowerCase()),
      false,
      `retired ember brand value "${retired}" must not appear in the site stylesheet`
    );
  }
});

test('the canonical brand token package stays the documented source of truth', async () => {
  const tokens = await readFile(path.join(repoRoot, 'packages/brand/tokens.css'), 'utf8');

  assert.match(tokens, /--primary:\s*200 100% 45%;/, 'canonical EL blue token present');
  assert.match(tokens, /--vellum:\s*40 26% 92%;/, 'canonical vellum token present');
  assert.match(tokens, /--font-display:\s*'Bricolage Grotesque'/, 'canonical display font present');
  // Brand red is a brand asset colour, NOT the product error colour.
  assert.match(tokens, /--brand-red:\s*354 65% 47%;/, 'raw brand red present');
  assert.match(tokens, /--danger:\s*354 65% 47%;/, 'product danger is its own token');
});
