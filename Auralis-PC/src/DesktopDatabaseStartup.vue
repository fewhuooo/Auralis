<template>
  <StartupSplashScreen
    stage="database"
    :failed="failed"
    :error-title="t(messages.failed)"
    :error-message="t(messages.waiting)"
    :retry-label="t(messages.retry)"
    @retry="failed && initialize()"
  />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { t } from '@/i18n'
import StartupSplashScreen from '@/components/StartupSplashScreen.vue'

const messages = {
  retry: { 'zh-CN': '重试', en: 'Retry', ja: '再試行' },
  waiting: { 'zh-CN': '应用将在本地数据库就绪后启动。', en: 'The app will start when the local database is ready.', ja: 'ローカルデータベースの準備ができ次第、アプリが起動します。' },
  failed: { 'zh-CN': '无法打开本地数据库', en: 'Unable to open the local database', ja: 'ローカルデータベースを開けません' },
}

const emit = defineEmits<{ ready: [] }>()
const failed = ref(false)

async function initialize(): Promise<void> {
  failed.value = false
  try {
    const { localDb } = await import('@/services/localDb')
    await localDb.init()
  } catch (error) {
    console.error('[SQLite PC] Local database startup failed', error)
    failed.value = true
    return
  }
  emit('ready')
}

onMounted(initialize)
</script>
