import type { HarrierCore, TimelineItem } from '@harrier/core';
import { factoryRoomIdByActivity } from '@harrier/core';
import { RoomToUnread } from '../../../../types/matrix/room';
import { getMxIdLocalPart } from '../../../utils/matrix';
import { PaletteCategory, PaletteItem, ScoredPaletteItem } from './types';

export type UnreadPreview = {
  sender: string;
  body: string;
};

export type UnreadPreviewLabels = {
  image: string;
  video: string;
  audio: string;
  file: string;
  sticker: string;
  redacted: string;
  encrypted: string;
};

const PREVIEW_BODY_LIMIT = 120;
export const UNREAD_LIST_LIMIT = 30;

const msgTypeToLabelKey = (msgtype: string): keyof UnreadPreviewLabels | undefined => {
  switch (msgtype) {
    case 'm.image':
      return 'image';
    case 'm.video':
      return 'video';
    case 'm.audio':
      return 'audio';
    case 'm.file':
      return 'file';
    default:
      return undefined;
  }
};

type UnreadTimelineItem = Extract<
  TimelineItem,
  { kind: 'message' | 'encrypted' | 'sticker' | 'redacted' }
>;

const MESSAGE_EVENT_TYPES = ['m.room.message', 'm.room.encrypted', 'm.sticker'];

const isMessageItem = (item: TimelineItem): item is UnreadTimelineItem =>
  item.kind === 'message' ||
  item.kind === 'encrypted' ||
  item.kind === 'sticker' ||
  (item.kind === 'redacted' && MESSAGE_EVENT_TYPES.includes(item.eventType));

const getMessagePreviewBody = (item: UnreadTimelineItem, labels: UnreadPreviewLabels): string => {
  if (item.kind === 'redacted') return labels.redacted;
  if (item.kind === 'encrypted') return labels.encrypted;
  if (item.kind === 'sticker') return labels.sticker;

  const labelKey = msgTypeToLabelKey(item.content.msgtype);
  if (labelKey) return labels[labelKey];

  const { body } = item.content;
  if (!body) return labels.encrypted;
  return body.length > PREVIEW_BODY_LIMIT ? `${body.slice(0, PREVIEW_BODY_LIMIT)}…` : body;
};

const getEventSenderName = (core: HarrierCore, roomId: string, senderId: string): string => {
  const member = core.rooms
    .members(roomId)
    .getSnapshot()
    .value.find(({ userId }) => userId === senderId);
  if (member?.displayName) return member.displayName;
  const profile = core.presence.profile(senderId).getSnapshot().value;
  if (profile.displayName) return profile.displayName;
  return getMxIdLocalPart(senderId) ?? senderId;
};

/**
 * Первое непрочитанное сообщение комнаты: первое входящее (не своё) событие
 * после прочитанного (read receipt) в core timeline. Собственные сообщения
 * пропускаются — read receipt не сдвигается при их отправке, поэтому они не
 * должны попадать в превью как «непрочитанные».
 */
const getFirstUnreadEvent = (
  core: HarrierCore,
  roomId: string,
  myUserId: string
): UnreadTimelineItem | undefined => {
  const timeline = core.timeline.liveTimeline(roomId).getSnapshot().value;
  // unreadStartIndex отсутствует, когда receipt вне загруженного диапазона.
  const startIndex = timeline.unreadStartIndex ?? 0;

  return timeline.items
    .slice(startIndex)
    .find((item): item is UnreadTimelineItem => item.sender !== myUserId && isMessageItem(item));
};

export const getUnreadPreview = (
  core: HarrierCore,
  roomId: string,
  labels: UnreadPreviewLabels
): UnreadPreview | undefined => {
  const myUserId = core.auth.session.getSnapshot().value?.userId;
  if (!myUserId) return undefined;

  const firstUnread = getFirstUnreadEvent(core, roomId, myUserId);
  if (!firstUnread) return undefined;

  return {
    sender: getEventSenderName(core, roomId, firstUnread.sender),
    body: getMessagePreviewBody(firstUnread, labels),
  };
};

/**
 * Список непрочитанных комнат в формате палитры:
 * с превью первого непрочитанного сообщения, сортировка — по highlight,
 * затем по количеству непрочитанных, затем по активности.
 */
export const buildUnreadPaletteItems = (
  items: PaletteItem[],
  core: HarrierCore,
  roomToUnread: RoomToUnread,
  labels: UnreadPreviewLabels
): ScoredPaletteItem[] => {
  const unreadItems: ScoredPaletteItem[] = [];

  items.forEach((item) => {
    if (item.category !== PaletteCategory.Rooms) return;
    const { roomId } = item;
    if (!roomId) return;

    const unread = roomToUnread.get(roomId);
    if (!unread || (unread.total === 0 && unread.highlight === 0)) return;

    const preview = getUnreadPreview(core, roomId, labels);
    const itemWithPreview: PaletteItem = preview
      ? { ...item, preview: `${preview.sender}: ${preview.body}` }
      : item;

    unreadItems.push({
      item: itemWithPreview,
      score: unread.highlight * 1000 + unread.total,
    });
  });

  const byActivity = factoryRoomIdByActivity((roomId) => {
    const room = core.rooms.room(roomId).getSnapshot().value;
    return room ? { name: room.name, lastActiveTimestamp: room.lastActiveTimestamp } : undefined;
  });

  unreadItems.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return byActivity(a.item.roomId ?? '', b.item.roomId ?? '');
  });

  return unreadItems.slice(0, UNREAD_LIST_LIMIT);
};

/** Вхождение строки запроса в заголовке/превью (без fuzzy-ранжирования) */
export const matchUnreadItem = (item: PaletteItem, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [item.title, item.subtitle ?? '', item.preview ?? '', ...item.keywords]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
};
