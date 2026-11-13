import { ApiProblemError } from '../../api/httpError.ts'

export const MAX_AUTOMATIC_RETRIES = 3

export const PARSED_DOCUMENT_UPLOAD_FAILURE_REASONS = [
  'connect',
  'timeout',
  'body',
  'request',
  'client',
  'retryable-response',
] as const

export type ParsedDocumentUploadFailureReason = typeof PARSED_DOCUMENT_UPLOAD_FAILURE_REASONS[number]

export function errorCode(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim().split(':', 1)[0]
  return 'DOCUMENT_PROCESSING_FAILED'
}

export function isAppClosed(error: unknown): boolean {
  return errorCode(error) === 'APP_CLOSED' || errorCode(error) === 'ABORT_ERR'
}

export function isNetworkFailure(error: unknown): boolean {
  if (error instanceof ApiProblemError) return error.status === 0
  return ['NETWORK_OFFLINE', 'NETWORK_ERROR', 'FETCH_FAILED', 'DOCUMENT_UPLOAD_RETRYABLE'].includes(errorCode(error))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : ''
}

/** Convert transport failures to a bounded, persistence-safe diagnostic token. */
export function parsedDocumentUploadFailureDetail(error: unknown, stage: 'upload' | 'complete'): string {
  const message = errorMessage(error)
  const code = errorCode(error)
  let reason: ParsedDocumentUploadFailureReason = 'client'
  if (code === 'DOCUMENT_UPLOAD_RETRYABLE') {
    reason = 'retryable-response'
  } else if (code === 'NETWORK_OFFLINE') {
    const suffix = message.slice('NETWORK_OFFLINE:'.length)
    if ((PARSED_DOCUMENT_UPLOAD_FAILURE_REASONS as readonly string[]).includes(suffix)) {
      reason = suffix as ParsedDocumentUploadFailureReason
    }
  }
  return `PARSED_DOCUMENT_UPLOAD_PAUSED:${stage === 'complete' ? 'complete' : 'upload'}:${reason}`
}

export function isAutomaticallyRetryable(error: unknown): boolean {
  return ['OCR_MODEL_FAILED', 'OCR_TIMEOUT', 'SIDECAR_CRASH', 'CACHE_WRITE_FAILED'].includes(errorCode(error))
}
