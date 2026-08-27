import type { BackgroundParserHostHandle } from './fileViewerBridge.ts'

let currentHost: BackgroundParserHostHandle | null = null

/**
 * The parser host is mounted once by App.vue and kept outside the route tree
 * so background Office extraction does not depend on the currently visible
 * page. Only the handle is retained; no document or file path is persisted.
 */
export function setBackgroundParserHost(host: BackgroundParserHostHandle | null): void {
  currentHost = host
}

export function getBackgroundParserHost(): BackgroundParserHostHandle | null {
  return currentHost
}
