export function navigateTo(url: string): void {
  uni.navigateTo({ url })
}

export function redirectTo(url: string, options?: { complete?: () => void }): void {
  uni.redirectTo({
    url,
    ...(options?.complete ? { complete: options.complete } : {}),
  })
}

export function reLaunch(url: string): void {
  uni.reLaunch({ url })
}

export function navigateBack(): void {
  uni.navigateBack()
}

export function getCurrentRoutePath(): string {
  try {
    const pages = getCurrentPages()
    if (!pages.length) return ''
    const raw = pages[pages.length - 1]?.route || ''
    if (!raw) return ''
    return raw.startsWith('/') ? raw : `/${raw}`
  } catch {
    return ''
  }
}

export function canNavigateBack(): boolean {
  try {
    return getCurrentPages().length > 1
  } catch {
    return false
  }
}
