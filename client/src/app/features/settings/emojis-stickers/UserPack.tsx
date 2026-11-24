import React from 'react';
import { Avatar, AvatarFallback, AvatarImage, Box, Button, Icon, Icons, Text } from 'folds';
import { useUserImagePack } from '../../../hooks/useImagePacks';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { ImagePack, ImageUsage } from '../../../plugins/custom-emoji';
import { useCoreSession } from '../../../hooks/useCoreSession';
import { toMediaRef, useMediaUrl } from '../../../utils/coreMedia';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';

type UserPackProps = {
  onViewPack: (imagePack: ImagePack) => void;
};
export function UserPack({ onViewPack }: UserPackProps) {
  const session = useCoreSession();
  const useAuthentication = useMediaAuthentication();

  const userPack = useUserImagePack();
  const avatarMxc = userPack?.getAvatarUrl(ImageUsage.Emoticon);
  const resolvedAvatarUrl = useMediaUrl(toMediaRef(avatarMxc ?? ''), { useAuthentication });
  const avatarUrl = avatarMxc ? resolvedAvatarUrl : undefined;

  const handleView = () => {
    if (userPack) {
      onViewPack(userPack);
    } else {
      const defaultPack = new ImagePack(session?.userId ?? '', {}, undefined);
      onViewPack(defaultPack);
    }
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Default Pack</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title={userPack?.meta.name ?? 'Unknown'}
          description={userPack?.meta.attribution}
          before={
            <Avatar size="300" radii="300">
              {avatarUrl ? (
                <AvatarImage style={{ objectFit: 'contain' }} src={avatarUrl} />
              ) : (
                <AvatarFallback>
                  <Icon size="400" src={Icons.Sticker} filled />
                </AvatarFallback>
              )}
            </Avatar>
          }
          after={
            <Button
              variant="Secondary"
              fill="Soft"
              size="300"
              radii="300"
              outlined
              onClick={handleView}
            >
              <Text size="B300">View</Text>
            </Button>
          }
        />
      </SequenceCard>
    </Box>
  );
}
