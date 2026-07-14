import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../src/', import.meta.url)
const main = await readFile(new URL('main.ts', root), 'utf8')
const iconUtility = await readFile(new URL('utils/subjectIcon.ts', root), 'utf8')
const workspace = await readFile(new URL('views/SubjectWorkspace/index.vue', root), 'utf8')
const hall = await readFile(new URL('views/SubjectHall/index.vue', root), 'utf8')
const home = await readFile(new URL('views/Home/index.vue', root), 'utf8')
const modal = await readFile(new URL('components/subject/SubjectCreateModal.vue', root), 'utf8')
const timeline = await readFile(new URL('views/Timeline/index.vue', root), 'utf8')

assert.match(iconUtility, /export const subjectIconOptions/, 'new subjects need a line-icon option list')
assert.match(iconUtility, /export const isSubjectIconKey/, 'rendering must distinguish semantic keys from legacy values')
assert.match(iconUtility, /@element-plus\/icons-vue/, 'semantic keys must resolve to Element Plus outline icons')
assert.match(main, /element-plus\/theme-chalk\/el-icon\.css/, 'Element Plus icon sizing styles must load globally')
assert.match(modal, /subjectIconOptions/, 'create modal must source its choices from the shared option list')
assert.match(modal, /<ElIcon/, 'create modal preview and choices must render outline icons')
assert.doesNotMatch(modal, /themeColors|color-row/, 'create modal must not offer per-subject theme colors')
assert.match(modal, /color: '#7D9372'/, 'new subjects must use the shared Sage Green default')
assert.match(workspace, /isSubjectIconKey\(activeSubject\?\.icon\)/, 'workspace must preserve legacy Emoji while rendering new keys')
assert.doesNotMatch(workspace, /backgroundColor: activeSubject\?\.color/, 'workspace subject icon background must not depend on subject data')
assert.match(workspace, /\.subject-mini-icon\s*\{[\s\S]*?background:\s*#7D9372/, 'workspace subject icon must use the shared Sage Green background')
assert.match(hall, /isSubjectIconKey\(subj\.icon\)/, 'hall must preserve legacy Emoji while rendering new keys')
assert.match(home, /isSubjectIconKey\(subj\.icon\)/, 'home must preserve legacy Emoji while rendering new keys')
assert.match(timeline, /isSubjectIconKey\(subj\.icon\)/, 'native select must not print semantic keys')

console.log('Subject icon rendering contract passed.')
