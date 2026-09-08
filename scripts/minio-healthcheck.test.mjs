import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const compose = await readFile(new URL('../docker-compose.yml', import.meta.url), 'utf8');

test('MinIO healthcheck verifies an isolated object write/read/delete cycle', () => {
  const minioService = compose.match(/  minio:\n([\s\S]*?)(?=\n  minio-init:)/)?.[1] ?? '';

  assert.match(minioService, /MINIO_HEALTHCHECK_BUCKET:/);
  assert.match(minioService, /test:\s*[\s\S]*CMD-SHELL[\s\S]*mc pipe/);
  assert.match(minioService, /mc stat/);
  assert.match(minioService, /mc cat/);
  assert.match(minioService, /mc rm/);
  assert.match(minioService, /\.healthcheck\//);
  assert.match(minioService, /date \+%s%N/);
});
