import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { fileViewerRenderers } from '@file-viewer/vite-plugin'

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const mobileRoot = path.resolve(scriptsDir, '..')

function createPackagedPptFallbackPlugin() {
  const virtualId = '\0auralis-packaged-ppt-fallback'
  return {
    name: 'auralis-packaged-ppt-fallback',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id !== '@file-viewer/ppt' || !importer) return undefined
      const normalized = importer.replace(/\\/g, '/')
      if (
        normalized.includes('/@file-viewer/renderer-presentation/')
        || normalized.includes('/@file-viewer+renderer-presentation@')
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

export async function buildTabletViewerRuntime(outputDir) {
  if (!outputDir) {
    throw new Error('UNI_OUTPUT_DIR is required to build tablet viewer runtime')
  }
  const resolvedOutputDir = path.resolve(outputDir)
  const staticDir = path.resolve(resolvedOutputDir, 'static')
  const viewerOutDir = path.resolve(staticDir, 'file-viewer')

  await build({
    configFile: false,
    root: mobileRoot,
    publicDir: false,
    logLevel: 'warn',
    resolve: {
      alias: [
        {
          find: '@',
          replacement: path.resolve(mobileRoot, 'src'),
        },
        {
          find: /^jszip$/,
          replacement: path.resolve(mobileRoot, 'node_modules/jszip/dist/jszip.min.js'),
        },
      ],
    },
    plugins: [
      createPackagedPptFallbackPlugin(),
      fileViewerRenderers({
        renderers: ['pdf', 'word', 'presentation'],
        autoPresets: false,
        inject: false,
        copyAssets: {
          mode: 'build',
          outDir: staticDir,
          baseDir: 'file-viewer',
        },
      }),
      {
        name: 'auralis-viewer-runtime-inline-dynamic-imports',
        configResolved(config) {
          const output = config.build?.rollupOptions?.output
          if (output && !Array.isArray(output)) {
            delete output.manualChunks
            output.inlineDynamicImports = true
          }
        },
      },
    ],
    build: {
      outDir: viewerOutDir,
      emptyOutDir: false,
      minify: 'esbuild',
      sourcemap: false,
      lib: {
        entry: path.resolve(mobileRoot, 'src/viewer-runtime/entry.ts'),
        name: 'AuralisDocViewerRuntime',
        formats: ['iife'],
        fileName: () => 'auralis-viewer-runtime.iife.js',
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
  })
}
