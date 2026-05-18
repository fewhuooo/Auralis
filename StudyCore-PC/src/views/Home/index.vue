<template>
  <div class="home" :class="{ 'is-chatting': activeChatId }">
    <!-- Default Home View -->
    <div v-if="!activeChatId" class="default-view">
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

      <!-- Search input area (Center) -->
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
              <div class="left-actions">
                <button class="icon-btn" @click="historyDrawerVisible = true" title="历史对话">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  历史对话
                </button>
              </div>
              <div class="right-actions">
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
        </div>
      </section>

      <!-- Quick actions -->
      <section class="quick-actions">
        <div
          v-for="action in quickActions"
          :key="action.label"
          class="action-card"
          @click="handleActionClick(action)"
        >
          <span class="action-icon">{{ action.icon }}</span>
          <div class="action-text">
            <span class="action-label">{{ action.label }}</span>
            <span class="action-desc">{{ action.desc }}</span>
          </div>
        </div>
      </section>

      <!-- Recent blocks (Real Knowledge Blocks only) -->
      <section class="recent-section" v-if="realBlocks.length > 0">
        <div class="section-header">
          <h3 class="section-title">最近入库的知识块</h3>
          <button class="section-action" @click="router.push('/profile')">查看全部 →</button>
        </div>
        <div class="blocks-grid">
          <div
            v-for="block in realBlocks.slice(0, 6)"
            :key="block.id"
            class="block-card"
          >
            <div class="block-tag" :style="{ background: block.color || 'var(--border-subtle)' }">{{ block.subject || '知识片' }}</div>
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

    <!-- Chat View -->
    <div v-else class="chat-view">
      <!-- Dedicated Chat Header for Actions (prevents buttons glitching inside the bubble) -->
      <div class="chat-header">
        <div class="header-info">
          <span class="chat-icon">✨</span>
          <h3 class="chat-title">RAG 智能问答助手</h3>
        </div>
        <div class="header-actions">
          <button class="header-action-btn" @click="resetChat" title="开始新对话">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            新对话
          </button>
          <button class="header-action-btn" @click="historyDrawerVisible = true" title="历史记录">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            历史记录
          </button>
        </div>
      </div>

      <div class="chat-container">
        <!-- User Message -->
        <div class="message user-message">
          <div class="message-content">
            {{ currentQueryText }}
          </div>
          <div class="avatar user-avatar">U</div>
        </div>

        <!-- AI Message -->
        <div class="message ai-message">
          <div class="avatar ai-avatar">✨</div>
          <div class="message-content" style="min-width: 0;">
            <div class="markdown-body" style="white-space: pre-wrap; line-height: 1.6; color: var(--text-primary); word-break: break-word; overflow-wrap: anywhere;">
              {{ activeBlock?.preview }}<span v-if="isLoading" class="cursor-blink"></span>
            </div>
          </div>
        </div>
      </div>

      <!-- Search input area (Bottom Fixed) -->
      <section class="inquiry-section chat-input-section">
        <div class="inquiry-box">
          <div class="inquiry-input-wrapper">
            <textarea
              v-model="query"
              class="inquiry-input"
              placeholder="继续追问..."
              rows="2"
              @keydown.ctrl.enter="handleSubmit"
            ></textarea>
            <div class="inquiry-actions">
              <div class="left-actions">
                <button class="icon-btn" @click="historyDrawerVisible = true" title="历史对话">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  历史对话
                </button>
              </div>
              <div class="right-actions">
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
        </div>
      </section>
    </div>

    <!-- History Drawer (Custom built for reliability) -->
    <div class="history-drawer-overlay" v-if="historyDrawerVisible" @click="historyDrawerVisible = false"></div>
    <div class="history-drawer" :class="{ 'is-open': historyDrawerVisible }">
      <div class="drawer-header">
        <h3>历史问答</h3>
        <button class="drawer-close" @click="historyDrawerVisible = false">×</button>
      </div>
      <div class="drawer-body">
        <div v-if="chatHistory.length === 0" class="no-history">暂无对话记录</div>
        <div v-for="chat in chatHistory" :key="chat.id" class="history-item" @click="restoreChat(chat)">
          <div class="history-title">{{ chat.title }}</div>
          <div class="history-meta">
            <span class="history-time">{{ chat.time }}</span>
            <span class="history-preview">{{ chat.preview }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useBlockStore } from '@/store/useBlockStore'
import { storeToRefs } from 'pinia'

const router = useRouter()
const query = ref('')
const currentQueryText = ref('')
const activeChatId = ref<string | null>(null)
const isLoading = ref(false)
const historyDrawerVisible = ref(false)

const blockStore = useBlockStore()
const { recentBlocks } = storeToRefs(blockStore)

// Only show real ingested blocks on home page (filter out AI chats)
const realBlocks = computed(() => {
  return recentBlocks.value.filter(b => b.subject !== 'AI 回答' && b.source !== 'RAG 推理引擎')
})

// Chat history specifically filters AI answers
const chatHistory = computed(() => {
  return recentBlocks.value.filter(b => b.subject === 'AI 回答' || b.source === 'RAG 推理引擎')
})

const activeBlock = computed(() => {
  if (!activeChatId.value) return null
  return recentBlocks.value.find(b => b.id === activeChatId.value)
})

onMounted(() => {
  blockStore.fetchBlocks()
})

const restoreChat = (chat: any) => {
  activeChatId.value = chat.id
  currentQueryText.value = chat.title
  historyDrawerVisible.value = false
}

const resetChat = () => {
  activeChatId.value = null
  currentQueryText.value = ''
  query.value = ''
}

const handleActionClick = (action: any) => {
  if (action.path) {
    router.push(action.path)
  } else if (action.prompt) {
    query.value = action.prompt
  }
}

const handleSubmit = async () => {
  if (!query.value.trim() || isLoading.value) return
  const text = query.value
  currentQueryText.value = text
  query.value = ''
  isLoading.value = true

  // Switch to chat mode
  const tempBlockId = 'b_' + Date.now()
  activeChatId.value = tempBlockId 
  
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
      
      const blockIndex = blockStore.recentBlocks.findIndex(b => b.id === tempBlockId)
      if (blockIndex !== -1) {
        blockStore.recentBlocks[blockIndex].preview = tempBlock.preview
      }
    }
    
    eventSource.onerror = (error) => {
      console.log('SSE closed or errored')
      eventSource.close()
      isLoading.value = false
      tempBlock.time = new Date().toLocaleString()
      blockStore.updateBlock(tempBlock)
    }

    eventSource.addEventListener('complete', () => {
      eventSource.close()
      isLoading.value = false
      tempBlock.time = new Date().toLocaleString()
      blockStore.updateBlock(tempBlock)
    })
  } catch (error) {
    console.error('AI Request failed:', error)
    isLoading.value = false
  }
}

const quickActions = [
  { icon: '🔬', label: '知识问答', desc: '搜索并补全知识库', prompt: '什么是 RAG 检索增强生成技术？' },
  { icon: '📄', label: '导入文档', desc: '粉碎 PPT / PDF 为知识块', path: '/asset' },
  { icon: '🎯', label: '目标拆解', desc: '将大目标拆分为任务块', path: '/timeline' },
  { icon: '📊', label: '学习回顾', desc: '查看本周学习报告', path: '/profile' },
]
</script>

<style scoped>
.home {
  max-width: 860px;
  width: 100%;
  margin: 0 auto;
  padding: 28px 32px;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.home.is-chatting {
  padding-bottom: 120px; 
}

.default-view {
  display: flex;
  flex-direction: column;
}

/* Chat View */
.chat-view {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 16px;
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: 24px;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.chat-icon {
  font-size: 18px;
}

.chat-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.header-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-subtle);
  padding: 6px 12px;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.header-action-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--text-primary);
  border-color: var(--border-default);
}

.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-bottom: 24px;
  min-width: 0;
}

.message {
  display: flex;
  gap: 16px;
  width: 100%;
}

.user-message {
  align-self: flex-end;
  justify-content: flex-end;
  width: 100%;
}

.ai-message {
  align-self: flex-start;
  width: 100%;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.user-avatar {
  background: var(--accent-gradient);
  color: white;
}

.ai-avatar {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-default);
}

.user-message .message-content {
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-default);
  padding: 12px 18px;
  border-radius: 20px 20px 4px 20px;
  font-size: 15px;
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
  max-width: 80%;
  text-align: left;
  word-wrap: break-word;
  word-break: break-word;
}

.ai-message .message-content {
  flex: 1;
  padding: 8px 0;
  max-width: 90%;
  min-width: 0;
}

.cursor-blink {
  display: inline-block;
  width: 8px;
  height: 16px;
  background-color: var(--text-primary);
  animation: blink 1s step-end infinite;
  vertical-align: middle;
  margin-left: 4px;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.message-actions {
  margin-top: 16px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-subtle);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.action-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--text-primary);
}

.chat-input-section {
  position: sticky;
  bottom: 0;
  background: var(--color-bg-primary, #fff);
  padding: 16px 0 24px;
  z-index: 10;
}

@media (max-width: 768px) {
  .home {
    padding: 16px;
  }
  .chat-input-section {
    padding: 12px 0 16px;
  }
  .user-message .message-content {
    max-width: 95%;
  }
  .ai-message .message-content {
    max-width: 100%;
  }
}

/* Original Styles */
.hero { margin-bottom: 32px; }
.hero-greeting { display: block; font-size: 14px; font-weight: 500; color: var(--text-secondary); margin-bottom: 6px; }
.hero-headline { display: block; font-size: 28px; font-weight: 800; background: var(--accent-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; letter-spacing: -0.5px; }
.hero-desc { margin-top: 10px; font-size: 14px; color: var(--text-secondary); line-height: 1.7; }

.inquiry-section { margin-bottom: 28px; }
.inquiry-box { background: var(--color-bg-secondary); border: 1px solid var(--border-default); border-radius: var(--radius-xl); padding: 4px; box-shadow: var(--shadow-sm); transition: all var(--transition-normal); }
.inquiry-box:focus-within { border-color: var(--border-accent); box-shadow: var(--accent-glow); }
.inquiry-input-wrapper { position: relative; }
.inquiry-input { width: 100%; padding: 16px 20px; padding-bottom: 8px; background: transparent; border: none; outline: none; color: var(--text-primary); font-family: inherit; font-size: 14px; line-height: 1.6; resize: none; box-sizing: border-box; }
.inquiry-input::placeholder { color: var(--text-muted); }
.inquiry-actions { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px 12px; }
.inquiry-hint { font-size: 11px; color: var(--text-muted); margin-left: 8px; }

.left-actions { display: flex; align-items: center; gap: 8px; }
.right-actions { display: flex; align-items: center; gap: 12px; }

.icon-btn { display: flex; align-items: center; gap: 4px; background: none; border: none; font-size: 12px; color: var(--text-muted); cursor: pointer; transition: color 0.2s; padding: 4px 8px; border-radius: 6px; }
.icon-btn:hover { color: var(--text-primary); background: var(--color-bg-tertiary); }

.inquiry-submit { width: 36px; height: 36px; border-radius: var(--radius-md); background: var(--accent-gradient); border: none; color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all var(--transition-normal); }
.inquiry-submit:hover:not(:disabled) { transform: scale(1.05); box-shadow: var(--accent-glow); }
.inquiry-submit:disabled { opacity: 0.3; cursor: not-allowed; }

.quick-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 36px; }
.action-card { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: var(--color-bg-secondary); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); cursor: pointer; transition: all var(--transition-normal); }
.action-card:hover { border-color: var(--border-accent); background: var(--color-bg-tertiary); transform: translateY(-2px); box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2); }
.action-icon { font-size: 22px; flex-shrink: 0; }
.action-text { display: flex; flex-direction: column; min-width: 0; }
.action-label { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.action-desc { font-size: 11px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.section-title { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.section-action { background: none; border: none; color: var(--text-accent); font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; transition: opacity var(--transition-fast); }
.section-action:hover { opacity: 0.8; }

.blocks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.block-card { background: var(--color-bg-secondary); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 18px; box-shadow: var(--shadow-sm); cursor: pointer; transition: all var(--transition-normal); }
.block-card:hover { border-color: var(--border-accent); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); }
.block-tag { display: inline-block; font-size: 10px; font-weight: 700; color: var(--text-primary); padding: 3px 8px; border-radius: var(--radius-sm); margin-bottom: 10px; letter-spacing: 0.3px; }
.block-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; line-height: 1.4; }
.block-preview { font-size: 12px; color: var(--text-secondary); line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 12px; }
.block-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); }

.loading-spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: white; animation: spin 1s linear infinite; }

/* History Drawer */
.history-drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); backdrop-filter: blur(2px); z-index: 100; opacity: 1; animation: fade-in 0.2s; }
.history-drawer { position: fixed; top: 0; right: -320px; width: 320px; height: 100vh; background: var(--color-bg-secondary); border-left: 1px solid var(--border-subtle); z-index: 101; display: flex; flex-direction: column; transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: -4px 0 24px rgba(0,0,0,0.1); }
.history-drawer.is-open { transform: translateX(-320px); }
.drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 20px; border-bottom: 1px solid var(--border-subtle); }
.drawer-header h3 { font-size: 16px; font-weight: 700; color: var(--text-primary); margin: 0; }
.drawer-close { background: none; border: none; font-size: 24px; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; transition: background 0.2s; }
.drawer-close:hover { background: var(--color-bg-tertiary); color: var(--text-primary); }
.drawer-body { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.no-history { text-align: center; color: var(--text-muted); font-size: 13px; margin-top: 40px; }
.history-item { padding: 14px; border-radius: var(--radius-lg); background: var(--color-bg-primary); border: 1px solid var(--border-subtle); cursor: pointer; transition: all 0.2s; }
.history-item:hover { border-color: var(--border-accent); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
.history-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.history-meta { display: flex; flex-direction: column; gap: 4px; }
.history-time { font-size: 11px; color: var(--text-muted); }
.history-preview { font-size: 12px; color: var(--text-secondary); display: -webkit-box; -webkit-line-clamp: 1; line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }

@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
</style>
