import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dedupeEventKey,
  isNewerCursor,
  isProblemDetails,
  normalizeCursor,
  parseProblemDetails,
} from '../src/api/protocol.ts';
import { ApiProblemError, assertDirectDto, toApiProblem } from '../src/api/httpError.ts';
import { createRefreshCoordinator } from '../src/api/authRefresh.ts';
import { getRuntimeConfig, resolveWebsocketUrl } from '../src/config/runtime.ts';

test('parses RFC 9457 Problem Details without trusting legacy wrappers', () => {
  const problem = parseProblemDetails({
    type: 'https://auralis.dev/problems/validation',
    title: 'Validation failed',
    status: 422,
    detail: 'The subject name is required',
    instance: '/api/subjects',
    errors: { name: ['required'] },
  });

  assert.equal(isProblemDetails(problem), true);
  assert.equal(problem.status, 422);
  assert.deepEqual(problem.errors, { name: ['required'] });
  assert.equal(isProblemDetails({ code: 200, data: { ok: true } }), false);
});

test('normalizes numeric cursors without losing opaque string cursors', () => {
  assert.equal(normalizeCursor(7), '7');
  assert.equal(normalizeCursor(' 0008 '), '0008');
  assert.equal(normalizeCursor(null), null);
  assert.equal(isNewerCursor('10', '9'), true);
  assert.equal(isNewerCursor('9', '10'), false);
  assert.equal(isNewerCursor('opaque-b', 'opaque-a'), true);
});

test('deduplicates realtime events by stable event identity', () => {
  const event = {
    type: 'UPDATED',
    resourceType: 'TASK',
    resourceId: 'task-1',
    cursor: 12,
    occurredAt: '2026-08-17T00:00:00Z',
  };

  assert.equal(dedupeEventKey(event), 'UPDATED:TASK:task-1:12');
  assert.equal(dedupeEventKey({ ...event, occurredAt: '2026-08-17T00:01:00Z' }), dedupeEventKey(event));
});

test('resolves Web and Tauri runtime addresses from environment values', () => {
  const web = getRuntimeConfig({ MODE: 'production', VITE_API_BASE_URL: 'https://api.example.test' });
  assert.equal(web.apiBaseUrl, 'https://api.example.test');
  assert.equal(web.isTauri, false);

  const tauri = getRuntimeConfig({
    MODE: 'production',
    TAURI_ENV: '1',
    VITE_API_BASE_URL: 'https://api.example.test',
    VITE_WS_BASE_URL: 'wss://api.example.test',
  });
  assert.equal(tauri.isTauri, true);
  assert.equal(resolveWebsocketUrl('/ws/events?ticket=ticket-1', tauri), 'wss://api.example.test/ws/events?ticket=ticket-1');
});

test('accepts direct DTOs, preserves empty 204 payloads, and rejects legacy wrappers', () => {
  const dto = { id: 'subject-1', name: 'Math' };
  assert.deepEqual(assertDirectDto(dto), dto);
  assert.equal(assertDirectDto(undefined), undefined);
  assert.throws(
    () => assertDirectDto({ code: 200, data: dto }),
    (error) => error instanceof ApiProblemError && error.status === 500,
  );
});

test('normalizes Problem Details from a failed HTTP response', () => {
  const problem = toApiProblem({
    response: {
      status: 409,
      data: { title: 'Conflict', status: 409, detail: 'Version mismatch' },
    },
  });

  assert.equal(problem.status, 409);
  assert.equal(problem.detail, 'Version mismatch');
});

test('shares one refresh promise for concurrent 401 retries', async () => {
  let calls = 0;
  const coordinator = createRefreshCoordinator(async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return 'access-token-2';
  });

  const first = coordinator.refresh();
  const second = coordinator.refresh();
  assert.equal(first, second);
  assert.deepEqual(await Promise.all([first, second]), ['access-token-2', 'access-token-2']);
  assert.equal(calls, 1);
});
