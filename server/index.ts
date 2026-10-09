import express from 'express'
import path from 'node:path'
import { createApiApp } from './fileApi'

// Production server: serves the built app from dist/ and mounts the SAME
// file API used in dev, so behaviour is identical. Run with `pnpm start`.
const root = process.cwd()
const distDir = path.join(root, 'dist')
const port = Number(process.env.PORT) || 4321

const app = express()

app.use('/api', createApiApp(root))
app.use(express.static(distDir))

// SPA fallback (Express 5 needs a RegExp rather than '*').
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

app.listen(port, () => {
  console.log(`\n  Poster Studio  →  http://localhost:${port}\n`)
})
