export type AuthSessionStatus = 'anonymous' | 'authenticated' | 'reauthentication-required'

export class AuthenticationRequiredError extends Error {
  readonly code = 'AUTHENTICATION_REQUIRED'

  constructor(message = 'Authentication is required. Please sign in again.') {
    super(message)
    this.name = 'AuthenticationRequiredError'
  }
}

export interface AuthSessionState {
  readonly status: AuthSessionStatus
  readonly reason: string | null
  markAuthenticated(): void
  clear(): void
  requireReauthentication(reason?: string): void
  canStartProtectedRequest(): boolean
}

export function createAuthSessionState(): AuthSessionState {
  let status: AuthSessionStatus = 'anonymous'
  let reason: string | null = null

  return {
    get status() { return status },
    get reason() { return reason },
    markAuthenticated() {
      status = 'authenticated'
      reason = null
    },
    clear() {
      status = 'anonymous'
      reason = null
    },
    requireReauthentication(nextReason = 'The saved session is no longer valid.') {
      if (status !== 'reauthentication-required') {
        status = 'reauthentication-required'
        reason = nextReason
      }
    },
    canStartProtectedRequest() {
      return status === 'authenticated'
    },
  }
}

export function isAuthenticationRequired(error: unknown): boolean {
  return error instanceof AuthenticationRequiredError
    || Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'AUTHENTICATION_REQUIRED')
}

export function isPublicAuthPath(url: string): boolean {
  const path = url.split('?', 1)[0].replace(/^https?:\/\/[^/]+/i, '')
  return path === '/api/auth/login'
    || path === '/api/auth/register'
    || path === '/api/auth/refresh'
    || path === '/actuator/health'
}

export function shouldBlockProtectedRequest(url: string, reauthenticationRequired: boolean): boolean {
  return reauthenticationRequired && !isPublicAuthPath(url)
}
