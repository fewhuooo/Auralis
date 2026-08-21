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
import {
  formatDeviceName,
  getDeviceIdentity,
  getOrCreateDeviceId,
  isValidUuid,
  resolveDevicePlatform,
} from '../src/auth/deviceIdentity.ts';
import { resolveAuthRedirect } from '../src/auth/authGuard.ts';
import { isValidSession } from '../src/auth/sessionValidation.ts';
import { RealtimeController } from '../src/services/realtimeController.ts';
import { register } from 'node:module';

const srcRootUrl = new URL('../src/', import.meta.url).href;
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const root = '${srcRootUrl}';
    const subPath = specifier.slice(2);
    const withExt = subPath.endsWith('.ts') || subPath.endsWith('.vue') || subPath.endsWith('.mjs') || subPath.endsWith('.js') ? subPath : subPath + '.ts';
    const resolved = new URL(withExt, root).href;
    return nextResolve(resolved, context);
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const parentUrl = context.parentURL;
    if (parentUrl && !specifier.endsWith('.ts') && !specifier.endsWith('.js') && !specifier.endsWith('.mjs') && !specifier.endsWith('.json')) {
      const candidate = new URL(specifier + '.ts', parentUrl).href;
      try {
        return await nextResolve(candidate, context);
      } catch {
        // fallback
      }
    }
  }
  return nextResolve(specifier, context);
}
`;
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url);

const { parseSseStream } = await import('../src/api/sse.ts');
const {
  useSubjectApi,
  listSubjects,
  getSubject,
  createSubject,
  updateSubject,
  deleteSubject,
  restoreSubject,
} = await import('../src/api/useSubjectApi.ts');
const {
  useKnowledgeApi,
  getKnowledgeBlocks,
  getKnowledgeBlock,
  createKnowledgeBlock,
  updateKnowledgeBlock,
  deleteKnowledgeBlock,
  restoreKnowledgeBlock,
} = await import('../src/api/useKnowledgeApi.ts');
const {
  useTaskApi,
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  restoreTask,
} = await import('../src/api/useTaskApi.ts');
const {
  useSourceApi,
  listSources,
  getSource,
  createSource,
  updateSource,
  deleteSource,
  restoreSource,
  reingestSource,
} = await import('../src/api/useSourceApi.ts');
const {
  useRelationApi,
  listRelations,
  getRelation,
  createRelation,
  updateRelation,
  deleteRelation,
  restoreRelation,
} = await import('../src/api/useRelationApi.ts');
const {
  useReviewApi,
  getDueReviews,
  getReviewQueue,
  recordEvent,
  recordReviewEvent,
  getHistory,
  getReviewHistory,
} = await import('../src/api/useReviewApi.ts');
const {
  useStatsApi,
  getOverview,
  getStatsOverview,
  getWeekly,
  getWeeklyStats,
} = await import('../src/api/useStatsApi.ts');
const {
  useAssetApi,
  createUploadIntent,
  completeUpload,
  getDownloadUrl,
  validateFileSize,
} = await import('../src/api/useAssetApi.ts');
const {
  useAiApi,
  checkHealth,
  getAiSettings,
  updateAiSettings,
  listConversations,
  createConversation,
  getConversation,
  deleteConversation,
  getSuggestions,
  streamAiMessage,
} = await import('../src/api/aiClient.ts');
const { default: request } = await import('../src/api/request.ts');


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

test('validates UUID format and stable generation for device identity', () => {
  const storageMap = new Map();
  const mockStorage = {
    getItem: (key) => storageMap.get(key) ?? null,
    setItem: (key, value) => { storageMap.set(key, String(value)); },
    removeItem: (key) => { storageMap.delete(key); },
    clear: () => { storageMap.clear(); },
    key: (i) => Array.from(storageMap.keys())[i] ?? null,
    length: storageMap.size,
  };

  const id1 = getOrCreateDeviceId(mockStorage);
  assert.equal(isValidUuid(id1), true);
  const id2 = getOrCreateDeviceId(mockStorage);
  assert.equal(id1, id2);

  mockStorage.setItem('auralis_device_id', 'not-a-valid-uuid');
  const id3 = getOrCreateDeviceId(mockStorage);
  assert.notEqual(id3, 'not-a-valid-uuid');
  assert.equal(isValidUuid(id3), true);
});

test('resolves device platform and formats device name under bounds', () => {
  assert.equal(resolveDevicePlatform(false), 'WEB');
  assert.equal(resolveDevicePlatform(true), 'WINDOWS');

  assert.equal(formatDeviceName(null, false), 'Web Browser');
  assert.equal(formatDeviceName(null, true), 'Windows Desktop');
  assert.equal(formatDeviceName('  My Custom Workstation  ', false), 'My Custom Workstation');

  const longName = 'A'.repeat(100);
  assert.equal(formatDeviceName(longName, false).length, 64);
});

test('constructs complete device identity without touching tokens', () => {
  const storageMap = new Map();
  const mockStorage = {
    getItem: (key) => storageMap.get(key) ?? null,
    setItem: (key, value) => { storageMap.set(key, String(value)); },
  };

  const identity = getDeviceIdentity({ storage: mockStorage, isTauri: false });
  assert.equal(isValidUuid(identity.deviceId), true);
  assert.equal(identity.platform, 'WEB');
  assert.equal(identity.deviceName, 'Web Browser');
  assert.equal(Object.prototype.hasOwnProperty.call(identity, 'token'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(identity, 'accessToken'), false);
});

test('resolves route redirects for public, protected, and login routes', () => {
  // Login route redirects to '/' if user already has an active session
  assert.equal(resolveAuthRedirect('/login', false, true), '/');
  assert.equal(resolveAuthRedirect('/login?redirect=%2Fsubjects', false, true), '/');
  // Login route allows unauthenticated users to enter
  assert.equal(resolveAuthRedirect('/login', false, false), null);

  // Protected routes require authentication; redirect unauthenticated users to '/login'
  assert.equal(resolveAuthRedirect('/', true, false), '/login');
  assert.equal(resolveAuthRedirect('/subjects', true, false), '/login');
  assert.equal(resolveAuthRedirect('/asset', true, false), '/login');
  assert.equal(resolveAuthRedirect('/subject/sub-1', true, false), '/login');

  // Protected routes allow authenticated users
  assert.equal(resolveAuthRedirect('/', true, true), null);
  assert.equal(resolveAuthRedirect('/subjects', true, true), null);
  assert.equal(resolveAuthRedirect('/asset', true, true), null);

  // Unprotected routes allow navigation regardless of session
  assert.equal(resolveAuthRedirect('/about', false, false), null);
  assert.equal(resolveAuthRedirect('/about', false, true), null);
});

test('validates session hydration data and discards corrupted state', () => {
  const validUser = { id: 'u-123', username: 'alice', displayName: 'Alice' };
  const validTokens = { accessToken: 'token-abc', refreshToken: 'refresh-xyz' };

  assert.equal(isValidSession(validUser, validTokens), true);

  // Reject missing or incomplete objects
  assert.equal(isValidSession(null, validTokens), false);
  assert.equal(isValidSession(validUser, null), false);
  assert.equal(isValidSession({}, validTokens), false);
  assert.equal(isValidSession(validUser, {}), false);
  assert.equal(isValidSession({ id: '' }, validTokens), false);
  assert.equal(isValidSession(validUser, { accessToken: '', refreshToken: 'xyz' }), false);
  assert.equal(isValidSession(validUser, { accessToken: 'abc', refreshToken: '' }), false);
});

test('resolves realtime websocket URL from relative ticket response and prevents token leaking', () => {
  const webConfig = getRuntimeConfig({ VITE_API_BASE_URL: 'https://api.auralis.test' });
  const tauriConfig = getRuntimeConfig({
    TAURI_ENV: '1',
    VITE_API_BASE_URL: 'https://api.auralis.test',
    VITE_WS_BASE_URL: 'wss://ws.auralis.test',
  });

  const relativeUrl = '/ws/events?ticket=ticket-secret-123';
  const webResolved = resolveWebsocketUrl(relativeUrl, { ...webConfig, websocketBaseUrl: 'wss://api.auralis.test' });
  assert.equal(webResolved, 'wss://api.auralis.test/ws/events?ticket=ticket-secret-123');

  const tauriResolved = resolveWebsocketUrl(relativeUrl, tauriConfig);
  assert.equal(tauriResolved, 'wss://ws.auralis.test/ws/events?ticket=ticket-secret-123');

  // Verify access token is not in URL
  assert.equal(/[?&]token=/.test(webResolved), false);
  assert.equal(/[?&]token=/.test(tauriResolved), false);
});

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    this.sent = [];
    MockWebSocket.instances.push(this);
  }

  static instances = [];
  static reset() {
    MockWebSocket.instances = [];
  }

  simulateOpen() {
    this.readyState = 1; // OPEN
    this.onopen?.({ type: 'open' });
  }

  simulateMessage(data) {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) });
  }

  simulateClose(code = 1000, reason = '') {
    this.readyState = 3; // CLOSED
    this.onclose?.({ code, reason, wasClean: true });
  }

  simulateError(err = new Error('ws error')) {
    this.onerror?.(err);
  }

  send(data) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    if (this.onclose) {
      const cb = this.onclose;
      this.onclose = null;
      cb({ code: 1000, reason: 'closed by client', wasClean: true });
    }
  }
}

test('RealtimeController connects with fresh ticket without leaking auth token into URL', async () => {
  MockWebSocket.reset();
  const ticketCalls = [];

  const controller = new RealtimeController({
    getDeviceId: () => 'dev-uuid-1',
    requestTicket: async (deviceId) => {
      ticketCalls.push(deviceId);
      return {
        ticket: 'ticket-alpha',
        websocketUrl: `/ws/events?ticket=ticket-alpha`,
      };
    },
    getRuntimeConfig: () => ({
      apiBaseUrl: 'https://api.auralis.test',
      websocketBaseUrl: 'wss://api.auralis.test',
      isTauri: false,
    }),
    websocketFactory: (url) => new MockWebSocket(url),
  });

  controller.start();
  // Wait for ticket resolution
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(ticketCalls.length, 1);
  assert.equal(ticketCalls[0], 'dev-uuid-1');
  assert.equal(MockWebSocket.instances.length, 1);

  const ws = MockWebSocket.instances[0];
  assert.equal(ws.url, 'wss://api.auralis.test/ws/events?ticket=ticket-alpha');
  assert.equal(/[?&]token=/.test(ws.url), false);

  ws.simulateOpen();
  assert.equal(controller.getStatus(), 'connected');

  controller.stop();
  assert.equal(controller.getStatus(), 'disconnected');
  assert.equal(ws.readyState, 3);
});

test('RealtimeController deduplicates events, advances cursor, and triggers sync signals', async () => {
  MockWebSocket.reset();
  const receivedEvents = [];
  const syncSignals = [];

  const controller = new RealtimeController({
    getDeviceId: () => 'dev-uuid-2',
    requestTicket: async () => ({
      ticket: 'ticket-beta',
      websocketUrl: '/ws/events?ticket=ticket-beta',
    }),
    getRuntimeConfig: () => ({
      apiBaseUrl: 'https://api.auralis.test',
      websocketBaseUrl: 'wss://api.auralis.test',
      isTauri: false,
    }),
    websocketFactory: (url) => new MockWebSocket(url),
    onEvent: (event) => receivedEvents.push(event),
    onSyncSignal: (reason) => syncSignals.push(reason),
    initialCursor: '10',
  });

  controller.start();
  await new Promise((r) => setTimeout(r, 10));

  const ws = MockWebSocket.instances[0];
  ws.simulateOpen();

  // 1. Send first event with cursor 15 (newer than 10)
  ws.simulateMessage({
    type: 'SYNC_CHANGED',
    resourceType: 'TASK',
    resourceId: 'task-100',
    cursor: 15,
    occurredAt: '2026-08-17T12:00:00Z',
  });

  assert.equal(receivedEvents.length, 1);
  assert.equal(syncSignals.length, 1);
  assert.equal(syncSignals[0], 'realtime');
  assert.equal(controller.getCursor(), '15');

  // 2. Send duplicate event (same type, resourceType, resourceId, cursor)
  ws.simulateMessage({
    type: 'SYNC_CHANGED',
    resourceType: 'TASK',
    resourceId: 'task-100',
    cursor: 15,
    occurredAt: '2026-08-17T12:05:00Z',
  });

  // Should be deduplicated - no new event or signal dispatched
  assert.equal(receivedEvents.length, 1);
  assert.equal(syncSignals.length, 1);
  assert.equal(controller.getCursor(), '15');

  // 3. Send event with older cursor (e.g. 12)
  ws.simulateMessage({
    type: 'SYNC_CHANGED',
    resourceType: 'SUBJECT',
    resourceId: 'sub-200',
    cursor: 12,
    occurredAt: '2026-08-17T12:06:00Z',
  });

  assert.equal(receivedEvents.length, 2);
  assert.equal(syncSignals.length, 2);
  // Cursor should NOT regress to 12
  assert.equal(controller.getCursor(), '15');

  // 4. Send event with newer cursor (e.g. 20)
  ws.simulateMessage({
    type: 'REVIEW_UPDATED',
    resourceType: 'KNOWLEDGE_BLOCK',
    resourceId: 'kb-300',
    cursor: 20,
    occurredAt: '2026-08-17T12:07:00Z',
  });

  assert.equal(receivedEvents.length, 3);
  assert.equal(syncSignals.length, 3);
  assert.equal(controller.getCursor(), '20');

  controller.stop();
});

test('RealtimeController requests a brand new ticket on reconnection without reusing old ticket', async () => {
  MockWebSocket.reset();
  let ticketCount = 0;

  const controller = new RealtimeController({
    getDeviceId: () => 'dev-uuid-3',
    requestTicket: async () => {
      ticketCount++;
      return {
        ticket: `ticket-${ticketCount}`,
        websocketUrl: `/ws/events?ticket=ticket-${ticketCount}`,
      };
    },
    getRuntimeConfig: () => ({
      apiBaseUrl: 'https://api.auralis.test',
      websocketBaseUrl: 'wss://api.auralis.test',
      isTauri: false,
    }),
    websocketFactory: (url) => new MockWebSocket(url),
    maxRetryDelayMs: 20, // fast retry for testing
  });

  controller.start();
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(MockWebSocket.instances.length, 1);
  const firstWs = MockWebSocket.instances[0];
  assert.equal(firstWs.url, 'wss://api.auralis.test/ws/events?ticket=ticket-1');
  firstWs.simulateOpen();

  // Simulate unexpected disconnect
  firstWs.simulateClose(1006, 'Abnormal closure');
  assert.equal(controller.getStatus(), 'reconnecting');

  // Wait for reconnect backoff timer (2^0 * 1000 is 1000ms, wait with lower backoff or trigger)
  // Let's verify ticketCount was 1 before timer fires
  assert.equal(ticketCount, 1);

  // Allow backoff to fire (since maxRetryDelayMs was set to 20ms)
  await new Promise((r) => setTimeout(r, 60));

  // A second ticket request MUST have been issued
  assert.equal(ticketCount, 2);
  assert.equal(MockWebSocket.instances.length, 2);
  const secondWs = MockWebSocket.instances[1];
  assert.equal(secondWs.url, 'wss://api.auralis.test/ws/events?ticket=ticket-2');

  controller.stop();
  assert.equal(controller.getStatus(), 'disconnected');
});

test('RealtimeController renews the ticket when its expiry is reached', async () => {
  MockWebSocket.reset();
  let ticketCount = 0;

  const controller = new RealtimeController({
    getDeviceId: () => 'dev-uuid-expiry',
    requestTicket: async () => {
      ticketCount++;
      const ticket = `ticket-expiry-${ticketCount}`;
      return {
        ticket,
        expiresAt: new Date(Date.now() + 15).toISOString(),
        websocketUrl: `/ws/events?ticket=${ticket}`,
      };
    },
    getRuntimeConfig: () => ({
      apiBaseUrl: 'https://api.auralis.test',
      websocketBaseUrl: 'wss://api.auralis.test',
      isTauri: false,
    }),
    websocketFactory: (url) => new MockWebSocket(url),
    maxRetryDelayMs: 5,
  });

  controller.start();
  await new Promise((r) => setTimeout(r, 5));
  MockWebSocket.instances[0].simulateOpen();
  await new Promise((r) => setTimeout(r, 60));

  assert.ok(ticketCount >= 2);
  assert.ok(MockWebSocket.instances.length >= 2);
  assert.match(MockWebSocket.instances[1].url, /ticket-expiry-2/);
  controller.stop();
});

test('RealtimeController.stop() cleans up timers, listeners, and WebSocket', async () => {
  MockWebSocket.reset();

  const controller = new RealtimeController({
    getDeviceId: () => 'dev-uuid-4',
    requestTicket: async () => ({
      ticket: 'ticket-stop-test',
      websocketUrl: '/ws/events?ticket=ticket-stop-test',
    }),
    getRuntimeConfig: () => ({
      apiBaseUrl: 'https://api.auralis.test',
      websocketBaseUrl: 'wss://api.auralis.test',
      isTauri: false,
    }),
    websocketFactory: (url) => new MockWebSocket(url),
    maxRetryDelayMs: 20,
  });

  controller.start();
  await new Promise((r) => setTimeout(r, 10));

  const ws = MockWebSocket.instances[0];
  ws.simulateOpen();

  // Stop controller
  controller.stop();

  assert.equal(controller.getStatus(), 'disconnected');
  assert.equal(ws.readyState, 3);
  assert.equal(ws.onopen, null);
  assert.equal(ws.onmessage, null);
  assert.equal(ws.onerror, null);
  assert.equal(ws.onclose, null);

  // Even if ws close or retry was queued, no new socket should be created
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(MockWebSocket.instances.length, 1);
});

test('parseSseStream parses events, multiline data, comments, chunk splits, and abort signal', async () => {
  async function* makeChunks(chunks) {
    for (const chunk of chunks) {
      yield chunk;
    }
  }

  // 1. Basic SSE stream with multiple event types
  const chunks = [
    'event: message.started\ndata: {"conversationId":"conv-1","messageId":"m-1"}\n\n',
    ': keepalive ping\n',
    'event: citation\ndata: {"sourceId":"s-10","chunkId":"c-10","ordinal":1,"similarity":0.92}\n\n',
    'event: message.delta\ndata: Hello \n\n',
    'event: message.delta\ndata: World!\n\n',
    'event: message.completed\ndata: {"conversationId":"conv-1","messageId":"m-1","content":"Hello World!"}\n\n',
  ];

  const events = [];
  for await (const ev of parseSseStream(makeChunks(chunks))) {
    events.push(ev);
  }

  assert.equal(events.length, 5);
  assert.equal(events[0].event, 'message.started');
  assert.deepEqual(events[0].data, { conversationId: 'conv-1', messageId: 'm-1' });
  assert.equal(events[1].event, 'citation');
  assert.deepEqual(events[1].data, { sourceId: 's-10', chunkId: 'c-10', ordinal: 1, similarity: 0.92 });
  assert.equal(events[2].event, 'message.delta');
  assert.equal(events[2].data, 'Hello ');
  assert.equal(events[3].event, 'message.delta');
  assert.equal(events[3].data, 'World!');
  assert.equal(events[4].event, 'message.completed');
  assert.deepEqual(events[4].data, { conversationId: 'conv-1', messageId: 'm-1', content: 'Hello World!' });

  // 2. Chunks split across field and line boundaries
  const splitChunks = [
    'event: message.',
    'delta\ndata: split-',
    'chunk\n',
    '\n',
  ];
  const splitEvents = [];
  for await (const ev of parseSseStream(makeChunks(splitChunks))) {
    splitEvents.push(ev);
  }
  assert.equal(splitEvents.length, 1);
  assert.equal(splitEvents[0].event, 'message.delta');
  assert.equal(splitEvents[0].data, 'split-chunk');

  const crlfSplitEvents = [];
  for await (const ev of parseSseStream(makeChunks([
    'event: message.delta\r',
    '\ndata: CRLF\r\n\r',
    '\n',
  ]))) {
    crlfSplitEvents.push(ev);
  }
  assert.equal(crlfSplitEvents.length, 1);
  assert.equal(crlfSplitEvents[0].data, 'CRLF');

  // 3. Multiline data lines concatenated with \n
  const multilineChunks = ['data: first line\ndata: second line\n\n'];
  const multilineEvents = [];
  for await (const ev of parseSseStream(makeChunks(multilineChunks))) {
    multilineEvents.push(ev);
  }
  assert.equal(multilineEvents.length, 1);
  assert.equal(multilineEvents[0].data, 'first line\nsecond line');

  // 4. AbortSignal cleanly terminates stream
  const abortController = new AbortController();
  async function* infiniteStream() {
    let count = 0;
    while (true) {
      yield `event: message.delta\ndata: ${count++}\n\n`;
    }
  }
  const receivedWhileAborting = [];
  for await (const ev of parseSseStream(infiniteStream(), { signal: abortController.signal })) {
    receivedWhileAborting.push(ev);
    if (receivedWhileAborting.length === 2) {
      abortController.abort();
    }
  }
  assert.equal(receivedWhileAborting.length, 2);
});

test('Subject API routes and parameters adhere to OpenAPI direct DTO contract', async () => {
  const calls = [];
  const origGet = request.get;
  const origPost = request.post;
  const origPut = request.put;
  const origDelete = request.delete;

  try {
    request.get = async (url, config) => {
      calls.push({ method: 'GET', url, config });
      if (url === '/api/subjects') return { items: [{ id: 'sub-1', name: 'Math' }], nextCursor: 'nc-1', hasMore: false };
      return { id: 'sub-1', name: 'Math' };
    };
    request.post = async (url, data, config) => {
      calls.push({ method: 'POST', url, data, config });
       return { id: 'sub-created', name: data?.name ?? 'Created' };
    };
    request.put = async (url, data, config) => {
      calls.push({ method: 'PUT', url, data, config });
       return { id: 'sub-updated', name: data?.name ?? 'Updated' };
    };
    request.delete = async (url, config) => {
      calls.push({ method: 'DELETE', url, config });
      return undefined;
    };

    // listSubjects
    const listRes = await listSubjects({ cursor: 'cur-1', limit: 20 });
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].url, '/api/subjects');
    assert.deepEqual(calls[0].config?.params, { cursor: 'cur-1', limit: 20 });
    assert.equal(listRes.items?.length, 1);

    // getSubject
    const getRes = await getSubject('sub-1');
    assert.equal(calls[1].method, 'GET');
    assert.equal(calls[1].url, '/api/subjects/sub-1');
     assert.equal(getRes.id, 'sub-1');

    // createSubject
     await createSubject({ baseVersion: 0, name: 'Physics' });
    assert.equal(calls[2].method, 'POST');
    assert.equal(calls[2].url, '/api/subjects');
     assert.deepEqual(calls[2].data, { baseVersion: 0, name: 'Physics' });

    // updateSubject
     await updateSubject('sub-1', { baseVersion: 1, name: 'Advanced Math' });
    assert.equal(calls[3].method, 'PUT');
    assert.equal(calls[3].url, '/api/subjects/sub-1');
    assert.equal(calls[3].data?.baseVersion, 1);

    // deleteSubject
    await deleteSubject('sub-1', { baseVersion: 2 });
    assert.equal(calls[4].method, 'DELETE');
    assert.equal(calls[4].url, '/api/subjects/sub-1');
    assert.deepEqual(calls[4].config?.data, { baseVersion: 2 });

    // restoreSubject
    await restoreSubject('sub-1', { baseVersion: 3 });
    assert.equal(calls[5].method, 'POST');
    assert.equal(calls[5].url, '/api/subjects/sub-1/restore');
    assert.deepEqual(calls[5].data, { baseVersion: 3 });
  } finally {
    request.get = origGet;
    request.post = origPost;
    request.put = origPut;
    request.delete = origDelete;
  }
});

test('KnowledgeBlock API routes and parameters adhere to OpenAPI direct DTO contract', async () => {
  const calls = [];
  const origGet = request.get;
  const origPost = request.post;
  const origPut = request.put;
  const origDelete = request.delete;

  try {
    request.get = async (url, config) => {
      calls.push({ method: 'GET', url, config });
      return { items: [{ id: 'kb-1', title: 'Theorem 1' }], nextCursor: null, hasMore: false };
    };
    request.post = async (url, data, config) => {
      calls.push({ method: 'POST', url, data, config });
      return { id: 'kb-created' };
    };
    request.put = async (url, data, config) => {
      calls.push({ method: 'PUT', url, data, config });
      return { id: 'kb-updated' };
    };
    request.delete = async (url, config) => {
      calls.push({ method: 'DELETE', url, config });
      return undefined;
    };

    // getKnowledgeBlocks
     await getKnowledgeBlocks('sub-1', { limit: 50 });
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].url, '/api/knowledge-blocks');
     assert.deepEqual(calls[0].config?.params, { limit: 50 });

    // getKnowledgeBlock
    await getKnowledgeBlock('kb-1');
    assert.equal(calls[1].method, 'GET');
    assert.equal(calls[1].url, '/api/knowledge-blocks/kb-1');

    // createKnowledgeBlock
     await createKnowledgeBlock({ baseVersion: 0, subjectId: 'sub-1', title: 'Calculus Intro', content: 'Limits' });
    assert.equal(calls[2].method, 'POST');
    assert.equal(calls[2].url, '/api/knowledge-blocks');
    assert.equal(calls[2].data?.baseVersion, 0);

    // updateKnowledgeBlock
     await updateKnowledgeBlock('kb-1', { baseVersion: 1, subjectId: 'sub-1', title: 'Calculus Advanced', content: 'Derivatives' });
    assert.equal(calls[3].method, 'PUT');
    assert.equal(calls[3].url, '/api/knowledge-blocks/kb-1');
    assert.equal(calls[3].data?.baseVersion, 1);

    // deleteKnowledgeBlock
    await deleteKnowledgeBlock('kb-1', { baseVersion: 2 });
    assert.equal(calls[4].method, 'DELETE');
    assert.equal(calls[4].url, '/api/knowledge-blocks/kb-1');
    assert.deepEqual(calls[4].config?.data, { baseVersion: 2 });

    // restoreKnowledgeBlock
    await restoreKnowledgeBlock('kb-1', { baseVersion: 3 });
    assert.equal(calls[5].method, 'POST');
    assert.equal(calls[5].url, '/api/knowledge-blocks/kb-1/restore');
  } finally {
    request.get = origGet;
    request.post = origPost;
    request.put = origPut;
    request.delete = origDelete;
  }
});

test('Task API routes and parameters adhere to OpenAPI direct DTO contract', async () => {
  const calls = [];
  const origGet = request.get;
  const origPost = request.post;
  const origPut = request.put;
  const origDelete = request.delete;

  try {
    request.get = async (url, config) => {
      calls.push({ method: 'GET', url, config });
      return { items: [{ id: 't-1', title: 'Task 1' }], nextCursor: null, hasMore: false };
    };
    request.post = async (url, data, config) => {
      calls.push({ method: 'POST', url, data, config });
      return { id: 't-created' };
    };
    request.put = async (url, data, config) => {
      calls.push({ method: 'PUT', url, data, config });
      return { id: 't-updated' };
    };
    request.delete = async (url, config) => {
      calls.push({ method: 'DELETE', url, config });
      return undefined;
    };

    // listTasks
     await listTasks({ cursor: 'cur-task', limit: 30 });
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].url, '/api/tasks');
     assert.deepEqual(calls[0].config?.params, { cursor: 'cur-task', limit: 30 });

    // getTask
    await getTask('t-1');
    assert.equal(calls[1].method, 'GET');
    assert.equal(calls[1].url, '/api/tasks/t-1');

    // createTask
    await createTask({ baseVersion: 0, subjectId: 'sub-1', title: 'Finish homework', status: 'TODO' });
    assert.equal(calls[2].method, 'POST');
    assert.equal(calls[2].url, '/api/tasks');

    // updateTask
    await updateTask('t-1', { baseVersion: 1, subjectId: 'sub-1', title: 'Done homework', status: 'DONE' });
    assert.equal(calls[3].method, 'PUT');
    assert.equal(calls[3].url, '/api/tasks/t-1');

    // deleteTask
    await deleteTask('t-1', { baseVersion: 2 });
    assert.equal(calls[4].method, 'DELETE');
    assert.equal(calls[4].url, '/api/tasks/t-1');

    // restoreTask
    await restoreTask('t-1', { baseVersion: 3 });
    assert.equal(calls[5].method, 'POST');
    assert.equal(calls[5].url, '/api/tasks/t-1/restore');
  } finally {
    request.get = origGet;
    request.post = origPost;
    request.put = origPut;
    request.delete = origDelete;
  }
});

test('Source API routes and parameters adhere to OpenAPI direct DTO contract', async () => {
  const calls = [];
  const origGet = request.get;
  const origPost = request.post;
  const origPut = request.put;
  const origDelete = request.delete;

  try {
    request.get = async (url, config) => {
      calls.push({ method: 'GET', url, config });
      return { items: [{ id: 'src-1', title: 'Notes.pdf' }], nextCursor: null, hasMore: false };
    };
    request.post = async (url, data, config) => {
      calls.push({ method: 'POST', url, data, config });
      return { id: 'src-created' };
    };
    request.put = async (url, data, config) => {
      calls.push({ method: 'PUT', url, data, config });
      return { id: 'src-updated' };
    };
    request.delete = async (url, config) => {
      calls.push({ method: 'DELETE', url, config });
      return undefined;
    };

    // listSources
     await listSources({ cursor: 'cur-source', limit: 30 });
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].url, '/api/sources');
     assert.deepEqual(calls[0].config?.params, { cursor: 'cur-source', limit: 30 });

    // getSource
    await getSource('src-1');
    assert.equal(calls[1].method, 'GET');
    assert.equal(calls[1].url, '/api/sources/src-1');

    // createSource
    await createSource({ baseVersion: 0, subjectId: 'sub-1', title: 'Chapter 1', type: 'TEXT' });
    assert.equal(calls[2].method, 'POST');
    assert.equal(calls[2].url, '/api/sources');

    // updateSource
    await updateSource('src-1', { baseVersion: 1, subjectId: 'sub-1', title: 'Chapter 1 v2' });
    assert.equal(calls[3].method, 'PUT');
    assert.equal(calls[3].url, '/api/sources/src-1');

    // deleteSource
    await deleteSource('src-1', { baseVersion: 2 });
    assert.equal(calls[4].method, 'DELETE');
    assert.equal(calls[4].url, '/api/sources/src-1');

    // restoreSource
    await restoreSource('src-1', { baseVersion: 3 });
    assert.equal(calls[5].method, 'POST');
    assert.equal(calls[5].url, '/api/sources/src-1/restore');

    // reingestSource
    await reingestSource('src-1', { baseVersion: 4 });
    assert.equal(calls[6].method, 'POST');
    assert.equal(calls[6].url, '/api/sources/src-1/reingest');
    assert.deepEqual(calls[6].data, { baseVersion: 4 });
  } finally {
    request.get = origGet;
    request.post = origPost;
    request.put = origPut;
    request.delete = origDelete;
  }
});

test('Relation API routes and parameters adhere to OpenAPI direct DTO contract', async () => {
  const calls = [];
  const origGet = request.get;
  const origPost = request.post;
  const origPut = request.put;
  const origDelete = request.delete;

  try {
    request.get = async (url, config) => {
      calls.push({ method: 'GET', url, config });
      return { items: [{ id: 'rel-1' }], nextCursor: null, hasMore: false };
    };
    request.post = async (url, data, config) => {
      calls.push({ method: 'POST', url, data, config });
      return { id: 'rel-created' };
    };
    request.put = async (url, data, config) => {
      calls.push({ method: 'PUT', url, data, config });
      return { id: 'rel-updated' };
    };
    request.delete = async (url, config) => {
      calls.push({ method: 'DELETE', url, config });
      return undefined;
    };

    // listRelations
     await listRelations({ cursor: 'cur-relation', limit: 30 });
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].url, '/api/relations');
     assert.deepEqual(calls[0].config?.params, { cursor: 'cur-relation', limit: 30 });

    // getRelation
    await getRelation('rel-1');
    assert.equal(calls[1].method, 'GET');
    assert.equal(calls[1].url, '/api/relations/rel-1');

    // createRelation
     await createRelation({
       baseVersion: 0,
       sourceType: 'SUBJECT',
       sourceId: 'sub-1',
       targetType: 'TASK',
       targetId: 'task-1',
       type: 'RELATED_TO',
     });
    assert.equal(calls[2].method, 'POST');
    assert.equal(calls[2].url, '/api/relations');

    // updateRelation
     await updateRelation('rel-1', {
       baseVersion: 1,
       sourceType: 'SUBJECT',
       sourceId: 'sub-1',
       targetType: 'TASK',
       targetId: 'task-1',
       type: 'RELATED_TO',
       label: 'rel-up',
     });
    assert.equal(calls[3].method, 'PUT');
    assert.equal(calls[3].url, '/api/relations/rel-1');

    // deleteRelation
    await deleteRelation('rel-1', { baseVersion: 2 });
    assert.equal(calls[4].method, 'DELETE');
    assert.equal(calls[4].url, '/api/relations/rel-1');

    // restoreRelation
    await restoreRelation('rel-1', { baseVersion: 3 });
    assert.equal(calls[5].method, 'POST');
    assert.equal(calls[5].url, '/api/relations/rel-1/restore');
  } finally {
    request.get = origGet;
    request.post = origPost;
    request.put = origPut;
    request.delete = origDelete;
  }
});

test('Review API routes and parameters adhere to OpenAPI direct DTO contract', async () => {
  const calls = [];
  const origGet = request.get;
  const origPost = request.post;

  try {
    request.get = async (url, config) => {
      calls.push({ method: 'GET', url, config });
      if (url === '/api/reviews/due') {
        return [{ id: 'rs-1', knowledgeBlockId: 'kb-1', difficulty: 0.3, stability: 2.5 }];
      }
      return [{ id: 'rev-1', knowledgeBlockId: 'kb-1', rating: 'GOOD' }];
    };
    request.post = async (url, data, config) => {
      calls.push({ method: 'POST', url, data, config });
      return { event: { id: 'rev-1' }, state: { id: 'rs-1' } };
    };

    // getReviewQueue
    const queue = await getReviewQueue({ at: '2026-08-20T00:00:00Z', limit: 25 });
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].url, '/api/reviews/due');
    assert.deepEqual(calls[0].config?.params, { at: '2026-08-20T00:00:00Z', limit: 25 });
    assert.equal(queue.length, 1);

    // recordReviewEvent
    const recorded = await recordReviewEvent({
      clientEventId: 'ev-uuid-1',
      knowledgeBlockId: 'kb-1',
      rating: 'GOOD',
      reviewedAt: '2026-08-20T00:00:00Z',
      durationSeconds: 15,
      baseVersion: 0,
    });
    assert.equal(calls[1].method, 'POST');
    assert.equal(calls[1].url, '/api/reviews/events');
    assert.equal(calls[1].data?.rating, 'GOOD');
    assert.equal(recorded.state?.id, 'rs-1');

    // getReviewHistory
     const history = await getReviewHistory({ knowledgeBlockId: 'kb-1' });
    assert.equal(calls[2].method, 'GET');
    assert.equal(calls[2].url, '/api/reviews/history');
     assert.deepEqual(calls[2].config?.params, { knowledgeBlockId: 'kb-1' });
    assert.equal(history.length, 1);
  } finally {
    request.get = origGet;
    request.post = origPost;
  }
});

test('Stats API routes and parameters adhere to OpenAPI direct DTO contract', async () => {
  const calls = [];
  const origGet = request.get;

  try {
    request.get = async (url, config) => {
      calls.push({ method: 'GET', url, config });
      if (url === '/api/stats/overview') {
        return { activeKnowledgeBlocks: 12, activeTasks: 5, dueReviews: 3 };
      }
      return { days: [{ date: '2026-08-20', studySeconds: 1800 }] };
    };

    // getStatsOverview
    const overview = await getStatsOverview({ at: '2026-08-20T12:00:00Z' });
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].url, '/api/stats/overview');
    assert.deepEqual(calls[0].config?.params, { at: '2026-08-20T12:00:00Z' });
    assert.equal(overview.activeKnowledgeBlocks, 12);

    // getWeeklyStats
    const weekly = await getWeeklyStats({ from: '2026-08-14', to: '2026-08-20' });
    assert.equal(calls[1].method, 'GET');
    assert.equal(calls[1].url, '/api/stats/weekly');
    assert.deepEqual(calls[1].config?.params, { from: '2026-08-14', to: '2026-08-20' });
    assert.equal(weekly.days?.length, 1);
  } finally {
    request.get = origGet;
  }
});

test('Asset API upload-intent, complete, download-url and size validation contract', async () => {
  const calls = [];
  const origPost = request.post;

  try {
    request.post = async (url, data, config) => {
      calls.push({ method: 'POST', url, data, config });
      if (url === '/api/assets/upload-intents') {
        return {
          assetId: 'ast-100',
          uploadUrl: 'https://minio.auralis.test/bucket/ast-100',
          headers: { 'Content-Type': 'application/pdf' },
          expiresAt: '2026-08-20T13:00:00Z',
        };
      }
      if (url.endsWith('/complete')) {
        return { id: 'ast-100', status: 'READY', version: 1 };
      }
      if (url.endsWith('/download-url')) {
        return { url: 'https://minio.auralis.test/bucket/ast-100?sign=xyz', expiresAt: '2026-08-20T13:00:00Z' };
      }
      return {};
    };

    // createUploadIntent
    const intent = await createUploadIntent({
      baseVersion: 0,
      originalName: 'notes.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
    });
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].url, '/api/assets/upload-intents');
    assert.equal(intent.assetId, 'ast-100');

    // completeUpload
    const completed = await completeUpload('ast-100');
    assert.equal(calls[1].method, 'POST');
    assert.equal(calls[1].url, '/api/assets/ast-100/complete');
    assert.equal(completed.id, 'ast-100');

    // getDownloadUrl
    const download = await getDownloadUrl('ast-100');
    assert.equal(calls[2].method, 'POST');
    assert.equal(calls[2].url, '/api/assets/ast-100/download-url');
    assert.match(download.url ?? '', /minio/);

    // validateFileSize
    assert.throws(() => validateFileSize({ size: 55 * 1024 * 1024 }), /超过上限/);
    assert.doesNotThrow(() => validateFileSize({ size: 10 * 1024 * 1024 }));
  } finally {
    request.post = origPost;
  }
});

test('AI Client calls settings, conversations, suggestions, and health without legacy paths', async () => {
  const calls = [];
  const origGet = request.get;
  const origPost = request.post;
  const origPut = request.put;
  const origDelete = request.delete;

  try {
    request.get = async (url, config) => {
      calls.push({ method: 'GET', url, config });
      if (url === '/actuator/health') return { status: 'UP' };
      if (url === '/api/ai/settings') return [{ provider: 'DEEPSEEK', hasApiKey: true }];
      if (url === '/api/ai/conversations') return [{ id: 'conv-1', title: 'Chat 1' }];
      if (url.startsWith('/api/ai/conversations/')) return { id: 'conv-1', title: 'Chat 1', messages: [] };
      return {};
    };
    request.post = async (url, data, config) => {
      calls.push({ method: 'POST', url, data, config });
      if (url === '/api/ai/conversations') return { id: 'conv-created', title: data?.title };
      if (url === '/api/ai/suggestions') return { id: 'sug-1', title: 'Summary', body: 'AI summary' };
      return {};
    };
    request.put = async (url, data, config) => {
      calls.push({ method: 'PUT', url, data, config });
      return { provider: data?.provider, hasApiKey: true };
    };
    request.delete = async (url, config) => {
      calls.push({ method: 'DELETE', url, config });
      return undefined;
    };

    // checkHealth
    const isHealthy = await checkHealth();
    assert.equal(isHealthy, true);
    assert.equal(calls[0].url, '/actuator/health');

    // getAiSettings & updateAiSettings
    const settings = await getAiSettings();
    assert.equal(settings[0].provider, 'DEEPSEEK');
     await updateAiSettings({
       provider: 'DEEPSEEK',
       baseUrl: 'https://api.deepseek.com',
       chatModel: 'deepseek-chat',
       embeddingModel: 'text-embedding-3-small',
       apiKey: 'sk-test',
     });
    assert.equal(calls[2].method, 'PUT');
    assert.equal(calls[2].url, '/api/ai/settings');

    // listConversations & createConversation & getConversation & deleteConversation
    const convs = await listConversations();
    assert.equal(convs.length, 1);
    await createConversation({ baseVersion: 0, title: 'Math Help' });
    assert.equal(calls[4].method, 'POST');
    assert.equal(calls[4].url, '/api/ai/conversations');

    await getConversation('conv-1');
    assert.equal(calls[5].method, 'GET');
    assert.equal(calls[5].url, '/api/ai/conversations/conv-1');

    await deleteConversation('conv-1', 2);
    assert.equal(calls[6].method, 'DELETE');
    assert.equal(calls[6].url, '/api/ai/conversations/conv-1');
    assert.deepEqual(calls[6].config?.params, { baseVersion: 2 });

    // getSuggestions
    const suggestions = await getSuggestions({ type: 'SUMMARY', knowledgeBlockId: 'kb-1', limit: 3 });
    assert.equal(calls[7].method, 'POST');
    assert.equal(calls[7].url, '/api/ai/suggestions');
    assert.equal(suggestions.title, 'Summary');
  } finally {
    request.get = origGet;
    request.post = origPost;
    request.put = origPut;
    request.delete = origDelete;
  }
});

test('AI Client streams the current message endpoint as parsed SSE events', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  let requestInit;

  globalThis.fetch = async (url, init) => {
    requestUrl = url;
    requestInit = init;
    return new Response(
      'id: msg-1\nevent: message.started\ndata: {"conversationId":"conv-1","messageId":"msg-1"}\n\n'
      + 'event: message.delta\ndata: Hello\n\n',
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    );
  };

  try {
    const events = [];
    for await (const event of streamAiMessage({ conversationId: 'conv-1', content: 'Hi' })) {
      events.push(event);
    }

    assert.match(requestUrl, /\/api\/ai\/messages\/stream$/);
    assert.equal(requestInit.method, 'POST');
    assert.equal(requestInit.headers.Accept, 'text/event-stream');
    // Provider is intentionally omitted; the server resolves AURALIS_AI_DEFAULT_PROVIDER.
    assert.deepEqual(JSON.parse(requestInit.body), { conversationId: 'conv-1', content: 'Hi' });
    assert.equal(events[0].event, 'message.started');
    assert.equal(events[1].event, 'message.delta');
    assert.equal(events[1].data, 'Hello');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
