/**
 * 使用 fetch + ReadableStream 消费 SSE 流
 * 支持 Authorization Header，避免 Token 泄露到 URL
 */
export async function streamFetch(
  url: string,
  token: string,
  onChunk: (chunk: string) => void,
  onComplete: () => void,
  onError: (err: Error) => void,
  signal?: AbortSignal
) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'text/event-stream',
      },
      signal,
    })

    if (!response.ok || !response.body) {
      onError(new Error(`HTTP ${response.status}`))
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? '' // 保留不完整行

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('data:')) {
          const data = trimmed.slice(5).trim()
          if (data === '[DONE]') {
            onComplete()
            return
          }
          // 特殊处理后端返回的 event: complete，或者只是普通的 chunk
          onChunk(data)
        }
      }
    }
    onComplete()
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return
    }
    onError(err)
  }
}
