export const OVERVIEW_INTENT_CREATED_EVENT = 'auralis-overview-intent-created'

export interface OverviewIntentCreatedDetail {
  userId: string
  serverDeviceId: string
  scopeType: 'FILE' | 'SUBJECT'
  scopeId: string
}

function isOverviewIntentCreatedDetail(value: unknown): value is OverviewIntentCreatedDetail {
  if (!value || typeof value !== 'object') return false
  const detail = value as Record<string, unknown>
  return typeof detail.userId === 'string' && typeof detail.serverDeviceId === 'string'
    && ['FILE', 'SUBJECT'].includes(String(detail.scopeType)) && typeof detail.scopeId === 'string'
}

/** Wake the caller only for an intent owned by its current local account/device scope. */
export function subscribeOverviewIntentCreated(
  target: EventTarget,
  isCurrentOwner: (detail: OverviewIntentCreatedDetail) => boolean,
  wake: () => void,
): () => void {
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail
    if (isOverviewIntentCreatedDetail(detail) && isCurrentOwner(detail)) wake()
  }
  target.addEventListener(OVERVIEW_INTENT_CREATED_EVENT, handler)
  return () => target.removeEventListener(OVERVIEW_INTENT_CREATED_EVENT, handler)
}

export const OVERVIEW_CACHE_UPDATED_EVENT = 'auralis-overview-cache-updated'

export interface OverviewCacheUpdatedDetail {
  userId: string
  serverDeviceId: string
  scopeType: 'FILE' | 'SUBJECT'
  scopeId: string
  revisionKey?: string
  removed?: true
}

export function notifyOverviewCacheUpdated(
  target: EventTarget | undefined,
  detail: OverviewCacheUpdatedDetail,
): void {
  const eventTarget = target ?? (typeof window !== 'undefined' ? window : undefined)
  if (!eventTarget || typeof eventTarget.dispatchEvent !== 'function') return
  eventTarget.dispatchEvent(new CustomEvent(OVERVIEW_CACHE_UPDATED_EVENT, { detail }))
}

export function subscribeOverviewCacheUpdated(
  target: EventTarget,
  isCurrentOwner: (detail: OverviewCacheUpdatedDetail) => boolean,
  onUpdated: (detail: OverviewCacheUpdatedDetail) => void,
): () => void {
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail
    if (isOverviewIntentCreatedDetail(detail) && isCurrentOwner(detail as OverviewCacheUpdatedDetail)) {
      onUpdated(detail as OverviewCacheUpdatedDetail)
    }
  }
  target.addEventListener(OVERVIEW_CACHE_UPDATED_EVENT, handler)
  return () => target.removeEventListener(OVERVIEW_CACHE_UPDATED_EVENT, handler)
}
