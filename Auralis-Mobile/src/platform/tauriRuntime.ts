/** Returns true when executing inside a Tauri 2 WebView host. */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
