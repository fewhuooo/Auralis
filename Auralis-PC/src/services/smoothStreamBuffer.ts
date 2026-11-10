/**
 * 前端弹簧阻尼蓄洪池 (Fluid Reservoir Stream Buffer)
 * 解决大模型 SSE 流式输出中的网络批次突发与停顿（例如网络停顿 300ms -> 突发 15 字），
 * 彻底消除“吐字过快、一顿一顿”的抽搐感。
 *
 * 核心原理（消峰填谷与时间连续性）：
 * 1. 真实时间戳驱动（Delta-Time）：基于 performance.now() 与秒级速率计算，彻底与屏幕刷新率（60Hz/120Hz/144Hz/240Hz）解耦；
 * 2. 蓄水与低水位保底拉伸：当网络包间隔较大、蓄水池字符偏少（<= 4 字）时，自动舒缓降速至保底拉伸速度（约 18~20 字/秒，每字 50ms），
 *    以极缓的步调维持打字光标连续前进，有效覆盖下一个 SSE 网络包到达前的 200~300ms 空窗期，彻底杜绝断流卡顿；
 * 3. 高水位平滑消峰追赶：当后台涌入大批文本时，速度以平滑的加速度（Damped Acceleration）渐进提升，最高受限于 maxSpeed，
 *    绝不整块瞬间倾泻突闪；
 * 4. 速度连续性阻尼（IIR 滤波）：实时速度平滑追踪目标速度，消除瞬间跳速与顿挫感。
 */
export interface SmoothStreamOptions {
  baseSpeed?: number // 正常巡航吐字速度（字符/秒，默认 28，约 35ms 一字）
  minSpeed?: number // 蓄水池偏低时的保底拉伸速度（字符/秒，默认 18，约 55ms 一字，填补网络等待间隙）
  maxSpeed?: number // 最大追赶上限（字符/秒，默认 75，避免堆积时文字快闪）
  finishSpeed?: number // 流结束排空时的推进速度（字符/秒，默认 50）
  speedDampingFactor?: number // 速度加速度阻尼系数（默认 6.5）
  onComplete?: () => void // 平滑缓冲彻底输出完毕的回调

  // 兼容旧参数
  baseStep?: number
  elasticFactor?: number
  maxStepPerTick?: number
  finishMaxStep?: number
}

export interface SmoothStreamController {
  push(targetText: string): void
  finish(targetText?: string): void
  flush(targetText?: string): void
  reset(): void
  destroy(): void
  isDrained(): boolean
}

export function createSmoothStreamBuffer(
  onUpdate: (displayedText: string) => void,
  options: SmoothStreamOptions = {},
): SmoothStreamController {
  const minSpeed = options.minSpeed ?? 18
  const baseSpeed = options.baseSpeed ?? 28
  const maxSpeed = options.maxSpeed ?? 75
  const finishSpeed = options.finishSpeed ?? 50
  const damping = options.speedDampingFactor ?? 6.5

  let fullText = ''
  let currentCursor = 0
  let displayedLength = 0
  let currentSpeed = baseSpeed
  let lastTimestamp = 0
  let rafId: number | null = null
  let isStreamFinished = false
  let isDrained = true

  function tick(timestamp: number) {
    if (rafId === null) return

    if (lastTimestamp === 0) {
      lastTimestamp = timestamp
    }
    // 限制单帧最大时间增量为 80ms，避免切后台唤醒或偶发卡顿导致的巨大瞬间跳字
    const deltaSeconds = Math.min(0.08, Math.max(0.001, (timestamp - lastTimestamp) / 1000))
    lastTimestamp = timestamp

    const remaining = fullText.length - currentCursor

    if (remaining > 0) {
      isDrained = false

      // 动态目标速度计算（蓄水池消峰填谷算法）：
      let targetSpeed: number

      if (isStreamFinished) {
        // 后台推流已完成，平滑加速收尾，不让用户漫长等待，但保持舒缓连贯
        targetSpeed = Math.min(maxSpeed, Math.max(finishSpeed, remaining * 2.2))
      } else if (remaining <= 4) {
        // 低水位区（1~4 字）：以保底拉伸速度（约 18 字/秒）缓缓出字，用时间拉伸覆盖网络延迟，避免池子空置骤停
        targetSpeed = minSpeed
      } else if (remaining <= 12) {
        // 最佳巡航区（5~12 字）：保持在自然舒适的黄金阅读速率（24~32 字/秒）
        targetSpeed = baseSpeed + (remaining - 5) * 1.0
      } else if (remaining <= 30) {
        // 中度积压区（13~30 字）：柔和提速（32~50 字/秒）消峰
        targetSpeed = baseSpeed + 7 + (remaining - 12) * 1.0
      } else {
        // 重度积压区（30+ 字）：加速消化积压文本，严格封顶于 maxSpeed
        targetSpeed = Math.min(maxSpeed, 50 + (remaining - 30) * 0.6)
      }

      // 速度连续性滤波（指数衰减平滑阻尼，避免瞬时速度突变）：
      const blend = Math.min(1, deltaSeconds * damping)
      currentSpeed += (targetSpeed - currentSpeed) * blend

      // 推进游标
      currentCursor = Math.min(fullText.length, currentCursor + currentSpeed * deltaSeconds)
      const nextIndex = Math.floor(currentCursor)

      // 仅当游标真正跨越到新字符时触发 DOM 更新
      if (nextIndex !== displayedLength) {
        displayedLength = nextIndex
        onUpdate(fullText.slice(0, nextIndex))
      }

      rafId = requestAnimationFrame(tick)
    } else {
      isDrained = true
      if (isStreamFinished) {
        if (displayedLength !== fullText.length) {
          displayedLength = fullText.length
          onUpdate(fullText)
        }
        rafId = null
        lastTimestamp = 0
        options.onComplete?.()
      } else {
        // 池子暂时见底，挂起等待新批次唤醒
        rafId = null
        lastTimestamp = 0
      }
    }
  }

  function startLoop() {
    if (typeof window === 'undefined' || typeof requestAnimationFrame === 'undefined') {
      currentCursor = fullText.length
      displayedLength = fullText.length
      onUpdate(fullText)
      options.onComplete?.()
      return
    }
    if (rafId === null) {
      lastTimestamp = 0
      rafId = requestAnimationFrame(tick)
    }
  }

  return {
    push(targetText: string) {
      fullText = targetText
      isStreamFinished = false
      isDrained = displayedLength >= fullText.length
      startLoop()
    },
    finish(targetText?: string) {
      if (typeof targetText === 'string') {
        fullText = targetText
      }
      isStreamFinished = true
      if (displayedLength >= fullText.length) {
        isDrained = true
        options.onComplete?.()
      } else {
        startLoop()
      }
    },
    flush(targetText?: string) {
      if (typeof targetText === 'string') {
        fullText = targetText
      }
      if (rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      currentCursor = fullText.length
      displayedLength = fullText.length
      lastTimestamp = 0
      isStreamFinished = true
      isDrained = true
      onUpdate(fullText)
      options.onComplete?.()
    },
    reset() {
      if (rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      fullText = ''
      currentCursor = 0
      displayedLength = 0
      currentSpeed = baseSpeed
      lastTimestamp = 0
      isStreamFinished = false
      isDrained = true
    },
    destroy() {
      if (rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      lastTimestamp = 0
    },
    isDrained() {
      return isDrained && displayedLength >= fullText.length
    },
  }
}
