import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const scanRoots = [
  'src/api',
  'src/store',
  'src/services',
  'src/views',
  'src/router',
  'src/App.vue',
  'src-tauri/src',
];
const forbidden = [
  { label: 'legacy response wrapper', pattern: /(?:response|res)\.data\.(?:code|data)\b/ },
  { label: 'legacy websocket endpoint', pattern: /\/ws\/sync/ },
  { label: 'fixed local address', pattern: /(?:127\.0\.0\.1|localhost):\d+/ },
  { label: 'access token in websocket URL', pattern: /(?:WebSocket|ws:\/\/|wss:\/\/)[^\n]*[?&]token=/ },
  { label: 'legacy sync cursor', pattern: /\b(?:afterId|lastMutationId|truncated)\b/ },
  { label: 'legacy asset endpoint', pattern: /\/api\/(?:fs\/presigned-url|assets\/bind)\b/ },
  { label: 'legacy AI endpoint', pattern: /\/api\/ai\/(?:chat|ingest\/file)\b/ },
];

function rustTestModuleEnd(source, openingBrace) {
  let depth = 0
  let index = openingBrace
  while (index < source.length) {
    const character = source[index]
    if (source.startsWith('//', index)) {
      const lineEnd = source.indexOf('\n', index + 2)
      index = lineEnd < 0 ? source.length : lineEnd + 1
      continue
    }
    if (source.startsWith('/*', index)) {
      let commentDepth = 1
      index += 2
      while (index < source.length && commentDepth > 0) {
        if (source.startsWith('/*', index)) {
          commentDepth += 1
          index += 2
          continue
        }
        if (source.startsWith('*/', index)) {
          commentDepth -= 1
          index += 2
          continue
        }
        index += 1
      }
      continue
    }
    const rawString = source.slice(index).match(/^(?:b)?r(#+)?"/)
    if (rawString) {
      const terminator = `"${rawString[1] ?? ''}`
      const end = source.indexOf(terminator, index + rawString[0].length)
      if (end < 0) return -1
      index = end + terminator.length
      continue
    }
    if (character === '"') {
      index += 1
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2
          continue
        }
        if (source[index] === '"') break
        index += 1
      }
      index += 1
      continue
    }
    if (character === "'") {
      if (source[index + 1] === '\\') {
        let end = index + 2
        while (end < source.length && source[end] !== '\n' && end <= index + 20 && source[end] !== "'") {
          end += 1
        }
        if (source[end] === "'") {
          index = end + 1
          continue
        }
      }
      const codePointLength = source.codePointAt(index + 1) > 0xffff ? 2 : 1
      if (source[index + 1 + codePointLength] === "'") {
        index += codePointLength + 2
        continue
      }
    }
    if (character === '{') depth += 1
    if (character === '}') {
      depth -= 1
      if (depth === 0) return index
    }
    index += 1
  }
  return -1
}

function stripRustTestModules(source) {
  const marker = /#\s*\[\s*cfg\s*\(\s*test\s*\)\s*\]\s*mod\s+tests\s*\{/g
  let result = source
  let offset = 0
  while (true) {
    marker.lastIndex = offset
    const match = marker.exec(result)
    if (!match) return result
    const lineStart = result.lastIndexOf('\n', match.index - 1) + 1
    if (result.slice(lineStart, match.index).trim()) {
      offset = marker.lastIndex
      continue
    }
    const openingBrace = marker.lastIndex - 1
    const closingBrace = rustTestModuleEnd(result, openingBrace)
    if (closingBrace < 0) return result
    result = `${result.slice(0, match.index)}\n${result.slice(closingBrace + 1)}`
    offset = match.index + 1
  }
}

const rustScannerFixture = stripRustTestModules(`
fn production_before() { let endpoint = "http://127.0.0.1:7000"; }
#[cfg(test)]
mod tests {
    const LOOPBACK: &str = r#"127.0.0.1:0 }"#;
    fn fixture<'a>() { let phrase = "don't count }"; }
    /* nested { /* ignored } */ comment */
}
fn production_after() { let endpoint = "http://localhost:7001"; }
`)
const fixtureHits = [...rustScannerFixture.matchAll(/(?:127\.0\.0\.1|localhost):\d+/g)].map(match => match[0])
assert.deepEqual(fixtureHits, ['127.0.0.1:7000', 'localhost:7001'],
  'the local-address guard ignores Rust cfg(test) fixtures and still scans production after the test module')

async function collectFiles(path) {
  const files = [];
  const entries = await import('node:fs/promises').then(({ readdir }) => readdir(path, { withFileTypes: true }));
  for (const entry of entries) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(entryPath));
    else if (/\.(?:ts|tsx|vue|js|mjs|rs)$/.test(entry.name)) files.push(entryPath);
  }
  return files;
}

const files = [];
for (const scanRoot of scanRoots) {
  const path = join(root, scanRoot);
  try {
    const stats = await import('node:fs/promises').then(({ stat }) => stat(path));
    files.push(...(stats.isDirectory() ? await collectFiles(path) : [path]));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const violations = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const text = file.endsWith('.rs') ? stripRustTestModules(source) : source;
  const displayPath = relative(root, file).replaceAll('\\', '/');
  for (const rule of forbidden) {
    if (rule.pattern.test(text)) violations.push(`${displayPath}: ${rule.label}`);
  }
}

if (violations.length > 0) {
  console.error('R4 PC static check failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(`R4 PC static check passed (${files.length} production files scanned)`);
}
