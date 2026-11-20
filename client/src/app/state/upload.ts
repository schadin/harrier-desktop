import { atom, useAtom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { useCallback, useEffect, useRef } from 'react';
import type { HarrierCore, UploadView } from '@harrier/core';
import { useThrottle } from '../hooks/useThrottle';
import { TUploadContent } from '../utils/matrix';

export enum UploadStatus {
  Idle = 'idle',
  Loading = 'loading',
  Success = 'success',
  Error = 'error',
}

export type UploadIdle = {
  file: TUploadContent;
  status: UploadStatus.Idle;
};

export type UploadLoading = {
  file: TUploadContent;
  status: UploadStatus.Loading;
  localId: string;
  progress: { loaded: number; total: number };
};

export type UploadSuccess = {
  file: TUploadContent;
  status: UploadStatus.Success;
  mxc: string;
};

export type UploadError = {
  file: TUploadContent;
  status: UploadStatus.Error;
  error: string;
};

export type Upload = UploadIdle | UploadLoading | UploadSuccess | UploadError;

export type UploadAtomAction =
  | {
      localId: string;
    }
  | {
      progress: { loaded: number; total: number };
    }
  | {
      mxc: string;
    }
  | {
      error: string;
    };

export const createUploadAtom = (file: TUploadContent) => {
  const baseUploadAtom = atom<Upload>({
    file,
    status: UploadStatus.Idle,
  });
  return atom<Upload, [UploadAtomAction], undefined>(
    (get) => get(baseUploadAtom),
    (get, set, update) => {
      const uploadState = get(baseUploadAtom);
      if ('localId' in update) {
        set(baseUploadAtom, {
          status: UploadStatus.Loading,
          file,
          localId: update.localId,
          progress: { loaded: 0, total: file.size },
        });
        return;
      }
      if ('progress' in update && uploadState.status === UploadStatus.Loading) {
        set(baseUploadAtom, {
          ...uploadState,
          progress: update.progress,
        });
        return;
      }
      if ('mxc' in update) {
        set(baseUploadAtom, {
          status: UploadStatus.Success,
          file,
          mxc: update.mxc,
        });
        return;
      }
      if ('error' in update) {
        set(baseUploadAtom, {
          status: UploadStatus.Error,
          file,
          error: update.error,
        });
      }
    }
  );
};
export type TUploadAtom = ReturnType<typeof createUploadAtom>;

export const useBindUploadAtom = (
  core: HarrierCore,
  uploadAtom: TUploadAtom,
  hideFilename?: boolean
) => {
  const [upload, setUpload] = useAtom(uploadAtom);
  const { file } = upload;
  const localId = 'localId' in upload ? upload.localId : undefined;
  const localIdRef = useRef<string | undefined>(undefined);

  const handleProgress = useThrottle(
    useCallback(
      (progress: { loaded: number; total: number }) => setUpload({ progress }),
      [setUpload]
    ),
    { immediate: true, wait: 200 }
  );

  useEffect(() => {
    if (!localId) return undefined;
    const store = core.uploads.status(localId);
    const apply = (view: UploadView | null) => {
      if (!view) return;
      if (view.status === 'uploading') {
        handleProgress({ loaded: view.loaded, total: view.total });
      } else if (view.status === 'done' && view.mxc) {
        setUpload({ mxc: view.mxc });
      } else if (view.status === 'failed') {
        setUpload({ error: view.error ?? 'Upload failed' });
      }
    };
    apply(store.getSnapshot().value);
    return store.subscribe(() => apply(store.getSnapshot().value));
  }, [core, handleProgress, setUpload, localId]);

  const startUpload = useCallback(async () => {
    if (localIdRef.current) return;
    const data = await file.arrayBuffer();
    const result = core.uploads.start({
      filename: hideFilename ? 'file' : file.name,
      contentType: file.type,
      data,
    });
    if (!result.ok) {
      setUpload({ error: result.error.message });
      return;
    }
    localIdRef.current = result.value;
    setUpload({ localId: result.value });
  }, [core, file, hideFilename, setUpload]);

  const cancelUpload = useCallback(async () => {
    const id = localIdRef.current;
    if (!id || upload.status !== UploadStatus.Loading) return;
    const result = await core.uploads.cancel(id);
    if (!result.ok) {
      setUpload({ error: result.error.message });
      return;
    }
    setUpload({ error: 'Upload cancelled' });
  }, [core, upload.status, setUpload]);

  return {
    upload,
    startUpload,
    cancelUpload,
  };
};

export const createUploadAtomFamily = () =>
  atomFamily<TUploadContent, TUploadAtom>(createUploadAtom);
export type TUploadAtomFamily = ReturnType<typeof createUploadAtomFamily>;

export const createUploadFamilyObserverAtom = (
  uploadFamily: TUploadAtomFamily,
  uploads: TUploadContent[]
) => atom<Upload[]>((get) => uploads.map((upload) => get(uploadFamily(upload))));
export type TUploadFamilyObserverAtom = ReturnType<typeof createUploadFamilyObserverAtom>;
