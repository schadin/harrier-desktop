import { useEffect, useState } from 'react';
import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import type { HarrierCore, MediaRef, MediaResizeMethod } from '@harrier/core';
import { useCore } from '../hooks/useCore';

export type MediaRefOptions = {
  readonly encInfo?: EncryptedAttachmentInfo;
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly resizeMethod?: MediaResizeMethod;
};

export const toMediaRef = (mxcUrl: string, options: MediaRefOptions = {}): MediaRef => ({
  mxcUrl,
  ...(options.mimeType ? { mimeType: options.mimeType } : {}),
  ...(options.width !== undefined ? { width: options.width } : {}),
  ...(options.height !== undefined ? { height: options.height } : {}),
  ...(options.resizeMethod ? { resizeMethod: options.resizeMethod } : {}),
  ...(options.encInfo
    ? {
        encrypted: {
          url: mxcUrl,
          key: options.encInfo.key,
          iv: options.encInfo.iv,
          ...(options.encInfo.hashes ? { hashes: options.encInfo.hashes } : {}),
          ...('type' in options.encInfo && typeof options.encInfo.type === 'string'
            ? { type: options.encInfo.type }
            : {}),
        },
      }
    : {}),
});

export const loadMediaSrc = async (core: HarrierCore, ref: MediaRef): Promise<string> => {
  const result = await core.media.resolve(ref);
  if (!result.ok) throw result.error;
  if (result.value.kind === 'blob') return URL.createObjectURL(result.value.blob);
  return result.value.url;
};

export const loadMediaBlob = async (
  core: HarrierCore,
  ref: MediaRef,
  filename: string
): Promise<Blob> => {
  const result = await core.media.download(ref, filename);
  if (!result.ok) throw result.error;
  return result.value;
};

export const useMediaSource = (ref: MediaRef | undefined): string | undefined => {
  const core = useCore();
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!ref) {
      setSrc(undefined);
      return undefined;
    }
    let disposed = false;
    let objectUrl: string | undefined;
    core.media
      .resolve(ref)
      .then((result) => {
        if (disposed) return;
        if (!result.ok) {
          setSrc(undefined);
          return;
        }
        if (result.value.kind === 'blob') {
          objectUrl = URL.createObjectURL(result.value.blob);
          setSrc(objectUrl);
        } else {
          setSrc(result.value.url);
        }
      })
      .catch(() => {
        if (!disposed) setSrc(undefined);
      });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [core, ref?.mxcUrl, ref?.width, ref?.height, ref?.resizeMethod]);

  return src;
};
