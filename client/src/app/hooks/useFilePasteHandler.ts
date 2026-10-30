import { useCallback, ClipboardEventHandler } from 'react';
import { readImage } from '@tauri-apps/plugin-clipboard-manager';
import { getDataTransferFiles } from '../utils/dom';
import { isTauri } from '../utils/notification';

const getClipboardImageFile = async (): Promise<File | undefined> => {
  try {
    const image = await readImage();
    const rgba = await image.rgba();
    const { width, height } = await image.size();
    if (width === 0 || height === 0) return undefined;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return undefined;

    const imageData = context.createImageData(width, height);
    imageData.data.set(rgba);
    context.putImageData(imageData, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/png');
    });
    if (!blob) return undefined;

    return new File([blob], 'clipboard.png', { type: 'image/png' });
  } catch {
    return undefined;
  }
};

export const useFilePasteHandler = (onPaste: (file: File[]) => void): ClipboardEventHandler =>
  useCallback(
    (evt) => {
      const files = getDataTransferFiles(evt.clipboardData);
      if (files) {
        onPaste(files);
        return;
      }
      if (!isTauri()) return;
      getClipboardImageFile().then((file) => {
        if (!file) return;
        evt.preventDefault();
        onPaste([file]);
      });
    },
    [onPaste]
  );
