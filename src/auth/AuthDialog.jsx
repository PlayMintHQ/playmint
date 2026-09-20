// Sign-in dialog + auth toast. Rendered by App INSIDE the fullscreen container.
//
// Key handling is a NATIVE window-capture listener on purpose: App's global
// capture guard calls stopPropagation() for events inside [data-pm-modal]
// (so Space/Enter on these buttons can't jump/restart the game), and that runs
// before React's root listener — a React onKeyDown here would never fire.
// Enter-to-submit needs no handler: these are real <form>s.
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './authContext';
import { getSupabase } from './supabaseClient';
import { rememberReturnPath } from './authBoot';

const MIN_PASSWORD = 8;

const REASON_TITLES = {
  'my-games': 'Sign in to see your games',
  save: 'Sign in to save this game',
};

const redirectUrl = () => window.location.origin + window.location.pathname;

const friendlyError = (err) => {
  const code = err?.code || '';
  const msg = err?.message || '';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) {
    return 'Wrong email or password.';
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) {
    return 'Please confirm your email first. Check your inbox, or resend the link below.';
  }
  if (code === 'over_email_send_rate_limit' || /rate limit/i.test(msg)) {
    return 'Too many emails were sent just now. Please wait a few minutes and try again.';
  }
  if (code === 'user_already_exists' || /already registered/i.test(msg)) {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (code === 'weak_password' || /password should/i.test(msg)) {
    return `Please choose a stronger password (at least ${MIN_PASSWORD} characters).`;
  }
  if (code === 'same_password') return 'The new password must be different from the old one.';
  if (/failed to fetch|network/i.test(msg)) return 'Network problem. Check your connection and try again.';
  return msg || 'Something went wrong. Please try again.';
};

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

function AuthDialogBody({ dialog }) {
  const { closeSignIn, setDialogView, showNotice } = useAuth();
  const view = dialog.view;
  const rootRef = useRef(null);
  const firstFieldRef = useRef(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(dialog.error || '');
  const [info, setInfo] = useState('');

  // Focus in on open, restore to the opener on close.
  useEffect(() => {
    const opener = document.activeElement;
    return () => {
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
        try { opener.focus({ preventScroll: true }); } catch { /* ignore */ }
      }
    };
  }, []);

  useEffect(() => {
    const el = firstFieldRef.current;
    if (el) {
      try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
    }
  }, [view]);

  // Esc + Tab trap (native capture listener — see the file header).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        closeSignIn();
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
  }, [closeSignIn]);

  const switchView = (next) => {
    setError('');
    setInfo('');
    setPassword('');
    setDialogView(next);
  };

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const supabase = await getSupabase();
      if (!supabase) throw new Error('Accounts are not available right now.');
      await fn(supabase);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSignIn = (e) => {
    e.preventDefault();
    run(async (supabase) => {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) throw err;
      // Success: the provider's SIGNED_IN handler closes the dialog.
    });
  };

  const handleSignUp = (e) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`Please use at least ${MIN_PASSWORD} characters for the password.`);
      return;
    }
    run(async (supabase) => {
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: redirectUrl() },
      });
      if (err) throw err;
      if (data?.session) return; // confirmation disabled → already signed in
      // With confirmation ON, Supabase answers an EXISTING email with an
      // obfuscated fake user (no identities) instead of an error.
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setError('An account with this email already exists. Sign in instead.');
        return;
      }
      setPassword('');
      setDialogView('check-email');
    });
  };

  const handleResend = () => {
    if (!email.trim()) {
      setError('Enter your email address first.');
      return;
    }
    run(async (supabase) => {
      const { error: err } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: redirectUrl() },
      });
      if (err) throw err;
      setInfo('Sent. Check your inbox (and the spam folder).');
    });
  };

  const handleForgot = (e) => {
    e.preventDefault();
    run(async (supabase) => {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl(),
      });
      if (err) throw err;
      setInfo('If that email has an account, a reset link is on its way.');
    });
  };

  const handleNewPassword = (e) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`Please use at least ${MIN_PASSWORD} characters for the password.`);
      return;
    }
    run(async (supabase) => {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      showNotice('Password updated.');
      closeSignIn();
    });
  };

  const handleGoogle = () => {
    run(async (supabase) => {
      // Full-page redirect (no popup — popups are unreliable on iOS Safari).
      // Ask App to flush the freshest config into the hash, then remember where
      // we are so authBoot brings the user back to this exact game.
      window.dispatchEvent(new CustomEvent('pm-flush-share-hash'));
      rememberReturnPath();
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl() },
      });
      if (err) throw err;
    });
  };

  const title =
    view === 'sign-up' ? 'Create your account'
      : view === 'check-email' ? 'Check your email'
        : view === 'forgot' ? 'Reset your password'
          : view === 'new-password' ? 'Choose a new password'
            : (REASON_TITLES[dialog.reason] || 'Sign in to PlayMint');

  const emailField = (
    <div className="pm-auth__field">
      <label className="pm-label" htmlFor="pm-auth-email">Email</label>
      <input
        ref={firstFieldRef}
        id="pm-auth-email"
        className="pm-input"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
    </div>
  );

  const passwordField = (isNew, ref) => (
    <div className="pm-auth__field">
      <label className="pm-label" htmlFor="pm-auth-password">{isNew ? 'New password' : 'Password'}</label>
      <input
        ref={ref}
        id="pm-auth-password"
        className="pm-input"
        type="password"
        autoComplete={isNew ? 'new-password' : 'current-password'}
        minLength={isNew ? MIN_PASSWORD : undefined}
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {isNew && <p className="pm-auth__hint">At least {MIN_PASSWORD} characters.</p>}
    </div>
  );

  const messages = (
    <>
      {error && <p className="pm-auth__error" role="alert">{error}</p>}
      {info && <p className="pm-auth__info" role="status">{info}</p>}
    </>
  );

  const googleBlock = (
    <>
      <button type="button" className="pm-btn pm-auth__google" onClick={handleGoogle} disabled={busy}>
        <GoogleMark /> Continue with Google
      </button>
      <div className="pm-auth__divider"><span>or</span></div>
    </>
  );

  return (
    <div
      className="pm-auth-backdrop"
      data-pm-modal=""
      onPointerDown={(e) => { if (e.target === e.currentTarget) closeSignIn(); }}
    >
      <div
        ref={rootRef}
        className="pm-auth pm-glass-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pm-auth-title"
      >
        <button type="button" className="pm-auth__close" aria-label="Close" onClick={closeSignIn}>✕</button>
        <h2 id="pm-auth-title" className="pm-auth__title">{title}</h2>

        {view === 'sign-in' && (
          <>
            <p className="pm-auth__sub">Playing never needs an account. Sign in to keep your games.</p>
            {googleBlock}
            <form onSubmit={handleSignIn}>
              {emailField}
              {passwordField(false)}
              {messages}
              <button type="submit" className="pm-btn pm-btn-primary pm-auth__submit" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            <div className="pm-auth__links">
              <button type="button" className="pm-auth__link" onClick={() => switchView('forgot')}>Forgot password?</button>
              <button type="button" className="pm-auth__link" onClick={handleResend} disabled={busy}>Resend confirmation</button>
            </div>
            <p className="pm-auth__switch">
              New here?{' '}
              <button type="button" className="pm-auth__link" onClick={() => switchView('sign-up')}>Create an account</button>
            </p>
          </>
        )}

        {view === 'sign-up' && (
          <>
            <p className="pm-auth__sub">Free. We only use your email to sign you in.</p>
            {googleBlock}
            <form onSubmit={handleSignUp}>
              {emailField}
              {passwordField(true)}
              {messages}
              <button type="submit" className="pm-btn pm-btn-primary pm-auth__submit" disabled={busy}>
                {busy ? 'Creating account…' : 'Create account'}
              </button>
            </form>
            <p className="pm-auth__switch">
              Already have an account?{' '}
              <button type="button" className="pm-auth__link" onClick={() => switchView('sign-in')}>Sign in</button>
            </p>
          </>
        )}

        {view === 'check-email' && (
          <>
            <p className="pm-auth__sub">
              We sent a confirmation link to <strong>{email.trim() || 'your email'}</strong>. Open it on any
              device and you will land back here, signed in.
            </p>
            {messages}
            <button type="button" className="pm-btn pm-btn-outline pm-auth__submit" onClick={handleResend} disabled={busy}>
              {busy ? 'Sending…' : 'Resend the email'}
            </button>
            <p className="pm-auth__switch">
              <button ref={firstFieldRef} type="button" className="pm-auth__link" onClick={() => switchView('sign-in')}>Back to sign in</button>
            </p>
          </>
        )}

        {view === 'forgot' && (
          <>
            <p className="pm-auth__sub">Enter your email and we will send you a link to choose a new password.</p>
            <form onSubmit={handleForgot}>
              {emailField}
              {messages}
              <button type="submit" className="pm-btn pm-btn-primary pm-auth__submit" disabled={busy}>
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
            <p className="pm-auth__switch">
              <button type="button" className="pm-auth__link" onClick={() => switchView('sign-in')}>Back to sign in</button>
            </p>
          </>
        )}

        {view === 'new-password' && (
          <form onSubmit={handleNewPassword}>
            {passwordField(true, firstFieldRef)}
            {messages}
            <button type="submit" className="pm-btn pm-btn-primary pm-auth__submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function AuthDialog() {
  const { dialog, notice, dismissNotice } = useAuth();

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(dismissNotice, 5000);
    return () => clearTimeout(t);
  }, [notice, dismissNotice]);

  return (
    <>
      {notice && (
        <div className="pm-auth-toast" role="status" onClick={dismissNotice}>{notice}</div>
      )}
      {dialog && <AuthDialogBody dialog={dialog} />}
    </>
  );
}
