export const MAX_AUTOMATIC_RETRIES = 3

export function errorCode(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim().split(':', 1)[0]
  return 'DOCUMENT_PROCESSING_FAILED'
}

export function isAppClosed(error: unknown): boolean {
  return errorCode(error) === 'APP_CLOSED' || errorCode(error) === 'ABORT_ERR'
}

export function isNetworkFailure(error: unknown): boolean {
  return ['NETWORK_OFFLINE', 'NETWORK_ERROR', 'FETCH_FAILED', 'DOCUMENT_UPLOAD_RETRYABLE'].includes(errorCode(error))
}

export function isAutomaticallyRetryable(error: unknown): boolean {
  return ['OCR_MODEL_FAILED', 'OCR_TIMEOUT', 'SIDECAR_CRASH', 'CACHE_WRITE_FAILED'].includes(errorCode(error))
}
