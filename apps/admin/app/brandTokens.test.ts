import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// The admin shell is the Field surface the Every Language design system was
// measured from: a vellum paper canvas, ONE EL blue accent, a persistent 256px
// nav rail, and Bricolage Grotesque / Archivo / JetBrains Mono. apps/site and
// apps/admin deploy as separate Vercel projects with different root
// directories, so each mirrors packages/brand/tokens.css rather than importing
// it. These assertions fail loudly if the mirror drifts, or if the retired
// ember "Illuminated" palette creeps back in.

const readAdmin = (file: string) =>
  readFile(path.join(repoRoot, 'apps/admin/app', file), 'utf8');

test('admin globals.css mirrors the EL token set', async () => {
  const css = await readAdmin('globals.css');

  assert.match(css, /--primary:\s*200 100% 45%;/, 'accent must be EL blue hsl(200 100% 45%)');
  assert.match(css, /--primary-deep:\s*200 100% 28%;/, 'blue text token must be hsl(200 100% 28%)');
  assert.match(css, /--vellum:\s*40 26% 92%;/, 'canvas must be vellum hsl(40 26% 92%)');
  assert.match(css, /--vellum-lit:\s*44 40% 97%;/, 'panels must be lit paper hsl(44 40% 97%)');
  assert.match(css, /--ink:\s*48 13% 9%;/, 'ink must be the warm off-black hsl(48 13% 9%)');
  assert.match(css, /--accent:\s*204 87% 92%;/, 'hover/selected surface must be pale blue');
  assert.match(css, /--rail-width:\s*256px;/, 'the nav rail is 256px and never icon-collapsed');
  assert.match(css, /--sea:\s*200 100% 45%;/, 'the ordered data series must ship');
});

test('admin ships both theme scopes, keyed to the shell data-theme attribute', async () => {
  const css = await readAdmin('globals.css');

  assert.ok(css.includes("[data-theme='dark'],"), 'dark scope must match the shell attribute');
  assert.ok(css.includes('.dark {'), 'the kit .dark scope must also apply');
  assert.ok(css.includes('.hc {'), 'the high-contrast scope must ship');
  assert.match(css, /--map-water:\s*200 18% 86%;/, 'light map chrome present');
  assert.match(css, /--map-water:\s*210 20% 5%;/, 'dark map chrome present');
});

test('admin uses the three EL type families', async () => {
  const css = await readAdmin('globals.css');

  assert.match(css, /--font-display:\s*'Bricolage Grotesque'/, 'display font is Bricolage Grotesque');
  assert.match(css, /--font-ui:\s*'Archivo'/, 'UI and reading font is Archivo');
  assert.match(css, /--font-mono:\s*'JetBrains Mono'/, 'mono font is JetBrains Mono');

  const layout = await readAdmin('layout.tsx');
  assert.ok(
    layout.includes('family=Bricolage+Grotesque'),
    'the three families must be loaded from Google Fonts'
  );
  assert.ok(
    layout.includes("import './el-field.css'"),
    'the Field layer must load after globals.css and neo-swiss.css'
  );
});

test('the Field layer carries the kit surface and interaction decisions', async () => {
  const css = await readAdmin('el-field.css');

  assert.ok(css.includes('--edge-light'), 'paper carries the inset edge light');
  assert.ok(css.includes('var(--grain)'), 'the grain overlay must ship');
  assert.ok(css.includes('var(--shadow-focus)'), 'focus is always the visible blue ring');
  assert.ok(css.includes('translateY(1px)'), 'press is translateY(1px), never a scale-down');
  assert.ok(css.includes('var(--rail-width)'), 'the rail width comes from the token');
});

test('no admin stylesheet references the retired ember Illuminated palette', async () => {
  const files = await Promise.all(
    ['globals.css', 'neo-swiss.css', 'el-field.css', 'layout.tsx'].map((file) => readAdmin(file))
  );
  const combined = files.join('\n').toLowerCase();

  for (const retired of [
    '#d96c57',
    '#e08573',
    '#b85441',
    '217, 108, 87',
    '#161412',
    '#1e1b18',
    'fraunces',
    'dm sans',
  ]) {
    assert.equal(
      combined.includes(retired.toLowerCase()),
      false,
      `retired ember brand value "${retired}" must not appear in the admin stylesheets`
    );
  }
});

test('the analytics globe paints from the EL map chrome, not the ember ramp', async () => {
  const globe = await readFile(
    path.join(repoRoot, 'apps/admin/components/AnalyticsGlobe.tsx'),
    'utf8'
  );

  // Magnitude uses the intensity ramp (see analyticsGlobeCamera.test.ts); the
  // basemap chrome still comes from the kit's --map-* tokens.
  assert.ok(globe.includes('GLOBE_HEAT'), 'the globe uses the intensity ramp');
  assert.ok(globe.includes('GLOBE_CHROME'), 'the globe uses the --map-* chrome mirror');

  for (const retired of ['#D96C57', '#B85441', '#d0c2af', '#d0a35a', 'rgba(217, 108, 87']) {
    assert.equal(
      globe.includes(retired),
      false,
      `retired ember value "${retired}" must not appear in the globe paint`
    );
  }
});
