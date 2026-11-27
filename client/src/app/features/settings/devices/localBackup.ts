import FileSaver from 'file-saver';
import type { HarrierCore } from '@harrier/core';
import { decryptMegolmKeyFile, encryptMegolmKeyFile } from '../../../../util/cryptE2ERoomKeys';
import { unwrapCoreResult } from '../../../utils/coreRoomActions';

export const exportLocalRoomKeys = async (core: HarrierCore, password: string): Promise<void> => {
  const keysJSON = await unwrapCoreResult(core.crypto.exportRoomKeys());
  const encrypted = await encryptMegolmKeyFile(keysJSON, password);
  const blob = new Blob([encrypted], { type: 'text/plain;charset=us-ascii' });
  FileSaver.saveAs(blob, 'harrier-keys.txt');
};

export const importLocalRoomKeys = async (
  core: HarrierCore,
  file: Pick<File, 'arrayBuffer'>,
  password: string
): Promise<void> => {
  const arrayBuffer = await file.arrayBuffer();
  const keysJSON = await decryptMegolmKeyFile(arrayBuffer, password);
  await unwrapCoreResult(core.crypto.importRoomKeys(keysJSON));
};
