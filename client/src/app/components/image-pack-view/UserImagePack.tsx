import React, { useCallback, useMemo } from 'react';
import type { JsonObject } from '@harrier/core';
import { ImagePackContent } from './ImagePackContent';
import { ImagePack, PackContent } from '../../plugins/custom-emoji';
import { useCore } from '../../hooks/useCore';
import { AccountDataEvent } from '../../../types/matrix/accountData';
import { useUserImagePack } from '../../hooks/useImagePacks';

export function UserImagePack() {
  const core = useCore();
  const userId = core.auth.session.getSnapshot().value?.userId ?? '';

  const defaultPack = useMemo(() => new ImagePack(userId, {}, undefined), [userId]);
  const imagePack = useUserImagePack();

  const handleUpdate = useCallback(
    async (packContent: PackContent) => {
      const result = await core.auth.setAccountData(
        AccountDataEvent.PoniesUserEmotes,
        packContent as unknown as JsonObject
      );
      if (!result.ok) throw result.error;
    },
    [core]
  );

  return <ImagePackContent imagePack={imagePack ?? defaultPack} canEdit onUpdate={handleUpdate} />;
}
