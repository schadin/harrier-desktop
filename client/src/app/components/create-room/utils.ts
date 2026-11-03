import type { HarrierCore } from '@harrier/core';
import { Room } from 'matrix-js-sdk';
import { RoomType } from '../../../types/matrix/room';
import { getViaServers } from '../../plugins/via-servers';
import { CreateRoomAccess } from './types';

export const createRoomCreationContent = (
  type: RoomType | undefined,
  allowFederation: boolean,
  additionalCreators: string[] | undefined
): object => {
  const content: Record<string, any> = {};
  if (typeof type === 'string') {
    content.type = type;
  }
  if (allowFederation === false) {
    content['m.federate'] = false;
  }
  if (Array.isArray(additionalCreators)) {
    content.additional_creators = additionalCreators;
  }

  return content;
};

export const createRoomEncryptionState = () => ({
  type: 'm.room.encryption',
  state_key: '',
  content: {
    algorithm: 'm.megolm.v1.aes-sha2',
  },
});

export type CreateRoomData = {
  version: string;
  type?: RoomType;
  parent?: Room;
  access: CreateRoomAccess;
  name: string;
  topic?: string;
  aliasLocalPart?: string;
  encryption?: boolean;
  knock: boolean;
  allowFederation: boolean;
  additionalCreators?: string[];
};

export const createRoom = async (core: HarrierCore, data: CreateRoomData): Promise<string> => {
  let access: 'private' | 'restricted' | 'public' = 'private';
  if (data.access === CreateRoomAccess.Public) access = 'public';
  if (data.access === CreateRoomAccess.Restricted) access = 'restricted';

  const result = await core.rooms.createRoom({
    version: data.version,
    type: data.type,
    access,
    knock: data.knock,
    name: data.name,
    topic: data.topic,
    aliasLocalPart: data.aliasLocalPart,
    encryption: data.encryption,
    allowFederation: data.allowFederation,
    additionalCreators: data.additionalCreators,
    parent: data.parent
      ? { roomId: data.parent.roomId, via: getViaServers(data.parent) }
      : undefined,
  });
  if (!result.ok) throw result.error;
  return result.value;
};
