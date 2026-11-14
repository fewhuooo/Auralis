import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const root = new URL('../src/', import.meta.url)

test('TaskCreateDialog integrates Zen date picker with due date support', async () => {
  const dialogSrc = await readFile(new URL('components/task/TaskCreateDialog.vue', root), 'utf8')

  // Template checks
  assert.match(dialogSrc, /<el-date-picker[\s\S]*?v-model="form\.due"/, 'TaskCreateDialog must bind form.due to el-date-picker')
  assert.match(dialogSrc, /class="zen-date-picker"/, 'TaskCreateDialog date picker must reuse zen-date-picker class')
  assert.match(dialogSrc, /popper-class="zen-date-popper"/, 'TaskCreateDialog date picker must use zen-date-popper class')
  assert.match(dialogSrc, /format="YYYY-MM-DD"/, 'TaskCreateDialog date picker must display YYYY-MM-DD')
  assert.match(dialogSrc, /value-format="YYYY-MM-DD"/, 'TaskCreateDialog date picker value must format as YYYY-MM-DD')

  // Script checks
  assert.match(dialogSrc, /defaultDue\?: string/, 'TaskCreateDialog props must accept optional defaultDue')
  assert.match(dialogSrc, /due\?: string/, 'TaskCreateDialog emit must declare optional due')
  assert.match(dialogSrc, /dueAt\?: string/, 'TaskCreateDialog emit must declare optional dueAt')
  assert.match(dialogSrc, /form\.due = props\.defaultDue \|\| ''/, 'TaskCreateDialog resetForm must populate form.due from props')
  assert.match(dialogSrc, /import \{ localDateEndOfDay \} from '@\/services\/taskViewRules'/, 'TaskCreateDialog must use the shared local-date conversion')
  assert.match(dialogSrc, /const dueAt = dueAtFromInput\(due\)/, 'TaskCreateDialog must format the selected date at submit time')
  assert.match(dialogSrc, /function dueAtFromInput\(due\?: string\)[\s\S]*?due\.includes\('T'\) \? due : localDateEndOfDay\(due\)\?\.toISOString\(\)/, 'date-only input must become local end of day while timestamp input stays exact')

  const helperStart = dialogSrc.indexOf('function dueAtFromInput(')
  const helperEnd = dialogSrc.indexOf('const handleSubmit', helperStart)
  const helperJs = ts.transpile(dialogSrc.slice(helperStart, helperEnd), { target: ts.ScriptTarget.ES2022 })
  const localDateEndOfDay = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!match) return undefined
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999)
    return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3])
      ? date
      : undefined
  }
  const dueAtFromInput = runInNewContext(`${helperJs}; dueAtFromInput`, { localDateEndOfDay })
  const dateOnly = '2099-10-06'
  assert.equal(dueAtFromInput(dateOnly), new Date(2099, 9, 6, 23, 59, 59, 999).toISOString())
  assert.equal(dueAtFromInput('2099-10-06T00:00:00.000+08:00'), '2099-10-06T00:00:00.000+08:00')

  // Style checks (Zen styling consistent with Asset page)
  assert.match(dialogSrc, /:deep\(\.zen-date-picker\)/, 'TaskCreateDialog styles must override .zen-date-picker')
  assert.match(dialogSrc, /:global\(\.zen-date-popper\.el-popper\)/, 'TaskCreateDialog styles must theme .zen-date-popper popup')
  assert.match(dialogSrc, /var\(--color-bg-tertiary,\s*#FAF7F2\)/, 'TaskCreateDialog date picker must use warm ivory paper background')
})

test('Asset task deadline edits display local dates and preserve an unchanged exact instant', async () => {
  const assetSrc = await readFile(new URL('views/Asset/index.vue', root), 'utf8')
  const formatSource = assetSrc.slice(assetSrc.indexOf('function formatDateInput('), assetSrc.indexOf('function taskTreeNode('))
  const saveSource = assetSrc.slice(assetSrc.indexOf('const saveTaskEdit ='), assetSrc.indexOf('const saveBlockEdit ='))

  assert.match(formatSource, /if \(\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/.test\(value\)\) return value/, 'only a pure date may bypass local timestamp formatting')
  assert.match(formatSource, /date\.getFullYear\(\)[\s\S]*?date\.getMonth\(\) \+ 1[\s\S]*?date\.getDate\(\)/, 'timestamps must display using the browser local calendar date')
  assert.match(formatSource, /trimmed === formatDateInput\(originalDueAt\)[\s\S]*?return originalDueAt/, 'an unchanged displayed date must retain its stored instant')
  assert.match(formatSource, /localDateEndOfDay\(trimmed\)\?\.toISOString\(\)/, 'a changed date must become local end of day')
  assert.match(formatSource, /dateTouched[\s\S]*?return originalDueAt/, 'same-date user selection must be distinguishable from an untouched date')
  assert.match(saveSource, /dueAt: toDueAtValue\(task\.due, task\.originalData\.dueAt, task\.dueDateTouched\)/, 'task edits must pass whether the user selected a deadline date')
  assert.match(assetSrc, /v-model="selected\.due"[\s\S]*?@change="selected\.dueDateTouched = true"/, 'explicit date changes, including clear then reselect, must be recorded')

  const helperJs = ts.transpile(formatSource, { target: ts.ScriptTarget.ES2022 })
  const localDateEndOfDay = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!match) return undefined
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999)
    return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3])
      ? date
      : undefined
  }
  const { formatDateInput, toDueAtValue } = runInNewContext(`${helperJs}; ({ formatDateInput, toDueAtValue })`, { localDateEndOfDay })
  const originalDueAt = '2099-10-06T00:00:00.000+08:00'
  const displayedDate = formatDateInput(originalDueAt)
  const expectedLocalDate = (() => {
    const date = new Date(originalDueAt)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  })()
  assert.equal(displayedDate, expectedLocalDate)
  assert.equal(toDueAtValue(displayedDate, originalDueAt, false), originalDueAt)
  let dueDateTouched = false
  const markDueDateChanged = () => { dueDateTouched = true }
  markDueDateChanged() // Clearing the date marks it as an explicit edit.
  assert.equal(toDueAtValue('', originalDueAt, dueDateTouched), undefined)
  markDueDateChanged() // Selecting the same displayed date restores a corrected local deadline.
  assert.equal(toDueAtValue(displayedDate, originalDueAt, dueDateTouched), localDateEndOfDay(displayedDate).toISOString())
  const utcMidnight = '2099-10-06T00:00:00.000Z'
  assert.equal(toDueAtValue(formatDateInput(utcMidnight), utcMidnight, true), localDateEndOfDay(formatDateInput(utcMidnight)).toISOString())
  const editedDate = '2099-10-07'
  assert.equal(toDueAtValue(editedDate, originalDueAt, true), localDateEndOfDay(editedDate).toISOString())
})

test('Dashboard, Timeline and SubjectWorkspace forward dueAt on task creation', async () => {
  const dashboardSrc = await readFile(new URL('views/Dashboard/index.vue', root), 'utf8')
  const timelineSrc = await readFile(new URL('views/Timeline/index.vue', root), 'utf8')
  const workspaceSrc = await readFile(new URL('views/SubjectWorkspace/index.vue', root), 'utf8')

  // Dashboard
  assert.match(dashboardSrc, /const handleAddTask = async \(taskData: \{[\s\S]*?dueAt\?: string[\s\S]*?\}\)/, 'Dashboard handleAddTask must accept dueAt')
  assert.match(dashboardSrc, /await taskStore\.addTask\(\{[\s\S]*?dueAt: taskData\.dueAt[\s\S]*?\}\)/, 'Dashboard handleAddTask must pass dueAt to taskStore.addTask')

  // Timeline
  assert.match(timelineSrc, /const handleCreateTask = async \(taskData: \{[\s\S]*?dueAt\?: string[\s\S]*?\}\)/, 'Timeline handleCreateTask must accept dueAt')
  assert.match(timelineSrc, /await taskStore\.addTask\(\{[\s\S]*?dueAt: taskData\.dueAt[\s\S]*?\}\)/, 'Timeline handleCreateTask must pass dueAt to taskStore.addTask')

  // SubjectWorkspace
  assert.match(workspaceSrc, /const handleAddTask = async \(taskData: \{[\s\S]*?dueAt\?: string[\s\S]*?\}\)/, 'SubjectWorkspace handleAddTask must accept dueAt')
  assert.match(workspaceSrc, /await taskStore\.addTask\(\{[\s\S]*?dueAt: taskData\.dueAt[\s\S]*?\}\)/, 'SubjectWorkspace handleAddTask must pass dueAt to taskStore.addTask')
})
