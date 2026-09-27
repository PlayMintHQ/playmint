// Small confirm dialog (added 2026-09-27 for the "Delete game" confirmation).
//
// Built on the AuthDialog recipe, and for the same reason: App's global capture
// guard calls stopPropagation() for events inside [data-pm-modal], and that runs
// BEFORE React's root listener — so a React onKeyDown here would never fire. Esc
// and the Tab trap are therefore native window-capture listeners, and focus is
// restored to the opener on close.
//
// Reuses the .pm-auth panel + backdrop so it looks like the rest of the modal
// family, and sits at the same z-index tier (13000) — nothing else in the app
// opens a dialog over a route page.
import { useEffect, useRef } from 'react';

export default function ConfirmDialog({
  open,
  title,
  message,
  error = '',
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const rootRef = useRef(null);
  const confirmRef = useRef(null);

  // Focus in on open, restore to the opener on close.
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const el = confirmRef.current;
    if (el) {
      try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
    }
    return () => {
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
        try { opener.focus({ preventScroll: true }); } catch { /* ignore */ }
      }
    };
  }, [open]);

  // Esc + Tab trap (native capture listener — see the file header).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = rootRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href]')
      ).filter((n) => n.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (!root.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="pm-auth-backdrop"
      data-pm-modal=""
      onPointerDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
    >
      <div
        ref={rootRef}
        className="pm-auth pm-glass-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="pm-confirm-title"
        aria-describedby="pm-confirm-message"
      >
        <h2 id="pm-confirm-title" className="pm-auth__title">{title}</h2>
        <p id="pm-confirm-message" className="pm-auth__sub">{message}</p>
        {error && <p className="pm-auth__error" role="alert">{error}</p>}
        <div className="pm-confirm__actions">
          <button
            type="button"
            className="pm-btn pm-btn-muted"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`pm-btn ${danger ? 'pm-btn-danger' : 'pm-btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
