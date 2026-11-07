import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitMessage, visibleLength } from '../src/split.js';

test('short text stays in one part', () => {
  assert.deepEqual(splitMessage('hello world'), ['hello world']);
});

test('plain text splits at word boundaries within the limit', () => {
  const parts = splitMessage('alpha beta gamma delta', 'plain', 11);
  assert.deepEqual(parts, ['alpha beta', 'gamma delta']);
});

test('an overlong word is hard split without losing characters', () => {
  const word = 'x'.repeat(25);
  const parts = splitMessage(word, 'plain', 10);
  assert.equal(parts.join(''), word);
  assert.ok(parts.every((part) => part.length <= 10));
});

test('emoji are never cut in half', () => {
  const parts = splitMessage('😀'.repeat(10), 'plain', 5);
  assert.equal(parts.join(''), '😀'.repeat(10));
  assert.ok(parts.every((part) => part.isWellFormed()));
});

test('open html tags are closed and reopened across a split', () => {
  const parts = splitMessage('<b>one two three four five six</b>', 'html', 20);
  assert.ok(parts.length > 1);
  for (const part of parts) {
    assert.match(part, /^<b>.*<\/b>$/);
    assert.ok(part.length <= 20);
  }
});

test('nested tags with attributes reopen in order', () => {
  const parts = splitMessage('<a href="https://x.y"><b>aaaa bbbb cccc dddd</b></a>', 'html', 45);
  assert.ok(parts.length > 1);
  assert.ok(parts[1].startsWith('<a href="https://x.y"><b>'));
  assert.ok(parts[0].endsWith('</b></a>'));
});

test('html entities are not split', () => {
  const parts = splitMessage('aaaaaa &amp; bbbbbb', 'html', 9);
  assert.ok(parts.every((part) => !/&(?!amp;)/.test(part)));
});

test('whitespace-only text produces no parts', () => {
  assert.deepEqual(splitMessage('   \n '), []);
  assert.deepEqual(splitMessage('<b> </b>', 'html'), []);
});

test('visibleLength ignores tags and counts entities once', () => {
  assert.equal(visibleLength('<b>a &amp; b</b>', 'html'), 5);
  assert.equal(visibleLength('<b>', 'plain'), 3);
});
