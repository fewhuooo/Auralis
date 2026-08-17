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
