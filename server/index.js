import 'dotenv/config'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCompareRouter } from './features/compare/compareRoutes.js'
import { createCandidateRouter } from './features/places/candidateRoutes.js'
import { createRouteRouter } from './features/routes/routeRoutes.js'

const PORT = Number(process.env.PORT || 5174)

const app = express()
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.use('/api', createCompareRouter())
app.use('/api', createCandidateRouter())
app.use('/api', createRouteRouter())

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '../dist')
const distIndex = path.join(distDir, 'index.html')
if (fs.existsSync(distIndex)) {
  app.use(express.static(distDir))
  // Express 5 + path-to-regexp v6 不支持 '*'，用正则兜底，同时避免吃掉 /api
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => res.sendFile(distIndex))
}

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`)
})
