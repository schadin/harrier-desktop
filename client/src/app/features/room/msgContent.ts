import { IContent, MsgType } from 'matrix-js-sdk';
import type { HarrierCore } from '@harrier/core';
import to from 'await-to-js';
import {
  IThumbnailContent,
  MATRIX_BLUR_HASH_PROPERTY_NAME,
  MATRIX_SPOILER_PROPERTY_NAME,
} from '../../../types/matrix/common';
import {
  getImageFileUrl,
  getThumbnail,
  getThumbnailDimensions,
  getVideoFileUrl,
  loadImageElement,
  loadVideoElement,
} from '../../utils/dom';
import { encryptFile, getImageInfo, getThumbnailContent, getVideoInfo } from '../../utils/matrix';
import { TUploadItem } from '../../state/room/roomInputDrafts';
import { encodeBlurHash } from '../../utils/blurHash';
import { scaleYDimension } from '../../utils/common';

const uploadAndWait = async (
  core: HarrierCore,
  file: File | Blob,
  filename: string
): Promise<string> => {
  const data = await file.arrayBuffer();
  const result = core.uploads.start({
    filename,
    contentType: file.type,
    data,
  });
  if (!result.ok) throw result.error;
  const store = core.uploads.status(result.value);
  return new Promise((resolve, reject) => {
    let unsubscribe: (() => void) | undefined;
    const apply = (): void => {
      const view = store.getSnapshot().value;
      if (!view || view.status === 'uploading') return;
      unsubscribe?.();
      if (view.status === 'done' && view.mxc) resolve(view.mxc);
      else reject(new Error(view.error ?? 'Upload failed'));
    };
    unsubscribe = store.subscribe(apply);
    apply();
  });
};

const generateThumbnailContent = async (
  core: HarrierCore,
  img: HTMLImageElement | HTMLVideoElement,
  dimensions: [number, number],
  encrypt: boolean
): Promise<IThumbnailContent> => {
  const thumbnail = await getThumbnail(img, ...dimensions);
  if (!thumbnail) throw new Error('Can not create thumbnail!');
  const encThumbData = encrypt ? await encryptFile(thumbnail) : undefined;
  const thumbnailFile = encThumbData?.file ?? thumbnail;
  if (!thumbnailFile) throw new Error('Can not create thumbnail!');

  const thumbMxc = await uploadAndWait(core, thumbnailFile, 'thumbnail');
  const thumbnailContent = getThumbnailContent({
    thumbnail: thumbnailFile,
    encInfo: encThumbData?.encInfo,
    mxc: thumbMxc,
    width: dimensions[0],
    height: dimensions[1],
  });
  return thumbnailContent;
};

export const getImageMsgContent = async (
  core: HarrierCore,
  item: TUploadItem,
  mxc: string
): Promise<IContent> => {
  const { file, originalFile, encInfo, metadata } = item;
  const [imgError, imgEl] = await to(loadImageElement(getImageFileUrl(originalFile)));
  if (imgError) console.warn(imgError);

  const content: IContent = {
    msgtype: MsgType.Image,
    filename: file.name,
    body: file.name,
    [MATRIX_SPOILER_PROPERTY_NAME]: metadata.markedAsSpoiler,
  };
  if (imgEl) {
    const blurHash = encodeBlurHash(imgEl, 512, scaleYDimension(imgEl.width, 512, imgEl.height));

    content.info = {
      ...getImageInfo(imgEl, file),
      [MATRIX_BLUR_HASH_PROPERTY_NAME]: blurHash,
    };
  }
  if (encInfo) {
    content.file = {
      ...encInfo,
      url: mxc,
    };
  } else {
    content.url = mxc;
  }
  return content;
};

export const getVideoMsgContent = async (
  core: HarrierCore,
  item: TUploadItem,
  mxc: string
): Promise<IContent> => {
  const { file, originalFile, encInfo, metadata } = item;

  const [videoError, videoEl] = await to(loadVideoElement(getVideoFileUrl(originalFile)));
  if (videoError) console.warn(videoError);

  const content: IContent = {
    msgtype: MsgType.Video,
    filename: file.name,
    body: file.name,
    [MATRIX_SPOILER_PROPERTY_NAME]: metadata.markedAsSpoiler,
  };
  if (videoEl) {
    const [thumbError, thumbContent] = await to(
      generateThumbnailContent(
        core,
        videoEl,
        getThumbnailDimensions(videoEl.videoWidth, videoEl.videoHeight),
        !!encInfo
      )
    );
    if (thumbContent && thumbContent.thumbnail_info) {
      thumbContent.thumbnail_info[MATRIX_BLUR_HASH_PROPERTY_NAME] = encodeBlurHash(
        videoEl,
        512,
        scaleYDimension(videoEl.videoWidth, 512, videoEl.videoHeight)
      );
    }
    if (thumbError) console.warn(thumbError);
    content.info = {
      ...getVideoInfo(videoEl, file),
      ...thumbContent,
    };
  }
  if (encInfo) {
    content.file = {
      ...encInfo,
      url: mxc,
    };
  } else {
    content.url = mxc;
  }
  return content;
};

export const getAudioMsgContent = (item: TUploadItem, mxc: string): IContent => {
  const { file, encInfo } = item;
  const content: IContent = {
    msgtype: MsgType.Audio,
    filename: file.name,
    body: file.name,
    info: {
      mimetype: file.type,
      size: file.size,
    },
  };
  if (encInfo) {
    content.file = {
      ...encInfo,
      url: mxc,
    };
  } else {
    content.url = mxc;
  }
  return content;
};

export const getFileMsgContent = (item: TUploadItem, mxc: string): IContent => {
  const { file, encInfo } = item;
  const content: IContent = {
    msgtype: MsgType.File,
    body: file.name,
    filename: file.name,
    info: {
      mimetype: file.type,
      size: file.size,
    },
  };
  if (encInfo) {
    content.file = {
      ...encInfo,
      url: mxc,
    };
  } else {
    content.url = mxc;
  }
  return content;
};
