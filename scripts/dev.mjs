/**
 * Start web + API without Windows "Terminate batch job?" cascades from uvicorn reload.
 * Spawns processes directly (no nested cmd) and only reloads Python app code dirs.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const webDir = path.join(root, 'packages', 'web')
const apiDir = path.join(root, 'packages', 'api')
const isWin = process.platform === 'win32'

const python = isWin
  ? path.join(apiDir, '.venv', 'Scripts', 'python.exe')
  : path.join(apiDir, '.venv', 'bin', 'python')

const uvicornArgs = [
  '-m',
  'uvicorn',
  'main:app',
  '--host',
  '127.0.0.1',
  '--port',
  '8000',
  '--reload',
  '--reload-delay',
  '0.75',
  '--reload-dir',
  'routes',
  '--reload-dir',
  'services',
  '--reload-dir',
  'core',
  '--reload-dir',
  'tasks',
]

const children = []

function prefix(name, chunk) {
  const lines = chunk.toString().split(/\r?\n/)
  for (const line of lines) {
    if (line.length) process.stdout.write(`[${name}] ${line}\n`)
  }
}

function start(name, cwd, command, args, useShell = false) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: useShell,
    windowsHide: true,
  })
  child.stdout.on('data', (d) => prefix(name, d))
  child.stderr.on('data', (d) => prefix(name, d))
  child.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`[${name}] exited with code ${code}${signal ? ` (${signal})` : ''}`)
    }
  })
  children.push(child)
  return child
}

console.log('[dev] Starting web (Next.js) + api (uvicorn)…')
console.log('[dev] API reload watches: routes, services, core, tasks only')

start('web', webDir, isWin ? 'pnpm.cmd' : 'pnpm', ['dev'], isWin)
start('api', apiDir, python, uvicornArgs, false)

let shuttingDown = false
function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  console.log('\n[dev] Shutting down…')
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
