import { ApiProblemError, toApiProblem } from './httpError.ts'

export interface SseEvent<T = unknown> {
  event?: string
  data: T
  id?: string
}

export interface SseParserOptions {
  signal?: AbortSignal
}

function parseDataValue(rawValue: string): unknown {
  const trimmed = rawValue.trim()
  if (!trimmed) return ''
  try {
    return JSON.parse(trimmed)
  } catch {
    return rawValue
  }
}

/**
 * Parses an async iterable of text chunks into SSE events.
 * Correctly handles:
 * - chunk boundaries (partial lines across chunks)
 * - `event:`, `data:`, `id:` fields
 * - multiline `data:` fields (concatenated with \n)
 * - comment lines starting with `:`
 * - dispatch on empty line (\n\n or \r\n\r\n)
 * - AbortSignal cancellation
 */
export async function* parseSseStream<T = unknown>(
  stream: AsyncIterable<string>,
  options?: SseParserOptions
): AsyncIterable<SseEvent<T>> {
  let buffer = ''
  let currentEvent: string | undefined
  let currentDataLines: string[] = []
  let currentId: string | undefined

  const consumeLine = (line: string): SseEvent<T> | undefined => {
    if (line === '') {
      if (currentDataLines.length === 0 && currentEvent === undefined) return undefined
      const event: SseEvent<T> = {
        event: currentEvent,
        data: parseDataValue(currentDataLines.join('\n')) as T,
        id: currentId,
      }
      currentEvent = undefined
      currentDataLines = []
      currentId = undefined
      return event
    }

    if (line.startsWith(':')) return undefined

    const colonIndex = line.indexOf(':')
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex)
    let value = colonIndex === -1 ? '' : line.slice(colonIndex + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'event') currentEvent = value
    else if (field === 'data') currentDataLines.push(value)
    else if (field === 'id') currentId = value
    return undefined
  }

  for await (const chunk of stream) {
    if (options?.signal?.aborted) {
      return
    }

    // Preserve a CR at the end of a chunk until a possible LF arrives in the
    // next chunk, otherwise a split CRLF would look like an empty event line.
    if (buffer.endsWith('\r') && chunk.startsWith('\n')) buffer = buffer.slice(0, -1)
    buffer += chunk
    const lines = buffer.split(/\r\n|\n|\r(?!$)/)
    // The last element is the remainder after the last newline
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (options?.signal?.aborted) {
        return
      }

      const event = consumeLine(line)
      if (event) yield event
    }
  }

  // Handle a final line or a lone trailing CR delimiter when the stream
  // closes without a final blank line.
  if (buffer.length > 0) {
    const hasTrailingCr = buffer.endsWith('\r')
    const event = consumeLine(hasTrailingCr ? buffer.slice(0, -1) : buffer)
    if (event) yield event
    if (hasTrailingCr) {
      const dispatched = consumeLine('')
      if (dispatched) yield dispatched
    }
  }

  const trailingEvent = consumeLine('')
  if (trailingEvent) yield trailingEvent
}

/**
 * Connects to an SSE endpoint and streams parsed SSE events.
 */
export async function* fetchSseStream<T = unknown>(
  url: string,
  init: RequestInit,
  options?: SseParserOptions
): AsyncIterable<SseEvent<T>> {
  const signal = options?.signal ?? init.signal
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      signal,
    })
  } catch (error) {
    if (signal?.aborted) return
    throw error
  }

  if (!response.ok) {
    let errorBody: unknown
    try {
      errorBody = await response.json()
    } catch {
      errorBody = await response.text()
    }
    const problem = toApiProblem({
      response: {
        status: response.status,
        data: errorBody,
        headers: Object.fromEntries(response.headers.entries()),
      },
    })
    throw new ApiProblemError(problem)
  }

  if (!response.body) {
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')

  async function* readChunks(): AsyncIterable<string> {
    try {
      while (true) {
        if (signal?.aborted) {
          break
        }
        const { done, value } = await reader.read()
        if (done) break
        yield decoder.decode(value, { stream: true })
      }
      const remainder = decoder.decode()
      if (remainder) yield remainder
    } finally {
      reader.releaseLock()
    }
  }

  try {
    yield* parseSseStream<T>(readChunks(), { signal: signal ?? undefined })
  } catch (error) {
    if (!signal?.aborted) throw error
  }
}
