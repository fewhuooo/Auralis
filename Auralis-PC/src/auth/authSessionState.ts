export type AuthSessionStatus = 'anonymous' | 'authenticated' | 'reauthentication-required'

export class AuthenticationRequiredError extends Error {
  readonly code = 'AUTHENTICATION_REQUIRED'

  constructor(message = 'Authentication is required. Please sign in again.') {
    super(message)
    this.name = 'AuthenticationRequiredError'
  }
}

export function isAuthenticationRequired(error: unknown): boolean {
  return error instanceof AuthenticationRequiredError
    || Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'AUTHENTICATION_REQUIRED')
}

export function isPublicAuthPath(url: string): boolean {
  const path = authPath(url)
  return path === '/api/auth/login'
    || path === '/api/auth/register'
    || path === '/api/auth/register/email-code'
    || path === '/api/auth/password/reset/email-code'
    || path === '/api/auth/password/reset'
    || path === '/api/auth/refresh'
    || path === '/actuator/health'
}

export function isLogoutPath(url: string): boolean {
  return authPath(url) === '/api/auth/logout'
}

export function isPasswordConfirmationFailure(url: string, method: string | undefined, responseData: unknown): boolean {
  const path = authPath(url)
  const verb = method?.toUpperCase()
  const confirmsPassword = (verb === 'DELETE' && path === '/api/auth/me')
    || (verb === 'PUT' && path === '/api/auth/password')
  if (!confirmsPassword || !responseData || typeof responseData !== 'object') {
    return false
  }

  const problem = responseData as { code?: unknown; detail?: unknown }
  return problem.code === 'UNAUTHENTICATED' && problem.detail === 'Invalid credentials'
}

export function shouldBlockProtectedRequest(url: string, reauthenticationRequired: boolean): boolean {
  return reauthenticationRequired && !isPublicAuthPath(url)
}

function authPath(url: string): string {
  return url.split('?', 1)[0].replace(/^https?:\/\/[^/]+/i, '')
}
