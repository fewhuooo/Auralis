import { isTauriEnvironment, updateWindowTheme } from '@/api/tauri'

const SETTINGS_STORAGE_KEY = 'settings'

export function applyPersistedThemeEarly(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false

  let isDark = false
  try {
    const raw = window.localStorage?.getItem(SETTINGS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { isDark?: unknown } | null
      isDark = parsed?.isDark === true
    }
  } catch {
    isDark = false
  }

  document.documentElement.classList.toggle('dark', isDark)
  if (isTauriEnvironment()) {
    void updateWindowTheme(isDark)
  }
  return isDark
}
