import { readonly, ref } from 'vue'

const unavailable = ref(false)
let nextRequestId = 0
let latestObservedRequestId = 0

export const serviceUnavailable = readonly(unavailable)

export function beginServiceRequest(): number {
  nextRequestId += 1
  return nextRequestId
}

function shouldApplyObservation(requestId: number | undefined): boolean {
  if (!Number.isSafeInteger(requestId) || requestId === undefined || requestId <= latestObservedRequestId) return false
  latestObservedRequestId = requestId
  return true
}

export function observeServiceFailure(
  requestId: number | undefined,
  status: number | undefined,
  code: string | undefined,
): void {
  const hasHttpResponse = typeof status === 'number'
  const isTransportFailure = !hasHttpResponse
    && (code === 'ERR_NETWORK' || code === 'ECONNABORTED' || code === 'ETIMEDOUT')
  if (!hasHttpResponse && !isTransportFailure) return
  if (!shouldApplyObservation(requestId)) return

  if (typeof status === 'number') {
    unavailable.value = status >= 500
    return
  }

  unavailable.value = true
}

export function observeServiceAvailable(requestId: number | undefined): void {
  if (!shouldApplyObservation(requestId)) return
  unavailable.value = false
}
