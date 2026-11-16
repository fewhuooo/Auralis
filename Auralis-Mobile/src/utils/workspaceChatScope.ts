import type { components } from '../api/generated/schema.ts'

type SourceView = components['schemas']['SourceResponse']
type ReadingContext = components['schemas']['ReadingContext']
type ConversationView = components['schemas']['ConversationView']

export function buildWorkspaceReadingContext(
  subjectId: string,
  selectedSource: SourceView | null,
): ReadingContext {
  if (selectedSource && selectedSource.ingestionStatus === 'READY' && selectedSource.id) {
    return {
      subjectId,
      retrievalMode: 'AUTO',
      currentSourceId: selectedSource.id,
    }
  }
  return {
    subjectId,
    retrievalMode: 'SUBJECT',
  }
}

export function doesConversationMatchWorkspaceScope(
  conversation: ConversationView,
  context: ReadingContext,
): boolean {
  if (conversation.deletedAt) return false
  if (conversation.chatScopeState !== 'BOUND' || !conversation.chatScope) return false

  const scope = conversation.chatScope
  if (scope.subjectId !== context.subjectId) return false
  if (scope.retrievalMode !== context.retrievalMode) return false
  if (Array.isArray(scope.sourceIds) && scope.sourceIds.length > 0) return false

  const scopeSourceId = scope.currentSourceId || undefined
  const expectedSourceId = context.currentSourceId || undefined
  return scopeSourceId === expectedSourceId
}
