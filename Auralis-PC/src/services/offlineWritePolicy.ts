import type { LocalMutation } from '@/types/api'

export interface StableMutationInput {
  clientMutationId: string
  resourceType: LocalMutation['resourceType']
  resourceId: string
  mutationType: LocalMutation['mutationType']
  baseVersion: number
  payload: Record<string, unknown>
}

/**
 * A 5xx response has reached the server and must remain visible to the caller.
 * Only an explicit offline state or a transport failure may be deferred into the
 * durable Sync outbox.
 */
export function isOfflineTransportFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (error instanceof TypeError) return true
  if (!error || typeof error !== 'object') return false

  const candidate = error as { status?: unknown; code?: unknown }
  const status = Number(candidate.status)
  if (Number.isFinite(status)) return status === 0
  return candidate.code === 'ERR_NETWORK' || candidate.code === 'ECONNABORTED' || candidate.code === 'NETWORK_OFFLINE'
}

/**
 * Makes retrying an already persisted intent safe: both identities are supplied
 * by the caller and the payload is copied so later UI edits cannot mutate it.
 */
export function createStableMutation(input: StableMutationInput): StableMutationInput {
  return { ...input, payload: { ...input.payload } }
}
