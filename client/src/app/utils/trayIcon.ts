import { setTrayIcon as setTrayIconBytes } from './desktop';
import trayBaseUrl from '../../../public/icons/tray-base.png';

const ICON_SIZE = 64;

type TrayUnread = {
  total: number;
  highlight: number;
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      reject();
    };
    img.src = url;
  });
}

async function renderToBytes(
  canvas: HTMLCanvasElement,
  emoji: string | null,
  unread: TrayUnread | undefined
): Promise<Uint8Array | null> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (import.meta.env.DEV && emoji) {
    // eslint-disable-next-line no-console
    console.log('[tray-icon] rendered', bytes.length, 'bytes', { emoji, unread });
  }
  return bytes;
}

export async function renderTrayIcon(
  emoji: string | null,
  unread: TrayUnread | undefined
): Promise<Uint8Array | null> {
  let base: HTMLImageElement;
  try {
    base = await loadImage(trayBaseUrl);
  } catch (err) {
    console.error('[tray-icon] failed to load base icon', err);
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Base icon
  ctx.drawImage(base, 0, 0, ICON_SIZE, ICON_SIZE);

  // Status emoji overlay
  if (emoji && emoji.trim()) {
    await document.fonts.load('28px Twemoji', emoji);
    ctx.font = '28px Twemoji, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, ICON_SIZE - 18, ICON_SIZE - 14);
  }

  // Unread badge
  if (unread && unread.total > 0) {
    const badgeX = ICON_SIZE - 14;
    const badgeY = 14;
    const radius = 10;

    ctx.beginPath();
    ctx.arc(badgeX, badgeY, radius, 0, 2 * Math.PI);
    ctx.fillStyle = unread.highlight > 0 ? '#ff4d4f' : '#1890ff';
    ctx.fill();

    const count = unread.total > 99 ? 99 : unread.total;
    if (count > 0) {
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(count), badgeX, badgeY);
    }
  }

  return renderToBytes(canvas, emoji, unread);
}

export async function updateTrayIcon(
  emoji: string | null,
  unread: TrayUnread | undefined
): Promise<void> {
  const bytes = await renderTrayIcon(emoji, unread);
  if (bytes) {
    await setTrayIconBytes(bytes);
  }
}
