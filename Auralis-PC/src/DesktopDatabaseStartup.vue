<template>
  <main class="database-startup">
    <div class="database-startup__content">
      <template v-if="failed">
        <div role="alert">
          <h1>无法打开本地数据库</h1>
          <p>应用将在本地数据库就绪后启动。</p>
        </div>
        <button type="button" @click="failed && initialize()">重试</button>
      </template>
      <p v-else role="status">正在启动 Auralis…</p>
    </div>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

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

<style scoped>
.database-startup {
  display: grid;
  min-height: 100dvh;
  place-items: center;
  padding: var(--spacing-6);
  background: var(--color-bg-primary);
  color: var(--text-primary);
}

.database-startup__content {
  width: min(100%, 25rem);
}

h1 {
  margin: 0 0 var(--spacing-2);
  font-size: var(--font-size-title);
}

p {
  margin: 0;
  color: var(--text-secondary);
}

button {
  margin-top: var(--spacing-5);
  padding: var(--spacing-2) var(--spacing-5);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
}

button:focus-visible {
  outline: 2px solid var(--text-primary);
  outline-offset: 2px;
}
</style>
