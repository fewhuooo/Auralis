export interface RuntimeConfig {
  apiBaseUrl: string;
  websocketBaseUrl: string;
  devApiTarget?: string;
  devWebsocketTarget?: string;
  isTauri: boolean;
}

type RuntimeEnv = Record<string, string | undefined>;

function trimBaseUrl(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/$/, '');
}

function isTauriEnvironment(env: RuntimeEnv): boolean {
  return env.TAURI_ENV === '1' || env.VITE_RUNTIME === 'tauri';
}

export function getRuntimeConfig(env: RuntimeEnv): RuntimeConfig {
  const isTauri = isTauriEnvironment(env);
  const apiBaseUrl = trimBaseUrl(env.VITE_API_BASE_URL);
  const websocketBaseUrl = trimBaseUrl(env.VITE_WS_BASE_URL);

  if (isTauri && (!apiBaseUrl || !websocketBaseUrl)) {
    throw new Error('Tauri runtime requires VITE_API_BASE_URL and VITE_WS_BASE_URL');
  }

  return {
    apiBaseUrl,
    websocketBaseUrl,
    devApiTarget: trimBaseUrl(env.VITE_DEV_API_TARGET) || undefined,
    devWebsocketTarget: trimBaseUrl(env.VITE_DEV_WS_TARGET) || undefined,
    isTauri,
  };
}

export function getClientRuntimeConfig(): RuntimeConfig {
  const env = (import.meta.env ?? {}) as RuntimeEnv;
  const tauriGlobal = (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  return getRuntimeConfig({ ...env, TAURI_ENV: tauriGlobal ? '1' : env.TAURI_ENV });
}

export function resolveWebsocketUrl(relativeOrAbsolute: string, config: RuntimeConfig): string {
  if (/^wss?:\/\//i.test(relativeOrAbsolute)) return relativeOrAbsolute;

  const base = config.websocketBaseUrl || (typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
    : '');
  if (!base) throw new Error('Cannot resolve a relative WebSocket URL without a base URL');

  return new URL(relativeOrAbsolute, `${base}/`).toString();
}
