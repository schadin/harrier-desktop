/* eslint-disable import/no-extraneous-dependencies */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const TARGET_FILES = [
  'src/app/features/common-settings/developer-tools/SendRoomEvent.tsx',
  'src/app/features/common-settings/general/RoomAddress.tsx',
  'src/app/features/create-room/CreateRoom.tsx',
  'src/app/features/create-space/CreateSpace.tsx',
  'src/app/features/ds-task-bot/helpers.ts',
  'src/app/features/room/jump-to-time/JumpToTime.tsx',
  'src/app/features/room/MembersDrawer.tsx',
  'src/app/components/emoji-board/components/Item.tsx',
  'src/app/hooks/useMemberPowerTag.ts',
];

const readTarget = (path: string): string =>
  readFileSync(new URL(path, new URL('../../../../../', import.meta.url)), 'utf8');

const expectNoSdkImport = (source: string) => {
  expect(source).not.toMatch(/from\s+['"]matrix-js-sdk(?:\/[^'"]*)?['"]/);
};

describe('core contract boundary', () => {
  it.each(TARGET_FILES)('%s does not import matrix-js-sdk', (path) => {
    expectNoSdkImport(readTarget(path));
  });

  it('sends developer message events through the core and surfaces CoreError', () => {
    const source = readTarget(TARGET_FILES[0]);
    expect(source).toContain('core.send.sendEvent(');
    expect(source).toMatch(/useAsyncCallback<\s*object,\s*CoreError/);
    expect(source).not.toContain('useMatrixClient');
  });

  it('reads room address failures from CoreError fields', () => {
    const source = readTarget(TARGET_FILES[1]);
    expect(source).toContain('addState.error.httpStatus === 409');
    expect(source).toContain('let error: CoreError | undefined');
    expect(source).not.toContain('as MatrixError');
  });

  it('formats room creation rate limits from CoreError', () => {
    const source = readTarget(TARGET_FILES[2]);
    expect(source).toContain('error.errcode === ErrorCode.M_LIMIT_EXCEEDED');
    expect(source).toContain("typeof retryAfterMs === 'number' ? retryAfterMs : 0");
    expect(source).not.toContain('MatrixError');
  });

  it('formats space creation rate limits from CoreError', () => {
    const source = readTarget(TARGET_FILES[3]);
    expect(source).toContain('error.errcode === ErrorCode.M_LIMIT_EXCEEDED');
    expect(source).toContain("typeof retryAfterMs === 'number' ? retryAfterMs : 0");
    expect(source).not.toContain('MatrixError');
  });

  it('uses local bot content types and core member snapshots', () => {
    const source = readTarget(TARGET_FILES[4]);
    expect(source).toContain("from '../../../types/matrix/protocol'");
    expect(source).toContain('members: readonly MemberView[]');
    expect(source).toContain('core.send.sendMessage(');
  });

  it('uses core timeline operations without legacy timeline directions', () => {
    const source = readTarget(TARGET_FILES[5]);
    expect(source).toContain('core.timeline.timeline(');
    expect(source).toContain('core.timeline.paginateBackward(');
    expect(source).not.toContain('EventTimelineDirection');
    expect(source).not.toContain('FORWARD_DIRECTION');
    expect(source).not.toMatch(/['"]f['"]/);
    expect(source).toContain('CoreError');
    expect(source).not.toContain('mx.timestampToEvent');
  });

  it('reads members drawer data from core room and member snapshots', () => {
    const source = readTarget(TARGET_FILES[6]);
    expect(source).toContain('useCoreRoom(');
    expect(source).toContain('coreRoom?.memberCount');
    expect(source).not.toContain('getJoinedMemberCount');
  });

  it('resolves emoji and sticker media through core', () => {
    const source = readTarget(TARGET_FILES[7]);
    expect(source).toContain('useMediaSource(');
    expect(source).toContain('toMediaRef(');
    expect(source).not.toContain('mxcUrlToHttp');
  });

  it('loads contact 3PIDs through core while rendering email addresses only', () => {
    const source = readTarget('src/app/features/settings/account/ContactInfo.tsx');
    expect(source).toContain('unwrapCoreResult(core.auth.threePids())');
    expect(source).toContain("id.medium === 'email'");
    expect(source).not.toContain('useMatrixClient');
    expect(source).not.toContain('mx.getThreePids');
    expect(source).not.toContain('.threepids');
  });

  it('writes own profile fields through core without changing input or avatar timing', () => {
    const source = readTarget('src/app/features/settings/account/Profile.tsx');
    expect(source).toContain('core.presence.setOwnProfile({ avatarUrl: mxc })');
    expect(source).toContain('core.presence.setOwnProfile({ avatarUrl: null })');
    expect(source).toContain('core.presence.setOwnProfile({ displayName: name })');
    expect(source).toContain('changeDisplayName(name);');
    expect(source).not.toContain('changeDisplayName(name.trim())');
    expect(source).toContain('getSessionUserId(session)');
    expect(source).toContain('useUserProfile(userId)');
    expect(source).toContain("capabilities['m.set_avatar_url']?.enabled === false");
    expect(source).toContain("capabilities['m.set_displayname']?.enabled === false");
    expect(source).not.toContain('useMatrixClient');
    expect(source).not.toContain('mx.setAvatarUrl');
    expect(source).not.toContain('mx.setDisplayName');

    const uploadCall = source.indexOf('core.presence.setOwnProfile({ avatarUrl: mxc })');
    const uploadCleanup = source.indexOf('handleRemoveUpload();', uploadCall);
    expect(uploadCall).toBeGreaterThanOrEqual(0);
    expect(uploadCleanup).toBeGreaterThan(uploadCall);

    const removeCall = source.indexOf('core.presence.setOwnProfile({ avatarUrl: null })');
    const removeCleanup = source.indexOf('setAlertRemove(false);', removeCall);
    expect(removeCall).toBeGreaterThanOrEqual(0);
    expect(removeCleanup).toBeGreaterThan(removeCall);
  });
});
