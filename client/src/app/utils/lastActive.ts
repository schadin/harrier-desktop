import dayjs from 'dayjs';
import isToday from 'dayjs/plugin/isToday';
import isYesterday from 'dayjs/plugin/isYesterday';

dayjs.extend(isToday);
dayjs.extend(isYesterday);

export const getLastActiveLabel = (lastActiveTs?: number): string | undefined => {
  if (!lastActiveTs || lastActiveTs === 0) return undefined;

  const now = dayjs();
  const ts = dayjs(lastActiveTs);
  const diffMinutes = now.diff(ts, 'minute');
  const diffHours = now.diff(ts, 'hour');

  if (diffMinutes < 1) {
    return 'Was online just now';
  }

  if (diffMinutes < 60) {
    return `Was online ${diffMinutes} min ago`;
  }

  if (ts.isToday()) {
    return `Was online ${diffHours} hours ago`;
  }

  if (ts.isYesterday()) {
    return `Last seen yesterday at ${ts.format('HH:mm')}`;
  }

  return `Last seen ${ts.format('D MMM YYYY, HH:mm')}`;
};
