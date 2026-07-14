import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/views/SubjectWorkspace/index.vue', import.meta.url), 'utf8')
const expectations = [
  ['summary center view', "centerView === 'summary'"],
  ['no PDF viewer default', "PdfViewer"],
  ['inline outline composer', 'outline-composer'],
  ['chapter drag handler', 'handleChapterDrop'],
  ['section drag handler', 'handleSectionDrop'],
  ['round outline add button', 'outline-add-button'],
  ['mobile-inspired AI welcome', 'ai-spark-ring'],
  ['icon-only clear button', 'aria-label="清空对话"'],
  ['mobile spark SVG', 'class="ai-spark-svg"'],
  ['spark ring', 'class="ai-spark-ring"'],
  ['assistant spark avatar', 'class="assistant-spark-avatar"'],
  ['typing dots', 'class="ai-typing-dots"'],
  ['capsule input', 'ai-chat-capsule'],
  ['send button label', 'aria-label="发送消息"']
]
const forbidden = [
  ['attachment affordance', 'ai-input-plus'],
  ['microphone affordance', 'mic-btn']
]

const failures = [
  ...expectations.filter(([label, text]) => {
  const found = source.includes(text)
  return label === 'no PDF viewer default' ? found : !found
  }),
  ...forbidden.filter(([, text]) => source.includes(text))
]

if (failures.length) {
  console.error(`Subject workspace reconstruction contract failed: ${failures.map(([label]) => label).join(', ')}`)
  process.exit(1)
}

console.log('Subject workspace reconstruction contract passed.')
