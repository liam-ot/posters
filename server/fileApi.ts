import express, { type Express } from 'express'
import path from 'node:path'
import fs from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { nanoid } from 'nanoid'
import type { CustomFontMeta, PosterDoc, PosterSummary } from '../src/types/poster'

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'

function runFfmpeg(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { cwd })
    let stderr = ''
    proc.stderr.on('data', (d) => (stderr += d.toString()))
    proc.on('error', (e) => reject(e))
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(stderr.slice(-2000))),
    )
  })
}

interface VideoSession {
  dir: string
  fps: number
  filename: string
}

/**
 * Creates the local file API as an Express app, mounted at `/api` in both dev
 * (Vite middleware) and prod. `rootDir` is the project root: exported posters
 * (png/jpg/mp4) are written there; poster docs and fonts live under data/.
 */
export function createApiApp(rootDir: string): Express {
  const dataDir = path.join(rootDir, 'data')
  const postersDir = path.join(dataDir, 'posters')
  const postersIndex = path.join(dataDir, 'index.json')
  const fontsDir = path.join(dataDir, 'fonts')
  const fontsIndex = path.join(fontsDir, 'index.json')
  const videoDir = path.join(dataDir, '.video')
  const videoSessions = new Map<string, VideoSession>()

  const ensureDir = (dir: string) => fs.mkdir(dir, { recursive: true })

  async function readJson<T>(file: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8')) as T
    } catch {
      return fallback
    }
  }

  // Reject anything that isn't a plain nanoid-style id (no path traversal).
  const safeId = (id: string) => /^[A-Za-z0-9_-]+$/.test(id)

  const safeName = (name: string) =>
    String(name || 'poster')
      .replace(/[^a-z0-9_\- ]/gi, '')
      .trim()
      .replace(/\s+/g, '-') || 'poster'

  // Resolve a non-clobbering path in the project root: poster.png, poster-1.png…
  async function uniquePath(base: string, ext: string): Promise<string> {
    let candidate = path.join(rootDir, `${base}.${ext}`)
    let n = 1
    while (true) {
      try {
        await fs.access(candidate)
        candidate = path.join(rootDir, `${base}-${n}.${ext}`)
        n++
      } catch {
        return candidate
      }
    }
  }

  const app = express()
  app.use(express.json({ limit: '512mb' }))

  app.get('/health', (_req, res) => {
    res.json({ ok: true, root: rootDir })
  })

  // ---- Posters (CRUD) -----------------------------------------------------
  app.get('/posters', async (_req, res) => {
    const list = await readJson<PosterSummary[]>(postersIndex, [])
    list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    res.json(list)
  })

  app.get('/posters/:id', async (req, res) => {
    if (!safeId(req.params.id)) return void res.status(400).end()
    const doc = await readJson<PosterDoc | null>(
      path.join(postersDir, `${req.params.id}.json`),
      null,
    )
    if (!doc) return void res.status(404).end()
    res.json(doc)
  })

  app.get('/posters/:id/thumb', async (req, res) => {
    if (!safeId(req.params.id)) return void res.status(400).end()
    const file = path.join(postersDir, `${req.params.id}.thumb.png`)
    try {
      await fs.access(file)
      res.sendFile(file)
    } catch {
      res.status(404).end()
    }
  })

  app.put('/posters/:id', async (req, res) => {
    const { id } = req.params
    if (!safeId(id)) return void res.status(400).end()
    const { doc, thumbnail } = req.body ?? {}
    if (!doc || doc.id !== id) {
      return void res.status(400).json({ error: 'doc with matching id required' })
    }
    await ensureDir(postersDir)
    await fs.writeFile(
      path.join(postersDir, `${id}.json`),
      JSON.stringify(doc, null, 2),
    )

    if (typeof thumbnail === 'string' && thumbnail.startsWith('data:image')) {
      const base64 = thumbnail.slice(thumbnail.indexOf(',') + 1)
      await fs.writeFile(
        path.join(postersDir, `${id}.thumb.png`),
        Buffer.from(base64, 'base64'),
      )
    }

    const list = await readJson<PosterSummary[]>(postersIndex, [])
    const summary: PosterSummary = {
      id: doc.id,
      name: doc.name,
      updatedAt: doc.updatedAt,
      width: doc.artboard.width,
      height: doc.artboard.height,
    }
    const i = list.findIndex((p) => p.id === id)
    if (i >= 0) list[i] = summary
    else list.push(summary)
    await fs.writeFile(postersIndex, JSON.stringify(list, null, 2))

    res.json({ ok: true })
  })

  app.delete('/posters/:id', async (req, res) => {
    const { id } = req.params
    if (!safeId(id)) return void res.status(400).end()
    await fs.rm(path.join(postersDir, `${id}.json`), { force: true })
    await fs.rm(path.join(postersDir, `${id}.thumb.png`), { force: true })
    const list = await readJson<PosterSummary[]>(postersIndex, [])
    await fs.writeFile(
      postersIndex,
      JSON.stringify(
        list.filter((p) => p.id !== id),
        null,
        2,
      ),
    )
    res.json({ ok: true })
  })

  // ---- Image export (writes png/jpg to the project ROOT) ------------------
  app.post('/export', async (req, res) => {
    const { filename, format, dataBase64 } = req.body ?? {}
    if (!dataBase64) {
      return void res.status(400).json({ error: 'dataBase64 required' })
    }
    const ext = format === 'jpg' ? 'jpg' : 'png'
    const file = await uniquePath(safeName(filename), ext)
    await fs.writeFile(file, Buffer.from(dataBase64, 'base64'))
    res.json({ path: path.relative(rootDir, file) })
  })

  // ---- Video export (frames -> ffmpeg -> mp4 in project ROOT) -------------
  app.post('/export/video/start', async (req, res) => {
    const { fps, filename } = req.body ?? {}
    const sessionId = nanoid()
    const dir = path.join(videoDir, sessionId)
    await fs.mkdir(dir, { recursive: true })
    videoSessions.set(sessionId, {
      dir,
      fps: Number(fps) || 30,
      filename: safeName(filename),
    })
    res.json({ sessionId })
  })

  app.post('/export/video/frame', async (req, res) => {
    const { sessionId, index, dataBase64 } = req.body ?? {}
    const session = videoSessions.get(sessionId)
    if (!session) return void res.status(404).json({ error: 'unknown session' })
    const name = `frame${String(index).padStart(5, '0')}.png`
    await fs.writeFile(
      path.join(session.dir, name),
      Buffer.from(dataBase64, 'base64'),
    )
    res.json({ ok: true })
  })

  app.post('/export/video/finish', async (req, res) => {
    const { sessionId } = req.body ?? {}
    const session = videoSessions.get(sessionId)
    if (!session) return void res.status(404).json({ error: 'unknown session' })
    const out = await uniquePath(session.filename, 'mp4')
    try {
      await runFfmpeg(
        [
          '-y',
          '-framerate',
          String(session.fps),
          '-i',
          'frame%05d.png',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          // force even dimensions (H.264 requirement) regardless of artboard size
          '-vf',
          'scale=trunc(iw/2)*2:trunc(ih/2)*2',
          '-movflags',
          '+faststart',
          out,
        ],
        session.dir,
      )
      res.json({ path: path.relative(rootDir, out) })
    } catch (e) {
      res.status(500).json({ error: (e as Error).message })
    } finally {
      videoSessions.delete(sessionId)
      fs.rm(session.dir, { recursive: true, force: true }).catch(() => {})
    }
  })

  // ---- Fonts --------------------------------------------------------------
  app.get('/fonts', async (_req, res) => {
    const list = await readJson<CustomFontMeta[]>(fontsIndex, [])
    res.json(list)
  })

  app.post('/fonts', async (req, res) => {
    const { family, fileName, ext, dataBase64 } = req.body ?? {}
    if (!family || !dataBase64) {
      return void res.status(400).json({ error: 'family and dataBase64 are required' })
    }
    await ensureDir(fontsDir)
    const id = nanoid()
    const safeExt = String(ext || 'ttf').replace(/[^a-z0-9]/gi, '') || 'ttf'
    await fs.writeFile(
      path.join(fontsDir, `${id}.${safeExt}`),
      Buffer.from(dataBase64, 'base64'),
    )
    const list = await readJson<CustomFontMeta[]>(fontsIndex, [])
    const meta: CustomFontMeta = {
      id,
      family,
      fileName: fileName || family,
      ext: safeExt,
    }
    list.push(meta)
    await fs.writeFile(fontsIndex, JSON.stringify(list, null, 2))
    res.json(meta)
  })

  app.get('/fonts/file/:id', async (req, res) => {
    if (!safeId(req.params.id)) return void res.status(400).end()
    const list = await readJson<CustomFontMeta[]>(fontsIndex, [])
    const meta = list.find((f) => f.id === req.params.id)
    if (!meta) return void res.status(404).end()
    res.sendFile(path.join(fontsDir, `${meta.id}.${meta.ext}`))
  })

  return app
}
