/**
 * 平滑流式文本蓄水池缓冲器（跨 H5 / 微信小程序）
 * 在后端按网络分片到达时，通过帧同步节拍按每帧约 2~4 字匀速推进展示，
 * 遇到流结束信号时加速平滑排空剩余字符，兼顾丝滑手感与零拖沓延迟。
 */
export interface SmoothStreamOptions {
  baseSpeed?: number
  minSpeed?: number
  maxSpeed?: number
  finishSpeed?: number
  speedDampingFactor?: number
  onComplete?: () => void
}

export interface SmoothStreamController {
  push(targetText: string): void
  finish(targetText?: string): void
  flush(targetText?: string): void
  reset(): void
  destroy(): void
  isDrained(): boolean
}

function currentTimestampMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

export function createSmoothStreamBuffer(
  onUpdate: (displayedText: string) => void,
  options: SmoothStreamOptions = {},
): SmoothStreamController {
  const minSpeed = options.minSpeed ?? 24
  const baseSpeed = options.baseSpeed ?? 42
  const maxSpeed = options.maxSpeed ?? 120
  const finishSpeed = options.finishSpeed ?? 78
  const damping = options.speedDampingFactor ?? 7.5

  let fullText = ''
  let currentCursor = 0
  let displayedLength = 0
  let currentSpeed = baseSpeed
  let lastTimestamp = 0
  let frameKind: 'raf' | 'timeout' | null = null
  let frameHandle = 0
  let isStreamFinished = false
  let drained = true
  let destroyed = false

  function cancelScheduledTick() {
    if (frameKind === 'raf' && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(frameHandle)
    } else if (frameKind === 'timeout') {
      clearTimeout(frameHandle)
    }
    frameKind = null
    frameHandle = 0
  }

  function scheduleNextTick() {
    if (destroyed || frameKind !== null) return
    if (typeof requestAnimationFrame === 'function') {
      frameKind = 'raf'
      frameHandle = requestAnimationFrame((ts) => {
        if (destroyed || frameKind !== 'raf') return
        frameKind = null
        frameHandle = 0
        tick(ts)
      })
      return
    }
    frameKind = 'timeout'
    frameHandle = Number(setTimeout(() => {
      if (destroyed || frameKind !== 'timeout') return
      frameKind = null
      frameHandle = 0
      tick(currentTimestampMs())
    }, 16))
  }

  function tick(timestamp: number) {
    if (destroyed) return
    if (lastTimestamp === 0) {
      lastTimestamp = timestamp
    }
    const deltaSeconds = Math.min(0.08, Math.max(0.001, (timestamp - lastTimestamp) / 1000))
    lastTimestamp = timestamp

    const remaining = fullText.length - currentCursor
    if (remaining <= 0) {
      drained = true
      lastTimestamp = 0
      if (!isStreamFinished) return
      if (displayedLength !== fullText.length) {
        displayedLength = fullText.length
        onUpdate(fullText)
      }
      if (!destroyed) {
        options.onComplete?.()
      }
      return
    }

    drained = false
    let targetSpeed = baseSpeed
    if (isStreamFinished) {
      targetSpeed = Math.min(maxSpeed, Math.max(finishSpeed, remaining * 3.0))
    } else if (remaining <= 4) {
      targetSpeed = minSpeed
    } else if (remaining <= 16) {
      targetSpeed = baseSpeed + (remaining - 4) * 1.4
    } else if (remaining <= 40) {
      targetSpeed = baseSpeed + 16 + (remaining - 16) * 1.2
    } else {
      targetSpeed = Math.min(maxSpeed, 76 + (remaining - 40) * 0.8)
    }

    const blend = Math.min(1, deltaSeconds * damping)
    currentSpeed += (targetSpeed - currentSpeed) * blend
    currentCursor = Math.min(fullText.length, currentCursor + currentSpeed * deltaSeconds)
    const nextIndex = Math.floor(currentCursor)

    if (nextIndex !== displayedLength) {
      displayedLength = nextIndex
      onUpdate(fullText.slice(0, nextIndex))
    }

    if (!destroyed) {
      scheduleNextTick()
    }
  }

  function startLoop() {
    if (!destroyed && frameKind === null) {
      lastTimestamp = 0
      scheduleNextTick()
    }
  }

  return {
    push(targetText: string) {
      if (destroyed) return
      if (targetText.length < fullText.length) {
        currentCursor = Math.min(currentCursor, targetText.length)
        displayedLength = Math.min(displayedLength, targetText.length)
      }
      fullText = targetText
      isStreamFinished = false
      drained = displayedLength >= fullText.length
      if (!drained) {
        startLoop()
      }
    },
    finish(targetText?: string) {
      if (destroyed) return
      if (typeof targetText === 'string') {
        fullText = targetText
      }
      isStreamFinished = true
      if (displayedLength >= fullText.length) {
        cancelScheduledTick()
        drained = true
        lastTimestamp = 0
        if (!destroyed) {
          options.onComplete?.()
        }
        return
      }
      startLoop()
    },
    flush(targetText?: string) {
      if (destroyed) return
      if (typeof targetText === 'string') {
        fullText = targetText
      }
      cancelScheduledTick()
      currentCursor = fullText.length
      displayedLength = fullText.length
      lastTimestamp = 0
      isStreamFinished = true
      drained = true
      onUpdate(fullText)
      if (!destroyed) {
        options.onComplete?.()
      }
    },
    reset() {
      cancelScheduledTick()
      fullText = ''
      currentCursor = 0
      displayedLength = 0
      currentSpeed = baseSpeed
      lastTimestamp = 0
      isStreamFinished = false
      drained = true
    },
    destroy() {
      destroyed = true
      cancelScheduledTick()
      lastTimestamp = 0
    },
    isDrained() {
      return drained && displayedLength >= fullText.length
    },
  }
}
