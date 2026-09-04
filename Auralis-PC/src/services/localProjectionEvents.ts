export type ProjectionChange = {
  resourceTypes: ReadonlySet<string>
}

const listeners = new Set<(change: ProjectionChange) => void>()

export function publishProjectionChange(change: ProjectionChange): void {
  for (const listener of listeners) listener(change)
}

export function subscribeProjectionChange(listener: (change: ProjectionChange) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
