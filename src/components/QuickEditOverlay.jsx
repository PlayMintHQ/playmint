import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A one-field prompt box over the running game. The full Creator Panel is a
 * drawer of sliders and share controls; a player who just wants "make it
 * night-time" should not have to open all of it. Submitting goes through the
 * SAME App handler as the panel, so tweak / restyle / regenerate semantics are
 * identical — this component only collects the sentence.
 */
const QuickEditOverlay = ({ isOpen, onClose, onSubmit }) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    setText('');
    setMessage(null);
    setBusy(false);
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [isOpen]);

  const submit = useCallback(async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await onSubmit(value);
      if (result && result.applied === false) {
        setMessage({ ok: false, text: result.summary || 'No changes were applied.' });
        setBusy(false);
        return;
      }
      onClose?.();
    } catch (err) {
      setMessage({ ok: false, text: err?.message || 'Could not apply that change.' });
      setBusy(false);
    }
  }, [text, busy, onSubmit, onClose]);

  // React handlers never run inside [data-pm-modal] (App's capture guard stops
  // propagation before React's root listener), so Escape/Enter are native
  // window-capture listeners — the same recipe as AuthDialog.
  const submitRef = useRef(submit);
  useEffect(() => { submitRef.current = submit; }, [submit]);
  // While an edit is being interpreted/applied the box must not be dismissable:
  // closing it would resume the game while the change is still in flight.
  const busyRef = useRef(false);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (!busyRef.current) onClose?.();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && document.activeElement === inputRef.current) {
        e.preventDefault();
        e.stopPropagation();
        submitRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      data-pm-modal
      className="pm-quick-edit"
      role="dialog"
      aria-modal="true"
      aria-label="Quick edit"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget && !busyRef.current) onClose?.();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12500,
        background: 'rgba(2, 6, 12, 0.62)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))'
      }}
    >
      <form
        className="pm-card"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        style={{
          width: '100%',
          maxWidth: '520px',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <h2 className="pm-heading" style={{ margin: 0, fontSize: '18px' }}>Quick edit</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close quick edit"
            style={{ background: 'none', border: 'none', color: 'var(--pm-text-secondary)', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <p style={{ margin: 0, fontSize: '13px', color: 'var(--pm-text-secondary)' }}>
          Describe a change to the running game. Small changes apply live; bigger ones redraw or regenerate the world.
        </p>

        <input
          ref={inputRef}
          type="text"
          className="pm-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What would you like to change?"
          disabled={busy}
          autoComplete="off"
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {['Make it night', 'Replace the enemies with robots', 'Change this into a fire world', 'Make the player faster'].map((chip) => (
            <button key={chip} type="button" className="pm-btn pm-btn-outline" disabled={busy}
              onClick={() => { setText(chip); inputRef.current?.focus(); }}
              style={{ fontSize: '12px', padding: '4px 10px' }}>
              {chip}
            </button>
          ))}
        </div>

        {message && (
          <p style={{
            margin: 0,
            fontSize: '12px',
            lineHeight: 1.4,
            color: message.ok ? 'var(--pm-accent-teal)' : 'var(--pm-accent-orange)'
          }}>
            {message.ok ? '✓ ' : ''}{message.text}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" className="pm-btn pm-btn-muted" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="pm-btn pm-btn-primary" disabled={busy || !text.trim()}>
            {busy ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default QuickEditOverlay;
