import { streamAiMessage, type AiMessageCommand } from '@/api/aiClient'
import type { AiStreamCitation, AiStreamEvent } from '@/api/sse'
import { reduceAiStreamEvent as reduceStreamEvent } from './aiStreamReducer'

export interface AiStreamResult {
  content: string
  citations: AiStreamCitation[]
}

export interface AiStreamHandlers {
  onDelta?: (content: string) => void
  onCitation?: (citation: AiStreamCitation) => void
  onStarted?: (data: unknown) => void
}

export function reduceAiStreamEvent(
  result: AiStreamResult,
  event: AiStreamEvent,
): AiStreamResult {
  return reduceStreamEvent(result, event) as AiStreamResult
}

export class AiStreamController {
  private abortController: AbortController | null = null

  abort(): void {
    this.abortController?.abort()
    this.abortController = null
  }

  async run(input: AiMessageCommand, handlers: AiStreamHandlers = {}): Promise<AiStreamResult> {
    this.abort()
    const controller = new AbortController()
    this.abortController = controller
    let result: AiStreamResult = { content: '', citations: [] }
    try {
      for await (const event of streamAiMessage(input, controller.signal)) {
        if (event.event === 'message.started') handlers.onStarted?.(event.data)
        const next = reduceAiStreamEvent(result, event)
        if (next.content !== result.content) handlers.onDelta?.(next.content.slice(result.content.length))
        if (next.citations.length > result.citations.length) handlers.onCitation?.(next.citations[next.citations.length - 1])
        result = next
        if (event.event === 'message.error') {
          const data = event.data as { message?: string; detail?: string } | undefined
          throw new Error(data?.message || data?.detail || 'AI 请求失败')
        }
      }
      if (controller.signal.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
      return result
    } finally {
      if (this.abortController === controller) this.abortController = null
    }
  }
}
