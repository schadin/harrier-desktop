import { ReactNode, useCallback, useEffect } from 'react';
import { IThumbnailContent } from '../../../../types/matrix/common';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { loadMediaSrc, toMediaRef } from '../../../utils/coreMedia';
import { useCore } from '../../../hooks/useCore';
import { FALLBACK_MIMETYPE } from '../../../utils/mimeTypes';

export type ThumbnailContentProps = {
  info: IThumbnailContent;
  renderImage: (src: string) => ReactNode;
};
export function ThumbnailContent({ info, renderImage }: ThumbnailContentProps) {
  const core = useCore();

  const [thumbSrcState, loadThumbSrc] = useAsyncCallback(
    useCallback(async () => {
      const thumbInfo = info.thumbnail_info;
      const thumbMxcUrl = info.thumbnail_file?.url ?? info.thumbnail_url;
      if (typeof thumbMxcUrl !== 'string' || typeof thumbInfo?.mimetype !== 'string') {
        throw new Error('Failed to load thumbnail');
      }
      return loadMediaSrc(
        core,
        toMediaRef(thumbMxcUrl, {
          encInfo: info.thumbnail_file,
          mimeType: thumbInfo.mimetype ?? FALLBACK_MIMETYPE,
          width: thumbInfo.w,
          height: thumbInfo.h,
          resizeMethod: 'scale',
        })
      );
    }, [core, info])
  );

  useEffect(() => {
    loadThumbSrc();
  }, [loadThumbSrc]);

  return thumbSrcState.status === AsyncStatus.Success ? renderImage(thumbSrcState.data) : null;
}
