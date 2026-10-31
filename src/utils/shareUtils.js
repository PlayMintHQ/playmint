// Native mobile sharing where supported with a copy-link fallback (October 2026 Milestone §2C).

/**
 * Share a game URL using the Web Share API (native on iOS/Android)
 * with a fallback to copying to clipboard.
 *
 * @param {{ title?: string, text?: string, url: string }} params
 * @returns {Promise<{ ok: boolean, method: 'share' | 'clipboard', error?: string }>}
 */
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

  // Fallback to clipboard
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      return { ok: true, method: 'clipboard' };
    }
    // Fallback for older browsers
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
