import { useAtomValue } from 'jotai';
import { mDirectAtom } from '../../../state/mDirectList';
import { allRoomsAtom } from '../../../state/room-list/roomList';
import { useDirects } from '../../../state/hooks/roomList';

export const useDirectRooms = () => {
  const mDirects = useAtomValue(mDirectAtom);
  const directs = useDirects(allRoomsAtom, mDirects);
  return directs;
};
