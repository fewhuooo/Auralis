/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_WS_BASE_URL?: string
  readonly VITE_APP_TARGET?: string
  readonly VITE_ENABLE_TABLET_HANDWRITING_NOTES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __AURALIS_APP_TARGET__: 'phone' | 'tablet' | undefined

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, any>
  export default component
}
