function fallbackCopyViaTextarea(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) return false
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }
  document.body.removeChild(textarea)
  return copied
}

export async function copyText(text: string): Promise<boolean> {
  if (
    typeof window !== 'undefined'
    && window.isSecureContext
    && typeof navigator !== 'undefined'
    && typeof navigator.clipboard?.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return fallbackCopyViaTextarea(text)
    }
  }
  return fallbackCopyViaTextarea(text)
}
