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

  const proxy: Record<string, { target: string; changeOrigin: boolean; ws?: boolean; headers?: Record<string, string> }> = {}
  if (devApiTarget) {
    proxy['/api'] = {
      target: devApiTarget,
      changeOrigin: true,
      headers: {
        'Accept-Encoding': 'identity', // 告诉代理和后端不进行 Gzip 压缩，防止本地代理为了攒包缓冲 SSE
      },
    }
  }
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
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // File Viewer renderers import the package root. Resolve that edge to
      // JSZip's self-contained browser bundle so Vite never follows the
      // Node/readable-stream branch. This is an alias, not a stream polyfill.
      'jszip$': fileURLToPath(new URL('./node_modules/jszip/dist/jszip.min.js', import.meta.url)),
    }
  },
  optimizeDeps: {
    include: [
      'vue',
      'vue-router',
      'pinia',
      'pinia-plugin-persistedstate',
      'axios',
      'element-plus',
      'element-plus/es',
      'element-plus/es/locale/lang/zh-cn',
      'element-plus/es/locale/lang/en',
      'element-plus/es/locale/lang/ja',
      'element-plus/es/components/base/style/css',
      'element-plus/es/components/button/style/css',
      'element-plus/es/components/config-provider/style/css',
      'element-plus/es/components/date-picker/style/css',
      'element-plus/es/components/form/style/css',
      'element-plus/es/components/form-item/style/css',
      'element-plus/es/components/icon/style/css',
      'element-plus/es/components/input/style/css',
      'element-plus/es/components/message/style/css',
      'element-plus/es/components/message-box/style/css',
      'element-plus/es/components/notification/style/css',
      'element-plus/es/components/option/style/css',
      'element-plus/es/components/overlay/style/css',
      'element-plus/es/components/popover/style/css',
      'element-plus/es/components/popper/style/css',
      'element-plus/es/components/scrollbar/style/css',
      'element-plus/es/components/select/style/css',
      'element-plus/es/components/tooltip/style/css',
      '@tabler/icons-vue',
      '@tauri-apps/api/core',
      '@tauri-apps/plugin-sql',
      '@file-viewer/docx',
      '@file-viewer/vue3',
      '@file-viewer/vue3-full',
      '@xmldom/xmldom',
      'jszip',
      'keynote-archives',
      'occt-import-js',
      'marked',
      'katex',
      'dompurify',
      'pdfjs-dist/legacy/build/pdf.mjs',
    ],
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
