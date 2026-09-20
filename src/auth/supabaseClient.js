// Supabase client (accounts, added 2026-09-19).
//
// Two rules:
//  1. Auth is OPTIONAL. Without both env vars the app behaves exactly as it did
//     before accounts existed (same philosophy as the keyless Gemini path), so a
//     deploy without the vars shows no auth UI at all. That makes shipping to
//     production safe BEFORE the Supabase project exists: accounts switch on
//     when the vars are added in Vercel and the site is redeployed.
//  2. The library is loaded LAZILY. `getSupabase()` is a module-memoized dynamic
//     import, so supabase-js is code-split off the first paint and share-link
//     boot timing is unaffected. The only boot that waits for it is an auth
//     callback (see authBoot.js).
//
// Only the PUBLIC anon/publishable key belongs here. The service-role key must
// never be VITE_-prefixed and never reach the client bundle.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isAuthConfigured = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY);

let clientPromise = null;

// Resolves to the client, or null when auth is not configured / failed to load.
// Never rejects: an auth failure must never break generation or play.
export const getSupabase = () => {
  if (!isAuthConfigured()) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js')
      .then(({ createClient }) =>
        // Library defaults on purpose: implicit flow + detectSessionInUrl +
        // localStorage persistence. Implicit flow keeps email-confirmation links
        // working when opened on a DIFFERENT device than the signup (PKCE keeps
        // the code verifier in the original browser and breaks that).
        createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      )
      .catch((err) => {
        console.warn('[AUTH] Supabase client failed to load:', err?.message || err);
        clientPromise = null;
        return null;
      });
  }
  return clientPromise;
};
