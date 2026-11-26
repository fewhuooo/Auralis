import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv, type Plugin, type PluginOption, type UserConfig } from 'vite'

function createPackagedPptFallbackPlugin(): Plugin {
  const virtualId = '\0auralis-packaged-ppt-fallback'
  return {
    name: 'auralis-packaged-ppt-fallback',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id !== '@file-viewer/ppt' || !importer) return undefined
      const normalized = importer.replace(/\\/g, '/')
      if (
        normalized.includes('/@file-viewer/renderer-presentation/') ||
        normalized.includes('/@file-viewer+renderer-presentation@')
      ) {
        return virtualId
      }
      return undefined
    },
    load(id) {
      if (id === virtualId) {
        return "export async function createPptViewer() { throw new Error('Packaged PPT runtime URL was not initialized.'); }"
      }
      return undefined
    },
  }
}

export default defineConfig(async ({ mode }): Promise<UserConfig> => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawTarget = (process.env.VITE_APP_TARGET || env.VITE_APP_TARGET || 'phone').trim().toLowerCase()
  const target = rawTarget === 'tablet' ? 'tablet' : 'phone'
  const isTablet = target === 'tablet'

  const tabletPlugins: PluginOption[] = []
  if (isTablet) {
    const { fileViewerRenderers } = await import('@file-viewer/vite-plugin')
    tabletPlugins.push(
      createPackagedPptFallbackPlugin(),
      fileViewerRenderers({
        renderers: ['pdf', 'word', 'presentation'],
        autoPresets: false,
        inject: false,
        copyAssets: {
          baseDir: 'file-viewer',
          publicDir: 'public-tablet',
        },
      }),
    )
  }

  return {
    plugins: [vue(), ...tabletPlugins],
    publicDir: isTablet ? 'public-tablet' : false,
    define: {
      __AURALIS_APP_TARGET__: JSON.stringify(target),
    },
    resolve: {
      alias: [
        {
          find: '@/router/activeRoutes',
          replacement: fileURLToPath(
            new URL(isTablet ? './src/router/tablet.ts' : './src/router/phone.ts', import.meta.url),
          ),
        },
        {
          find: '@',
          replacement: fileURLToPath(new URL('./src', import.meta.url)),
        },
        ...(isTablet
          ? [
              {
                find: /^jszip$/,
                replacement: fileURLToPath(
                  new URL('./node_modules/jszip/dist/jszip.min.js', import.meta.url),
                ),
              },
            ]
          : []),
      ],
    },
    envPrefix: ['VITE_', 'TAURI_ENV_*'],
    build: {
      outDir: isTablet ? 'dist-tablet' : 'dist-phone',
      emptyOutDir: true,
      target: 'es2022',
      minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
      sourcemap: !!process.env.TAURI_ENV_DEBUG,
    },
    server: {
      host: '0.0.0.0',
      port: 1420,
      strictPort: false,
      watch: {
        ignored: ['**/public-tablet/file-viewer/**'],
      },
    },
  }
})
