import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/views/SubjectWorkspace/index.vue', import.meta.url), 'utf8')
const expectations = [
  ['summary center view', "centerView === 'summary'"],
  ['no PDF viewer default', "PdfViewer"],
  ['inline outline composer', 'outline-composer'],
  ['chapter drag handler', 'handleChapterDrop'],
  ['section drag handler', 'handleSectionDrop'],
  ['round outline add button', 'outline-add-button'],
  ['mobile-inspired AI welcome', 'ai-star-ring'],
  ['icon-only clear button', 'aria-label="清空对话"']
]

const failures = expectations.filter(([label, text]) => {
  const found = source.includes(text)
  return label === 'no PDF viewer default' ? found : !found
})

if (failures.length) {
  console.error(`Subject workspace reconstruction contract failed: ${failures.map(([label]) => label).join(', ')}`)
  process.exit(1)
}

console.log('Subject workspace reconstruction contract passed.')
