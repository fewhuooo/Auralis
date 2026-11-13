export type SseStreamFactory<T> = (accessToken: string | null) => AsyncIterable<T>

function isUnauthorized(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && Number((error as { status?: unknown }).status) === 401)
}

/** Runs one SSE request again after the shared refresh flow succeeds, at most once. */
export async function* streamWithAccessTokenRefresh<T>(
  initialAccessToken: string | null,
  open: SseStreamFactory<T>,
  refreshAccessToken: () => Promise<string>,
  signal?: AbortSignal,
  assertSessionCurrent?: () => void,
): AsyncIterable<T> {
  let accessToken = initialAccessToken
  let retriedAfterRefresh = false
  while (true) {
    assertSessionCurrent?.()
    try {
      yield* open(accessToken)
      assertSessionCurrent?.()
      return
    } catch (error) {
      if (signal?.aborted) throw error
      assertSessionCurrent?.()
      if (!isUnauthorized(error) || retriedAfterRefresh) throw error
      accessToken = await refreshAccessToken()
      if (signal?.aborted) return
      retriedAfterRefresh = true
    }
  }
}
