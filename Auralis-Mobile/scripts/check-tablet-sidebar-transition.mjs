import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(resolve(root, 'src/components/tablet/TabletLayout.vue'), 'utf8')

const redirectDelay = source.match(
  /setTimeout\(\s*\(\)\s*=>\s*\{\s*redirectTo\(\s*path\s*\)\s*\}\s*,\s*(\d+)\s*\)/m,
)

if (!redirectDelay) {
  throw new Error('Unable to find tablet route switch redirect delay in TabletLayout.vue')
}

const indicatorBlock = source.match(/\.active-capsule-indicator\s*\{([\s\S]*?)\n\}/)

if (!indicatorBlock) {
  throw new Error('Unable to find .active-capsule-indicator styles in TabletLayout.vue')
}

const transition = indicatorBlock[1].match(/transition:\s*transform\s+([\d.]+)(ms|s)\b/)

if (!transition) {
  throw new Error('Unable to find sidebar indicator transform transition duration')
}

const redirectDelayMs = Number(redirectDelay[1])
const transitionMs = Number(transition[1]) * (transition[2] === 's' ? 1000 : 1)
const frameBudgetMs = 16
const requiredSettledFrames = 2

if (transitionMs > redirectDelayMs - frameBudgetMs * requiredSettledFrames) {
  throw new Error(
    `Sidebar indicator transition (${transitionMs}ms) must finish at least ${requiredSettledFrames} frames before route redirect (${redirectDelayMs}ms) to avoid first-switch flicker.`,
  )
}

if (!source.includes('getStableInitialNavState')) {
  throw new Error('Tablet sidebar initial nav state must prefer the current route over stale store defaults.')
}

if (!source.match(/displayIndex\s*=\s*ref\(\s*initialNav\.idx\s*\)/)) {
  throw new Error('Tablet sidebar displayIndex must be initialized from stable route-aware nav state.')
}

console.log(
  `Tablet sidebar transition check passed: ${transitionMs}ms indicator transition settles before ${redirectDelayMs}ms redirect.`,
)
