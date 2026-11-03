import { useCoreRoom } from './useCoreRoom';

export function useCoreRoomMeta(roomId: string) {
  const room = useCoreRoom(roomId);
  return {
    room,
    name: room?.name ?? roomId,
    topic: room?.topic,
    avatarMxc: room?.avatarMxc,
    dmAvatarMxc: room?.dmAvatarMxc,
    joinRule: room?.joinRule,
    roomType: room?.roomType,
    encrypted: room?.encrypted ?? false,
  };
}
