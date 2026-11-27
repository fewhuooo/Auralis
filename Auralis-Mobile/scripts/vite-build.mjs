import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const rawTarget = (process.argv[2] || process.env.VITE_APP_TARGET || 'phone').trim().toLowerCase()
if (rawTarget !== 'phone' && rawTarget !== 'tablet') {
  console.error(`[vite-build] Invalid target "${rawTarget}". Expected "phone" or "tablet".`)
  process.exit(1)
}

const command = (process.argv[3] || 'build').trim().toLowerCase()
if (command !== 'build' && command !== 'dev') {
  console.error(`[vite-build] Invalid command "${command}". Expected "build" or "dev".`)
  process.exit(1)
}

const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const args = [viteBin, ...(command === 'build' ? ['build'] : []), ...process.argv.slice(4)]
const result = spawnSync(process.execPath, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_APP_TARGET: rawTarget,
  },
})

if (result.error) {
  console.error('[vite-build] Failed to launch Vite:', result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)
