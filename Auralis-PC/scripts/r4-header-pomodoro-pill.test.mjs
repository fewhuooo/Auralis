import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const headerCode = await readFile(new URL('../src/components/layout/AppHeader.vue', import.meta.url), 'utf8')

test('AppHeader integrates synchronized Pomodoro timer pill next to dark mode toggle', () => {
  assert.match(headerCode, /import\s*\{\s*usePomodoroStore\s*\}\s*from\s*'@\/store\/usePomodoroStore'/)
  assert.match(headerCode, /const\s+pomodoroStore\s*=\s*usePomodoroStore\(\)/)

  // Verify activation computed condition
  assert.match(headerCode, /const\s+isPomodoroActive\s*=\s*computed\(\(\)\s*=>\s*\{/)
  assert.match(headerCode, /pomodoroStore\.isRunning\s*\|\|\s*pomodoroStore\.runtime\.elapsedBeforeRunMs\s*>\s*0/)

  // Verify time formatting uses mm:ss
  assert.match(headerCode, /const\s+formattedRemainingTime\s*=\s*computed\(\(\)\s*=>\s*\{/)
  assert.match(headerCode, /Math\.floor\(totalSec\s*\/\s*60\)/)

  // Verify template structure
  assert.match(headerCode, /class="header-pomodoro-pill"/)
  assert.match(headerCode, /class="pomo-pill-svg"/)
  assert.match(headerCode, /class="pomo-track-path"/)
  assert.match(headerCode, /class="pomo-progress-path"/)
  assert.match(headerCode, /:stroke-dashoffset="strokeDashoffset"/)
  assert.match(headerCode, /class="pomo-time-display"/)

  // Verify bold stroke width and track styles aligned with PomodoroRing
  assert.match(headerCode, /stroke-width="3\.8"/)
  assert.match(headerCode, /transition:\s*stroke-dashoffset\s+1s\s+linear/)
  assert.match(headerCode, /stroke-linecap="round"/)

  // Verify floating shadow style
  assert.match(headerCode, /box-shadow:\s*0\s+4px\s+14px/)

  // Placed right before dark mode toggle in header-right
  const pillIndex = headerCode.indexOf('header-pomodoro-pill')
  const darkToggleIndex = headerCode.indexOf('dark-toggle')
  assert.ok(pillIndex > 0 && pillIndex < darkToggleIndex, 'Pomodoro pill must be placed before dark toggle')

  // Click navigates to /pomodoro
  assert.match(headerCode, /router\.push\('\/pomodoro'\)/)

  // Tabular numbers
  assert.match(headerCode, /font-variant-numeric:\s*tabular-nums/)
})
