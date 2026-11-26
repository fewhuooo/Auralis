import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const rawTarget = (process.argv[2] || '').trim().toLowerCase()
if (rawTarget !== 'phone' && rawTarget !== 'tablet') {
  console.error(`[tauri-android-build] Invalid target "${rawTarget}". Expected "phone" or "tablet".`)
  process.exit(1)
}

const buildArgs = process.argv.slice(3)
const finalArgs = buildArgs.length > 0 ? buildArgs : ['--debug', '--apk', '--target', 'aarch64']

const stalePaths = [
  '../src-tauri/gen/android/app/src/main/assets',
  '../src-tauri/gen/android/app/build/intermediates/assets',
  '../src-tauri/gen/android/app/build/intermediates/merged_manifests',
  '../src-tauri/gen/android/app/build/outputs/apk',
]
for (const relPath of stalePaths) {
  rmSync(fileURLToPath(new URL(relPath, import.meta.url)), { recursive: true, force: true })
}

const tauriCli = fileURLToPath(new URL('../node_modules/@tauri-apps/cli/tauri.js', import.meta.url))
const result = spawnSync(
  process.execPath,
  [tauriCli, 'android', 'build', '--config', `src-tauri/tauri.${rawTarget}.conf.json`, ...finalArgs],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      AURALIS_APP_TARGET: rawTarget,
      VITE_APP_TARGET: rawTarget,
    },
  },
)

if (result.error) {
  console.error('[tauri-android-build] Failed to launch Tauri CLI:', result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)
