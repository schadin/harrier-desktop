import React from 'react';
import { useAtom } from 'jotai';
import { Text } from 'folds';
import { SidebarItem, SidebarItemTooltip, SidebarAvatar } from '../../../components/sidebar';
import { UserAvatar } from '../../../components/user-avatar';
import { getSessionUserId, useCoreSession } from '../../../hooks/useCoreSession';
import { getMxIdLocalPart } from '../../../utils/matrix';
import { toMediaRef, useMediaUrl } from '../../../utils/coreMedia';
import { nameInitials } from '../../../utils/common';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { Settings, SettingsPages } from '../../../features/settings';
import { useUserProfile } from '../../../hooks/useUserProfile';
import { Modal500 } from '../../../components/Modal500';
import { settingsPageAtom } from '../../../state/settingsNav';
import { StatusButton } from './StatusButton';

export function SettingsTab() {
  const session = useCoreSession();
  const useAuthentication = useMediaAuthentication();
  const userId = getSessionUserId(session);
  const profile = useUserProfile(userId);

  const [settingsPage, setSettingsPage] = useAtom(settingsPageAtom);

  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl =
    useMediaUrl(
      toMediaRef(profile.avatarUrl ?? '', { width: 96, height: 96, resizeMethod: 'crop' }),
      { useAuthentication }
    ) ?? undefined;

  const openSettings = () => setSettingsPage(SettingsPages.GeneralPage);
  const closeSettings = () => setSettingsPage(null);

  return (
    <SidebarItem active={settingsPage !== null}>
      <SidebarItemTooltip tooltip="User Settings">
        {(triggerRef) => (
          <div style={{ position: 'relative' }}>
            <SidebarAvatar as="button" ref={triggerRef} onClick={openSettings}>
              <UserAvatar
                userId={userId}
                src={avatarUrl}
                renderFallback={() => <Text size="H4">{nameInitials(displayName)}</Text>}
              />
            </SidebarAvatar>
            <StatusButton />
          </div>
        )}
      </SidebarItemTooltip>
      {settingsPage !== null && (
        <Modal500 requestClose={closeSettings}>
          <Settings key={settingsPage} initialPage={settingsPage} requestClose={closeSettings} />
        </Modal500>
      )}
    </SidebarItem>
  );
}
