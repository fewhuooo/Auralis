export interface SseEvent {
  event?: string
  data: unknown
}

function parseData(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function createSseDecoder(onEvent: (event: SseEvent) => void) {
  let buffer = ''
  let eventName: string | undefined
  let dataLines: string[] = []

  function consume(line: string) {
    if (line === '') {
      if (eventName || dataLines.length > 0) {
        onEvent({ event: eventName, data: parseData(dataLines.join('\n')) })
      }
      eventName = undefined
      dataLines = []
      return
    }
    if (line.startsWith(':')) return
    const separator = line.indexOf(':')
    const field = separator < 0 ? line : line.slice(0, separator)
    const value = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '')
    if (field === 'event') eventName = value
    if (field === 'data') dataLines.push(value)
  }

  return {
    push(chunk: string) {
      buffer += chunk
      const lines = buffer.split(/\r\n|\n|\r(?!$)/)
      buffer = lines.pop() || ''
      for (const line of lines) consume(line)
    },
    finish() {
      if (buffer) consume(buffer.replace(/\r$/, ''))
      consume('')
      buffer = ''
    },
  }
}
