<template>
  <Teleport to="body">
    <Transition name="palette">
      <div v-if="isVisible" class="palette-backdrop" @click="close">
        <div class="palette-container" @click.stop>
          <div class="palette-header">
            <IconSearch class="search-icon" :size="20" :stroke-width="2" />
            <input
              ref="searchInput"
              v-model="query"
              class="palette-input"
              :placeholder="t(messages.search)"
              :aria-label="t(messages.search)"
              @keydown.esc="close"
              @keydown="handleKeyNav"
            />
            <button class="close-btn" :aria-label="t(messages.close)" @click="close">ESC</button>
          </div>
          
          <div class="palette-body" v-if="query">
            <div v-if="isSearching" class="search-loading">
              <span class="loading-spinner"></span> {{ t(messages.loading) }}
            </div>
            <template v-else>
              <div class="result-group" v-if="searchResults.length > 0">
                <div class="group-title">{{ t(messages.blocks) }}</div>
                <div
                  v-for="(block, idx) in searchResults"
                  :key="block.id"
                  class="result-item"
                  :class="{ 'is-selected': selectedIndex === idx }"
                  @click="selectResult(block)"
                >
                  <span class="icon">⬡</span>
                  <div class="text">
                    <span class="title">{{ block.title }}</span>
                    <span class="desc">{{ block.subject }} · {{ block.content.slice(0, 50) }}{{ block.content.length > 50 ? '...' : '' }}</span>
                  </div>
                </div>
              </div>
              
              <div v-if="searchResults.length === 0" class="no-result">
                {{ t(messages.noMatches) }}
              </div>
            </template>
          </div>
          
          <div class="palette-footer" v-else>
            <div class="hint-item"><kbd>↑</kbd> <kbd>↓</kbd> {{ t(messages.navigate) }}</div>
            <div class="hint-item"><kbd>Enter</kbd> {{ t(messages.confirm) }}</div>
            <div class="hint-item"><kbd>Esc</kbd> {{ t(messages.cancel) }}</div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { IconSearch } from '@tabler/icons-vue'
import { t } from '@/i18n'
import { useKnowledgeStore } from '@/store/useKnowledgeStore'
import type { KnowledgeBlockModel } from '@/services/domainMappers'

const messages = {
  search: { 'zh-CN': '唤醒个人知识库... (Personal Context)', en: 'Search your knowledge base…', ja: 'ナレッジベースを検索…' },
  close: { 'zh-CN': '关闭搜索', en: 'Close search', ja: '検索を閉じる' },
  loading: { 'zh-CN': '正在为您检索个人知识库...', en: 'Searching your knowledge base…', ja: 'ナレッジベースを検索中…' },
  blocks: { 'zh-CN': '知识块', en: 'Knowledge blocks', ja: '知識ブロック' },
  noMatches: { 'zh-CN': '未匹配到合适的本地知识块', en: 'No matching local knowledge blocks', ja: '一致するローカルの知識ブロックはありません' },
  navigate: { 'zh-CN': '导航', en: 'Navigate', ja: '移動' },
  confirm: { 'zh-CN': '确认', en: 'Confirm', ja: '決定' },
  cancel: { 'zh-CN': '取消', en: 'Cancel', ja: 'キャンセル' },
}

const router = useRouter()
const knowledgeStore = useKnowledgeStore()

const isVisible = ref(false)
const query = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

const searchResults = ref<KnowledgeBlockModel[]>([])
const isSearching = ref(false)
const selectedIndex = ref(-1)

watch([query, isVisible], ([value, visible], _, onCleanup) => {
  selectedIndex.value = -1
  if (!visible || !value.trim()) {
    searchResults.value = []
    isSearching.value = false
    return
  }
  const keyword = value.toLowerCase()
  isSearching.value = true
  let active = true
  const searchTimeout = setTimeout(async () => {
    try {
      const blocks = await knowledgeStore.loadLocalBlocks()
      if (!active) return
      searchResults.value = blocks.filter((block) =>
        block.title.toLowerCase().includes(keyword) ||
        block.subject.toLowerCase().includes(keyword) ||
        block.content.toLowerCase().includes(keyword)
      ).slice(0, 6)
    } catch (e) {
      if (!active) return
      console.error(e)
      searchResults.value = []
    } finally {
      if (active) isSearching.value = false
    }
  }, 300)
  onCleanup(() => {
    active = false
    clearTimeout(searchTimeout)
  })
}, { flush: 'sync' })

const open = () => {
  query.value = ''
  isVisible.value = true
  nextTick(() => {
    searchInput.value?.focus()
  })
}

const close = () => {
  isVisible.value = false
}

const selectResult = (block: KnowledgeBlockModel) => {
  if (!isVisible.value || isSearching.value || !searchResults.value.includes(block)) return
  close()
  void router.push({ path: '/', query: { openBlock: block.id } })
}

const handleKeyNav = (e: KeyboardEvent) => {
  if (e.isComposing || !isVisible.value || isSearching.value) return
  const resultCount = searchResults.value.length
  if (resultCount === 0) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value + 1) % resultCount
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value - 1 + resultCount) % resultCount
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const index = selectedIndex.value < 0 ? 0 : selectedIndex.value
    selectResult(searchResults.value[index])
  }
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
  min-width: 0;
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

.result-item:hover,
.result-item.is-selected {
  background: rgba(163, 177, 155, 0.12);
}

.search-loading, .no-result {
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
}

.search-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.loading-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.1);
  border-radius: 50%;
  border-top-color: var(--text-accent);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
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
  transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.palette-enter-active .palette-container,
.palette-leave-active .palette-container {
  transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s ease;
  will-change: transform, opacity;
}

.palette-enter-from,
.palette-leave-to {
  opacity: 0;
}

.palette-enter-from .palette-container {
  opacity: 0;
  transform: translateY(-12px) scale(0.96);
}

.palette-leave-to .palette-container {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
}
</style>
