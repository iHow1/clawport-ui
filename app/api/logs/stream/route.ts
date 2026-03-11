import { spawn } from 'child_process'
import { requireEnv } from '@/lib/env'

const MAX_LIFETIME_MS = 10 * 60 * 1000 // 10 minutes
const HEARTBEAT_INTERVAL_MS = 15 * 1000 // 15 seconds

export async function GET(request: Request) {
  const encoder = new TextEncoder()
  let child: ReturnType<typeof spawn> | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let lifetime: ReturnType<typeof setTimeout> | null = null
  let closed = false

  const stream = new ReadableStream({
    start(controller) {
      function send(event: string | null, payload: string) {
        if (closed) return
        const prefix = event ? `event: ${event}\n` : ''
        try {
          controller.enqueue(encoder.encode(`${prefix}data: ${payload}\n\n`))
        } catch {
          closed = true
        }
      }

      function closeStream() {
        if (closed) return
        closed = true
        try {
          controller.close()
        } catch {
          // Stream is already closed.
        }
      }

      const openclawBin = requireEnv('OPENCLAW_BIN')

      try {
        child = spawn(openclawBin, ['logs', '--follow', '--json'], {
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to spawn openclaw'
        send('error', JSON.stringify({ error: msg }))
        closeStream()
        return
      }

      let buffer = ''

      child.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          send(null, line)
        }
      })

      child.stderr?.on('data', (chunk: Buffer) => {
        const msg = chunk.toString().trim()
        if (msg) {
          send('error', JSON.stringify({ error: msg }))
        }
      })

      child.on('error', (err) => {
        send('error', JSON.stringify({ error: err.message }))
        cleanup()
        closeStream()
      })

      child.on('close', (code) => {
        if (code !== null && code !== 0) {
          send('error', JSON.stringify({ error: `Process exited with code ${code}` }))
        }
        cleanup()
        closeStream()
      })

      // Heartbeat to prevent proxy timeouts
      heartbeat = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          closed = true
        }
      }, HEARTBEAT_INTERVAL_MS)

      // Max lifetime safety valve
      lifetime = setTimeout(() => {
        cleanup()
        send('error', JSON.stringify({ error: 'Stream max lifetime reached' }))
        closeStream()
      }, MAX_LIFETIME_MS)

      // Cleanup on client disconnect
      request.signal.addEventListener('abort', () => {
        cleanup()
        closeStream()
      })

      function cleanup() {
        if (heartbeat) { clearInterval(heartbeat); heartbeat = null }
        if (lifetime) { clearTimeout(lifetime); lifetime = null }
        if (child) { child.kill('SIGTERM'); child = null }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
