import type { Protocol1MessageCommand } from '../api/aiClient.ts'
import type { ChatStreamEnvelope } from '../types/chatProtocol.ts'
import { createChatStreamState, reduceChatStreamEvent, type ChatStreamState } from './aiStreamReducer.ts'

export type ChatStreamSource = (
  input: Protocol1MessageCommand,
  signal: AbortSignal
) => AsyncIterable<ChatStreamEnvelope> | Promise<AsyncIterable<ChatStreamEnvelope>>

async function defaultStreamSource(
  input: Protocol1MessageCommand,
  signal: AbortSignal
): Promise<AsyncIterable<ChatStreamEnvelope>> {
  const { streamAiMessage } = await import('../api/aiClient.ts')
  return streamAiMessage(input, signal)
}

export interface ChatStreamHandlers {
  onEvent?: (event: ChatStreamEnvelope, state: ChatStreamState) => void
}

export class AiStreamController {
  private abortController: AbortController | null = null
  private readonly streamSource: ChatStreamSource

  constructor(streamSource: ChatStreamSource = defaultStreamSource) {
    this.streamSource = streamSource
  }

  /**
   * Transport abort is reserved for teardown / client disconnect.
   * To cancel server execution, use the server cancel route.
   */
  abort(): void {
    this.abortController?.abort()
    this.abortController = null
  }

  async run(
    input: Protocol1MessageCommand,
    handlers: ChatStreamHandlers = {},
    initialState?: Partial<ChatStreamState>
  ): Promise<ChatStreamState> {
    if (this.abortController) {
      throw new Error('A chat stream is already active')
    }
    const controller = new AbortController()
    this.abortController = controller
    let state = createChatStreamState(initialState)
    try {
      const stream = await this.streamSource(input, controller.signal)
      for await (const event of stream) {
        const next = reduceChatStreamEvent(state, event)
        if (next !== state) {
          state = next
          handlers.onEvent?.(event, state)
        }
      }
      if (controller.signal.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError')
      }
      return state
    } finally {
      if (this.abortController === controller) {
        this.abortController = null
      }
    }
  }
}
