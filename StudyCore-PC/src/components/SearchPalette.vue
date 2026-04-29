<template>
  <Teleport to="body">
    <Transition name="palette">
      <div v-if="isVisible" class="palette-backdrop" @click="close">
        <div class="palette-container" @click.stop>
          <div class="palette-header">
            <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              ref="searchInput"
              v-model="query"
              class="palette-input"
              placeholder="唤醒个人知识库... (Personal Context)"
              @keydown.esc="close"
            />
            <button class="close-btn" @click="close">ESC</button>
          </div>
          
          <div class="palette-body" v-if="query">
            <!-- Simulated Results -->
            <div class="result-group">
              <div class="group-title">知识块</div>
              <div class="result-item">
                <span class="icon">⬡</span>
                <div class="text">
                  <span class="title">进程与线程的区别</span>
                  <span class="desc">操作系统 · 包含 "{{ query }}" 相关的概念</span>
                </div>
              </div>
              <div class="result-item">
                <span class="icon">⬡</span>
                <div class="text">
                  <span class="title">JVM 垃圾回收机制</span>
                  <span class="desc">Java基础 · 曾在这个笔记中提到过</span>
                </div>
              </div>
            </div>
            <div class="result-group">
              <div class="group-title">快捷操作</div>
              <div class="result-item">
                <span class="icon">✨</span>
                <div class="text">
                  <span class="title">让 AI 解答 "{{ query }}"</span>
                  <span class="desc">在知识库中未找到，调用大模型分析并入库</span>
                </div>
              </div>
            </div>
          </div>
          
          <div class="palette-footer" v-else>
            <div class="hint-item"><kbd>↑</kbd> <kbd>↓</kbd> 导航</div>
            <div class="hint-item"><kbd>Enter</kbd> 确认</div>
            <div class="hint-item"><kbd>Esc</kbd> 取消</div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'

const isVisible = ref(false)
const query = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

const open = () => {
  isVisible.value = true
  query.value = ''
  nextTick(() => {
    searchInput.value?.focus()
  })
}

const close = () => {
  isVisible.value = false
}

const handleKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    if (isVisible.value) {
      close()
    } else {
      open()
    }
  }
}

const openEvent = () => {
  open()
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('open-search-palette', openEvent)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('open-search-palette', openEvent)
})
</script>

<style scoped>
.palette-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: var(--z-index-modal);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
}

.palette-container {
  width: 100%;
  max-width: 640px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl), 0 0 40px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.palette-header {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
  gap: 16px;
}

.search-icon {
  color: var(--text-accent);
}

.palette-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 18px;
  color: var(--text-primary);
  font-family: inherit;
}

.palette-input::placeholder {
  color: var(--text-muted);
}

.close-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.palette-body {
  max-height: 400px;
  overflow-y: auto;
  padding: 12px 0;
}

.result-group {
  margin-bottom: 8px;
}

.group-title {
  padding: 8px 20px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.result-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.result-item .icon {
  font-size: 18px;
  color: var(--text-secondary);
  width: 24px;
  text-align: center;
}

.result-item .text {
  display: flex;
  flex-direction: column;
}

.result-item .title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.result-item .desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.palette-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.02);
  border-top: 1px solid var(--border-subtle);
}

.hint-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-muted);
}

.hint-item kbd {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  padding: 2px 6px;
  font-family: inherit;
}

/* Animations */
.palette-enter-active,
.palette-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.palette-enter-from,
.palette-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.98);
}
</style>
