import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpServer } from './mcp/server.js'
import { buildIndex, getSkillIndex, getAgentIndex } from './services/indexer.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PORT = parseInt(process.env.PORT ?? '3001', 10)
const SKILLS_DIR = process.env.SKILLS_DIR ?? join(__dirname, '..', '..', 'skills')
const AGENTS_DIR = process.env.AGENTS_DIR ?? join(__dirname, '..', '..', 'agents')

export function createApp() {
  const app = express()

  app.use(cors())
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
  app.use(express.json())

  type SessionEntry = { transport: StreamableHTTPServerTransport }
  const activeSessions = new Map<string, SessionEntry>()

  app.all('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined

    if (sessionId) {
      const entry = activeSessions.get(sessionId)
      if (!entry) {
        res.status(404).json({ error: 'Session not found' })
        return
      }
      await entry.transport.handleRequest(req, res, req.body)
      return
    }

    if (req.method !== 'POST') {
      res.status(400).json({ error: 'Bad Request: session ID required for non-POST requests' })
      return
    }

    const server = createMcpServer()
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        activeSessions.set(sid, { transport })
        console.log(`[mcp] session opened: ${sid} (active: ${activeSessions.size})`)
      },
    })

    transport.onclose = () => {
      const sid = transport.sessionId
      if (sid) {
        activeSessions.delete(sid)
        console.log(`[mcp] session closed: ${sid} (active: ${activeSessions.size})`)
      }
    }

    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  })

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      skills: getSkillIndex().size,
      agents: getAgentIndex().size,
      sessions: activeSessions.size,
      ts: new Date().toISOString(),
    })
  })

  return { app, activeSessions }
}

async function main() {
  buildIndex(SKILLS_DIR, AGENTS_DIR)

  const { app } = createApp()

  const server = app.listen(PORT, () => {
    console.log(`\nSkills Collection MCP Server`)
    console.log(`  MCP:    http://localhost:${PORT}/mcp`)
    console.log(`  Health: http://localhost:${PORT}/health\n`)
  })

  const shutdown = () => {
    console.log('[server] shutting down...')
    server.close(() => {
      console.log('[server] done')
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 5_000)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  console.error('[fatal]', err)
  process.exit(1)
})
