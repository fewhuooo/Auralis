import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

const isH5 = !process.env.UNI_PLATFORM || process.env.UNI_PLATFORM === "h5";

type AppVariant = "app-phone" | "app-tablet";

function resolveAppTargetFromEnv(): string | undefined {
  if (process.env.VITE_APP_TARGET) {
    return process.env.VITE_APP_TARGET;
  }
  const rawDefine = process.env.UNI_CUSTOM_DEFINE;
  if (!rawDefine) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(rawDefine) as { VITE_APP_TARGET?: unknown };
    return typeof parsed.VITE_APP_TARGET === "string" ? parsed.VITE_APP_TARGET : undefined;
  } catch {
    return undefined;
  }
}

function resolveAppVariant(): AppVariant | null {
  const customScript = process.env.UNI_CUSTOM_SCRIPT;
  if (customScript === "app-phone" || customScript === "app-tablet") {
    return customScript;
  }
  const platform = process.env.UNI_PLATFORM;
  if (platform !== "app" && platform !== "app-plus") {
    return null;
  }
  const target = resolveAppTargetFromEnv();
  if (target === "phone") return "app-phone";
  if (target === "tablet") return "app-tablet";
  return null;
}

function createAppVariantManifestPlugin(variant: AppVariant | null): Plugin | null {
  if (!variant) return null;
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
      if (variant === "app-phone") {
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
        ];
        apple.devices = "ipad";
      }
      distribute.apple = apple;
      plus.distribute = distribute;
      manifest.plus = plus;
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

      if (variant === "app-tablet") {
        const viewHtmlPath = path.resolve(outputDir, "__uniappview.html");
        if (fs.existsSync(viewHtmlPath)) {
          const html = fs.readFileSync(viewHtmlPath, "utf8");
          const updatedHtml = html.replace(
            "initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0",
            "initial-scale=0.85, maximum-scale=0.85, minimum-scale=0.85",
          );
          if (updatedHtml !== html) {
            fs.writeFileSync(viewHtmlPath, updatedHtml, "utf8");
          }
        }
      }
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

function createAppInlineDynamicImportsPlugin(banner?: string): Plugin | null {
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
        if (banner) {
          const prevBanner = output.banner;
          output.banner = typeof prevBanner === "function"
            ? async (chunk) => `${banner}\n${await prevBanner(chunk)}`
            : prevBanner
              ? `${banner}\n${prevBanner}`
              : banner;
        }
      }
    },
  };
}

function createTabletViewerRuntimePlugin(variant: AppVariant | null): Plugin | null {
  if (
    variant !== "app-tablet"
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
  if (!isH5) {
    const compatScriptPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "scripts/unicode-property-regex-compat.mjs",
    );
    const { createUnicodePropertyRegexCompatPlugin } = await import(
      /* @vite-ignore */ pathToFileURL(compatScriptPath).href
    );
    appPlugins.push(createUnicodePropertyRegexCompatPlugin());
  }
  const appVariant = resolveAppVariant();
  const variantManifestPlugin = createAppVariantManifestPlugin(appVariant);
  if (variantManifestPlugin) {
    appPlugins.push(variantManifestPlugin);
  }
  let appBanner: string | undefined;
  if (process.env.UNI_PLATFORM === "app" && process.env.UNI_COMPILER === "vue") {
    const polyfillPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "scripts/app-text-encoding-polyfill.mjs",
    );
    const { createTextEncodingPolyfillBanner } = await import(
      /* @vite-ignore */ pathToFileURL(polyfillPath).href
    );
    appBanner = createTextEncodingPolyfillBanner();
  }
  const inlineDynamicImportsPlugin = createAppInlineDynamicImportsPlugin(appBanner);
  if (inlineDynamicImportsPlugin) {
    appPlugins.push(inlineDynamicImportsPlugin);
  }
  const tabletViewerPlugin = createTabletViewerRuntimePlugin(appVariant);
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
