import React, {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HarrierCore,
  RoomView,
  SnapshotStore,
  TimelineItem,
  UnreadCountView,
  unreadEqual,
  unreadInfoToUnread,
} from '@harrier/core';

import LogoSVG from '../../../../public/res/svg/harrier.svg';
import LogoUnreadSVG from '../../../../public/res/svg/harrier-unread.svg';
import LogoHighlightSVG from '../../../../public/res/svg/harrier-highlight.svg';
import NotificationSound from '../../../../public/sound/notification.ogg';
import InviteSound from '../../../../public/sound/invite.ogg';
import { setFavicon } from '../../utils/dom';
import { extractMessagePreview, isTauri, showNotification } from '../../utils/notification';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { usePreviousValue } from '../../hooks/usePreviousValue';
import { useCore } from '../../hooks/useCore';
import { getInboxInvitesPath, getInboxNotificationsPath } from '../pathUtils';
import { getMxIdLocalPart } from '../../utils/matrix';
import { useSelectedRoom } from '../../hooks/router/useSelectedRoom';
import { useInboxNotificationsSelected } from '../../hooks/router/useInbox';
import { useCustomStatus } from '../../hooks/useCustomStatus';
import {
  DEFAULT_STATUS_PRESETS,
  restoreCustomStatus,
  setCustomStatusWithTime,
  stripTimeSuffix,
} from '../../plugins/custom-status';
import {
  applyAutostart,
  applySingleInstance,
  listenTrayStatus,
  setActiveStatus,
  setDesktopSettings,
  setStatusPresets,
} from '../../utils/desktop';
import { updateTrayIcon } from '../../utils/trayIcon';
import { useRestoreBackupOnStartup } from '../../hooks/useRestoreBackupOnStartup';
import { useRetryDecryptionOnKeyArrival } from '../../hooks/useRetryDecryptionOnKeyArrival';

// задержки повторов запроса presence: покрывают старт приложения до поднятия
// сети (автозапуск при загрузке системы) без одноразового таймаута
const STATUS_RESTORE_RETRY_DELAYS_MS = [1_000, 3_000, 10_000, 30_000, 60_000];

const useCoreSnapshot = <T,>(store: SnapshotStore<T>): T =>
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;

const useUnreadSummary = (core: HarrierCore): UnreadCountView => {
  const rooms = useCoreSnapshot(core.rooms.all);
  const unreads = useCoreSnapshot(core.rooms.unreads);

  return useMemo(() => {
    const spaceRoomIds = new Set(rooms.filter((room) => room.isSpace).map((room) => room.roomId));
    return unreads.reduce<UnreadCountView>(
      (summary, { roomId, unread }) => {
        if (spaceRoomIds.has(roomId)) return summary;
        return {
          total: summary.total + unread.total,
          highlight: summary.highlight + unread.highlight,
        };
      },
      { total: 0, highlight: 0 }
    );
  }, [rooms, unreads]);
};

type TimelineTracker = {
  readonly items: ReadonlyMap<string, TimelineItem>;
  readonly lastIndex: number;
  readonly lastEventId?: string;
};

const isNotificationTimelineItem = (item: TimelineItem): boolean =>
  item.kind === 'message' ||
  item.kind === 'sticker' ||
  item.kind === 'encrypted' ||
  (item.kind === 'state' && item.eventType === 'm.room.create');

const getNotificationPreview = (item: TimelineItem): string => {
  if (item.kind === 'message') {
    return extractMessagePreview({
      getContent: () => ({ msgtype: item.content.msgtype, body: item.content.body }),
      isRedacted: () => false,
    });
  }
  if (item.kind === 'sticker') {
    return extractMessagePreview({
      getContent: () => ({
        body: typeof item.content.body === 'string' ? item.content.body : undefined,
      }),
      isRedacted: () => false,
    });
  }
  if (item.kind === 'encrypted') return item.preview;
  return 'Sent a message';
};

function CustomStatusRestore() {
  const core = useCore();

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    let attempt = 0;

    function schedule() {
      const delay =
        STATUS_RESTORE_RETRY_DELAYS_MS[
          Math.min(attempt, STATUS_RESTORE_RETRY_DELAYS_MS.length - 1)
        ];
      attempt += 1;
      timer = window.setTimeout(run, delay);
    }

    function run() {
      if (disposed) return;
      restoreCustomStatus(core)
        .then((result) => {
          if (!disposed && result === 'retry') schedule();
        })
        .catch(() => {
          if (!disposed) schedule();
        });
    }

    run();

    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [core]);

  return null;
}

function AutoRestoreBackup() {
  useRestoreBackupOnStartup();
  return null;
}

function RetryDecryption() {
  useRetryDecryptionOnKeyArrival();
  return null;
}

function DesktopFeatures() {
  const core = useCore();
  const session = useCoreSnapshot(core.auth.session);
  const userId = session?.userId ?? '';
  const currentStatus = useCustomStatus(userId);
  const unreadSummary = useUnreadSummary(core);

  const [showTrayIcon] = useSetting(settingsAtom, 'showTrayIcon');
  const [customPresets] = useSetting(settingsAtom, 'statusPresets');
  const [statusNoticeRoomId] = useSetting(settingsAtom, 'statusNoticeRoomId');
  const [autostart, setAutostartSetting] = useSetting(settingsAtom, 'autostart');
  const [singleInstance, setSingleInstanceSetting] = useSetting(settingsAtom, 'singleInstance');

  useEffect(() => {
    if (!isTauri()) return undefined;
    const timer = setTimeout(() => {
      setDesktopSettings(showTrayIcon);
    }, 100);
    return () => clearTimeout(timer);
  }, [showTrayIcon]);

  useEffect(() => {
    if (!isTauri()) return undefined;
    let disposed = false;
    const timer = setTimeout(() => {
      applyAutostart(autostart).then((applied) => {
        // регистрация не удалась — вернуть переключатель в выключенное положение
        if (!disposed && !applied) setAutostartSetting(false);
      });
    }, 100);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [autostart, setAutostartSetting]);

  useEffect(() => {
    if (!isTauri()) return undefined;
    let disposed = false;
    const timer = setTimeout(() => {
      applySingleInstance(singleInstance).then((applied) => {
        if (!disposed && !applied) setSingleInstanceSetting(false);
      });
    }, 100);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [singleInstance, setSingleInstanceSetting]);

  useEffect(() => {
    if (!isTauri()) return undefined;
    const presets = [...DEFAULT_STATUS_PRESETS, ...customPresets];
    const timer = setTimeout(() => {
      setStatusPresets(presets);
    }, 100);
    return () => clearTimeout(timer);
  }, [customPresets]);

  useEffect(() => {
    if (!isTauri()) return undefined;
    const emoji = currentStatus?.emoji ?? '';
    const text = currentStatus?.text ? stripTimeSuffix(currentStatus.text) : '';
    const timer = setTimeout(() => {
      setActiveStatus(emoji || text ? { emoji, text } : null);
    }, 100);
    return () => clearTimeout(timer);
  }, [currentStatus]);

  useEffect(() => {
    if (!isTauri()) return undefined;
    let disposed = false;
    const disposeFns: Array<() => void> = [];
    listenTrayStatus((preset) => {
      setCustomStatusWithTime(core, preset.emoji, preset.text, statusNoticeRoomId);
    }).then((fn) => {
      if (disposed) {
        fn();
      } else {
        disposeFns.push(fn);
      }
    });
    return () => {
      disposed = true;
      disposeFns.forEach((fn) => fn());
    };
  }, [core, statusNoticeRoomId]);

  useEffect(() => {
    if (!isTauri() || !showTrayIcon) return undefined;
    const { total, highlight } = unreadSummary;
    const emoji = currentStatus?.emoji ?? '';
    const timer = setTimeout(() => {
      updateTrayIcon(emoji || null, { total, highlight });
    }, 100);
    return () => clearTimeout(timer);
  }, [currentStatus, unreadSummary, showTrayIcon]);

  return null;
}

function SystemEmojiFeature() {
  const [twitterEmoji] = useSetting(settingsAtom, 'twitterEmoji');

  if (twitterEmoji) {
    document.documentElement.style.setProperty('--font-emoji', 'Twemoji');
  } else {
    document.documentElement.style.setProperty('--font-emoji', 'Twemoji_DISABLED');
  }

  return null;
}

function PageZoomFeature() {
  const [pageZoom] = useSetting(settingsAtom, 'pageZoom');

  if (pageZoom === 100) {
    document.documentElement.style.removeProperty('font-size');
  } else {
    document.documentElement.style.setProperty('font-size', `calc(1em * ${pageZoom / 100})`);
  }

  return null;
}

function FaviconUpdater() {
  const core = useCore();
  const unreadSummary = useUnreadSummary(core);

  useEffect(() => {
    if (unreadSummary.total > 0) {
      setFavicon(unreadSummary.highlight > 0 ? LogoHighlightSVG : LogoUnreadSVG);
    } else {
      setFavicon(LogoSVG);
    }
  }, [unreadSummary]);

  return null;
}

function InviteNotifications() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const core = useCore();
  const rooms = useCoreSnapshot(core.rooms.all);
  const syncState = useCoreSnapshot(core.auth.sync);
  const invites = rooms.filter((room) => room.membership === 'invite');
  const perviousInviteLen = usePreviousValue(invites.length, 0);

  const navigate = useNavigate();
  const [showNotifications] = useSetting(settingsAtom, 'showNotifications');
  const [notificationSound] = useSetting(settingsAtom, 'isNotificationSounds');

  const notify = useCallback(
    (count: number) => {
      const noti = showNotification({
        title: 'Invitation',
        icon: LogoSVG,
        badge: LogoSVG,
        body: `You have ${count} new invitation request.`,
        silent: true,
        onClick: () => {
          if (!window.closed) navigate(getInboxInvitesPath());
          noti.close();
        },
      });
    },
    [navigate]
  );

  const playSound = useCallback(() => {
    const audioElement = audioRef.current;
    audioElement?.play();
  }, []);

  useEffect(() => {
    if (invites.length > perviousInviteLen && syncState.phase === 'syncing') {
      if (showNotifications) {
        notify(invites.length - perviousInviteLen);
      }

      if (notificationSound) {
        playSound();
      }
    }
  }, [
    invites.length,
    perviousInviteLen,
    showNotifications,
    notificationSound,
    notify,
    playSound,
    syncState.phase,
  ]);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio ref={audioRef} style={{ display: 'none' }}>
      <source src={InviteSound} type="audio/ogg" />
    </audio>
  );
}

function MessageNotifications() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const notifRef = useRef<{ close: () => void }>();
  const unreadCacheRef = useRef<Map<string, UnreadCountView>>(new Map());
  const timelineTrackersRef = useRef<Map<string, TimelineTracker>>(new Map());
  const decryptionTimersRef = useRef<Map<string, { roomId: string; timer: number }>>(new Map());
  const notifiedEncryptedEventsRef = useRef<Map<string, Set<string>>>(new Map());
  const notificationSequenceRef = useRef(0);
  const mountedRef = useRef(true);
  const core = useCore();
  const session = useCoreSnapshot(core.auth.session);
  const userId = session?.userId;
  const preferences = useCoreSnapshot(core.notifications.preferences);
  const [showNotifications] = useSetting(settingsAtom, 'showNotifications');
  const [notificationSound] = useSetting(settingsAtom, 'isNotificationSounds');

  const navigate = useNavigate();
  const notificationSelected = useInboxNotificationsSelected();
  const selectedRoomId = useSelectedRoom();

  const notify = useCallback(
    ({
      roomName,
      roomAvatar,
      username,
      roomId,
      messagePreview,
      releaseAvatar,
    }: {
      roomName: string;
      roomAvatar?: string;
      username: string;
      roomId: string;
      messagePreview: string;
      releaseAvatar?: () => void;
    }) => {
      const noti = showNotification({
        title: roomName,
        icon: roomAvatar,
        badge: roomAvatar,
        body: `${username}: ${messagePreview}`,
        silent: true,
        tag: roomId,
        onClick: () => {
          if (!window.closed) navigate(getInboxNotificationsPath());
          noti.close();
          releaseAvatar?.();
          notifRef.current = undefined;
        },
      });

      notifRef.current?.close();
      notifRef.current = {
        close: () => {
          noti.close();
          releaseAvatar?.();
        },
      };
    },
    [navigate]
  );

  const notifyForEvent = useCallback(
    async (item: TimelineItem, room: RoomView) => {
      const { sender } = item;
      if (!sender || sender === userId) return;
      notificationSequenceRef.current += 1;
      const notificationSequence = notificationSequenceRef.current;
      const avatarMxc = room.dmAvatarMxc ?? room.avatarMxc;
      let roomAvatar: string | undefined;
      let releaseAvatar: (() => void) | undefined;
      if (avatarMxc) {
        const result = await core.media
          .resolve({ mxcUrl: avatarMxc, width: 96, height: 96, resizeMethod: 'crop' })
          .catch(() => undefined);
        if (result?.ok) {
          if (result.value.kind === 'blob') {
            const avatarUrl = URL.createObjectURL(result.value.blob);
            roomAvatar = avatarUrl;
            releaseAvatar = () => URL.revokeObjectURL(avatarUrl);
          } else {
            roomAvatar = result.value.url;
          }
        }
      }
      if (!mountedRef.current || notificationSequence !== notificationSequenceRef.current) {
        releaseAvatar?.();
        return;
      }

      const member = core.rooms
        .members(room.roomId)
        .getSnapshot()
        .value.find(({ userId: memberId }) => memberId === sender);
      const displayName = member?.rawDisplayName;
      notify({
        roomName: room.name ?? 'Unknown',
        roomAvatar,
        username:
          displayName && displayName !== sender ? displayName : getMxIdLocalPart(sender) ?? sender,
        roomId: room.roomId,
        messagePreview: getNotificationPreview(item),
        releaseAvatar,
      });
    },
    [core, notify, userId]
  );

  const notifyForTimelineItem = useCallback(
    (item: TimelineItem, room: RoomView) => {
      if (!isNotificationTimelineItem(item)) return;
      if (item.kind === 'encrypted') {
        const notified = notifiedEncryptedEventsRef.current.get(room.roomId) ?? new Set<string>();
        if (notified.has(item.eventId)) return;
        notified.add(item.eventId);
        notifiedEncryptedEventsRef.current.set(room.roomId, notified);
      }
      notifyForEvent(item, room).catch(() => undefined);
    },
    [notifyForEvent]
  );

  const playSound = useCallback(() => {
    const audioElement = audioRef.current;
    audioElement?.play();
  }, []);

  useEffect(() => {
    const decryptionTimers = decryptionTimersRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      decryptionTimers.forEach(({ timer }) => window.clearTimeout(timer));
      decryptionTimers.clear();
      notifRef.current?.close();
      notifRef.current = undefined;
    };
  }, [core]);

  useEffect(() => {
    const timelineSubscriptions = new Map<string, () => void>();
    const timelineTrackers = timelineTrackersRef.current;
    const notifiedEncryptedEvents = notifiedEncryptedEventsRef.current;

    const updateTimeline = (
      roomId: string,
      store: ReturnType<HarrierCore['timeline']['timeline']>
    ) => {
      const room = core.rooms.room(roomId).getSnapshot().value;
      const timeline = store.getSnapshot().value;
      const nextItems = new Map(timeline.items.map((item) => [item.eventId, item]));
      const previousTracker = timelineTrackersRef.current.get(roomId);
      const lastEventId = timeline.items[timeline.items.length - 1]?.eventId;

      // A missing tail means the shared core timeline was focused or replaced.
      // Treat its contents as history instead of notifying about old events.
      if (
        !previousTracker ||
        (previousTracker.lastEventId !== undefined && !nextItems.has(previousTracker.lastEventId))
      ) {
        timelineTrackersRef.current.set(roomId, {
          items: nextItems,
          lastIndex: timeline.items.length - 1,
          lastEventId,
        });
        return;
      }

      // TimelineView has no liveEvent flag: only appended ids are treated as live,
      // while pagination and focus changes initialise a new silent baseline.
      const newItems: TimelineItem[] = [];
      timeline.items.forEach((item, index) => {
        const previousItem = previousTracker.items.get(item.eventId);
        if (!previousItem && index > previousTracker.lastIndex) {
          newItems.push(item);
        }

        const pendingDecryption = decryptionTimersRef.current.get(item.eventId);
        if (
          room &&
          previousItem?.kind === 'encrypted' &&
          item.kind === 'message' &&
          showNotifications &&
          pendingDecryption
        ) {
          window.clearTimeout(pendingDecryption.timer);
          decryptionTimersRef.current.delete(item.eventId);
          notifyForTimelineItem(item, room);
        }
      });
      timelineTrackersRef.current.set(roomId, {
        items: nextItems,
        lastIndex: timeline.items.length - 1,
        lastEventId,
      });

      const notifiedEncrypted = notifiedEncryptedEventsRef.current.get(roomId);
      notifiedEncrypted?.forEach((eventId) => {
        if (!nextItems.has(eventId)) notifiedEncrypted.delete(eventId);
      });

      if (!room) return;
      newItems.forEach((item) => {
        if (core.auth.sync.getSnapshot().value.phase !== 'syncing') return;
        if (document.hasFocus() && (selectedRoomId === room.roomId || notificationSelected)) return;
        if (
          room.isSpace ||
          preferences.mute.includes(room.roomId) ||
          !isNotificationTimelineItem(item)
        ) {
          return;
        }
        if (!item.sender || !item.eventId || item.sender === userId) return;

        const unreadInfo = core.rooms.unreads
          .getSnapshot()
          .value.find(({ roomId: unreadRoomId }) => unreadRoomId === room.roomId)?.unread;
        if (!unreadInfo) return;
        const cachedUnreadInfo = unreadCacheRef.current.get(room.roomId);
        unreadCacheRef.current.set(room.roomId, unreadInfo);

        if (unreadInfo.total === 0) return;
        if (
          cachedUnreadInfo &&
          unreadEqual(unreadInfoToUnread(cachedUnreadInfo), unreadInfoToUnread(unreadInfo))
        ) {
          return;
        }

        if (showNotifications) {
          if (item.kind === 'encrypted') {
            const timer = window.setTimeout(() => {
              decryptionTimersRef.current.delete(item.eventId);
              const currentItem = store
                .getSnapshot()
                .value.items.find(({ eventId }) => eventId === item.eventId);
              if (currentItem?.kind === 'encrypted') {
                notifyForTimelineItem(currentItem, room);
              }
            }, 5000);
            decryptionTimersRef.current.set(item.eventId, { roomId, timer });
          } else {
            notifyForTimelineItem(item, room);
          }
        }

        if (notificationSound) {
          playSound();
        }
      });
    };

    const syncRooms = () => {
      const roomIds = new Set(core.rooms.list.getSnapshot().value.map((room) => room.roomId));
      timelineSubscriptions.forEach((unsubscribe, roomId) => {
        if (roomIds.has(roomId)) return;
        unsubscribe();
        timelineSubscriptions.delete(roomId);
        timelineTrackersRef.current.delete(roomId);
        notifiedEncryptedEventsRef.current.delete(roomId);
        decryptionTimersRef.current.forEach((pending, eventId) => {
          if (pending.roomId !== roomId) return;
          window.clearTimeout(pending.timer);
          decryptionTimersRef.current.delete(eventId);
        });
      });
      roomIds.forEach((roomId) => {
        if (timelineSubscriptions.has(roomId)) return;
        const store = core.timeline.timeline(roomId);
        const update = () => updateTimeline(roomId, store);
        update();
        timelineSubscriptions.set(roomId, store.subscribe(update));
      });
    };

    syncRooms();
    const unsubscribeRooms = core.rooms.list.subscribe(syncRooms);
    return () => {
      unsubscribeRooms();
      timelineSubscriptions.forEach((unsubscribe) => unsubscribe());
      timelineTrackers.clear();
      notifiedEncryptedEvents.clear();
    };
  }, [
    core,
    notificationSound,
    notificationSelected,
    notifyForTimelineItem,
    playSound,
    preferences,
    selectedRoomId,
    showNotifications,
    userId,
  ]);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio ref={audioRef} style={{ display: 'none' }}>
      <source src={NotificationSound} type="audio/ogg" />
    </audio>
  );
}

type ClientNonUIFeaturesProps = {
  children: ReactNode;
};

export function ClientNonUIFeatures({ children }: ClientNonUIFeaturesProps) {
  return (
    <>
      <SystemEmojiFeature />
      <PageZoomFeature />
      <FaviconUpdater />
      <InviteNotifications />
      <MessageNotifications />
      <CustomStatusRestore />
      <AutoRestoreBackup />
      <RetryDecryption />
      <DesktopFeatures />
      {children}
    </>
  );
}
