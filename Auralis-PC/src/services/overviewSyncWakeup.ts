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
