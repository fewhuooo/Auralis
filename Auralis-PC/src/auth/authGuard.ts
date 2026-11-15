export function resolveAuthRedirect(
  path: string,
  requiresAuth: boolean,
  hasSession: boolean,
): string | null {
  const isLoginPage = path === '/login' || path.startsWith('/login?') || path.startsWith('/login#')
  if (isLoginPage) {
    return hasSession ? '/' : null
  }
  if (requiresAuth && !hasSession) {
    return '/login'
  }
  return null
}

export function resolveLoginReturnPath(
  redirect: unknown,
  isProtectedRoute: (path: string) => boolean,
): string {
  if (typeof redirect !== 'string' || !redirect.startsWith('/') || redirect.startsWith('//')
    || /[\\\u0000-\u001f\u007f]/.test(redirect)) return '/'
  return isProtectedRoute(redirect) ? redirect : '/'
}
