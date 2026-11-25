import { readonly, ref } from 'vue'

export const [autoSyncEnabled, setAutoSyncEnabled] = desktopPreference('auralis.settings.autoSync', true)
export const [autoOverviewEnabled, setAutoOverviewEnabled] = desktopPreference('auralis.settings.autoOverview', true)

function desktopPreference(key: string, defaultValue: boolean) {
  const value = ref(readPreference(key, defaultValue))

  const setValue = (enabled: boolean): void => {
    value.value = enabled
    try {
      globalThis.localStorage?.setItem(key, String(enabled))
    } catch {
      // The current session still uses the selected preference.
    }
  }

  return [readonly(value), setValue] as const
}

function readPreference(key: string, defaultValue: boolean): boolean {
  try {
    const stored = globalThis.localStorage?.getItem(key)
    if (stored === 'true') return true
    if (stored === 'false') return false
  } catch {
    // Storage can be unavailable during startup.
  }
  return defaultValue
}
