import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../src/', import.meta.url)
const iconUtility = await readFile(new URL('utils/subjectIcon.ts', root), 'utf8')
const workspace = await readFile(new URL('views/SubjectWorkspace/index.vue', root), 'utf8')
const hall = await readFile(new URL('views/SubjectHall/index.vue', root), 'utf8')

assert.match(iconUtility, /const iconAliases/, 'subject icons need a compatibility alias map')
assert.match(iconUtility, /book:/, 'legacy book icon names need a fallback')
assert.match(iconUtility, /export const getSubjectIcon/, 'subject icon rendering needs one shared resolver')
assert.match(workspace, /getSubjectIcon\(activeSubject\?\.icon\)/, 'workspace must render resolved subject icons')
assert.match(hall, /getSubjectIcon\(subj\.icon\)/, 'subject hall must render resolved subject icons')

console.log('Subject icon rendering contract passed.')
