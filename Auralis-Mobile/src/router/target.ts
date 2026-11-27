export type AppTarget = 'phone' | 'tablet'

/** Resolves the compile-time application target ('phone' or 'tablet'). */
export function getAppTarget(): AppTarget {
  const compileTarget = typeof __AURALIS_APP_TARGET__ !== 'undefined'
    ? __AURALIS_APP_TARGET__
    : (typeof import.meta !== 'undefined'
        ? (import.meta as { env?: { VITE_APP_TARGET?: string } }).env?.VITE_APP_TARGET
        : undefined)
  return compileTarget === 'tablet' ? 'tablet' : 'phone'
}

export function getDefaultHomeRoute(target: AppTarget = getAppTarget()): string {
  return target === 'tablet' ? '/pages/tablet/dashboard/index' : '/pages/mobile/home/index'
}

export function getDefaultLoginRoute(target: AppTarget = getAppTarget()): string {
  return target === 'tablet' ? '/pages/tablet/login/index' : '/pages/mobile/login/index'
}
