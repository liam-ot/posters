import type { Plugin } from 'vite'
import { createApiApp } from './server/fileApi'

/**
 * Mounts the local file API on the Vite dev server so a single `pnpm dev`
 * serves the React app (with HMR) AND the `/api` endpoints on one origin.
 * No proxy, no CORS.
 */
export function fileApiPlugin(): Plugin {
  return {
    name: 'poster-file-api',
    configureServer(server) {
      const app = createApiApp(process.cwd())
      server.middlewares.use('/api', app)
    },
  }
}
