export interface SyncScheduler {
  request(): void
  flushNow(): Promise<void>
  dispose(): void
}

export function createSyncScheduler(input: { delayMs: number; run: () => Promise<void> }): SyncScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null
  let running: Promise<void> | null = null
  let requested = false
  let disposed = false

  const clearTimer = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  const runRequested = async (): Promise<void> => {
    clearTimer()
    if (disposed || running || !requested) return running ?? Promise.resolve()
    requested = false
    running = input.run()
    try {
      await running
    } finally {
      running = null
      if (requested && !disposed) schedule()
    }
  }

  const schedule = (): void => {
    if (disposed || timer || running) return
    timer = setTimeout(() => { void runRequested() }, input.delayMs)
  }

  return {
    request(): void {
      if (disposed) return
      requested = true
      schedule()
    },
    async flushNow(): Promise<void> {
      if (disposed) return
      clearTimer()
      if (running) {
        requested = true
        await running
        return this.flushNow()
      }
      requested = true
      await runRequested()
    },
    dispose(): void {
      disposed = true
      requested = false
      clearTimer()
    },
  }
}
