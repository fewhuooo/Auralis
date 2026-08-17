export interface ApiProblemDetails {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: Record<string, string[]>;
  [key: string]: unknown;
}

export interface RealtimeEventLike {
  type: string;
  resourceType: string;
  resourceId: string;
  cursor: string | number;
  occurredAt?: string;
}

export function isProblemDetails(value: unknown): value is ApiProblemDetails {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.title === 'string' &&
    typeof candidate.status === 'number' &&
    Number.isInteger(candidate.status) &&
    candidate.status >= 400 &&
    candidate.status <= 599
  );
}

export function parseProblemDetails(value: unknown): ApiProblemDetails {
  if (!isProblemDetails(value)) {
    throw new TypeError('Response is not RFC 9457 Problem Details');
  }

  return value;
}

export function normalizeCursor(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return String(value);
  }
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
  return null;
}

export function isNewerCursor(candidate: unknown, current: unknown): boolean {
  const next = normalizeCursor(candidate);
  const previous = normalizeCursor(current);
  if (next === null) return false;
  if (previous === null) return true;

  if (/^\d+$/.test(next) && /^\d+$/.test(previous)) {
    return BigInt(next) > BigInt(previous);
  }

  // The server currently emits numeric cursors. For a future opaque cursor,
  // only a changed value can be treated as new because ordering is unknown.
  return next !== previous;
}

export function dedupeEventKey(event: RealtimeEventLike): string {
  return [event.type, event.resourceType, event.resourceId, normalizeCursor(event.cursor) ?? ''].join(':');
}
