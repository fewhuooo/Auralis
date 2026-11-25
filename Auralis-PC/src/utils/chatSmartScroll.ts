export const PC_SMART_SCROLL_THRESHOLD_PX = 50

export interface PcScrollMetrics {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  userPullUpActive?: boolean
}

export interface PcSmartScrollState {
  locked: boolean
  prevScrollTop: number
}

export function isPcNearBottom(metrics: PcScrollMetrics, thresholdPx = PC_SMART_SCROLL_THRESHOLD_PX): boolean {
  const distance = metrics.scrollHeight - (metrics.scrollTop + metrics.clientHeight)
  return distance < thresholdPx
}

/**
 * Evaluates user scroll events against the 50px bottom threshold.
 * Preserves upward wheel/touch intent inside 50px and ignores programmatic scroll growth unless unlocked at bottom.
 */
export function evaluatePcScrollEvent(
  state: PcSmartScrollState,
  metrics: PcScrollMetrics,
  isProgrammatic: boolean,
  thresholdPx = PC_SMART_SCROLL_THRESHOLD_PX,
): PcSmartScrollState {
  const nearBottom = isPcNearBottom(metrics, thresholdPx)
  if (isProgrammatic) {
    return {
      locked: state.locked && !nearBottom,
      prevScrollTop: metrics.scrollTop,
    }
  }
  if (metrics.userPullUpActive) {
    return {
      locked: true,
      prevScrollTop: metrics.scrollTop,
    }
  }
  const scrolledUp = metrics.scrollTop < state.prevScrollTop - 4
  if (scrolledUp && !nearBottom) {
    return {
      locked: true,
      prevScrollTop: metrics.scrollTop,
    }
  }
  if (nearBottom) {
    return {
      locked: false,
      prevScrollTop: metrics.scrollTop,
    }
  }
  return {
    locked: state.locked,
    prevScrollTop: metrics.scrollTop,
  }
}

export function shouldPcAutoScroll(locked: boolean): boolean {
  return !locked
}
