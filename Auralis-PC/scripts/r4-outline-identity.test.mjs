import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'

const srcRootUrl = new URL('../src/', import.meta.url).href
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const root = '${srcRootUrl}';
    const subPath = specifier.slice(2);
    const withExt = subPath.endsWith('.ts') ? subPath : subPath + '.ts';
    return nextResolve(new URL(withExt, root).href, context);
  }
  return nextResolve(specifier, context);
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

const {
  shouldAdoptGeneratedOutline,
} = await import('../src/services/outlineIdentity.ts')

test('a late generated candidate refreshes only a clean file draft', () => {
  assert.equal(shouldAdoptGeneratedOutline('2026-10-18T10:00:00Z', '2026-10-19T10:00:00Z', true), false,
    'an unsaved title, summary, ordering, or ref edit keeps its current draft')
  assert.equal(shouldAdoptGeneratedOutline('2026-10-18T10:00:00Z', '2026-10-19T10:00:00Z', false), true)
  assert.equal(shouldAdoptGeneratedOutline('2026-10-18T10:00:00Z', '2026-10-18T10:00:00Z', false), false)
  assert.equal(shouldAdoptGeneratedOutline(undefined, '2026-10-18T10:00:00Z', false), false)
})
