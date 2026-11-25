import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

const isH5 = !process.env.UNI_PLATFORM || process.env.UNI_PLATFORM === "h5";

function createAppVariantManifestPlugin(customScript: string | undefined): Plugin | null {
  if (customScript !== "app-phone" && customScript !== "app-tablet") return null;
  return {
    name: "auralis-app-variant-manifest",
    closeBundle() {
      const outputDir = process.env.UNI_OUTPUT_DIR;
      if (!outputDir) return;
      const manifestPath = path.resolve(outputDir, "manifest.json");
      if (!fs.existsSync(manifestPath)) return;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
      const plus = (manifest.plus as Record<string, unknown> | undefined) ?? {};
      const distribute = (plus.distribute as Record<string, unknown> | undefined) ?? {};
      const apple = (distribute.apple as Record<string, unknown> | undefined) ?? {};
      if (customScript === "app-phone") {
        manifest.name = "Auralis";
        manifest["@platforms"] = ["android", "iPhone"];
        manifest.screenOrientation = ["portrait-primary"];
        apple.devices = "iphone";
      } else {
        manifest.name = "Auralis HD";
        manifest["@platforms"] = ["android", "iPad"];
        manifest.screenOrientation = [
          "landscape-primary",
          "landscape-secondary",
          "portrait-primary",
          "portrait-secondary",
        ];
        apple.devices = "ipad";
      }
      distribute.apple = apple;
      plus.distribute = distribute;
      manifest.plus = plus;
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    },
  };
}

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

function createAppInlineDynamicImportsPlugin(): Plugin | null {
  if (process.env.UNI_PLATFORM !== "app" || process.env.UNI_COMPILER !== "vue") {
    return null;
  }
  return {
    name: "auralis-app-inline-dynamic-imports",
    configResolved(config) {
      const output = config.build?.rollupOptions?.output;
      if (output && !Array.isArray(output) && output.format === "iife") {
        delete output.manualChunks;
        output.inlineDynamicImports = true;
      }
    },
  };
}

function createTabletViewerRuntimePlugin(): Plugin | null {
  if (
    process.env.UNI_CUSTOM_SCRIPT !== "app-tablet"
    || process.env.UNI_COMPILER !== "vue"
  ) {
    return null;
  }
  let builtOnce = false;
  return {
    name: "auralis-tablet-viewer-runtime",
    async writeBundle() {
      if (builtOnce) return;
      const outputDir = process.env.UNI_OUTPUT_DIR;
      if (!outputDir) return;
      builtOnce = true;
      const scriptPath = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "scripts/build-tablet-viewer-runtime.mjs",
      );
      const scriptUrl = pathToFileURL(scriptPath).href;
      const { buildTabletViewerRuntime } = await import(/* @vite-ignore */ scriptUrl);
      await buildTabletViewerRuntime(outputDir);
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

  const appPlugins: Plugin[] = [];
  const variantManifestPlugin = createAppVariantManifestPlugin(process.env.UNI_CUSTOM_SCRIPT);
  if (variantManifestPlugin) {
    appPlugins.push(variantManifestPlugin);
  }
  const inlineDynamicImportsPlugin = createAppInlineDynamicImportsPlugin();
  if (inlineDynamicImportsPlugin) {
    appPlugins.push(inlineDynamicImportsPlugin);
  }
  const tabletViewerPlugin = createTabletViewerRuntimePlugin();
  if (tabletViewerPlugin) {
    appPlugins.push(tabletViewerPlugin);
  }

  return {
    plugins: [uni(), ...h5Plugins, ...appPlugins],
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
