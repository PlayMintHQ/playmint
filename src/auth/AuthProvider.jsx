// Accounts provider (Supabase Auth). Holds auth STATE only — the dialog itself
// is rendered by App inside the fullscreen container (anything outside that
// element is invisible in fullscreen), reading this context.
//
// Lint/StrictMode notes: state is only ever set inside subscription / promise
// callbacks (react-hooks/set-state-in-effect), and the `cancelled` flag stops
// StrictMode's torn-down first effect pass from subscribing late.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthContext } from './authContext';
import { getSupabase, isAuthConfigured } from './supabaseClient';
import { getBootAuthIntent, clearBootAuthIntent } from './authBoot';

const deriveDisplayName = (user, profile) => {
  if (!user) return '';
  const meta = user.user_metadata || {};
  const fromEmail = (user.email || '').split('@')[0];
  return (profile?.display_name || meta.full_name || meta.name || fromEmail || 'Player').trim();
};

export default function AuthProvider({ children }) {
  const [status, setStatus] = useState(() => (isAuthConfigured() ? 'loading' : 'disabled'));
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [dialog, setDialog] = useState(null); // { view, reason, error }
  const [notice, setNotice] = useState(null);
  const pendingActionRef = useRef(null);

  useEffect(() => {
    if (!isAuthConfigured()) return undefined;
    let cancelled = false;
    let subscription = null;

    getSupabase().then((supabase) => {
      if (cancelled) return;
      if (!supabase) {
        setStatus('disabled');
        return;
      }

      // NEVER await a supabase call inside this callback (auth-js holds a lock
      // while it runs — awaiting another auth/db call here deadlocks). Anything
      // async hangs off state instead (see the profile effect below).
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (cancelled) return;
        const nextUser = session?.user ?? null;
        setUser(nextUser);
        setStatus(nextUser ? 'authed' : 'guest');
        if (event === 'SIGNED_OUT') setProfile(null);
        if (event === 'PASSWORD_RECOVERY') setDialog({ view: 'new-password' });
        if (event === 'SIGNED_IN') {
          setDialog((d) => (d && (d.view === 'sign-in' || d.view === 'sign-up') ? null : d));
          const pending = pendingActionRef.current;
          pendingActionRef.current = null;
          if (typeof pending === 'function') setTimeout(pending, 0);
        }
      });
      subscription = data.subscription;

      // An auth callback was consumed before React rendered (authBoot.js), so
      // its events fired before this subscription existed. Replay the intent.
      const intent = getBootAuthIntent();
      if (intent) {
        clearBootAuthIntent();
        if (intent.errorCode) {
          const expired = intent.errorCode === 'otp_expired' || intent.errorCode === 'access_denied';
          setDialog({
            view: 'sign-in',
            error: expired
              ? 'That email link has expired or was already used. Sign in, or sign up again to get a fresh link.'
              : (intent.errorDescription || 'Sign-in could not be completed. Please try again.'),
          });
        } else if (intent.type === 'recovery') {
          setDialog({ view: 'new-password' });
        } else if (intent.type === 'signup') {
          setNotice('Email confirmed. You are signed in.');
        }
      }
    });

    return () => {
      cancelled = true;
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  // Profile row (created by the handle_new_user DB trigger on first sign-in).
  // A missing table or row is fine — the display name falls back to metadata.
  const userId = user?.id || null;
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    getSupabase().then(async (supabase) => {
      if (!supabase || cancelled) return;
      try {
        const { data } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', userId)
          .maybeSingle();
        if (!cancelled) setProfile(data || null);
      } catch { /* profile is cosmetic — never block auth on it */ }
    });
    return () => { cancelled = true; };
  }, [userId]);

  const openSignIn = useCallback((reason = null, view = 'sign-in') => {
    if (!isAuthConfigured()) return;
    setDialog({ view, reason });
  }, []);

  const closeSignIn = useCallback(() => {
    pendingActionRef.current = null;
    setDialog(null);
  }, []);

  const setDialogView = useCallback((view) => {
    setDialog((d) => (d ? { ...d, view, error: null } : d));
  }, []);

  const signOut = useCallback(async () => {
    const supabase = await getSupabase();
    if (!supabase) return;
    // 'local' = this device only; the default ('global') would silently sign
    // the user out of their phone when they sign out on their laptop.
    try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
  }, []);

  // Gate for actions that need an account (Week 2: Save). Returns true when the
  // caller may proceed now; otherwise opens the dialog and runs `onAuthed` after
  // a successful sign-in (password flow — an OAuth redirect reloads the page).
  const isAuthed = status === 'authed';
  const requireAuth = useCallback((reason, onAuthed) => {
    if (isAuthed) return true;
    pendingActionRef.current = typeof onAuthed === 'function' ? onAuthed : null;
    openSignIn(reason);
    return false;
  }, [isAuthed, openSignIn]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  const value = useMemo(() => ({
    status,
    user,
    profile,
    displayName: deriveDisplayName(user, profile),
    dialog,
    notice,
    openSignIn,
    closeSignIn,
    setDialogView,
    signOut,
    requireAuth,
    dismissNotice,
    showNotice: setNotice,
  }), [status, user, profile, dialog, notice, openSignIn, closeSignIn, setDialogView, signOut, requireAuth, dismissNotice]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
