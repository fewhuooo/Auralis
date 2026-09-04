import type { ApiFieldError } from './protocol.ts';

export function normalizeFieldErrors(value: unknown): Record<string, string[]> {
  if (!Array.isArray(value)) return {};

  const result: Record<string, string[]> = {};
  for (const entry of value as ApiFieldError[]) {
    if (!entry || typeof entry !== 'object') continue;

    const field = typeof entry.field === 'string' ? entry.field.trim() : '';
    const message = typeof entry.message === 'string' ? entry.message.trim() : '';
    if (!field || !message) continue;

    const messages = result[field] ?? (result[field] = []);
    if (!messages.includes(message)) messages.push(message);
  }

  return result;
}

/**
 * Returns the actionable messages from an RFC Problem Details fieldErrors array.
 * The server may use a generic detail such as "Request validation failed";
 * showing these messages in the login banner keeps the failure useful even
 * when a field is not rendered by the form (for example a device field).
 */
export function summarizeFieldErrors(value: unknown): string {
  return Object.values(normalizeFieldErrors(value))
    .flat()
    .join('；');
}
