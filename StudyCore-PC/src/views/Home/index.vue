<template>
  <div class="home">
    <!-- Welcome hero -->
    <section class="hero">
      <div class="hero-content">
        <h1 class="hero-title">
          <span class="hero-greeting">你好，同学 👋</span>
          <span class="hero-headline">今天想探索什么知识？</span>
        </h1>
        <p class="hero-desc">输入任何问题，AI 将搜索你的个人知识库，找不到的知识会自动补全入库。</p>
      </div>
    </section>

    <!-- Search input area -->
    <section class="inquiry-section">
      <div class="inquiry-box">
        <div class="inquiry-input-wrapper">
          <textarea
            v-model="query"
            class="inquiry-input"
            placeholder="例如：解释 JVM 的垃圾回收机制..."
            rows="3"
            @keydown.ctrl.enter="handleSubmit"
          ></textarea>
          <div class="inquiry-actions">
            <span class="inquiry-hint">Ctrl + Enter 发送</span>
            <button class="inquiry-submit" :disabled="!query.trim()" @click="handleSubmit">
              <svg v-if="!isLoading" width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 9H15M15 9L10 4M15 9L10 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span v-else class="loading-spinner"></span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Quick actions -->
    <section class="quick-actions">
      <div
        v-for="action in quickActions"
        :key="action.label"
        class="action-card"
        @click="query = action.prompt"
      >
        <span class="action-icon">{{ action.icon }}</span>
        <div class="action-text">
          <span class="action-label">{{ action.label }}</span>
          <span class="action-desc">{{ action.desc }}</span>
        </div>
      </div>
    </section>

    <!-- Recent blocks -->
    <section class="recent-section">
      <div class="section-header">
        <h3 class="section-title">最近入库的知识块</h3>
        <button class="section-action">查看全部 →</button>
      </div>
      <div class="blocks-grid">
        <div
          v-for="block in recentBlocks"
          :key="block.id"
          class="block-card"
        >
          <div class="block-tag" :style="{ background: block.color }">{{ block.subject }}</div>
          <h4 class="block-title">{{ block.title }}</h4>
          <p class="block-preview">{{ block.preview }}</p>
          <div class="block-meta">
            <span class="block-time">{{ block.time }}</span>
            <span class="block-source">{{ block.source }}</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useBlockStore } from '@/store/useBlockStore'
import { storeToRefs } from 'pinia'

const query = ref('')
const blockStore = useBlockStore()
const { recentBlocks } = storeToRefs(blockStore)

onMounted(() => {
  blockStore.fetchBlocks()
})

import { fragmentPDFToAtomBlocks } from '@/api/aiClient'

const isLoading = ref(false)

const handleSubmit = async () => {
  if (!query.value.trim() || isLoading.value) return
  const text = query.value
  query.value = ''
  isLoading.value = true

  // Create a placeholder block for the stream
  const tempBlockId = 'b_' + Date.now()
  const tempBlock = {
    id: tempBlockId,
    subject: 'AI 回答',
    title: text,
    preview: '',
    time: '正在生成...',
    source: 'RAG 推理引擎',
    color: 'rgba(16, 185, 129, 0.2)'
  }
  blockStore.addBlock(tempBlock)

  try {
    const eventSource = new EventSource(`http://localhost:8080/api/ai/chat?message=${encodeURIComponent(text)}`)
    
    eventSource.onmessage = (event) => {
      const chunk = event.data
      tempBlock.preview += chunk
      
      // Force reactivity
      const blockIndex = blockStore.blocks.findIndex(b => b.id === tempBlockId)
      if (blockIndex !== -1) {
        blockStore.blocks[blockIndex].preview = tempBlock.preview
      }
    }
    
    eventSource.onerror = (error) => {
      console.log('SSE closed or errored')
      eventSource.close()
      isLoading.value = false
      tempBlock.time = '刚刚'
    }

    eventSource.addEventListener('complete', () => {
      eventSource.close()
      isLoading.value = false
      tempBlock.time = '刚刚'
    })
  } catch (error) {
    console.error('AI Request failed:', error)
    isLoading.value = false
  }
}

const quickActions = [
  { icon: '🔬', label: '知识问答', desc: '搜索并补全知识库', prompt: '' },
  { icon: '📄', label: '导入文档', desc: '粉碎 PPT / PDF 为知识块', prompt: '' },
  { icon: '🎯', label: '目标拆解', desc: '将大目标拆分为任务块', prompt: '' },
  { icon: '📊', label: '学习回顾', desc: '查看本周学习报告', prompt: '' },
]
</script>

<style scoped>
.home {
  max-width: 860px;
  margin: 0 auto;
  padding: 28px 32px;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

/* Hero */
.hero {
  margin-bottom: 32px;
}

.hero-greeting {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.hero-headline {
  display: block;
  font-size: 28px;
  font-weight: 800;
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.5px;
}

.hero-desc {
  margin-top: 10px;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.7;
}

/* Inquiry box */
.inquiry-section {
  margin-bottom: 28px;
}

.inquiry-box {
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: 4px;
  box-shadow: var(--shadow-sm);
  transition: all var(--transition-normal);
}

.inquiry-box:focus-within {
  border-color: var(--border-accent);
  box-shadow: var(--accent-glow);
}

.inquiry-input-wrapper {
  position: relative;
}

.inquiry-input {
  width: 100%;
  padding: 16px 20px;
  padding-bottom: 8px;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  resize: none;
}

.inquiry-input::placeholder {
  color: var(--text-muted);
}

.inquiry-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px 12px;
}

.inquiry-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.inquiry-submit {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: var(--accent-gradient);
  border: none;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--transition-normal);
}

.inquiry-submit:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: var(--accent-glow);
}

.inquiry-submit:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Quick actions */
.quick-actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 36px;
}

.action-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: all var(--transition-normal);
}

.action-card:hover {
  border-color: var(--border-accent);
  background: var(--color-bg-tertiary);
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.action-icon {
  font-size: 22px;
  flex-shrink: 0;
}

.action-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.action-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.action-desc {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Section header */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.section-action {
  background: none;
  border: none;
  color: var(--text-accent);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: opacity var(--transition-fast);
}

.section-action:hover {
  opacity: 0.8;
}

/* Block cards */
.blocks-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

.block-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 18px;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: all var(--transition-normal);
}

.block-card:hover {
  border-color: var(--border-accent);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.block-tag {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-primary);
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  margin-bottom: 10px;
  letter-spacing: 0.3px;
}

.block-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
  line-height: 1.4;
}

.block-preview {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 12px;
}

.block-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted);
}

.loading-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
