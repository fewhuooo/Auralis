import 'katex/dist/katex.min.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router, { APP_TARGET } from './router'

document.documentElement.dataset.appTarget = APP_TARGET

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

void router.isReady().then(() => {
  app.mount('#app')
})
