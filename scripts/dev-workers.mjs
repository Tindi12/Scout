/**
 * Start N Celery workers for local beta (Windows-safe --pool=solo).
 *
 * On Windows, worker_concurrency in celery_app.py does not parallelize solo
 * workers — each process runs one apply task at a time. This script spawns
 * multiple solo workers so friends' applications can run in parallel.
 *
 * Usage (from repo root):
 *   pnpm dev:workers          # default 3 workers (matches celery_app worker_concurrency)
 *   CELERY_WORKER_COUNT=2 pnpm dev:workers
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiDir = path.join(root, 'packages', 'api')
const isWin = process.platform === 'win32'
const uvCmd = isWin ? 'uv.exe' : 'uv'

const count = Math.max(
  1,
  parseInt(process.env.CELERY_WORKER_COUNT ?? '3', 10) || 3,
)

const children = []

const PREFIX_COLORS = {
  dev: '\x1b[90m',
}
const WORKER_COLORS = ['\x1b[33m', '\x1b[32m', '\x1b[34m', '\x1b[35m', '\x1b[36m']
const RESET = '\x1b[0m'

function workerColor(index) {
  return WORKER_COLORS[(index - 1) % WORKER_COLORS.length]
}

function prefix(name, chunk, stream = process.stdout, color = '') {
  const lines = chunk.toString().split(/\r?\n/)
  for (const line of lines) {
    if (line.length) stream.write(`${color}[${name}]${RESET} ${line}\n`)
  }
}

function logDev(message) {
  process.stdout.write(`${PREFIX_COLORS.dev}[dev:workers]${RESET} ${message}\n`)
}

function startWorker(index) {
  const name = `worker${index}`
  const color = workerColor(index)
  const args = [
    'run',
    'celery',
    '-A',
    'core.celery_app',
    'worker',
    '--pool=solo',
    '-n',
    `${name}@%h`,
    '-l',
    'info',
  ]

  const child = spawn(uvCmd, args, {
    cwd: apiDir,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  })
  child.stdout.on('data', (d) => prefix(name, d, process.stdout, color))
  child.stderr.on('data', (d) => prefix(name, d, process.stderr, color))
  child.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      process.stderr.write(
        `${color}[${name}]${RESET} exited with code ${code}${signal ? ` (${signal})` : ''}\n`,
      )
    }
  })
  children.push(child)
  return child
}

logDev(
  `Starting ${count} Celery worker(s) (--pool=solo, cwd packages/api)…`,
)
logDev('Requires Redis (REDIS_URL in packages/api/.env). Ctrl+C stops all workers.')

for (let i = 1; i <= count; i++) {
  startWorker(i)
}

let shuttingDown = false
function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  process.stdout.write('\n')
  logDev('Shutting down workers…')
  for (const child of children) {
    if (!child.killed) {
      if (isWin) {
        spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], {
          stdio: 'ignore',
          windowsHide: true,
        })
      } else {
        child.kill('SIGTERM')
      }
    }
  }
  setTimeout(() => process.exit(0), 500)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
