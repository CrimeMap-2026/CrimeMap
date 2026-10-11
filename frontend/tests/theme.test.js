import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_KEY, applyTheme, normalizeTheme, readTheme } from '../src/theme.js';

test('light is the default; only the explicit dark preference activates dark mode', () => {
  assert.equal(normalizeTheme(undefined), 'light');
  assert.equal(normalizeTheme('invalid'), 'light');
  assert.equal(normalizeTheme('dark'), 'dark');
  assert.equal(readTheme({ getItem: () => 'dark' }), 'dark');
  assert.equal(readTheme({ getItem: () => 'light' }), 'light');
});
test('theme works even if browser storage is blocked', () => {
  assert.equal(readTheme({ getItem: () => { throw new Error('blocked'); } }), 'light');
  const root = { dataset: {}, style: {} };
  const result = applyTheme('dark', root, { setItem: () => { throw new Error('blocked'); } });
  assert.equal(result, 'dark');
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.style.colorScheme, 'dark');
});
test('theme persists a chosen light mode', () => {
  const recorded = [];
  const root = { dataset: {}, style: {} };
  applyTheme('light', root, { setItem: (key, value) => recorded.push([key, value]) });
  assert.deepEqual(recorded, [[THEME_KEY, 'light']]);
  assert.equal(root.dataset.theme, 'light');
});
