import type { LocalMutation } from '@/types/api'

const CREATE_ORDER = ['SUBJECT', 'SOURCE', 'KNOWLEDGE_BLOCK', 'TASK', 'RELATION']
const DELETE_ORDER = ['RELATION', 'KNOWLEDGE_BLOCK', 'TASK', 'SOURCE', 'SUBJECT']

function priority(mutation: LocalMutation): number {
  if (mutation.mutationType === 'DELETE') {
    const index = DELETE_ORDER.indexOf(mutation.resourceType)
    return 100 + (index < 0 ? DELETE_ORDER.length : index)
  }
  const index = CREATE_ORDER.indexOf(mutation.resourceType)
  return index < 0 ? CREATE_ORDER.length : index
}

export function orderMutationsForPush(mutations: LocalMutation[]): LocalMutation[] {
  return [...mutations].sort((left, right) => priority(left) - priority(right)
    || left.createdAt.localeCompare(right.createdAt)
    || left.clientMutationId.localeCompare(right.clientMutationId))
}
