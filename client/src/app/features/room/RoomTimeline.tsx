/* eslint-disable react/destructuring-assignment */
import React, {
  MouseEventHandler,
  RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EventTimelineSet, MatrixEvent, MsgType, Room } from 'matrix-js-sdk';
import { HTMLReactParserOptions } from 'html-react-parser';
import classNames from 'classnames';
import { ReactEditor } from 'slate-react';
import { Editor } from 'slate';
import { useAtomValue, useSetAtom } from 'jotai';
import type { TimelineItem } from '@harrier/core';
import {
  Badge,
  Box,
  Chip,
  ContainerColor,
  Icon,
  Icons,
  Line,
  Scroll,
  Text,
  as,
  color,
  config,
  toRem,
} from 'folds';
import { isKeyHotkey } from 'is-hotkey';
import { Opts as LinkifyOpts } from 'linkifyjs';
import { useTranslation } from 'react-i18next';
import { eventWithShortcode, factoryEventSentBy, getMxIdLocalPart } from '../../utils/matrix';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useDsTaskBotSettings } from '../../state/dsTaskBot';
import { parseBotMessage } from '../ds-task-bot/parser';
import {
  isBotCommandMessage,
  isBotServiceReply,
  isCollapseAllowed,
  isDirectRoomWithBot,
} from '../ds-task-bot/helpers';
import { DsTaskBotCards } from '../ds-task-bot/DsTaskBotCards';
import { CollapsedBotCommand } from '../ds-task-bot/CollapsedBotCommand';
import { useVirtualPaginator, ItemRange } from '../../hooks/useVirtualPaginator';
import { useAlive } from '../../hooks/useAlive';
import { editableActiveElement, scrollToBottom } from '../../utils/dom';
import {
  DefaultPlaceholder,
  CompactPlaceholder,
  Reply,
  MessageBase,
  MessageUnsupportedContent,
  Time,
  MessageNotDecryptedContent,
  RedactedContent,
  MSticker,
  ImageContent,
  EventContent,
} from '../../components/message';
import {
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  makeMentionCustomProps,
  renderMatrixMention,
} from '../../plugins/react-custom-html-parser';
import {
  getEventReactions,
  getMemberDisplayName,
  getReactionContent,
  isMembershipContentChanged,
} from '../../utils/room';
import { isVisibleTimelineItem } from '../../utils/timelineVisibility';
import { sendEventSafely } from '../../utils/send';
import { useSetting } from '../../state/hooks/settings';
import { MessageLayout, settingsAtom } from '../../state/settings';
import { useMatrixEventRenderer } from '../../hooks/useMatrixEventRenderer';
import { Reactions, Message, Event, EncryptedContent } from './message';
import { useMemberEventParser } from '../../hooks/useMemberEventParser';
import * as customHtmlCss from '../../styles/CustomHtml.css';
import { RoomIntro } from '../../components/room-intro';
import {
  getIntersectionObserverEntry,
  useIntersectionObserver,
} from '../../hooks/useIntersectionObserver';
import { markAsRead } from '../../utils/notifications';
import { useDebounce } from '../../hooks/useDebounce';
import { getResizeObserverEntry, useResizeObserver } from '../../hooks/useResizeObserver';
import * as css from './RoomTimeline.css';
import { inSameDay, minuteDifference, timeDayMonthYear, today, yesterday } from '../../utils/time';
import { createMentionElement, isEmptyEditor, moveCursor } from '../../components/editor';
import { roomIdToReplyDraftAtomFamily } from '../../state/room/roomInputDrafts';
import { usePowerLevelsContext } from '../../hooks/usePowerLevels';
import { GetContentCallback, MessageEvent, StateEvent } from '../../../types/matrix/room';
import { IImageContent } from '../../../types/matrix/common';
import { useKeyDown } from '../../hooks/useKeyDown';
import { useDocumentFocusChange } from '../../hooks/useDocumentFocusChange';
import { RenderMessageContent } from '../../components/RenderMessageContent';
import { requestRoomKey } from '../../utils/keyRequest';
import { useOpenSettingsPage } from '../../state/settingsNav';
import { SettingsPages } from '../../features/settings';
import { Image } from '../../components/media';
import { ImageViewer } from '../../components/image-viewer';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { useRoomUnread } from '../../state/hooks/unread';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';
import { useMentionClickHandler } from '../../hooks/useMentionClickHandler';
import { useSpoilerClickHandler } from '../../hooks/useSpoilerClickHandler';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useIgnoredUsers } from '../../hooks/useIgnoredUsers';
import { useImagePackRooms } from '../../hooks/useImagePackRooms';
import { useIsDirectRoom } from '../../hooks/useRoom';
import { useOpenUserRoomProfile } from '../../state/hooks/userRoomProfile';
import { useSpaceOptionally } from '../../hooks/useSpace';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { useAccessiblePowerTagColors, useGetMemberPowerTag } from '../../hooks/useMemberPowerTag';
import { useTheme } from '../../hooks/useTheme';
import { useRoomCreatorsTag } from '../../hooks/useRoomCreatorsTag';
import { usePowerLevelTags } from '../../hooks/usePowerLevelTags';
import { useCore } from '../../hooks/useCore';
import {
  clearCoreTimelineFocus,
  focusCoreEvent,
  paginateCoreTimelineBackward,
  paginateCoreTimelineForward,
  useCoreTimeline,
} from '../../hooks/useCoreTimeline';

const TimelineFloat = as<'div', css.TimelineFloatVariants>(
  ({ position, className, ...props }, ref) => (
    <Box
      className={classNames(css.TimelineFloat({ position }), className)}
      justifyContent="Center"
      alignItems="Center"
      gap="200"
      {...props}
      ref={ref}
    />
  )
);

const TimelineDivider = as<'div', { variant?: ContainerColor | 'Inherit' }>(
  ({ variant, children, ...props }, ref) => (
    <Box gap="100" justifyContent="Center" alignItems="Center" {...props} ref={ref}>
      <Line style={{ flexGrow: 1 }} variant={variant} size="300" />
      {children}
      <Line style={{ flexGrow: 1 }} variant={variant} size="300" />
    </Box>
  )
);

type RoomTimelineProps = {
  room: Room;
  eventId?: string;
  roomInputRef: RefObject<HTMLElement>;
  editor: Editor;
};

const PAGINATION_LIMIT = 80;

const itemTimelineType = (item: TimelineItem): string => {
  if (item.kind === 'state' || item.kind === 'unsupported') return item.eventType;
  if (item.kind === 'sticker') return 'm.sticker';
  if (item.kind === 'encrypted') return 'm.room.encrypted';
  if (item.kind === 'redacted') return 'm.room.message';
  return 'm.room.message';
};

const isEditableItem = (item: TimelineItem, myUserId: string | null | undefined): boolean =>
  item.kind === 'message' &&
  item.sender === myUserId &&
  (item.content.msgtype === MsgType.Text ||
    item.content.msgtype === MsgType.Emote ||
    item.content.msgtype === MsgType.Notice);

export function RoomTimeline({ room, eventId, roomInputRef, editor }: RoomTimelineProps) {
  const mx = useMatrixClient();
  const dsTaskBotSettings = useDsTaskBotSettings();
  const openSettingsPage = useOpenSettingsPage();
  const useAuthentication = useMediaAuthentication();
  const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
  const [messageLayout] = useSetting(settingsAtom, 'messageLayout');
  const [messageSpacing] = useSetting(settingsAtom, 'messageSpacing');
  const [legacyUsernameColor] = useSetting(settingsAtom, 'legacyUsernameColor');
  const direct = useIsDirectRoom();
  const botCollapseAllowed = isCollapseAllowed(
    direct,
    isDirectRoomWithBot(room, dsTaskBotSettings.botMxid)
  );
  const [roomReadReceipts] = useSetting(settingsAtom, 'roomReadReceipts');
  const [directReadReceipts] = useSetting(settingsAtom, 'directReadReceipts');
  const showReadReceiptAvatars = direct
    ? directReadReceipts === 'avatars'
    : roomReadReceipts === 'avatars';
  const itemReactions = (timelineItem: TimelineItem) =>
    timelineItem.kind === 'message' ? timelineItem.reactions : undefined;
  const getReadReceiptUsers = (timelineItem: TimelineItem): string[] | undefined => {
    if (!showReadReceiptAvatars || timelineItem.kind !== 'message') return undefined;
    return timelineItem.readBy ? [...timelineItem.readBy] : undefined;
  };
  const [hideMembershipEvents] = useSetting(settingsAtom, 'hideMembershipEvents');
  const [hideNickAvatarEvents] = useSetting(settingsAtom, 'hideNickAvatarEvents');
  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [urlPreview] = useSetting(settingsAtom, 'urlPreview');
  const [encUrlPreview] = useSetting(settingsAtom, 'encUrlPreview');
  const showUrlPreview = room.hasEncryptionStateEvent() ? encUrlPreview : urlPreview;
  const [showHiddenEvents] = useSetting(settingsAtom, 'showHiddenEvents');
  const [showDeveloperTools] = useSetting(settingsAtom, 'developerTools');

  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

  const ignoredUsersList = useIgnoredUsers();
  const ignoredUsersSet = useMemo(() => new Set(ignoredUsersList), [ignoredUsersList]);

  const setReplyDraft = useSetAtom(roomIdToReplyDraftAtomFamily(room.roomId));
  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);

  const creatorsTag = useRoomCreatorsTag();
  const powerLevelTags = usePowerLevelTags(room, powerLevels);
  const getMemberPowerTag = useGetMemberPowerTag(room, creators, powerLevels);

  const theme = useTheme();
  const accessiblePowerTagColors = useAccessiblePowerTagColors(
    theme.kind,
    creatorsTag,
    powerLevelTags
  );

  const permissions = useRoomPermissions(creators, powerLevels);

  const canRedact = permissions.action('redact', mx.getSafeUserId());
  const canDeleteOwn = permissions.event(MessageEvent.RoomRedaction, mx.getSafeUserId());
  const canSendReaction = permissions.event(MessageEvent.Reaction, mx.getSafeUserId());
  const canPinEvent = permissions.stateEvent(StateEvent.RoomPinnedEvents, mx.getSafeUserId());
  const [editId, setEditId] = useState<string>();

  const roomToParents = useAtomValue(roomToParentsAtom);
  const unread = useRoomUnread(room.roomId, roomToUnreadAtom);
  const { navigateRoom } = useRoomNavigate();
  const mentionClickHandler = useMentionClickHandler(room.roomId);
  const spoilerClickHandler = useSpoilerClickHandler();
  const openUserRoomProfile = useOpenUserRoomProfile();
  const space = useSpaceOptionally();

  const imagePackRooms: Room[] = useImagePackRooms(room.roomId, roomToParents);

  const core = useCore();
  const timelineView = useCoreTimeline(room.roomId);

  const [unreadInfo, setUnreadInfo] = useState<
    | {
        readUptoEventId: string;
        inLiveTimeline: boolean;
        scrollTo: boolean;
      }
    | undefined
  >(() => {
    const readUptoEventId = timelineView.readUpTo;
    if (!readUptoEventId) return undefined;
    return {
      readUptoEventId,
      inLiveTimeline: timelineView.focusedEventId === undefined,
      scrollTo: true,
    };
  });
  const readUptoEventIdRef = useRef<string>();
  if (unreadInfo) {
    readUptoEventIdRef.current = unreadInfo.readUptoEventId;
  }

  const atBottomAnchorRef = useRef<HTMLElement>(null);
  const [atBottom, setAtBottom] = useState<boolean>(true);
  const atBottomRef = useRef(atBottom);
  atBottomRef.current = atBottom;

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollToBottomRef = useRef({
    count: 0,
    smooth: true,
  });

  const [focusItem, setFocusItem] = useState<
    | {
        index: number;
        scrollTo: boolean;
        highlight: boolean;
      }
    | undefined
  >();
  const alive = useAlive();

  const linkifyOpts = useMemo<LinkifyOpts>(
    () => ({
      ...LINKIFY_OPTS,
      render: factoryRenderLinkifyWithMention((href) =>
        renderMatrixMention(mx, room.roomId, href, makeMentionCustomProps(mentionClickHandler))
      ),
    }),
    [mx, room, mentionClickHandler]
  );
  const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
    () =>
      getReactCustomHtmlParser(mx, room.roomId, {
        linkifyOpts,
        useAuthentication,
        handleSpoilerClick: spoilerClickHandler,
        handleMentionClick: mentionClickHandler,
      }),
    [mx, room, linkifyOpts, spoilerClickHandler, mentionClickHandler, useAuthentication]
  );
  const parseMemberEvent = useMemberEventParser();

  const { items } = timelineView;
  const eventsLength = items.length;
  const liveTimelineLinked = timelineView.focusedEventId === undefined;
  const canPaginateBack = timelineView.hasBackwardHistory;
  const [range, setRange] = useState<ItemRange>(() => ({ start: 0, end: 0 }));

  const rangeAtStart = range.start === 0;
  const rangeAtEnd = range.end === eventsLength;
  const atLiveEndRef = useRef(liveTimelineLinked && rangeAtEnd);
  atLiveEndRef.current = liveTimelineLinked && rangeAtEnd;

  // Initialise the visible window on the last page of the chain.
  const initialisedRef = useRef(false);
  useEffect(() => {
    if (initialisedRef.current) return;
    if (eventsLength === 0) return;
    initialisedRef.current = true;
    setRange({ start: Math.max(eventsLength - PAGINATION_LIMIT, 0), end: eventsLength });
  }, [eventsLength]);

  // Keep the window pointing at the same items when pagination
  // prepends older events, and extend it when new events arrive
  // while the window already reached the end.
  const prevChainRef = useRef<{
    length: number;
    firstId: string | undefined;
    lastId: string | undefined;
    focusedId: string | undefined;
  }>({
    length: 0,
    firstId: undefined,
    lastId: undefined,
    focusedId: undefined,
  });
  useEffect(() => {
    const firstId = items[0]?.eventId;
    const lastId = items[items.length - 1]?.eventId;
    const prev = prevChainRef.current;
    const focusedId = timelineView.focusedEventId;
    if (prev.length !== 0 && eventsLength !== prev.length && focusedId === prev.focusedId) {
      const prepended =
        prev.firstId !== undefined && firstId !== prev.firstId && lastId === prev.lastId;
      if (prepended) {
        const delta = eventsLength - prev.length;
        setRange((r) => ({ start: r.start + delta, end: r.end + delta }));
      } else if (range.end === prev.length) {
        setRange((r) => ({ start: r.start, end: r.end + (eventsLength - prev.length) }));
      }
    }
    prevChainRef.current = { length: eventsLength, firstId, lastId, focusedId };
  }, [items, eventsLength, timelineView.focusedEventId, range.end]);

  const handleTimelinePagination = useCallback(
    async (backwards: boolean) => {
      try {
        if (backwards) {
          await paginateCoreTimelineBackward(core, room.roomId, PAGINATION_LIMIT);
        } else {
          await paginateCoreTimelineForward(core, room.roomId, PAGINATION_LIMIT);
        }
      } catch {
        // Keep the current window on pagination errors.
      }
    },
    [core, room.roomId]
  );

  const getScrollElement = useCallback(() => scrollRef.current, []);

  const { getItems, scrollToItem, scrollToElement, observeBackAnchor, observeFrontAnchor } =
    useVirtualPaginator({
      count: eventsLength,
      limit: PAGINATION_LIMIT,
      range,
      onRangeChange: setRange,
      getScrollElement,
      getItemElement: useCallback(
        (index: number) =>
          (scrollRef.current?.querySelector(`[data-message-item="${index}"]`) as HTMLElement) ??
          undefined,
        []
      ),
      onEnd: handleTimelinePagination,
    });

  const loadEventTimeline = useCallback(
    async (evtId: string) => {
      try {
        const index = await focusCoreEvent(core, room.roomId, evtId);
        if (!alive()) return;
        const len = core.timeline.timeline(room.roomId).getSnapshot().value.items.length;
        setFocusItem({
          index,
          scrollTo: true,
          highlight: evtId !== readUptoEventIdRef.current,
        });
        setRange({
          start: Math.max(index - PAGINATION_LIMIT, 0),
          end: Math.min(index + PAGINATION_LIMIT, len),
        });
      } catch {
        if (!alive()) return;
        clearCoreTimelineFocus(core, room.roomId);
        scrollToBottomRef.current.count += 1;
        scrollToBottomRef.current.smooth = false;
      }
    },
    [alive, core, room.roomId]
  );

  // Live items arrive through the core timeline subscription.
  // Mirror the old live-arrive behaviour: conditionally mark as read,
  // track unread info, and scroll to the bottom while at the live end.
  const lastItemIdRef = useRef<string | undefined>();
  useEffect(() => {
    const last = items[items.length - 1];
    if (!last?.eventId || last.eventId === lastItemIdRef.current) return;
    const isFirst = lastItemIdRef.current === undefined;
    lastItemIdRef.current = last.eventId;
    if (isFirst || !liveTimelineLinked) return;
    const refreshUnreadInfo = () => {
      const readUptoEventId = timelineView.readUpTo;
      if (readUptoEventId) {
        setUnreadInfo({ readUptoEventId, inLiveTimeline: true, scrollTo: false });
      }
    };
    if (atBottomRef.current) {
      if (document.hasFocus() && (!unreadInfo || last.sender === mx.getUserId())) {
        requestAnimationFrame(() => markAsRead(mx, last.roomId, hideActivity));
      }
      if (!document.hasFocus() && !unreadInfo) {
        refreshUnreadInfo();
      }
      scrollToBottomRef.current.count += 1;
      scrollToBottomRef.current.smooth = true;
    } else if (!unreadInfo) {
      refreshUnreadInfo();
    }
  }, [items, liveTimelineLinked, mx, hideActivity, unreadInfo, timelineView.readUpTo]);

  const handleOpenEvent = useCallback(
    async (
      evtId: string,
      highlight = true,
      onScroll: ((scrolled: boolean) => void) | undefined = undefined
    ) => {
      const absoluteIndex = items.findIndex((timelineItem) => timelineItem.eventId === evtId);

      if (absoluteIndex >= 0) {
        const scrolled = scrollToItem(absoluteIndex, {
          behavior: 'smooth',
          align: 'center',
          stopInView: true,
        });
        if (onScroll) onScroll(scrolled);
        setFocusItem({
          index: absoluteIndex,
          scrollTo: false,
          highlight,
        });
      } else {
        setRange({ start: 0, end: 0 });
        await loadEventTimeline(evtId);
      }
    },
    [items, scrollToItem, loadEventTimeline]
  );

  // Stay at bottom when room editor resize
  useResizeObserver(
    useMemo(() => {
      let mounted = false;
      return (entries) => {
        if (!mounted) {
          // skip initial mounting call
          mounted = true;
          return;
        }
        if (!roomInputRef.current) return;
        const editorBaseEntry = getResizeObserverEntry(roomInputRef.current, entries);
        const scrollElement = getScrollElement();
        if (!editorBaseEntry || !scrollElement) return;

        if (atBottomRef.current) {
          scrollToBottom(scrollElement);
        }
      };
    }, [getScrollElement, roomInputRef]),
    useCallback(() => roomInputRef.current, [roomInputRef])
  );

  const tryAutoMarkAsRead = useCallback(() => {
    const readUptoEventId = readUptoEventIdRef.current;
    if (!readUptoEventId) {
      requestAnimationFrame(() => markAsRead(mx, room.roomId, hideActivity));
      return;
    }
    const inCurrentChain = items.some((timelineItem) => timelineItem.eventId === readUptoEventId);
    if (inCurrentChain && liveTimelineLinked) {
      requestAnimationFrame(() => markAsRead(mx, room.roomId, hideActivity));
    }
  }, [items, liveTimelineLinked, mx, room.roomId, hideActivity]);

  const debounceSetAtBottom = useDebounce(
    useCallback((entry: IntersectionObserverEntry) => {
      if (!entry.isIntersecting) setAtBottom(false);
    }, []),
    { wait: 1000 }
  );
  useIntersectionObserver(
    useCallback(
      (entries) => {
        const target = atBottomAnchorRef.current;
        if (!target) return;
        const targetEntry = getIntersectionObserverEntry(target, entries);
        if (targetEntry) debounceSetAtBottom(targetEntry);
        if (targetEntry?.isIntersecting && atLiveEndRef.current) {
          setAtBottom(true);
          if (document.hasFocus()) {
            tryAutoMarkAsRead();
          }
        }
      },
      [debounceSetAtBottom, tryAutoMarkAsRead]
    ),
    useCallback(
      () => ({
        root: getScrollElement(),
        rootMargin: '100px',
      }),
      [getScrollElement]
    ),
    useCallback(() => atBottomAnchorRef.current, [])
  );

  useDocumentFocusChange(
    useCallback(
      (inFocus) => {
        if (inFocus && atBottomRef.current) {
          if (unreadInfo?.inLiveTimeline) {
            handleOpenEvent(unreadInfo.readUptoEventId, false, (scrolled) => {
              // the unread event is already in view
              // so, try mark as read;
              if (!scrolled) {
                tryAutoMarkAsRead();
              }
            });
            return;
          }
          tryAutoMarkAsRead();
        }
      },
      [tryAutoMarkAsRead, unreadInfo, handleOpenEvent]
    )
  );

  // Handle up arrow edit
  useKeyDown(
    window,
    useCallback(
      (evt) => {
        if (
          isKeyHotkey('arrowup', evt) &&
          editableActiveElement() &&
          document.activeElement?.getAttribute('data-editable-name') === 'RoomInput' &&
          isEmptyEditor(editor)
        ) {
          const editableItem = [...items]
            .reverse()
            .find((timelineItem) => isEditableItem(timelineItem, mx.getUserId()));
          const editableEvtId = editableItem?.eventId;
          if (!editableEvtId) return;
          setEditId(editableEvtId);
          evt.preventDefault();
        }
      },
      [items, mx, editor]
    )
  );

  useEffect(() => {
    if (eventId) {
      setRange({ start: 0, end: 0 });
      loadEventTimeline(eventId);
    }
  }, [eventId, loadEventTimeline]);

  // Scroll to bottom on initial timeline load
  useLayoutEffect(() => {
    const scrollEl = scrollRef.current;
    if (scrollEl) {
      scrollToBottom(scrollEl);
    }
  }, []);

  // if live timeline is linked and unreadInfo change
  // Scroll to last read message
  useLayoutEffect(() => {
    const { readUptoEventId, inLiveTimeline, scrollTo } = unreadInfo ?? {};
    if (readUptoEventId && inLiveTimeline && scrollTo) {
      const absoluteIndex = items.findIndex(
        (timelineItem) => timelineItem.eventId === readUptoEventId
      );
      if (absoluteIndex >= 0) {
        scrollToItem(absoluteIndex, {
          behavior: 'instant',
          align: 'start',
          stopInView: true,
        });
      }
    }
  }, [items, unreadInfo, scrollToItem]);

  // scroll to focused message
  useLayoutEffect(() => {
    if (focusItem && focusItem.scrollTo) {
      scrollToItem(focusItem.index, {
        behavior: 'instant',
        align: 'center',
        stopInView: true,
      });
    }

    setTimeout(() => {
      if (!alive()) return;
      setFocusItem((currentItem) => {
        if (currentItem === focusItem) return undefined;
        return currentItem;
      });
    }, 2000);
  }, [alive, focusItem, scrollToItem]);

  // scroll to bottom of timeline
  const scrollToBottomCount = scrollToBottomRef.current.count;
  useLayoutEffect(() => {
    if (scrollToBottomCount > 0) {
      const scrollEl = scrollRef.current;
      if (scrollEl)
        scrollToBottom(scrollEl, scrollToBottomRef.current.smooth ? 'smooth' : 'instant');
    }
  }, [scrollToBottomCount]);

  // Remove unreadInfo on mark as read
  useEffect(() => {
    if (!unread) {
      setUnreadInfo(undefined);
    }
  }, [unread]);

  // scroll out of view msg editor in view.
  useEffect(() => {
    if (editId) {
      const editMsgElement =
        (scrollRef.current?.querySelector(`[data-message-id="${editId}"]`) as HTMLElement) ??
        undefined;
      if (editMsgElement) {
        scrollToElement(editMsgElement, {
          align: 'center',
          behavior: 'smooth',
          stopInView: true,
        });
      }
    }
  }, [scrollToElement, editId]);

  const handleJumpToLatest = () => {
    if (eventId) {
      navigateRoom(room.roomId, undefined, { replace: true });
    }
    clearCoreTimelineFocus(core, room.roomId);
    scrollToBottomRef.current.count += 1;
    scrollToBottomRef.current.smooth = false;
  };

  const handleJumpToUnread = () => {
    if (unreadInfo?.readUptoEventId) {
      setRange({ start: 0, end: 0 });
      loadEventTimeline(unreadInfo.readUptoEventId);
    }
  };

  const handleMarkAsRead = () => {
    markAsRead(mx, room.roomId, hideActivity);
  };

  const handleOpenReply: MouseEventHandler = useCallback(
    async (evt) => {
      const targetId = evt.currentTarget.getAttribute('data-event-id');
      if (!targetId) return;
      handleOpenEvent(targetId);
    },
    [handleOpenEvent]
  );

  const handleUserClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      const userId = evt.currentTarget.getAttribute('data-user-id');
      if (!userId) {
        console.warn('Button should have "data-user-id" attribute!');
        return;
      }
      openUserRoomProfile(
        room.roomId,
        space?.roomId,
        userId,
        evt.currentTarget.getBoundingClientRect()
      );
    },
    [room, space, openUserRoomProfile]
  );
  const handleUsernameClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      evt.preventDefault();
      const userId = evt.currentTarget.getAttribute('data-user-id');
      if (!userId) {
        console.warn('Button should have "data-user-id" attribute!');
        return;
      }
      const name = getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId;
      editor.insertNode(
        createMentionElement(
          userId,
          name.startsWith('@') ? name : `@${name}`,
          userId === mx.getUserId()
        )
      );
      ReactEditor.focus(editor);
      moveCursor(editor);
    },
    [mx, room, editor]
  );

  const handleReplyClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt, startThread = false) => {
      const replyId = evt.currentTarget.getAttribute('data-event-id');
      if (!replyId) {
        console.warn('Button should have "data-event-id" attribute!');
        return;
      }
      const applyDraft = (item: TimelineItem | null) => {
        if (!item || (item.kind !== 'message' && item.kind !== 'sticker')) return;
        const { body } = item.content;
        if (typeof body !== 'string') return;
        const formattedBody = item.kind === 'message' ? item.content.formattedBody : undefined;
        setReplyDraft({
          userId: item.sender,
          eventId: replyId,
          body,
          formattedBody,
          relation: startThread ? { rel_type: 'm.thread', event_id: replyId } : undefined,
        });
        setTimeout(() => ReactEditor.focus(editor), 100);
      };
      const localItem = timelineView.items.find((entry) => entry.eventId === replyId);
      if (localItem) {
        applyDraft(localItem);
        return;
      }
      core.timeline.event(room.roomId, replyId).then((result) => {
        if (result.ok) applyDraft(result.value);
      });
    },
    [core, room, setReplyDraft, editor, timelineView.items]
  );

  const handleReactionToggle = useCallback(
    (targetEventId: string, key: string, shortcode?: string) => {
      const relations = getEventReactions(room.getUnfilteredTimelineSet(), targetEventId);
      const allReactions = relations?.getSortedAnnotationsByKey() ?? [];
      const [, reactionsSet] = allReactions.find(([k]) => k === key) ?? [];
      const reactions = reactionsSet ? Array.from(reactionsSet) : [];
      const myReaction = reactions.find(factoryEventSentBy(mx.getUserId()!));

      if (myReaction && !!myReaction?.isRelation()) {
        mx.redactEvent(room.roomId, myReaction.getId()!);
        return;
      }
      const rShortcode =
        shortcode ||
        (reactions.find(eventWithShortcode)?.getContent().shortcode as string | undefined);
      sendEventSafely(
        mx,
        room.roomId,
        MessageEvent.Reaction as any,
        getReactionContent(targetEventId, key, rShortcode)
      );
    },
    [mx, room]
  );
  const handleEdit = useCallback(
    (editEvtId?: string) => {
      if (editEvtId) {
        setEditId(editEvtId);
        return;
      }
      setEditId(undefined);
      ReactEditor.focus(editor);
    },
    [editor]
  );
  const { t } = useTranslation();

  const renderMatrixEvent = useMatrixEventRenderer<
    [string, MatrixEvent, number, EventTimelineSet, boolean, TimelineItem]
  >(
    {
      [MessageEvent.RoomMessage]: (mEventId, mEvent, item, timelineSet, collapse, timelineItem) => {
        const replyEventId = timelineItem.kind === 'message' ? timelineItem.replyTo : undefined;
        const threadRootId = timelineItem.kind === 'message' ? timelineItem.threadRoot : undefined;
        const highlighted = focusItem?.index === item && focusItem.highlight;

        const itemContent = timelineItem.kind === 'message' ? timelineItem.content : undefined;
        const showEditedInline =
          timelineItem.kind === 'message' &&
          timelineItem.edited === true &&
          messageLayout !== MessageLayout.Bubble;
        const getContent = (() => itemContent?.raw ?? mEvent.getContent()) as GetContentCallback;

        const senderId = timelineItem.sender;
        const senderDisplayName =
          getMemberDisplayName(room, senderId) ?? getMxIdLocalPart(senderId) ?? senderId;

        const dsBotMxid = dsTaskBotSettings.botMxid;
        const parsedBotContent =
          dsTaskBotSettings.cardsEnabled &&
          dsBotMxid !== '' &&
          senderId === dsBotMxid &&
          timelineItem.kind === 'message'
            ? parseBotMessage(timelineItem, dsBotMxid)
            : null;

        return (
          <Message
            key={timelineItem.eventId}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            timelineItem={timelineItem}
            messageSpacing={messageSpacing}
            messageLayout={messageLayout}
            collapse={collapse}
            highlight={highlighted}
            edit={editId === mEventId}
            edited={timelineItem.kind === 'message' && timelineItem.edited === true}
            canDelete={canRedact || (canDeleteOwn && timelineItem.sender === mx.getUserId())}
            canSendReaction={canSendReaction}
            canPinEvent={canPinEvent}
            imagePackRooms={imagePackRooms}
            reactionCounts={itemReactions(timelineItem)}
            onUserClick={handleUserClick}
            onUsernameClick={handleUsernameClick}
            onReplyClick={handleReplyClick}
            onReactionToggle={handleReactionToggle}
            onEditId={handleEdit}
            reply={
              replyEventId && (
                <Reply
                  room={room}
                  replyEventId={replyEventId}
                  replyItem={items.find((entry) => entry.eventId === replyEventId)}
                  threadRootId={threadRootId}
                  onClick={handleOpenReply}
                  getMemberPowerTag={getMemberPowerTag}
                  accessibleTagColors={accessiblePowerTagColors}
                  legacyUsernameColor={legacyUsernameColor || direct}
                />
              )
            }
            reactions={
              (itemReactions(timelineItem)?.length ?? 0) > 0 && (
                <Reactions
                  style={{ marginTop: config.space.S200 }}
                  room={room}
                  reactions={itemReactions(timelineItem) ?? []}
                  mEventId={mEventId}
                  canSendReaction={canSendReaction}
                  onReactionToggle={handleReactionToggle}
                />
              )
            }
            hideReadReceipts={hideActivity}
            readReceiptUsers={getReadReceiptUsers(timelineItem)}
            showDeveloperTools={showDeveloperTools}
            memberPowerTag={getMemberPowerTag(senderId)}
            accessibleTagColors={accessiblePowerTagColors}
            legacyUsernameColor={legacyUsernameColor || direct}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          >
            {(() => {
              if (timelineItem.kind === 'redacted') {
                return (
                  <RedactedContent reason={mEvent.getUnsigned().redacted_because?.content.reason} />
                );
              }
              const messageContent = (
                <RenderMessageContent
                  displayName={senderDisplayName}
                  msgType={itemContent?.msgtype ?? mEvent.getContent().msgtype ?? ''}
                  ts={timelineItem.timestamp}
                  edited={showEditedInline}
                  getContent={getContent}
                  mediaAutoLoad={mediaAutoLoad}
                  urlPreview={showUrlPreview}
                  htmlReactParserOptions={htmlReactParserOptions}
                  linkifyOpts={linkifyOpts}
                  outlineAttachment={messageLayout === MessageLayout.Bubble}
                />
              );

              if (parsedBotContent && mx.getUserId()) {
                const botCards = (
                  <DsTaskBotCards
                    parsed={parsedBotContent}
                    mx={mx}
                    roomId={room.roomId}
                    myUserId={mx.getUserId() ?? ''}
                    botMxid={dsBotMxid}
                    dm={direct}
                    eventId={mEventId}
                  />
                );
                if (parsedBotContent.origin === 'envelope' && parsedBotContent.kind === 'file') {
                  return (
                    <Box direction="Column" gap="200">
                      {botCards}
                      {messageContent}
                    </Box>
                  );
                }
                return botCards;
              }
              return messageContent;
            })()}
          </Message>
        );
      },
      [MessageEvent.RoomMessageEncrypted]: (
        mEventId,
        mEvent,
        item,
        timelineSet,
        collapse,
        timelineItem
      ) => {
        const replyEventId = timelineItem.kind === 'message' ? timelineItem.replyTo : undefined;
        const threadRootId = timelineItem.kind === 'message' ? timelineItem.threadRoot : undefined;
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const showEditedInline =
          timelineItem.kind === 'message' &&
          timelineItem.edited === true &&
          messageLayout !== MessageLayout.Bubble;

        return (
          <Message
            key={timelineItem.eventId}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            timelineItem={timelineItem}
            messageSpacing={messageSpacing}
            messageLayout={messageLayout}
            collapse={collapse}
            highlight={highlighted}
            edit={editId === mEventId}
            edited={timelineItem.kind === 'message' && timelineItem.edited === true}
            canDelete={canRedact || (canDeleteOwn && timelineItem.sender === mx.getUserId())}
            canSendReaction={canSendReaction}
            canPinEvent={canPinEvent}
            imagePackRooms={imagePackRooms}
            reactionCounts={itemReactions(timelineItem)}
            onUserClick={handleUserClick}
            onUsernameClick={handleUsernameClick}
            onReplyClick={handleReplyClick}
            onReactionToggle={handleReactionToggle}
            onEditId={handleEdit}
            reply={
              replyEventId && (
                <Reply
                  room={room}
                  replyEventId={replyEventId}
                  replyItem={items.find((entry) => entry.eventId === replyEventId)}
                  threadRootId={threadRootId}
                  onClick={handleOpenReply}
                  getMemberPowerTag={getMemberPowerTag}
                  accessibleTagColors={accessiblePowerTagColors}
                  legacyUsernameColor={legacyUsernameColor || direct}
                />
              )
            }
            reactions={
              (itemReactions(timelineItem)?.length ?? 0) > 0 && (
                <Reactions
                  style={{ marginTop: config.space.S200 }}
                  room={room}
                  reactions={itemReactions(timelineItem) ?? []}
                  mEventId={mEventId}
                  canSendReaction={canSendReaction}
                  onReactionToggle={handleReactionToggle}
                />
              )
            }
            hideReadReceipts={hideActivity}
            readReceiptUsers={getReadReceiptUsers(timelineItem)}
            showDeveloperTools={showDeveloperTools}
            memberPowerTag={getMemberPowerTag(timelineItem.sender)}
            accessibleTagColors={accessiblePowerTagColors}
            legacyUsernameColor={legacyUsernameColor || direct}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          >
            <EncryptedContent mEvent={mEvent}>
              {() => {
                if (timelineItem.kind === 'redacted') return <RedactedContent />;
                if (timelineItem.kind === 'sticker')
                  return (
                    <MSticker
                      content={timelineItem.content as unknown as IImageContent}
                      renderImageContent={(props) => (
                        <ImageContent
                          {...props}
                          autoPlay={mediaAutoLoad}
                          renderImage={(p) => <Image {...p} loading="lazy" />}
                          renderViewer={(p) => <ImageViewer {...p} />}
                        />
                      )}
                    />
                  );
                if (timelineItem.kind === 'message') {
                  const getContent = (() => timelineItem.content.raw) as GetContentCallback;

                  const senderId = timelineItem.sender;
                  const senderDisplayName =
                    getMemberDisplayName(room, senderId) ?? getMxIdLocalPart(senderId) ?? senderId;
                  return (
                    <RenderMessageContent
                      displayName={senderDisplayName}
                      msgType={timelineItem.content.msgtype}
                      ts={timelineItem.timestamp}
                      edited={showEditedInline}
                      getContent={getContent}
                      mediaAutoLoad={mediaAutoLoad}
                      urlPreview={showUrlPreview}
                      htmlReactParserOptions={htmlReactParserOptions}
                      linkifyOpts={linkifyOpts}
                      outlineAttachment={messageLayout === MessageLayout.Bubble}
                      decryptionFailureReason={mEvent.decryptionFailureReason}
                      onRequestKey={() => requestRoomKey(mx, mEvent)}
                      onVerifyDevice={() => openSettingsPage(SettingsPages.DevicesPage)}
                      onRestoreBackup={() => openSettingsPage(SettingsPages.DevicesPage)}
                    />
                  );
                }
                if (timelineItem.kind === 'encrypted')
                  return (
                    <Text>
                      <MessageNotDecryptedContent />
                    </Text>
                  );
                return (
                  <Text>
                    <MessageUnsupportedContent />
                  </Text>
                );
              }}
            </EncryptedContent>
          </Message>
        );
      },
      [MessageEvent.Sticker]: (mEventId, mEvent, item, timelineSet, collapse, timelineItem) => {
        const highlighted = focusItem?.index === item && focusItem.highlight;

        return (
          <Message
            key={timelineItem.eventId}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            timelineItem={timelineItem}
            messageSpacing={messageSpacing}
            messageLayout={messageLayout}
            collapse={collapse}
            highlight={highlighted}
            canDelete={canRedact || (canDeleteOwn && timelineItem.sender === mx.getUserId())}
            canSendReaction={canSendReaction}
            canPinEvent={canPinEvent}
            imagePackRooms={imagePackRooms}
            reactionCounts={itemReactions(timelineItem)}
            onUserClick={handleUserClick}
            onUsernameClick={handleUsernameClick}
            onReplyClick={handleReplyClick}
            onReactionToggle={handleReactionToggle}
            reactions={
              (itemReactions(timelineItem)?.length ?? 0) > 0 && (
                <Reactions
                  style={{ marginTop: config.space.S200 }}
                  room={room}
                  reactions={itemReactions(timelineItem) ?? []}
                  mEventId={mEventId}
                  canSendReaction={canSendReaction}
                  onReactionToggle={handleReactionToggle}
                />
              )
            }
            hideReadReceipts={hideActivity}
            readReceiptUsers={getReadReceiptUsers(timelineItem)}
            showDeveloperTools={showDeveloperTools}
            memberPowerTag={getMemberPowerTag(timelineItem.sender)}
            accessibleTagColors={accessiblePowerTagColors}
            legacyUsernameColor={legacyUsernameColor || direct}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          >
            {timelineItem.kind === 'redacted' ? (
              <RedactedContent reason={mEvent.getUnsigned().redacted_because?.content.reason} />
            ) : (
              <MSticker
                content={
                  (timelineItem.kind === 'sticker'
                    ? timelineItem.content
                    : mEvent.getContent()) as unknown as IImageContent
                }
                renderImageContent={(props) => (
                  <ImageContent
                    {...props}
                    autoPlay={mediaAutoLoad}
                    renderImage={(p) => <Image {...p} loading="lazy" />}
                    renderViewer={(p) => <ImageViewer {...p} />}
                  />
                )}
              />
            )}
          </Message>
        );
      },
      [StateEvent.RoomMember]: (mEventId, mEvent, item, timelineSet, collapse, timelineItem) => {
        if (timelineItem.kind !== 'state') return null;
        const membershipChanged = isMembershipContentChanged(
          timelineItem.content,
          timelineItem.prevContent ?? {}
        );
        if (membershipChanged && hideMembershipEvents) return null;
        if (!membershipChanged && hideNickAvatarEvents) return null;

        const highlighted = focusItem?.index === item && focusItem.highlight;
        const parsed = parseMemberEvent(timelineItem);

        const timeJSX = (
          <Time
            ts={timelineItem.timestamp}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        return (
          <Event
            key={timelineItem.eventId}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            timelineItem={timelineItem}
            highlight={highlighted}
            messageSpacing={messageSpacing}
            canDelete={canRedact || timelineItem.sender === mx.getUserId()}
            hideReadReceipts={hideActivity}
            readReceiptUsers={getReadReceiptUsers(timelineItem)}
            showDeveloperTools={showDeveloperTools}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              iconSrc={parsed.icon}
              content={
                <Box grow="Yes" direction="Column">
                  <Text size="T300" priority="300">
                    {parsed.body}
                  </Text>
                </Box>
              }
            />
          </Event>
        );
      },
      [StateEvent.RoomName]: (mEventId, mEvent, item, timelineSet, collapse, timelineItem) => {
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = timelineItem.sender;
        const senderName = getMemberDisplayName(room, senderId) || getMxIdLocalPart(senderId);

        const timeJSX = (
          <Time
            ts={timelineItem.timestamp}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        return (
          <Event
            key={timelineItem.eventId}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            timelineItem={timelineItem}
            highlight={highlighted}
            messageSpacing={messageSpacing}
            canDelete={canRedact || timelineItem.sender === mx.getUserId()}
            hideReadReceipts={hideActivity}
            readReceiptUsers={getReadReceiptUsers(timelineItem)}
            showDeveloperTools={showDeveloperTools}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              iconSrc={Icons.Hash}
              content={
                <Box grow="Yes" direction="Column">
                  <Text size="T300" priority="300">
                    <b>{senderName}</b>
                    {t('Organisms.RoomCommon.changed_room_name')}
                  </Text>
                </Box>
              }
            />
          </Event>
        );
      },
      [StateEvent.RoomTopic]: (mEventId, mEvent, item, timelineSet, collapse, timelineItem) => {
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = timelineItem.sender;
        const senderName = getMemberDisplayName(room, senderId) || getMxIdLocalPart(senderId);

        const timeJSX = (
          <Time
            ts={timelineItem.timestamp}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        return (
          <Event
            key={timelineItem.eventId}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            timelineItem={timelineItem}
            highlight={highlighted}
            messageSpacing={messageSpacing}
            canDelete={canRedact || timelineItem.sender === mx.getUserId()}
            hideReadReceipts={hideActivity}
            readReceiptUsers={getReadReceiptUsers(timelineItem)}
            showDeveloperTools={showDeveloperTools}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              iconSrc={Icons.Hash}
              content={
                <Box grow="Yes" direction="Column">
                  <Text size="T300" priority="300">
                    <b>{senderName}</b>
                    {' changed room topic'}
                  </Text>
                </Box>
              }
            />
          </Event>
        );
      },
      [StateEvent.RoomAvatar]: (mEventId, mEvent, item, timelineSet, collapse, timelineItem) => {
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = timelineItem.sender;
        const senderName = getMemberDisplayName(room, senderId) || getMxIdLocalPart(senderId);

        const timeJSX = (
          <Time
            ts={timelineItem.timestamp}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        return (
          <Event
            key={timelineItem.eventId}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            timelineItem={timelineItem}
            highlight={highlighted}
            messageSpacing={messageSpacing}
            canDelete={canRedact || timelineItem.sender === mx.getUserId()}
            hideReadReceipts={hideActivity}
            readReceiptUsers={getReadReceiptUsers(timelineItem)}
            showDeveloperTools={showDeveloperTools}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              iconSrc={Icons.Hash}
              content={
                <Box grow="Yes" direction="Column">
                  <Text size="T300" priority="300">
                    <b>{senderName}</b>
                    {' changed room avatar'}
                  </Text>
                </Box>
              }
            />
          </Event>
        );
      },
      [StateEvent.GroupCallMemberPrefix]: (
        mEventId,
        mEvent,
        item,
        timelineSet,
        collapse,
        timelineItem
      ) => {
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = timelineItem.sender;
        const senderName = getMemberDisplayName(room, senderId) || getMxIdLocalPart(senderId);

        const content = mEvent.getContent();
        const prevContent = mEvent.getPrevContent();

        const callJoined = content.application;
        if (callJoined && 'application' in prevContent) {
          return null;
        }

        const timeJSX = (
          <Time
            ts={timelineItem.timestamp}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        return (
          <Event
            key={timelineItem.eventId}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            timelineItem={timelineItem}
            highlight={highlighted}
            messageSpacing={messageSpacing}
            canDelete={canRedact || timelineItem.sender === mx.getUserId()}
            hideReadReceipts={hideActivity}
            readReceiptUsers={getReadReceiptUsers(timelineItem)}
            showDeveloperTools={showDeveloperTools}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              iconSrc={callJoined ? Icons.Phone : Icons.PhoneDown}
              content={
                <Box grow="Yes" direction="Column">
                  <Text size="T300" priority="300">
                    <b>{senderName}</b>
                    {callJoined ? ' joined the call' : ' ended the call'}
                  </Text>
                </Box>
              }
            />
          </Event>
        );
      },
    },
    (mEventId, mEvent, item, timelineSet, collapse, timelineItem) => {
      if (!showHiddenEvents) return null;
      const highlighted = focusItem?.index === item && focusItem.highlight;
      const senderId = timelineItem.sender;
      const senderName = getMemberDisplayName(room, senderId) || getMxIdLocalPart(senderId);

      const timeJSX = (
        <Time
          ts={timelineItem.timestamp}
          compact={messageLayout === MessageLayout.Compact}
          hour24Clock={hour24Clock}
          dateFormatString={dateFormatString}
        />
      );

      return (
        <Event
          key={timelineItem.eventId}
          data-message-item={item}
          data-message-id={mEventId}
          room={room}
          mEvent={mEvent}
          timelineItem={timelineItem}
          highlight={highlighted}
          messageSpacing={messageSpacing}
          canDelete={canRedact || timelineItem.sender === mx.getUserId()}
          hideReadReceipts={hideActivity}
          readReceiptUsers={getReadReceiptUsers(timelineItem)}
          showDeveloperTools={showDeveloperTools}
        >
          <EventContent
            messageLayout={messageLayout}
            time={timeJSX}
            iconSrc={Icons.Code}
            content={
              <Box grow="Yes" direction="Column">
                <Text size="T300" priority="300">
                  <b>{senderName}</b>
                  {' sent '}
                  <code className={customHtmlCss.Code}>{mEvent.getType()}</code>
                  {' state event'}
                </Text>
              </Box>
            }
          />
        </Event>
      );
    },
    (mEventId, mEvent, item, timelineSet, collapse, timelineItem) => {
      if (!showHiddenEvents) return null;
      if (Object.keys(mEvent.getContent()).length === 0) return null;
      if (mEvent.getRelation()) return null;
      if (mEvent.isRedaction()) return null;

      const highlighted = focusItem?.index === item && focusItem.highlight;
      const senderId = timelineItem.sender;
      const senderName = getMemberDisplayName(room, senderId) || getMxIdLocalPart(senderId);

      const timeJSX = (
        <Time
          ts={timelineItem.timestamp}
          compact={messageLayout === MessageLayout.Compact}
          hour24Clock={hour24Clock}
          dateFormatString={dateFormatString}
        />
      );

      return (
        <Event
          key={timelineItem.eventId}
          data-message-item={item}
          data-message-id={mEventId}
          room={room}
          mEvent={mEvent}
          timelineItem={timelineItem}
          highlight={highlighted}
          messageSpacing={messageSpacing}
          canDelete={canRedact || timelineItem.sender === mx.getUserId()}
          hideReadReceipts={hideActivity}
          readReceiptUsers={getReadReceiptUsers(timelineItem)}
          showDeveloperTools={showDeveloperTools}
        >
          <EventContent
            messageLayout={messageLayout}
            time={timeJSX}
            iconSrc={Icons.Code}
            content={
              <Box grow="Yes" direction="Column">
                <Text size="T300" priority="300">
                  <b>{senderName}</b>
                  {' sent '}
                  <code className={customHtmlCss.Code}>{mEvent.getType()}</code>
                  {' event'}
                </Text>
              </Box>
            }
          />
        </Event>
      );
    }
  );

  let prevItem: TimelineItem | undefined;
  let isPrevRendered = false;
  let newDivider = false;
  let dayDivider = false;
  const eventRenderer = (item: number) => {
    const timelineItem = items[item];
    if (!timelineItem) return null;
    const mEvent = room.findEventById(timelineItem.eventId);
    const mEventId = mEvent?.getId();
    const timelineSet = room.getUnfilteredTimelineSet();

    if (!mEvent || !mEventId) return null;

    const eventSender = timelineItem.sender;
    if (
      !isVisibleTimelineItem(timelineItem, {
        hideMembershipEvents,
        hideNickAvatarEvents,
        showHiddenEvents,
        ignoredUsers: ignoredUsersSet,
      })
    ) {
      return null;
    }

    if (!newDivider && readUptoEventIdRef.current) {
      newDivider = prevItem?.eventId === readUptoEventIdRef.current;
    }
    if (!dayDivider) {
      dayDivider = prevItem ? !inSameDay(prevItem.timestamp, timelineItem.timestamp) : false;
    }

    const collapsed =
      isPrevRendered &&
      !dayDivider &&
      (!newDivider || eventSender === mx.getUserId()) &&
      prevItem !== undefined &&
      prevItem.sender === eventSender &&
      itemTimelineType(prevItem) === itemTimelineType(timelineItem) &&
      minuteDifference(prevItem.timestamp, timelineItem.timestamp) < 2;

    const collapseBotCommand =
      botCollapseAllowed &&
      dsTaskBotSettings.collapseCommandsEnabled &&
      dsTaskBotSettings.botMxid !== '' &&
      eventSender !== undefined &&
      eventSender !== dsTaskBotSettings.botMxid &&
      isBotCommandMessage(timelineItem, dsTaskBotSettings.botMxid);

    const collapseBotReply =
      botCollapseAllowed &&
      dsTaskBotSettings.collapseCommandsEnabled &&
      dsTaskBotSettings.botMxid !== '' &&
      isBotServiceReply(timelineItem, dsTaskBotSettings.botMxid);

    let eventJSX: React.ReactNode;
    if (collapseBotCommand || collapseBotReply) {
      const body =
        timelineItem.kind === 'message' && typeof timelineItem.content.body === 'string'
          ? timelineItem.content.body
          : '';
      const senderName = eventSender
        ? getMemberDisplayName(room, eventSender) ?? getMxIdLocalPart(eventSender) ?? eventSender
        : '';
      eventJSX = (
        <CollapsedBotCommand
          key={mEventId}
          body={body}
          senderName={senderName}
          messageSpacing={messageSpacing}
        />
      );
    } else {
      eventJSX = renderMatrixEvent(
        itemTimelineType(timelineItem),
        timelineItem.kind === 'state',
        mEventId,
        mEvent,
        item,
        timelineSet,
        collapsed,
        timelineItem
      );
    }
    prevItem = timelineItem;
    isPrevRendered = !!eventJSX;

    const newDividerJSX =
      newDivider && eventJSX && eventSender !== mx.getUserId() ? (
        <MessageBase space={messageSpacing}>
          <TimelineDivider style={{ color: color.Success.Main }} variant="Inherit">
            <Badge as="span" size="500" variant="Success" fill="Solid" radii="300">
              <Text size="L400">New Messages</Text>
            </Badge>
          </TimelineDivider>
        </MessageBase>
      ) : null;

    const dayDividerJSX =
      dayDivider && eventJSX ? (
        <MessageBase space={messageSpacing}>
          <TimelineDivider variant="Surface">
            <Badge as="span" size="500" variant="Secondary" fill="None" radii="300">
              <Text size="L400">
                {(() => {
                  if (today(timelineItem.timestamp)) return 'Today';
                  if (yesterday(timelineItem.timestamp)) return 'Yesterday';
                  return timeDayMonthYear(timelineItem.timestamp);
                })()}
              </Text>
            </Badge>
          </TimelineDivider>
        </MessageBase>
      ) : null;

    if (eventJSX && (newDividerJSX || dayDividerJSX)) {
      if (newDividerJSX) newDivider = false;
      if (dayDividerJSX) dayDivider = false;

      return (
        <React.Fragment key={mEventId}>
          {newDividerJSX}
          {dayDividerJSX}
          {eventJSX}
        </React.Fragment>
      );
    }

    return eventJSX;
  };

  return (
    <Box grow="Yes" style={{ position: 'relative' }}>
      {unreadInfo?.readUptoEventId && !unreadInfo?.inLiveTimeline && (
        <TimelineFloat position="Top">
          <Chip
            variant="Primary"
            radii="Pill"
            outlined
            before={<Icon size="50" src={Icons.MessageUnread} />}
            onClick={handleJumpToUnread}
          >
            <Text size="L400">Jump to Unread</Text>
          </Chip>

          <Chip
            variant="SurfaceVariant"
            radii="Pill"
            outlined
            before={<Icon size="50" src={Icons.CheckTwice} />}
            onClick={handleMarkAsRead}
          >
            <Text size="L400">Mark as Read</Text>
          </Chip>
        </TimelineFloat>
      )}
      <Scroll ref={scrollRef} visibility="Hover">
        <Box
          direction="Column"
          justifyContent="End"
          style={{ minHeight: '100%', padding: `${config.space.S600} 0` }}
        >
          {!canPaginateBack && rangeAtStart && getItems().length > 0 && (
            <div
              style={{
                padding: `${config.space.S700} ${config.space.S400} ${config.space.S600} ${
                  messageLayout === MessageLayout.Compact ? config.space.S400 : toRem(64)
                }`,
              }}
            >
              <RoomIntro room={room} />
            </div>
          )}
          {(canPaginateBack || !rangeAtStart) &&
            (messageLayout === MessageLayout.Compact ? (
              <>
                <MessageBase>
                  <CompactPlaceholder key={getItems().length} />
                </MessageBase>
                <MessageBase>
                  <CompactPlaceholder key={getItems().length} />
                </MessageBase>
                <MessageBase>
                  <CompactPlaceholder key={getItems().length} />
                </MessageBase>
                <MessageBase>
                  <CompactPlaceholder key={getItems().length} />
                </MessageBase>
                <MessageBase ref={observeBackAnchor}>
                  <CompactPlaceholder key={getItems().length} />
                </MessageBase>
              </>
            ) : (
              <>
                <MessageBase>
                  <DefaultPlaceholder key={getItems().length} />
                </MessageBase>
                <MessageBase>
                  <DefaultPlaceholder key={getItems().length} />
                </MessageBase>
                <MessageBase ref={observeBackAnchor}>
                  <DefaultPlaceholder key={getItems().length} />
                </MessageBase>
              </>
            ))}

          {getItems().map(eventRenderer)}

          {(!liveTimelineLinked || !rangeAtEnd) &&
            (messageLayout === MessageLayout.Compact ? (
              <>
                <MessageBase ref={observeFrontAnchor}>
                  <CompactPlaceholder key={getItems().length} />
                </MessageBase>
                <MessageBase>
                  <CompactPlaceholder key={getItems().length} />
                </MessageBase>
                <MessageBase>
                  <CompactPlaceholder key={getItems().length} />
                </MessageBase>
                <MessageBase>
                  <CompactPlaceholder key={getItems().length} />
                </MessageBase>
                <MessageBase>
                  <CompactPlaceholder key={getItems().length} />
                </MessageBase>
              </>
            ) : (
              <>
                <MessageBase ref={observeFrontAnchor}>
                  <DefaultPlaceholder key={getItems().length} />
                </MessageBase>
                <MessageBase>
                  <DefaultPlaceholder key={getItems().length} />
                </MessageBase>
                <MessageBase>
                  <DefaultPlaceholder key={getItems().length} />
                </MessageBase>
              </>
            ))}
          <span ref={atBottomAnchorRef} />
        </Box>
      </Scroll>
      {!atBottom && (
        <TimelineFloat position="Bottom">
          <Chip
            variant="SurfaceVariant"
            radii="Pill"
            outlined
            before={<Icon size="50" src={Icons.ArrowBottom} />}
            onClick={handleJumpToLatest}
          >
            <Text size="L400">Jump to Latest</Text>
          </Chip>
        </TimelineFloat>
      )}
    </Box>
  );
}
