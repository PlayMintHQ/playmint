import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'
import { Buffer } from 'node:buffer'

// Dev-only Blob endpoints (2026-11-07). Plain `npm run dev` has no /api, so the
// asset cache's uploads silently no-op locally. With PM_DEV_API=1 the two Blob
// routes (api/games/upload.js — the client-upload token endpoint — and
// api/games/list.js) are served by the dev server itself, using the server-only
// BLOB_READ_WRITE_TOKEN from .env (never exposed to the client bundle).
// Uploads then go to the REAL shared store, exactly like production — which is
// why it is opt-in: `PM_DEV_API=1 npm run dev` (used for the Quick Start warm-up).
function devBlobApi(env) {
  return {
    name: 'pm-dev-blob-api',
    apply: 'serve',
    configureServer(server) {
      if ((process.env.PM_DEV_API || env.PM_DEV_API) !== '1') return
      for (const key of ['BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID']) {
        if (env[key] && !process.env[key]) process.env[key] = env[key]
      }
      const routes = {
        '/api/games/upload': '/api/games/upload.js',
        '/api/games/list': '/api/games/list.js'
      }
      let listCache = null // { at, body } — the list fans out to every meta.json
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url || '').split('?')[0]
        const file = routes[path]
        if (!file) return next()
        try {
          if (path === '/api/games/list' && req.method === 'GET' && listCache && Date.now() - listCache.at < 60000) {
            res.setHeader('Content-Type', 'application/json')
            res.end(listCache.body)
            return
          }
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const raw = Buffer.concat(chunks).toString('utf8')
          req.body = raw ? JSON.parse(raw) : undefined
          let sent = ''
          res.status = (code) => { res.statusCode = code; return res }
          res.json = (obj) => {
            sent = JSON.stringify(obj)
            res.setHeader('Content-Type', 'application/json')
            res.end(sent)
            return res
          }
          const mod = await server.ssrLoadModule(file)
          await mod.default(req, res)
          if (path === '/api/games/list' && res.statusCode === 200 && sent) listCache = { at: Date.now(), body: sent }
          if (path === '/api/games/upload' && req.method === 'POST') listCache = null
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err?.message || String(err) }))
        }
      })
      server.config.logger.info('[pm-dev-api] /api/games/upload + /api/games/list served locally — uploads go to the REAL Blob store')
    }
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), devBlobApi(env)],
  }
})
