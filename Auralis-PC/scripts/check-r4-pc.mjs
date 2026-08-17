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
  const text = await readFile(file, 'utf8');
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
