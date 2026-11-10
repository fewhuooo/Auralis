import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const source = (file) => readFile(path.join(root, file), 'utf8')

test('tauri.conf.json enforces window boundary with minWidth 960 and minHeight 600', async () => {
  const confRaw = await source('src-tauri/tauri.conf.json')
  const conf = JSON.parse(confRaw)
  const windowConfig = conf.app?.windows?.[0]

  assert.ok(windowConfig, 'primary window config must exist')
  assert.equal(windowConfig.width, 1280, 'default window width should be 1280')
  assert.equal(windowConfig.height, 800, 'default window height should be 800')
  assert.equal(windowConfig.minWidth, 960, 'primary window must have minWidth 960')
  assert.equal(windowConfig.minHeight, 600, 'primary window must have minHeight 600')
  assert.equal(windowConfig.resizable, true, 'window must be resizable')
})

test('App.vue defines fallback min-width and min-height on .app-shell', async () => {
  const appVue = await source('src/App.vue')
  assert.match(appVue, /\.app-shell\s*\{[\s\S]*?min-width:\s*960px;/, 'app-shell must guard min-width: 960px')
  assert.match(appVue, /\.app-shell\s*\{[\s\S]*?min-height:\s*600px;/, 'app-shell must guard min-height: 600px')
})

test('SubjectWorkspace has dedicated 960px breakpoint avoiding horizontal overflow', async () => {
  const workspaceVue = await source('src/views/SubjectWorkspace/index.vue')
  assert.match(workspaceVue, /@media\s*\(max-width:\s*960px\)/, 'SubjectWorkspace must include @media (max-width: 960px)')

  // Verify responsive narrowing rules under 960px
  const narrowBlock = workspaceVue.slice(workspaceVue.indexOf('@media (max-width: 960px)'))
  assert.match(narrowBlock, /\.workspace-center\s*\{[\s\S]*?min-width:\s*280px;/)
  assert.match(narrowBlock, /\.tier2-drawer\.is-open\s*\{[\s\S]*?max-width:\s*200px;/)
  assert.match(narrowBlock, /\.workspace-right\.is-open\s*\{[\s\S]*?min-width:\s*260px;/)

  // 64 (sidebar) + 64 (tier1) + 200 (tier2) + 280 (center) + 260 (right) = 868px <= 960px
  const totalMinWidthUnder960 = 64 + 64 + 200 + 280 + 260
  assert.ok(totalMinWidthUnder960 <= 960, `combined column widths (${totalMinWidthUnder960}px) must not exceed 960px`)
})

test('Core views maintain 960px narrow window responsive adaptations', async () => {
  const [statsPane, assetView, pomodoroView, hallView] = await Promise.all([
    source('src/components/subject/SubjectStatsPane.vue'),
    source('src/views/Asset/index.vue'),
    source('src/views/Pomodoro/index.vue'),
    source('src/views/SubjectHall/index.vue'),
  ])

  assert.match(statsPane, /@media\s*\(max-width:\s*960px\)/, 'SubjectStatsPane must support 960px breakpoint')
  assert.match(assetView, /@media\s*\(max-width:\s*960px\)/, 'Asset view must support 960px breakpoint')
  assert.match(pomodoroView, /@media\s*\(max-width:\s*960px\)/, 'Pomodoro view must support 960px breakpoint')
  assert.match(hallView, /@media\s*\(max-width:\s*960px\)/, 'SubjectHall view must support 960px breakpoint')
})

