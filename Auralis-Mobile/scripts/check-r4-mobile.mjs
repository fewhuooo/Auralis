import { access, readFile, readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const scanRoots = ['src/api', 'src/store', 'src/services', 'src/pages', 'src/config', 'src/components', 'src/App.vue']
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

async function exists(relPath) {
  try {
    await access(join(root, relPath))
    return true
  } catch {
    return false
  }
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

const retiredPages = [
  'src/pages/mobile/settings/index.vue',
  'src/pages/mobile/timeline/index.vue',
  'src/pages/mobile/handwriting/index.vue',
  'src/pages/mobile/asset/index.vue',
  'src/pages/mobile/stats/index.vue',
  'src/pages/tablet/review/index.vue',
]
for (const retired of retiredPages) {
  if (await exists(retired)) {
    violations.push(`${retired}: retired orphan route must be deleted`)
  }
}

const mobileReview = sources.get('src/pages/mobile/review/index.vue') || ''
if (!mobileReview.includes('@/api/reviewApi') || /Math\.random\s*\(/.test(mobileReview)) {
  violations.push('src/pages/mobile/review/index.vue: review must use the review event API without random statistics')
}

const studyMetrics = sources.get('src/components/StudyMetrics.vue') || ''
if (!studyMetrics.includes('@/api/statsApi') || /Math\.random\s*\(/.test(studyMetrics)) {
  violations.push('src/components/StudyMetrics.vue: shared metrics must use the statistics API without random values')
}

const taskSelectSheet = sources.get('src/components/TaskSelectSheet.vue') || ''
if (/mockTasks|mock-\d+/.test(taskSelectSheet)) {
  violations.push('src/components/TaskSelectSheet.vue: task picker must not inject mock tasks')
}

const mobilePomodoro = sources.get('src/pages/mobile/pomodoro/index.vue') || ''
if (/completedToday\s*=\s*ref\(3\)/.test(mobilePomodoro)) {
  violations.push('src/pages/mobile/pomodoro/index.vue: pomodoro count must not use fixed demo value')
}

const mobileHome = sources.get('src/pages/mobile/home/index.vue') || ''
if (/staticDemoTasks|demo-\d+|注入演示|静态测试数据/.test(mobileHome)) {
  violations.push('src/pages/mobile/home/index.vue: home schedule must not inject demo tasks')
}

const mobileProfile = sources.get('src/pages/mobile/profile/index.vue') || ''
if (/completedCount\s*\|\|\s*38|focusHours\s*\|\|\s*24\.5|joinedDays\s*=\s*ref\(42\)/.test(mobileProfile)) {
  violations.push('src/pages/mobile/profile/index.vue: profile metrics must not use fixed demo values')
}

const tabletAi = sources.get('src/pages/tablet/ai-search/index.vue') || ''
if (!tabletAi.includes('@/api/aiApi')) {
  violations.push('src/pages/tablet/ai-search/index.vue: AI history must use the conversation API')
}
if (/historySessions\s*=\s*ref<HistorySession\[\]>\(\[\s*\{/.test(tabletAi)) {
  violations.push('src/pages/tablet/ai-search/index.vue: AI history must not contain hardcoded sessions')
}

const tabletWorkspace = sources.get('src/pages/tablet/workspace/index.vue') || ''
if (!tabletWorkspace.includes('chatWithAI')
  || /new Promise\(r\s*=>\s*setTimeout\(r|全科知识架构概览与核心体系要点|重点导读与精炼要点总结/.test(tabletWorkspace)) {
  violations.push('src/pages/tablet/workspace/index.vue: summary must use the AI stream, not fixed demo text')
}

if (violations.length > 0) {
  console.error('R4 Mobile static check failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log(`R4 Mobile static check passed (${files.length - ignored.size} production files scanned)`)
}
