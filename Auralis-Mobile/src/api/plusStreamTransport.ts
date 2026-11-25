export interface PlusXhrLike {
  readyState: number
  status: number
  responseText: string
  timeout: number
  onreadystatechange: (() => void) | null
  onerror: (() => void) | null
  ontimeout: (() => void) | null
  onabort?: (() => void) | null
  open(method: string, url: string): void
  setRequestHeader(name: string, value: string): void
  send(body?: string): void
  abort(): void
  getResponseHeader(name: string): string | null
}

export interface IncrementalXhrSseOptions {
  createXhr: () => PlusXhrLike
  url: string
  headers: Record<string, string>
  body: string
  timeoutMs?: number
  isCurrent: () => boolean
  isManuallyAborted: () => boolean
  onChunk: (chunkText: string) => void
  onAbortReady?: (abortFn: () => void) => void
}

export interface IncrementalXhrSseResult {
  aborted: boolean
  statusCode: number
  remainingText: string
  fullText: string
  retryAfterHeader?: string
}

export function runIncrementalXhrSse(
  options: IncrementalXhrSseOptions,
): Promise<IncrementalXhrSseResult> {
  return new Promise((resolve, reject) => {
    const xhr = options.createXhr()
    let consumedOffset = 0
    let settled = false
    let localAborted = false

    const abortRequest = () => {
      try {
        xhr.abort()
      } catch {
        // Ignore abort errors
      }
    }

    const settleAbort = () => {
      if (settled) return
      settled = true
      localAborted = true
      abortRequest()
      resolve({
        aborted: true,
        statusCode: xhr.status || 0,
        remainingText: '',
        fullText: '',
      })
    }

    options.onAbortReady?.(settleAbort)

    if (!options.isCurrent()) {
      settled = true
      reject(new Error('登录状态已变化，请重试。'))
      return
    }
    if (options.isManuallyAborted()) {
      settleAbort()
      return
    }

    xhr.onreadystatechange = () => {
      if (settled) return
      if (localAborted || options.isManuallyAborted()) {
        settleAbort()
        return
      }
      if (!options.isCurrent()) {
        settled = true
        abortRequest()
        reject(new Error('登录状态已变化，请重试。'))
        return
      }

      const text = typeof xhr.responseText === 'string' ? xhr.responseText : ''
      if (xhr.readyState === 3) {
        if (xhr.status >= 200 && xhr.status < 300 && text.length > consumedOffset) {
          const delta = text.slice(consumedOffset)
          consumedOffset = text.length
          options.onChunk(delta)
        }
        return
      }

      if (xhr.readyState === 4) {
        if (xhr.status === 0) {
          queueMicrotask(() => {
            if (settled) return
            settled = true
            reject(new Error('Network Error'))
          })
          return
        }
        settled = true
        const remainingText = text.slice(consumedOffset)
        consumedOffset = text.length
        const retryAfter = xhr.getResponseHeader('retry-after')
        resolve({
          aborted: false,
          statusCode: xhr.status,
          remainingText,
          fullText: text,
          retryAfterHeader: retryAfter ?? undefined,
        })
      }
    }

    xhr.onerror = () => {
      if (settled) return
      if (localAborted || options.isManuallyAborted()) {
        settleAbort()
        return
      }
      settled = true
      reject(new Error('Network Error'))
    }

    xhr.ontimeout = () => {
      if (settled) return
      if (localAborted || options.isManuallyAborted()) {
        settleAbort()
        return
      }
      settled = true
      reject(new Error('AI 流式请求超时，请检查网络后重试'))
    }

    xhr.open('POST', options.url)
    xhr.timeout = options.timeoutMs ?? 330_000
    for (const [key, value] of Object.entries(options.headers)) {
      xhr.setRequestHeader(key, value)
    }
    xhr.send(options.body)
  })
}
