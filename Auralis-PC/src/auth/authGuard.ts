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
