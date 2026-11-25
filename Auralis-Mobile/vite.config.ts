import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

const isH5 = !process.env.UNI_PLATFORM || process.env.UNI_PLATFORM === "h5";

function createPackagedPptFallbackPlugin(): Plugin {
  const virtualId = "\0auralis-packaged-ppt-fallback";
  return {
    name: "auralis-packaged-ppt-fallback",
    enforce: "pre",
    resolveId(id, importer) {
      if (id !== "@file-viewer/ppt" || !importer) return undefined;
      const normalized = importer.replace(/\\/g, "/");
      if (
        normalized.includes("/@file-viewer/renderer-presentation/") ||
        normalized.includes("/@file-viewer+renderer-presentation@")
      ) {
        return virtualId;
      }
      return undefined;
    },
    load(id) {
      if (id === virtualId) {
        return "export async function createPptViewer() { throw new Error('Packaged PPT runtime URL was not initialized.'); }";
      }
      return undefined;
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(async () => {
  const h5Plugins: Plugin[] = [];
  if (isH5) {
    const { fileViewerRenderers } = await import("@file-viewer/vite-plugin");
    h5Plugins.push(
      createPackagedPptFallbackPlugin(),
      fileViewerRenderers({
        renderers: ["pdf", "word", "presentation"],
        autoPresets: false,
        inject: false,
        copyAssets: {
          baseDir: "file-viewer",
          publicDir: "public",
        },
      }),
    );
  }

  return {
    plugins: [uni(), ...h5Plugins],
    ...(isH5
      ? {
          resolve: {
            alias: [
              {
                find: /^jszip$/,
                replacement: fileURLToPath(
                  new URL("./node_modules/jszip/dist/jszip.min.js", import.meta.url),
                ),
              },
            ],
          },
        }
      : {}),
    server: {
      host: "0.0.0.0",
      port: 5174,
      strictPort: false,
      watch: {
        ignored: ["**/public/file-viewer/**"],
      },
    },
  };
});
