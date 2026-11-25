import { readonly, ref, watch } from 'vue'

export const localeOptions = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
] as const

export type Locale = (typeof localeOptions)[number]['value']
export type Message = Record<Locale, string>

const localeKey = 'auralis.settings.language'
const currentLocale = ref<Locale>(storedLocale())
export const locale = readonly(currentLocale)

watch(currentLocale, (value) => {
  if (typeof document !== 'undefined') document.documentElement.lang = value
}, { immediate: true, flush: 'sync' })

export function setLocale(value: string): void {
  const option = localeOptions.find((entry) => entry.value === value)
  if (!option) return

  currentLocale.value = option.value
  try {
    globalThis.localStorage?.setItem(localeKey, option.label)
  } catch {
    // A restricted WebView can still switch languages for the current session.
  }
}

export function t(message: Message, params: Record<string, string | number> = {}): string {
  return message[locale.value].replace(/\{(\w+)\}/g, (token, key: string) =>
    Object.hasOwn(params, key) ? String(params[key]) : token)
}

function storedLocale(): Locale {
  try {
    const label = globalThis.localStorage?.getItem(localeKey)
    return localeOptions.find((entry) => entry.label === label)?.value ?? 'zh-CN'
  } catch {
    return 'zh-CN'
  }
}
