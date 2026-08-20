import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const scanRoots = ['src/api', 'src/store', 'src/services', 'src/pages', 'src/config', 'src/App.vue']
const ignored = new Set([
  'src/api/generated/schema.ts',
  'src/services/localDb.ts',
])
const forbidden = [
  { label: 'legacy response wrapper', pattern: /(?:body|response|res\.data)\s*(?:&&|\?)?[^\n]{0,80}\.code\s*===?\s*200/ },
  { label: 'legacy websocket endpoint', pattern: /\/ws\/sync/ },
  { label: 'fixed local address', pattern: /(?:127\.0\.0\.1|localhost):\d+/ },
  { label: 'access token in websocket URL', pattern: /(?:connectSocket|WebSocket)[^\n]{0,160}[?&]token=/ },
  { label: 'legacy sync cursor', pattern: /\b(?:afterId|lastMutationId|truncated)\b/ },
  { label: 'legacy AI endpoint', pattern: /\/api\/ai\/chat\b/ },
]

async function collect(path) {
  const info = await stat(path)
  if (!info.isDirectory()) return [path]
  const files = []
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const entryPath = join(path, entry.name)
    if (entry.isDirectory()) files.push(...await collect(entryPath))
    else if (/\.(?:ts|vue|js|mjs)$/.test(entry.name)) files.push(entryPath)
  }
  return files
}

const files = []
for (const scanRoot of scanRoots) {
  try {
    files.push(...await collect(join(root, scanRoot)))
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

const violations = []
for (const file of files) {
  const displayPath = relative(root, file).replaceAll('\\', '/')
  if (ignored.has(displayPath)) continue
  const source = await readFile(file, 'utf8')
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) violations.push(`${displayPath}: ${rule.label}`)
  }
}

if (violations.length > 0) {
  console.error('R4 Mobile static check failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log(`R4 Mobile static check passed (${files.length - ignored.size} production files scanned)`)
}
