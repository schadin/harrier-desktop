import {
  createSnapshotStore,
  type HarrierCore,
  type JsonObject,
  type RoomStateEntry,
} from '@harrier/core';
import { describe, expect, it } from 'vitest';
import { AccountDataEvent } from '../../../types/matrix/accountData';
import { StateEvent } from '../../../types/matrix/room';
import {
  getGlobalImagePacks,
  getRoomImagePack,
  getRoomImagePacks,
  getUserImagePack,
} from './utils';

const USER_ID = '@user:example.org';
const ROOM_ID = '!room:example.org';
const PACK_TYPE = StateEvent.PoniesRoomEmotes;

type CoreData = {
  accountData: Map<string, JsonObject>;
  rooms: Map<string, { roomId: string; name: string }>;
  state: Map<string, readonly RoomStateEntry[]>;
};

const makeCore = (data: CoreData): HarrierCore =>
  ({
    auth: {
      session: createSnapshotStore({ userId: USER_ID, deviceId: 'DEVICE', ready: true }),
      accountData: (type: string) => createSnapshotStore(data.accountData.get(type) ?? null),
    },
    rooms: {
      room: (roomId: string) => createSnapshotStore(data.rooms.get(roomId) ?? null),
      stateList: (roomId: string, eventType: string) =>
        createSnapshotStore(data.state.get(`${roomId}|${eventType}`) ?? []),
    },
  } as unknown as HarrierCore);

const stateKey = (roomId: string, eventType: string) => `${roomId}|${eventType}`;

describe('image packs through core', () => {
  it('reads the personal pack from auth account data and the core session', () => {
    const core = makeCore({
      accountData: new Map([
        [AccountDataEvent.PoniesUserEmotes, { pack: { display_name: 'Personal' } }],
      ]),
      rooms: new Map(),
      state: new Map(),
    });

    const pack = getUserImagePack(core);

    expect(pack?.id).toBe(USER_ID);
    expect(pack?.meta.name).toBe('Personal');
    expect(pack?.address).toBeUndefined();
  });

  it('reads only selected room packs from core room state', () => {
    const core = makeCore({
      accountData: new Map([
        [
          AccountDataEvent.PoniesEmoteRooms,
          { rooms: { [ROOM_ID]: { selected: {}, ignored: null } } },
        ],
      ]),
      rooms: new Map([[ROOM_ID, { roomId: ROOM_ID, name: 'Pack room' }]]),
      state: new Map([
        [
          stateKey(ROOM_ID, PACK_TYPE),
          [
            {
              stateKey: 'selected',
              eventId: '$selected',
              content: { pack: { display_name: 'Selected' } },
            },
            {
              stateKey: 'ignored',
              eventId: '$ignored',
              content: { pack: { display_name: 'Ignored' } },
            },
          ],
        ],
      ]),
    });

    const packs = getGlobalImagePacks(core);

    expect(packs).toHaveLength(1);
    expect(packs[0]).toMatchObject({
      id: '$selected',
      address: { roomId: ROOM_ID, stateKey: 'selected' },
      meta: { name: 'Selected' },
    });
  });

  it('returns no global packs for missing account data or unknown rooms', () => {
    const missingData = makeCore({
      accountData: new Map(),
      rooms: new Map(),
      state: new Map(),
    });
    const unknownRoom = makeCore({
      accountData: new Map([
        [AccountDataEvent.PoniesEmoteRooms, { rooms: { [ROOM_ID]: { selected: {} } } }],
      ]),
      rooms: new Map(),
      state: new Map(),
    });

    expect(getGlobalImagePacks(missingData)).toEqual([]);
    expect(getGlobalImagePacks(unknownRoom)).toEqual([]);
  });

  it('reads one or all room packs by state key through core state lists', () => {
    const entries: readonly RoomStateEntry[] = [
      { stateKey: 'one', eventId: '$one', content: { pack: { display_name: 'One' } } },
      { stateKey: 'two', eventId: '$two', content: { pack: { display_name: 'Two' } } },
    ];
    const core = makeCore({
      accountData: new Map(),
      rooms: new Map(),
      state: new Map([[stateKey(ROOM_ID, PACK_TYPE), entries]]),
    });

    expect(getRoomImagePack(core, ROOM_ID, 'two')?.meta.name).toBe('Two');
    expect(getRoomImagePacks(core, ROOM_ID).map((pack) => pack.meta.name)).toEqual(['One', 'Two']);
  });
});
