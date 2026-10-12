import { test } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { getAiCitationFileNames } from '../src/utils/aiCitationFileNames.ts'

test('AI Citation File Names Helper', async (t) => {
  await t.test('returns empty array for null/undefined/invalid', () => {
    assert.deepStrictEqual(getAiCitationFileNames(null), [])
    assert.deepStrictEqual(getAiCitationFileNames(undefined), [])
    assert.deepStrictEqual(getAiCitationFileNames({}), [])
  })

  await t.test('extracts, trims and deduplicates valid titles', () => {
    const citations = [
      { title: 'File A.pdf' },
      { title: ' File B.docx ' },
      { title: 'File A.pdf' },
      { title: '' },
      { title: null },
      {},
      { title: '  ' }
    ]
    // Mocking to avoid TS errors as type checking is not strict in js test, but helper expects AiStreamCitation array
    const result = getAiCitationFileNames(citations)
    assert.deepStrictEqual(result, ['File A.pdf', 'File B.docx'])
  })
})

test('SFC Static Assertions for AI Citation File Names', async (t) => {
  const sfcPath = path.resolve('src/views/SubjectWorkspace/index.vue')
  const content = fs.readFileSync(sfcPath, 'utf8')
  
  await t.test('Completed messages should render citationFileNames as pure text', () => {
    assert.ok(content.includes('msg.citationFileNames'), 'Should access msg.citationFileNames in template')
    assert.match(content, /v-for=".*?in msg\.citationFileNames"/, 'Should iterate over citationFileNames')
  })

  await t.test('Streaming message should render streamingCitationFileNames as pure text', () => {
    assert.ok(content.includes('streamingCitationFileNames'), 'Should access streamingCitationFileNames in template')
    assert.match(content, /v-for=".*?in streamingCitationFileNames"/, 'Should iterate over streamingCitationFileNames')
  })

  await t.test('Both citation lists interpolate filenames as text, not HTML', () => {
    const completedCitationList = content.match(/<div class="chat-msg-citations" v-if="msg\.citationFileNames[\s\S]*?<ul class="citation-list">[\s\S]*?<\/ul>\s*<\/div>/)?.[0]
    const streamingCitationList = content.match(/<div class="chat-msg-citations" v-if="streamingCitationFileNames[\s\S]*?<ul class="citation-list">[\s\S]*?<\/ul>\s*<\/div>/)?.[0]

    assert.ok(completedCitationList, 'Completed message citation list should exist')
    assert.ok(streamingCitationList, 'Streaming citation list should exist')
    for (const list of [completedCitationList, streamingCitationList]) {
      assert.match(list, /\{\{\s*fileName\s*\}\}/, 'Filename must use Vue text interpolation')
      assert.doesNotMatch(list, /v-html\s*=/, 'Filename must not be interpreted as HTML')
    }
  })

  await t.test('Should not render excerpt or similarity', () => {
    assert.ok(!content.includes('.excerpt'), 'Should not render excerpt')
    assert.ok(!content.includes('.similarity'), 'Should not render similarity')
  })
})
