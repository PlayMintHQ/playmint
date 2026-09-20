import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AuthProvider from './auth/AuthProvider.jsx'
import { hasAuthCallbackParams, consumeAuthCallback } from './auth/authBoot.js'

const AUTH_CALLBACK_TIMEOUT_MS = 6000

// An auth callback (#access_token=… / #error=…) is consumed BEFORE React
// renders, because the app owns the URL hash (#config= share links) — see
// src/auth/authBoot.js. Every other boot renders immediately and loads the
// auth client lazily. The race + catch guarantee the app ALWAYS renders, even
// if the auth chunk or the network hangs.
async function boot() {
  if (hasAuthCallbackParams()) {
    try {
      await Promise.race([
        consumeAuthCallback(),
        new Promise((resolve) => setTimeout(resolve, AUTH_CALLBACK_TIMEOUT_MS)),
      ])
    } catch (err) {
      console.warn('[AUTH] callback handling failed:', err?.message || err)
    }
  }

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </StrictMode>,
  )
}

boot()
