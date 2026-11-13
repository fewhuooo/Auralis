import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { isTauriEnvironment } from '@/api/tauri'

// Global styles
import './styles/index.css'
import 'katex/dist/katex.min.css'
import 'element-plus/theme-chalk/el-icon.css'
import 'element-plus/theme-chalk/dark/css-vars.css' // Element Plus dark mode

async function mountApp(startup?: ReturnType<typeof createApp>): Promise<void> {
  const [{ default: App }, { default: router }] = await Promise.all([
    import('./App.vue'),
    import('./router'),
  ])
  startup?.unmount()

  const app = createApp(App)
  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)
  app.use(pinia)
  app.use(router)
  app.mount('#app')
}

async function start(): Promise<void> {
  if (!isTauriEnvironment()) return mountApp()

  const { default: DesktopDatabaseStartup } = await import('./DesktopDatabaseStartup.vue')
  const startup = createApp(DesktopDatabaseStartup, { onReady: () => mountApp(startup) })
  startup.mount('#app')
}

void start()
