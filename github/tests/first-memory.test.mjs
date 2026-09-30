import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirstMemoryState } from '../src/lib/first-memory.ts';

function memoryStorage() {
  const entries = new Map();
  return { entries, getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value) };
}

test('onboarding starts eligible and remembers successful guest saves across reloads', () => {
  const storage = memoryStorage();
  const state = createFirstMemoryState(storage);
  assert.equal(state.has(), false);
  state.remember();
  assert.equal(state.has(), true);
  assert.equal(createFirstMemoryState(storage).has(), true);
  assert.deepEqual([...storage.entries.values()], ['true']);
});

test('different accounts and the guest browser have independent completion flags', () => {
  const state = createFirstMemoryState(memoryStorage());
  state.remember('account-a');
  assert.equal(state.has('account-a'), true);
  assert.equal(state.has('account-b'), false);
  assert.equal(state.has(), false);
});

test('blocked or missing storage remembers completion for the current page without throwing', () => {
  for (const storage of [undefined, { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } }]) {
    const state = createFirstMemoryState(storage);
    assert.equal(state.has(), false);
    assert.doesNotThrow(() => state.remember());
    assert.equal(state.has(), true);
  }
});
