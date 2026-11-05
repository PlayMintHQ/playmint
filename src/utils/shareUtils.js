// Native mobile sharing where supported with a copy-link fallback (October 2026 Milestone §2C).

/**
 * Share a game URL using the Web Share API (native on iOS/Android)
 * with a fallback to copying to clipboard.
 *
 * @param {{ title?: string, text?: string, url: string }} params
 * @returns {Promise<{ ok: boolean, method: 'share' | 'clipboard', error?: string }>}
 */
async function copyToClipboard(url) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      return { ok: true, method: 'clipboard' };
    }
    // Fallback for older browsers / non-secure contexts
    const textArea = document.createElement('textarea');
    textArea.value = url;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (successful) return { ok: true, method: 'clipboard' };
    return { ok: false, method: 'clipboard', error: 'Copy command failed' };
  } catch (err) {
    return { ok: false, method: 'clipboard', error: err?.message || String(err) };
  }
}

export async function shareLink({ title = 'PlayMint game', text = 'Play this game on PlayMint!', url }) {
  if (!url) return { ok: false, method: 'clipboard', error: 'No URL provided' };

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title,
        text,
        url
      });
      return { ok: true, method: 'share' };
    } catch (err) {
      // If user aborted/cancelled the native share sheet, don't fail, treat as neutral
      if (err.name === 'AbortError') {
        return { ok: true, method: 'share', cancelled: true };
      }
      // Fall through to clipboard if share failed for other reasons
    }
  }

  return copyToClipboard(url);
}

/**
 * Explicit clipboard action. Desktop browsers have no Web Share API, so a
 * "Share" button whose only visible behaviour is a silent clipboard write
 * reads as broken. Call sites pair this with shareLink: Share = native sheet
 * where supported, Copy Link = always the URL.
 */
export async function copyLink(url) {
  if (!url) return { ok: false, method: 'clipboard', error: 'No URL provided' };
  return copyToClipboard(url);
}

// Social-preview URL for a saved game (2026-11-05). WhatsApp, Discord and
// Telegram cache the preview card PER URL. A game is private when it is first
// shared (private is the default), so the first scrape gets the generic PlayMint
// card — and kept showing it after the game was made public. `?v=` changes
// whenever what the card shows changes (visibility, title, art), so every share
// after a change is a URL the scrapers have not seen. The server ignores it.
const shortHash = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
};

export function gameShareUrl(rowId, { visibility = '', title = '', artId = '', thumb = '' } = {}) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://playmintai.vercel.app';
  return `${origin}/g/${encodeURIComponent(rowId)}?v=${shortHash(`${visibility}|${title}|${artId}|${thumb}`)}`;
}
