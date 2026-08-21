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
const sources = new Map()
for (const file of files) {
  const displayPath = relative(root, file).replaceAll('\\', '/')
  if (ignored.has(displayPath)) continue
  const source = await readFile(file, 'utf8')
  sources.set(displayPath, source)
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) violations.push(`${displayPath}: ${rule.label}`)
  }
}

const tabletReview = sources.get('src/pages/tablet/review/index.vue') || ''
if (!tabletReview.includes("@/api/reviewApi")) {
  violations.push('src/pages/tablet/review/index.vue: tablet review must use the review event API')
}
if (/Math\.random\s*\(/.test(tabletReview)) {
  violations.push('src/pages/tablet/review/index.vue: tablet review must not generate random statistics')
}

const tabletDashboard = sources.get('src/pages/tablet/dashboard/index.vue') || ''
if (!tabletDashboard.includes("@/api/statsApi")) {
  violations.push('src/pages/tablet/dashboard/index.vue: tablet dashboard must use the statistics API')
}
if (/Math\.random\s*\(/.test(tabletDashboard)) {
  violations.push('src/pages/tablet/dashboard/index.vue: tablet dashboard must not generate random statistics')
}

const tabletStats = sources.get('src/pages/tablet/stats/index.vue') || ''
if (!tabletStats.includes("@/api/statsApi")) {
  violations.push('src/pages/tablet/stats/index.vue: tablet stats must use the statistics API')
}
if (/Math\.random\s*\(/.test(tabletStats)) {
  violations.push('src/pages/tablet/stats/index.vue: tablet stats must not generate random statistics')
}

const taskSelectSheet = await readFile(join(root, 'src/components/TaskSelectSheet.vue'), 'utf8')
if (/mockTasks|mock-\d+/.test(taskSelectSheet)) {
  violations.push('src/components/TaskSelectSheet.vue: task picker must not inject mock tasks')
}

const mobilePomodoro = sources.get('src/pages/mobile/pomodoro/index.vue') || ''
if (/completedToday\s*=\s*ref\(3\)/.test(mobilePomodoro)) {
  violations.push('src/pages/mobile/pomodoro/index.vue: pomodoro count must come from the task store')
}

const mobileSettings = sources.get('src/pages/mobile/settings/index.vue') || ''
if (/joinedDays\s*=\s*ref\(12\)/.test(mobileSettings)) {
  violations.push('src/pages/mobile/settings/index.vue: joined days must not use a fixed demo value')
}

if (violations.length > 0) {
  console.error('R4 Mobile static check failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log(`R4 Mobile static check passed (${files.length - ignored.size} production files scanned)`)
}
