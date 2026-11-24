import { Box, Text } from 'folds';
import React from 'react';
import { Atom, atom, useAtomValue } from 'jotai';
import * as css from './styles.css';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { toMediaRef, useMediaUrl } from '../../../utils/coreMedia';

export type PreviewData = {
  key: string;
  shortcode: string;
};

export const createPreviewDataAtom = (initial?: PreviewData) =>
  atom<PreviewData | undefined>(initial);

type PreviewProps = {
  previewAtom: Atom<PreviewData | undefined>;
};

type PreviewImageProps = {
  mxc: string;
  shortcode: string;
  useAuthentication: boolean;
};
function PreviewImage({ mxc, shortcode, useAuthentication }: PreviewImageProps) {
  const src = useMediaUrl(toMediaRef(mxc), { useAuthentication }) ?? mxc;

  return <img className={css.PreviewImg} src={src} alt={shortcode} />;
}

export function Preview({ previewAtom }: PreviewProps) {
  const useAuthentication = useMediaAuthentication();

  const { key, shortcode } = useAtomValue(previewAtom) ?? {};

  if (!shortcode) return null;

  return (
    <Box shrink="No" className={css.Preview} gap="300" alignItems="Center">
      {key && (
        <Box
          display="InlineFlex"
          className={css.PreviewEmoji}
          alignItems="Center"
          justifyContent="Center"
        >
          {key.startsWith('mxc://') ? (
            <PreviewImage mxc={key} shortcode={shortcode} useAuthentication={useAuthentication} />
          ) : (
            key
          )}
        </Box>
      )}
      <Text size="H5" truncate>
        :{shortcode}:
      </Text>
    </Box>
  );
}
