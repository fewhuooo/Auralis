import type { RequestAdapterOptions } from '../api/requestCore.ts'

function parseResponsePayload(rawText: string, status: number): unknown {
  if (status === 204 || rawText === '') return undefined
  try {
    return JSON.parse(rawText) as unknown
  } catch {
    return rawText
  }
}

export function sendHttpRequest(options: RequestAdapterOptions): void {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  let timedOut = false
  const timer = controller && options.timeout > 0
    ? setTimeout(() => {
        timedOut = true
        controller.abort()
      }, options.timeout)
    : null

  const body = options.method === 'GET' || options.data === undefined
    ? undefined
    : (typeof options.data === 'string' ? options.data : JSON.stringify(options.data))

  void fetch(options.url, {
    method: options.method,
    headers: options.header,
    ...(body !== undefined ? { body } : {}),
    ...(controller ? { signal: controller.signal } : {}),
  })
    .then(async (response) => {
      const rawText = await response.text()
      if (timer) clearTimeout(timer)
      options.success({
        statusCode: response.status,
        data: parseResponsePayload(rawText, response.status),
      })
    })
    .catch((error: unknown) => {
      if (timer) clearTimeout(timer)
      const errMsg = timedOut
        ? 'request:fail timeout'
        : (error instanceof Error && error.message ? error.message : 'Network Error')
      options.fail({ errMsg })
    })
}
