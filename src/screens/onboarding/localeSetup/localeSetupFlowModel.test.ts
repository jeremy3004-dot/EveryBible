import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getActiveSearchQuery,
  getAdjacentSetupStep,
  getFlagEmoji,
  groupOptionsIntoSections,
} from './localeSetupFlowModel';

test('steps move forward and back inside the flow and stop at either end', () => {
  const steps = ['country', 'contentLanguage'] as const;
  assert.equal(getAdjacentSetupStep(steps, 'country', 1), 'contentLanguage');
  assert.equal(getAdjacentSetupStep(steps, 'contentLanguage', -1), 'country');
  assert.equal(getAdjacentSetupStep(steps, 'contentLanguage', 1), null);
  assert.equal(getAdjacentSetupStep(steps, 'country', -1), null);
});

test('each step searches with its own query, and the interface language step has none', () => {
  const queries = { translation: 'hin', country: 'nep', language: 'spa' };
  assert.equal(getActiveSearchQuery('translation', queries), 'hin');
  assert.equal(getActiveSearchQuery('country', queries), 'nep');
  assert.equal(getActiveSearchQuery('contentLanguage', queries), 'spa');
  assert.equal(getActiveSearchQuery('interfaceLanguage', queries), '');
});

test('consecutive options with one label form one section, in order', () => {
  const option = (key: string, groupLabel: string) => ({ key, groupLabel });
  const sections = groupOptionsIntoSections([
    option('eng', 'E'),
    option('ewe', 'E'),
    option('hin', 'H'),
    option('hau', 'H'),
    option('npi', 'N'),
  ]);

  assert.deepEqual(
    sections.map(({ groupLabel, options }) => [groupLabel, options.map(({ key }) => key)]),
    [
      ['E', ['eng', 'ewe']],
      ['H', ['hin', 'hau']],
      ['N', ['npi']],
    ]
  );
  assert.deepEqual(groupOptionsIntoSections([]), []);
});

test('a two-letter region code becomes its flag; anything else shows no flag', () => {
  assert.equal(getFlagEmoji('NP'), '🇳🇵');
  assert.equal(getFlagEmoji('US'), '🇺🇸');
  assert.equal(getFlagEmoji('np'), '', 'codes arrive upper-cased from the engine');
  assert.equal(getFlagEmoji('419'), '');
  assert.equal(getFlagEmoji(''), '');
});
