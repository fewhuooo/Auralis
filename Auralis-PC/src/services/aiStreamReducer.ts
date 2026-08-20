export interface StreamCitation {
  sourceId?: string
  chunkId?: string
  ordinal?: number
  title?: string
  excerpt?: string
  similarity?: number
}

export interface StreamEvent {
  event: string
  data: unknown
}

export interface StreamResult {
  content: string
  citations: StreamCitation[]
}

export function reduceAiStreamEvent(result: StreamResult, event: StreamEvent): StreamResult {
  if (event.event === 'message.delta' && typeof event.data === 'string') {
    return { ...result, content: result.content + event.data }
  }
  if (event.event === 'message.completed' && typeof event.data === 'object' && event.data !== null) {
    const data = event.data as { content?: unknown }
    if (!result.content && typeof data.content === 'string') return { ...result, content: data.content }
  }
  if (event.event === 'citation' && typeof event.data === 'object' && event.data !== null) {
    const citation = event.data as StreamCitation
    const key = `${citation.sourceId || ''}:${citation.chunkId || ''}:${citation.ordinal ?? ''}`
    if (result.citations.some((item) => `${item.sourceId || ''}:${item.chunkId || ''}:${item.ordinal ?? ''}` === key)) return result
    return { ...result, citations: [...result.citations, citation] }
  }
  return result
}
