import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { fileViewerRenderers } from '@file-viewer/vite-plugin'
import { fileURLToPath, URL } from 'node:url'
import * as vueCompiler from 'vue/compiler-sfc'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devApiTarget = env.VITE_DEV_API_TARGET?.trim()
  const devWebsocketTarget = env.VITE_DEV_WS_TARGET?.trim()

  const proxy: Record<string, { target: string; changeOrigin: boolean; ws?: boolean }> = {}
  if (devApiTarget) proxy['/api'] = { target: devApiTarget, changeOrigin: true }
  if (devWebsocketTarget) proxy['/ws'] = { target: devWebsocketTarget, ws: true, changeOrigin: true }

  return {
  plugins: [
    vue({ compiler: vueCompiler }),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
    fileViewerRenderers({
      copyAssets: true,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  // Tauri expect a fixed port, fail if that port is not available
  server: {
    port: 5173,
    strictPort: false,
    // File Viewer copies a large generated asset tree during dev startup. It
    // is served as static runtime data and must not trigger Vue HMR while the
    // plugin compiler is still being initialized.
    watch: {
      ignored: ['**/public/file-viewer/**'],
    },
    proxy,
  },
  // to access the Tauri environment variables set by the CLI with information about the current target
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target: process.env.TAURI_ENV_PLATFORM == 'windows' ? 'chrome105' : 'safari15',
    // don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  }
})
