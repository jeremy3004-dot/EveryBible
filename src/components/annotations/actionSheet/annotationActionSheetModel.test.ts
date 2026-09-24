import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getNoteInputMaxHeight,
  getNoteToSave,
  getSheetMaxHeight,
  HIGHLIGHT_COLORS,
  NOTE_INPUT_MIN_HEIGHT,
} from './annotationActionSheetModel';

test('the five highlight colours keep their ids and saved hex values', () => {
  assert.deepEqual(
    HIGHLIGHT_COLORS.map(({ id, hex }) => [id, hex]),
    [
      ['red', '#D95B57'],
      ['yellow', '#F4E2A8'],
      ['orange', '#E6A24C'],
      ['green', '#6FBF7A'],
      ['blue', '#4A90E2'],
    ]
  );
});

test('the sheet is capped at 90% of the window below the status bar', () => {
  assert.equal(getSheetMaxHeight(667, 20), 582);
  assert.equal(getSheetMaxHeight(844, 47), 717);
});

test('the note field grows to a fifth of the window, never below its minimum', () => {
  assert.equal(getNoteInputMaxHeight(844), 169);
  assert.equal(getNoteInputMaxHeight(500), NOTE_INPUT_MIN_HEIGHT);
});

test('Done saves the trimmed note, and nothing for a blank one', () => {
  assert.equal(getNoteToSave('  Remember this \n'), 'Remember this');
  assert.equal(getNoteToSave(' \n\t '), null);
  assert.equal(getNoteToSave(''), null);
});
