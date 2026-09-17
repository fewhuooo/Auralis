/**
 * Owner/device scoped lifecycle mutex shared by the local Source and Asset
 * repositories.  SQLite transactions remain the durable boundary; this
 * mutex closes the in-process gap between the two repository facades.
 */
const locks = new Map<string, Promise<void>>()

export async function withLocalAssetLifecycleLock<T>(
  userId: string,
  serverDeviceId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = `${userId}\u0000${serverDeviceId}`
  const previous = locks.get(key) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const chained = previous.then(() => gate, () => gate)
  locks.set(key, chained)
  await previous
  try {
    return await operation()
  } finally {
    release()
    if (locks.get(key) === chained) locks.delete(key)
  }
}

