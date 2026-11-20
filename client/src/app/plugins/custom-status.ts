import type { HarrierCore } from '@harrier/core';

export type CustomStatus = {
  emoji?: string;
  text?: string;
};

export type StatusPreset = {
  emoji: string;
  text: string;
};

export const DEFAULT_STATUS_PRESETS: StatusPreset[] = [
  { emoji: '🟢', text: 'На месте' },
  { emoji: '🙅‍♂️', text: 'Отошел' },
  { emoji: '🍴', text: 'Обед' },
  { emoji: '🏁', text: 'Ушел' },
];

const EMOJI_REGEX = /\p{Extended_Pictographic}/u;

const graphemeSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : undefined;

const getFirstGrapheme = (value: string): string | undefined => {
  if (!value) return undefined;
  if (graphemeSegmenter) {
    const [first] = graphemeSegmenter.segment(value);
    return first?.segment;
  }
  const [first] = value.match(/./su) ?? [];
  return first;
};

export const parseStatusMsg = (statusMsg?: string): CustomStatus => {
  const status = statusMsg?.trim();
  if (!status) return {};

  const firstGrapheme = getFirstGrapheme(status);
  if (!firstGrapheme || !EMOJI_REGEX.test(firstGrapheme)) {
    return { text: status };
  }

  const text = status.slice(firstGrapheme.length).trim();
  return {
    emoji: firstGrapheme,
    text: text || undefined,
  };
};

export const formatStatusMsg = (emoji: string, text?: string): string => {
  const trimmedText = text?.trim();
  return trimmedText ? `${emoji} ${trimmedText}` : emoji;
};

const TIME_SUFFIX_REGEX = / · \d{2}:\d{2}$/;
const TIME_SEPARATOR = ' · ';

const ACTIVE_STATUS_STORAGE_KEY = 'cinny_active_status_msg';

export const saveActiveStatusMsg = (statusMsg: string | undefined): void => {
  if (statusMsg === undefined || statusMsg === '') {
    localStorage.removeItem(ACTIVE_STATUS_STORAGE_KEY);
  } else {
    localStorage.setItem(ACTIVE_STATUS_STORAGE_KEY, statusMsg);
  }
};

export const getActiveStatusMsg = (): string | undefined => {
  const value = localStorage.getItem(ACTIVE_STATUS_STORAGE_KEY);
  return value || undefined;
};

export const stripTimeSuffix = (text: string): string => text.replace(TIME_SUFFIX_REGEX, '').trim();

export const extractStatusTimeSuffix = (text?: string): string | undefined => {
  if (!text) return undefined;
  const match = text.match(TIME_SUFFIX_REGEX);
  return match ? match[0].slice(TIME_SEPARATOR.length) : undefined;
};

export const formatStatusMsgWithTime = (emoji: string, text?: string): string => {
  const base = formatStatusMsg(emoji, text);
  const timeStr = new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${base}${TIME_SEPARATOR}${timeStr}`;
};

const sendStatusNotice = (
  core: HarrierCore,
  noticeRoomId: string | undefined,
  emoji: string,
  text?: string
): void => {
  if (!noticeRoomId) return;
  const body = formatStatusMsg(emoji, text);
  if (!body) return;
  core.send.sendMessage(noticeRoomId, { msgtype: 'm.notice', body }).catch(() => undefined);
};

const applyOwnStatus = async (core: HarrierCore, statusMessage: string): Promise<void> => {
  const result = await core.presence.setOwnPresence({ status: 'online', statusMessage });
  if (!result.ok) throw result.error;
};

export const setCustomStatus = (
  core: HarrierCore,
  emoji: string,
  text?: string,
  noticeRoomId?: string
): Promise<void> => {
  const statusMsg = formatStatusMsg(emoji, text);
  saveActiveStatusMsg(statusMsg);
  sendStatusNotice(core, noticeRoomId, emoji, text);
  return applyOwnStatus(core, statusMsg);
};

export const setCustomStatusWithTime = (
  core: HarrierCore,
  emoji: string,
  text?: string,
  noticeRoomId?: string
): Promise<void> => {
  const statusMsg = formatStatusMsgWithTime(emoji, text);
  saveActiveStatusMsg(statusMsg);
  sendStatusNotice(core, noticeRoomId, emoji, text);
  return applyOwnStatus(core, statusMsg);
};

export const clearCustomStatus = (core: HarrierCore): Promise<void> => {
  saveActiveStatusMsg(undefined);
  return applyOwnStatus(core, '');
};

export type StatusRestoreAction =
  | { type: 'noop' }
  | { type: 'show-server'; statusMsg: string }
  | { type: 'adopt-server'; statusMsg: string }
  | { type: 'restore'; statusMsg: string };

/**
 * Матрица решений восстановления. `serverMsg` — серверное значение, полученное
 * явным presence-запросом (`undefined` — сервер вернул пустой статус), `saved` —
 * локальный кэш активного статуса.
 */
export const decideStatusRestore = (
  serverMsg: string | undefined,
  saved: string | undefined
): StatusRestoreAction => {
  // значения совпали (в том числе оба пусты) — отправлять на сервер нечего,
  // но непустое серверное значение нужно показать в UI
  if (serverMsg === saved) {
    return serverMsg ? { type: 'show-server', statusMsg: serverMsg } : { type: 'noop' };
  }

  // сервер новее (например, статус сменён с другого устройства) — приоритет
  // у сервера, локальный кэш синхронизируется
  if (serverMsg) return { type: 'adopt-server', statusMsg: serverMsg };

  // локального значения нет — восстанавливать нечего
  if (!saved) return { type: 'noop' };

  // серверное значение пустое (утеряно/истекло) — восстанавливаем локальное
  return { type: 'restore', statusMsg: saved };
};

export type StatusRestoreResult = 'done' | 'retry';

export const restoreCustomStatus = async (core: HarrierCore): Promise<StatusRestoreResult> => {
  const userId = core.auth.session.getSnapshot().value?.userId;
  if (!userId) return 'done';

  const saved = getActiveStatusMsg();

  // авторитетный источник серверного значения — явный запрос presence;
  // собственное m.presence не подходит: у Synapse статус не переживает offline,
  // а matrix-js-sdk не различает «пустой status_msg» и «события не было»
  let response;
  try {
    response = await core.presence.getOwnPresence();
  } catch {
    return 'retry';
  }
  if (!response.ok) return 'retry';
  const serverMsg = response.value?.statusMessage;

  // пользователь изменил или снял статус, пока шёл запрос — его выбор важнее
  if (getActiveStatusMsg() !== saved) return 'done';

  const action = decideStatusRestore(serverMsg, saved);

  switch (action.type) {
    case 'show-server':
      core.presence.setLocalOwnStatus(action.statusMsg);
      break;
    case 'adopt-server':
      saveActiveStatusMsg(action.statusMsg);
      core.presence.setLocalOwnStatus(action.statusMsg);
      break;
    case 'restore':
      core.presence
        .setOwnPresence({
          status: response.value?.status ?? 'online',
          statusMessage: action.statusMsg,
        })
        .catch(() => undefined);
      break;
    case 'noop':
    default:
      break;
  }

  return 'done';
};
