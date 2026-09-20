// Context + hook live apart from AuthProvider.jsx because of the
// react-refresh/only-export-components lint rule (a component file may not also
// export non-components).
import { createContext, useContext } from 'react';

export const DISABLED_AUTH = Object.freeze({
  status: 'disabled', // 'disabled' | 'loading' | 'guest' | 'authed'
  user: null,
  profile: null,
  displayName: '',
  dialog: null,
  notice: null,
  openSignIn: () => {},
  closeSignIn: () => {},
  setDialogView: () => {},
  signOut: async () => {},
  requireAuth: () => false,
  dismissNotice: () => {},
  showNotice: () => {},
});

export const AuthContext = createContext(DISABLED_AUTH);

export const useAuth = () => useContext(AuthContext);
