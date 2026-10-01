import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteVerseForImage } from './verseImageQuote';

test('a verse with no quotes of its own is wrapped in curly double quotes', () => {
  assert.equal(quoteVerseForImage('In the beginning'), '“In the beginning”');
});

test('Genesis 1:3 nests its inner double quotes as single quotes inside the outer pair', () => {
  assert.equal(
    quoteVerseForImage('And God said, “Let there be light,” and there was light.'),
    '“And God said, ‘Let there be light,’ and there was light.”'
  );
});

test('John 3:3 nests its quoted speech as single quotes', () => {
  assert.equal(
    quoteVerseForImage(
      'Jesus replied, “Truly, truly, I tell you, unless one is born again, he cannot see the kingdom of God.”'
    ),
    '“Jesus replied, ‘Truly, truly, I tell you, unless one is born again, he cannot see the kingdom of God.’”'
  );
});

test('a third level swaps back to double quotes, and apostrophes are left alone', () => {
  assert.equal(
    quoteVerseForImage('He said, “She told me, ‘God’s word stands.’ So I believe.”'),
    '“He said, ‘She told me, “God’s word stands.” So I believe.’”'
  );
});

test('Matthew 2:6 already opens with a quote, so it is shown as written rather than wrapped again', () => {
  const verse = '“‘But you, Bethlehem, are by no means least among the rulers of Judah.’”';
  assert.equal(quoteVerseForImage(verse), verse);
  assert.equal(quoteVerseForImage('‘Go,’ he said.'), '‘Go,’ he said.');
});
