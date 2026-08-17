export function isValidSession(user: unknown, tokens: unknown): boolean {
  if (!user || typeof user !== 'object') return false
  if (!tokens || typeof tokens !== 'object') return false
  const u = user as Record<string, unknown>
  const t = tokens as Record<string, unknown>
  if (typeof u.id !== 'string' || !u.id.trim()) return false
  if (typeof t.accessToken !== 'string' || !t.accessToken.trim()) return false
  if (typeof t.refreshToken !== 'string' || !t.refreshToken.trim()) return false
  return true
}
