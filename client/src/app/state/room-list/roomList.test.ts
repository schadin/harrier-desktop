import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { allRoomsAtom } from './roomList';

describe('allRoomsAtom identity', () => {
  it('does not reinitialize IDs when membership produces the same ordered list', () => {
    const store = createStore();
    store.set(allRoomsAtom, { type: 'INITIALIZE', rooms: ['!a:example.org', '!b:example.org'] });
    const initial = store.get(allRoomsAtom);

    store.set(allRoomsAtom, { type: 'INITIALIZE', rooms: ['!a:example.org', '!b:example.org'] });

    expect(store.get(allRoomsAtom)).toBe(initial);
  });

  it('ignores duplicate PUT and missing DELETE operations', () => {
    const store = createStore();
    store.set(allRoomsAtom, { type: 'INITIALIZE', rooms: ['!a:example.org'] });
    const initial = store.get(allRoomsAtom);

    store.set(allRoomsAtom, { type: 'PUT', roomId: '!a:example.org' });
    store.set(allRoomsAtom, { type: 'DELETE', roomId: '!missing:example.org' });

    expect(store.get(allRoomsAtom)).toBe(initial);
  });
});
