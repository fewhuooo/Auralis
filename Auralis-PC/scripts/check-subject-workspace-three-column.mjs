import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const workspaceUrl = new URL('../src/views/SubjectWorkspace/index.vue', import.meta.url)
const source = await readFile(workspaceUrl, 'utf8')

assert.doesNotMatch(source, /class="outline-subtabs"/, 'the outline must not contain summary tabs')
assert.doesNotMatch(source, /import PdfViewer/, 'selected files must not default to the original-file viewer')
assert.doesNotMatch(source, /class="drawer-item-actions"/, 'file rows must not render right-side action buttons')
assert.match(source, /centerView\.value = 'summary'/, 'file selection must open the summary center view')
assert.match(source, /centerView === 'summary' && selectedFile/, 'the center column must render a selected-file summary')
assert.match(source, /class="outline-add-button"/, 'the outline editor entry must be a circular plus button')

console.log('Subject workspace three-column layout contract passed.')
