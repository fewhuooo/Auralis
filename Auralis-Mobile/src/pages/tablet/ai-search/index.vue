<template>
  <TabletLayout>
    <view class="ai-chat-layout">
      
      <!-- ===== Left: History Sidebar Card ===== -->
      <view class="history-sidebar-card">
        <!-- Top: New Chat Button (Moved to sidebar as requested) -->
        <view class="sidebar-header">
          <view class="new-chat-btn" @click="startNewChat">
            <LineIcon name="plus" size="32rpx" color="#FFFFFF" />
            <text class="new-chat-text">开启新对话</text>
          </view>
        </view>

        <!-- Middle: History Sessions List -->
        <view class="history-list-wrap">
          <text class="history-label">历史会话</text>
          <scroll-view scroll-y class="history-scroll">
            <view
              v-for="item in historySessions"
              :key="item.id"
              class="history-item"
              :class="{ active: currentSessionId === item.id }"
              @click="switchSession(item)"
            >
              <view class="history-icon">💬</view>
              <view class="history-info">
                <text class="history-title">{{ item.title }}</text>
                <text class="history-time">{{ item.time }}</text>
              </view>
              <view class="history-del" @click.stop="deleteSession(item.id)" title="删除会话">
                <LineIcon name="close" size="24rpx" color="var(--color-zen-stone, #A8A8A5)" />
              </view>
            </view>
          </scroll-view>
        </view>
      </view>

      <!-- ===== Right: Main AI Chat Card (Responsive Full Screen Adapted) ===== -->
      <view class="ai-chat-main-card">
        <!-- ===== Custom Header ===== -->
        <view class="custom-header">
          <view class="header-content">
            <!-- Left: Model Selector -->
            <view class="header-left">
              <view class="model-name-btn" @click.stop="isModelMenuOpen = !isModelMenuOpen">
                <text class="model-icon-top">{{ currentModelObj.icon }}</text>
                <text class="model-text">{{ currentModelObj.label }}</text>
                <svg class="chevron-icon" :class="{ 'is-rotated': isModelMenuOpen }"
                  width="10" height="7" viewBox="0 0 10 7" fill="none">
                  <path d="M1 1L5 5.5L9 1" stroke="var(--text-muted)" stroke-width="1.8"
                    stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </view>

              <!-- Small dropdown -->
              <view class="model-mini-dropdown" :class="{ 'is-open': isModelMenuOpen }">
                <view v-for="m in modelOptions" :key="m.id"
                  class="mini-menu-item" @click.stop="selectModel(m.label)">
                  <text class="mini-menu-icon">{{ m.icon }}</text>
                  <view class="mini-menu-text">
                    <text class="mini-menu-label" :class="{ 'is-active': currentModel === m.label }">{{ m.label }}</text>
                    <text class="mini-menu-desc">{{ m.desc }}</text>
                  </view>
                  <view v-if="currentModel === m.label" class="mini-check">✓</view>
                </view>
              </view>
            </view>

            <!-- Right: Status Badge -->
            <view class="header-right-badge">
              <span class="status-dot"></span>
              <text class="status-text">Auralis AI 智联引擎</text>
            </view>
          </view>
        </view>

        <!-- Dropdown Mask -->
        <view class="dropdown-mask" v-if="isModelMenuOpen" @click="isModelMenuOpen = false" />

        <!-- ===== Content Area (Responsive Full Screen Adapted) ===== -->
        <scroll-view
          :scroll-y="messages.length > 0"
          class="chat-content"
          :scroll-into-view="bottomId"
          :style="{ paddingBottom: scrollPaddingBottom + 'px' }"
        >
          <view class="content-container">
            <!-- ===== Welcome / Empty State ===== -->
            <view class="welcome-section" v-if="messages.length === 0">
              <!-- AI Spark Icon -->
              <view class="spark-icon-wrap">
                <view class="spark-ring" />
                <svg class="spark-svg" width="64" height="64" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="url(#sparkGrad)" />
                  <defs>
                    <linearGradient id="sparkGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                      <stop stop-color="#A2B396" />
                      <stop offset="1" stop-color="#6A805E" />
                    </linearGradient>
                  </defs>
                </svg>
              </view>

              <!-- Greeting -->
              <view class="greeting-main">{{ currentModelObj.welcomeDesc }}</view>
              <view class="greeting-sub">你好，{{ username }}！请选择左侧历史会话或直接提问</view>

              <!-- Minimalist Prompt Chips -->
              <view class="minimal-chips-wrap">
                <text class="chips-label">试试问我</text>
                <view class="chips-list">
                  <view v-for="(chip, idx) in presetPrompts" :key="idx"
                    class="minimal-chip" @click="query = chip; handleSearch()">
                    <text class="chip-text">{{ chip }}</text>
                  </view>
                </view>
              </view>
            </view>

            <!-- ===== Chat Stream ===== -->
            <view class="chat-stream" v-else>
              <view v-for="(msg, index) in messages" :key="index"
                class="chat-bubble" :class="msg.role">

                <!-- Assistant Avatar -->
                <view class="assistant-avatar" v-if="msg.role === 'assistant'">
                  <text style="font-size: 32rpx; color: var(--text-accent, #7D9372);">◈</text>
                </view>

                <!-- Bubble Body -->
                <view class="bubble-body">
                  <view class="bubble-content"
                    v-if="msg.role === 'assistant'"
                    v-html="formatMarkdown(msg.content)" />
                  <view class="bubble-content"
                    v-else>
                    <text>{{ msg.content }}</text>
                  </view>

                  <!-- Actions under assistant msg -->
                  <view class="bubble-actions" v-if="msg.role === 'assistant' && msg.content">
                    <view class="action-btn icon-only" @click="copyText(msg.content)" title="复制">
                      <LineIcon name="copy" size="26rpx" color="var(--text-muted)" />
                    </view>
                    <view class="action-btn text-btn" @click="extractToBlock(msg.content)">
                      <text>+ 提炼为知识块</text>
                    </view>
                  </view>
                </view>
              </view>

              <!-- Typing indicator -->
              <view class="typing-indicator" v-if="isAiTyping">
                <view class="assistant-avatar small">
                  <text style="font-size: 26rpx; color: var(--text-accent, #7D9372);">◈</text>
                </view>
                <view class="typing-dots">
                  <view class="dot" />
                  <view class="dot" />
                  <view class="dot" />
                </view>
              </view>

              <view id="bottom-anchor" class="bottom-anchor" />
            </view>
          </view>
        </scroll-view>

        <!-- ===== Action Sheet Overlay (Attachment Menu) ===== -->
        <view class="action-overlay" v-if="isActionOpen" @click="closeActionPanel" />
        <view class="action-panel" :class="{ 'is-open': isActionOpen }">
          <view class="action-panel-row" @click="onActionTap(0)">
            <view class="action-panel-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="12" cy="13" r="4" stroke="#7D9372" stroke-width="2"/>
              </svg>
            </view>
            <text class="action-panel-label">拍照 / 扫描题目或笔记</text>
          </view>
          <view class="action-panel-divider" />
          <view class="action-panel-row" @click="onActionTap(1)">
            <view class="action-panel-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="var(--text-muted)" stroke-width="2"/>
                <circle cx="8.5" cy="8.5" r="1.5" fill="#7D9372"/>
                <path d="M21 15l-5-5L5 21" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </view>
            <text class="action-panel-label">选择本地图库照片</text>
          </view>
          <view class="action-panel-divider" />
          <view class="action-panel-row" @click="onActionTap(2)">
            <view class="action-panel-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M4 6h16M4 12h10M4 18h7" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round"/>
                <circle cx="19" cy="18" r="3" stroke="#7D9372" stroke-width="2"/>
                <path d="M19 16v2l1 1" stroke="#7D9372" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </view>
            <text class="action-panel-label">从现有知识块导入</text>
          </view>
        </view>

        <!-- ===== Bottom Capsule Input (Responsive Full Screen Adapted) ===== -->
        <view
          class="ai-capsule-wrapper"
          :class="{ 'action-open': isActionOpen }"
          :style="{ bottom: capsuleBottom + 'px' }"
        >
          <view class="ai-capsule" :class="{ 'is-focused': isInputFocused }">
            <!-- Plus btn -->
            <view class="capsule-left" @click="openActionSheet">
              <view class="plus-icon-wrap" :class="{ 'is-rotated': isActionOpen }">
                <LineIcon name="plus" size="50rpx" color="var(--text-muted)" />
              </view>
            </view>

            <input
              class="ai-capsule-input"
              v-model="query"
              placeholder="问问 Auralis AI... (支持 Markdown 与公式)"
              placeholder-style="color: #c4bdb6; font-size: 32rpx;"
              :focus="isInputFocused"
              :adjust-position="false"
              @focus="onInputFocus"
              @blur="onInputBlur"
              @confirm="handleSearch"
              :cursor-spacing="20"
            />

            <!-- Divider -->
            <view class="capsule-divider" v-if="query.trim().length === 0" />

            <!-- Mic / Send -->
            <view class="capsule-right">
              <view v-if="query.trim().length === 0" class="mic-btn" @click="startVoice">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect x="9" y="2" width="6" height="11" rx="3" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round"/>
                  <path d="M19 10v2a7 7 0 01-14 0v-2" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round"/>
                  <path d="M12 19v3M9 22h6" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </view>
              <view v-else class="send-btn" @click="handleSearch">
                <LineIcon name="arrow-up" size="40rpx" color="#ffffff" />
              </view>
            </view>
          </view>
        </view>
      </view>

    </view>
  </TabletLayout>
</template>

<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { useBlockStore } from '@/store/useBlockStore'
import { chatWithAI } from '@/api/aiClient'
import { aiApi, type ConversationView } from '@/api/aiApi'
import { uuidv7 } from '@/utils/uuid'
import LineIcon from '@/components/LineIcon.vue'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import { useAuthStore } from '@/store/useAuthStore'

const authStore = useAuthStore()
const username = computed(() => authStore.username || '同学')
const blockStore = useBlockStore()
const { recentBlocks } = storeToRefs(blockStore)

interface HistorySession {
  id: string
  title: string
  time: string
  version: number
  messages: { role: 'user' | 'assistant', content: string }[]
}

const historySessions = ref<HistorySession[]>([])

const formatConversationTime = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const toHistorySession = (conversation: ConversationView): HistorySession | null => {
  if (!conversation.id) return null
  return {
    id: conversation.id,
    title: conversation.title || '未命名对话',
    time: formatConversationTime(conversation.updatedAt || conversation.createdAt),
    messages: (conversation.messages || []).flatMap((message) => {
      const role = message.role === 'USER' ? 'user' : message.role === 'ASSISTANT' ? 'assistant' : null
      return role && message.content ? [{ role, content: message.content }] : []
    }),
    version: Number(conversation.version || 0),
  }
}

const loadHistory = async () => {
  try {
    const conversations = await aiApi.listConversations()
    historySessions.value = conversations
      .map(toHistorySession)
      .filter((session): session is HistorySession => Boolean(session))
      .sort((a, b) => b.time.localeCompare(a.time))
  } catch (error) {
    console.error('[TabletAI] Failed to load conversation history:', error)
    uni.showToast({ title: '会话历史加载失败', icon: 'none' })
  }
}

const currentSessionId = ref<string>('')
const query = ref('')
const messages = ref<{role: 'user' | 'assistant', content: string}[]>([])
const isAiTyping = ref(false)
const bottomId = ref('')
const isInputFocused = ref(false)
const isModelMenuOpen = ref(false)
const isActionOpen = ref(false)
const keyboardHeight = ref(0)
const capsuleBottom = computed(() => keyboardHeight.value + 20)
const scrollPaddingBottom = computed(() => keyboardHeight.value + 160)

const currentModel = ref('通用模式')
const modelOptions = [
  { id: 1, icon: '✦', label: '学霸模式', desc: '深度推演与严谨解析', welcomeDesc: '深度严谨，逻辑清晰' },
  { id: 2, icon: '◈', label: '通用模式', desc: '全能助手与问答探索', welcomeDesc: '今天想探索点什么？' },
  { id: 3, icon: '✧', label: '翻译模式', desc: '学术润色与精准翻译', welcomeDesc: '精准翻译，流畅润色' },
]

const currentModelObj = computed(() => modelOptions.find(m => m.label === currentModel.value) || modelOptions[1])
const presetPrompts = [
  '帮我总结今天上的《线性代数》矩阵乘法核心要点',
  '解释一下什么是 Transformer 架构中的自注意力机制',
  '写一段 Python 代码实现快速排序算法，并加详细注释',
  '如何用 Feynman 学习法高效复习期末考试？'
]

onLoad(() => {
  void loadHistory()
  uni.onKeyboardHeightChange((res) => {
    keyboardHeight.value = res.height
    if (res.height > 0) isActionOpen.value = false
  })
})

const selectModel = (label: string) => {
  currentModel.value = label
  isModelMenuOpen.value = false
  uni.showToast({ title: `已切换至：${label}`, icon: 'none' })
}

const switchSession = (session: HistorySession) => {
  currentSessionId.value = session.id
  messages.value = [...session.messages]
  scrollToBottom()
  uni.showToast({ title: `已进入：${session.title.slice(0, 8)}...`, icon: 'none' })
}

const startNewChat = () => {
  if (messages.value.length === 0 && !currentSessionId.value) return
  messages.value = []
  query.value = ''
  currentSessionId.value = ''
  isActionOpen.value = false
  uni.showToast({ title: '已开启新对话', icon: 'none' })
}

const deleteSession = (id: string) => {
  uni.showModal({
    title: '删除会话',
    content: '确定要删除该历史会话记录吗？',
    confirmColor: '#E65353',
    success: async (res) => {
      if (res.confirm) {
        const session = historySessions.value.find(item => item.id === id)
        try {
          await aiApi.deleteConversation(id, session?.version || 0)
          historySessions.value = historySessions.value.filter(s => s.id !== id)
          if (currentSessionId.value === id) {
            startNewChat()
          }
          uni.showToast({ title: '已删除', icon: 'success' })
        } catch (error) {
          console.error('[TabletAI] Failed to delete conversation:', error)
          uni.showToast({ title: '会话删除失败', icon: 'none' })
        }
      }
    }
  })
}

const onInputFocus = () => { isInputFocused.value = true; isActionOpen.value = false }
const onInputBlur = () => { isInputFocused.value = false }
const openActionSheet = () => { if (isActionOpen.value) { isActionOpen.value = false; return }; uni.hideKeyboard(); isActionOpen.value = true }
const closeActionPanel = () => { isActionOpen.value = false }

const onActionTap = (index: number) => {
  isActionOpen.value = false
  if (index === 0) scanPhoto()
  else if (index === 1) {
    uni.chooseImage({
      count: 1,
      success: (res) => {
        void res
        uni.showToast({ title: '图片解析需先接入资料上传链路', icon: 'none' })
      }
    })
  } else if (index === 2) {
    if (!recentBlocks.value.length) { uni.showToast({ title: '暂无知识块', icon: 'none' }); return }
    const block = recentBlocks.value[0]
    query.value = `关于知识块【${block.title}】，请深入解释。`
    void handleSearch()
  }
}

const formatMarkdown = (text: string) => {
  if (!text) return ''
  return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>')
}

const copyText = (content: string) => {
  uni.setClipboardData({ data: content, success: () => uni.showToast({ title: '已复制', icon: 'success' }) })
}

const extractToBlock = (content: string) => {
  blockStore.addBlock({ subject: 'AI 问答', title: 'AI 笔记', preview: content.slice(0, 50), source: 'Auralis AI', color: '#7D9372', id: uuidv7() })
  uni.showToast({ title: '已保存至知识库', icon: 'success' })
}

const scanPhoto = () => uni.showToast({ title: '相机调起中...', icon: 'none' })
const startVoice = () => uni.showToast({ title: '正在录制...', icon: 'none' })

const scrollToBottom = () => {
  nextTick(() => {
    bottomId.value = 'bottom-anchor'
    setTimeout(() => { bottomId.value = '' }, 100)
  })
}

const handleSearch = async () => {
  if (!query.value.trim()) return
  const text = query.value.trim()
  if (!currentSessionId.value) {
    try {
      const conversation = await aiApi.createConversation({
        title: text.slice(0, 60),
        baseVersion: 0,
        clientRequestId: uuidv7(),
      })
      if (!conversation.id) throw new Error('Conversation response is incomplete')
      currentSessionId.value = conversation.id
    } catch (error) {
      console.error('[TabletAI] Failed to create conversation:', error)
      uni.showToast({ title: '新对话创建失败', icon: 'none' })
      return
    }
  }
  messages.value.push({ role: 'user', content: text })
  query.value = ''
  scrollToBottom()

  isAiTyping.value = true
  messages.value.push({ role: 'assistant', content: '' })
  const aiMsgIndex = messages.value.length - 1
  try {
    await chatWithAI(text, [], (delta) => { messages.value[aiMsgIndex].content += delta; scrollToBottom() }, currentSessionId.value || undefined)
    await loadHistory()
  } catch (err) { messages.value[aiMsgIndex].content = '网络异常，请重试。' }
  finally { isAiTyping.value = false; scrollToBottom() }
}
</script>

<style scoped>
/* ========================================================
   Zen Minimalist Dual-Card Layout Architecture
   ======================================================== */
.ai-chat-layout {
  display: flex;
  width: 100%;
  height: 100%;
  background: var(--color-zen-ivory, #F9F9F7);
  padding: 24rpx;
  box-sizing: border-box;
  gap: 24rpx;
  overflow: hidden;
}

/* ===== Left: History Sidebar Card ===== */
.history-sidebar-card {
  width: 440rpx;
  height: calc(100vh - 48rpx);
  background: var(--color-zen-white, #FFFFFF);
  border-radius: 36rpx;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 32rpx 24rpx 24rpx;
  border-bottom: 1px solid var(--color-zen-hairline, #E6E6E4);
}

.new-chat-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  width: 100%;
  height: 88rpx;
  background: var(--text-accent, #7D9372);
  color: var(--color-zen-white, #FFFFFF);
  border-radius: 44rpx;
  font-size: 32rpx;
  font-weight: 600;
  box-shadow: 0 8rpx 24rpx rgba(125, 147, 114, 0.25);
  cursor: pointer;
  transition: all 0.2s ease;
}
.new-chat-btn:hover {
  background: #6A805E;
  transform: translateY(-2rpx);
  box-shadow: 0 12rpx 32rpx rgba(125, 147, 114, 0.35);
}
.new-chat-btn:active {
  transform: scale(0.96);
}

.history-list-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 0;
  padding: 24rpx 16rpx;
  box-sizing: border-box;
}

.history-label {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--color-zen-stone, #A8A8A5);
  letter-spacing: 2rpx;
  margin-left: 16rpx;
  margin-bottom: 20rpx;
}

.history-scroll {
  flex: 1;
  height: 0;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx 20rpx;
  border-radius: 24rpx;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 12rpx;
  position: relative;
  border: 1px solid transparent;
}
.history-item:hover {
  background: rgba(125, 147, 114, 0.06);
}
.history-item.active {
  background: rgba(125, 147, 114, 0.12);
  border-color: rgba(125, 147, 114, 0.25);
}
.history-icon {
  font-size: 32rpx;
  flex-shrink: 0;
}
.history-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  min-width: 0;
}
.history-title {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--color-zen-graphite, #1C1C1A);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.history-item.active .history-title {
  color: var(--text-accent, #7D9372);
}
.history-time {
  font-size: 24rpx;
  color: var(--color-zen-stone, #A8A8A5);
}
.history-del {
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  opacity: 0;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.history-item:hover .history-del,
.history-item.active .history-del {
  opacity: 1;
}
.history-del:hover {
  background: rgba(0, 0, 0, 0.08);
}

/* ===== Right: Main AI Chat Card ===== */
.ai-chat-main-card {
  flex: 1;
  width: 0;
  height: calc(100vh - 48rpx);
  background: var(--color-zen-white, #FFFFFF);
  border-radius: 36rpx;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

/* Header - Responsive Full Screen Adapted */
.custom-header {
  padding-top: 24rpx;
  position: sticky;
  top: 0;
  z-index: 300;
  background: transparent;
}
.header-content {
  height: 100rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0 clamp(36rpx, 5vw, 96rpx);
  box-sizing: border-box;
}

.header-left {
  position: relative;
  z-index: 310;
}
.model-name-btn {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx 36rpx;
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 999rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.03);
  cursor: pointer;
  transition: all 0.2s ease;
}
.model-name-btn:active {
  transform: scale(0.96);
}
.model-icon-top {
  font-size: 32rpx;
  color: var(--text-accent, #7D9372);
}
.model-text {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--color-zen-graphite, #1C1C1A);
}
.chevron-icon {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.chevron-icon.is-rotated {
  transform: rotate(180deg);
}

.header-right-badge {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx 28rpx;
  background: rgba(125, 147, 114, 0.08);
  border: 1px solid rgba(125, 147, 114, 0.2);
  border-radius: 999rpx;
}
.status-dot {
  width: 12rpx;
  height: 12rpx;
  background: var(--text-accent, #7D9372);
  border-radius: 50%;
  box-shadow: 0 0 8rpx rgba(125, 147, 114, 0.8);
}
.status-text {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--text-accent, #7D9372);
}

/* Model Dropdown */
.model-mini-dropdown {
  position: absolute;
  top: calc(100% + 16rpx);
  left: 0;
  width: 480rpx;
  background: var(--color-zen-white, rgba(255, 255, 255, 0.96));
  backdrop-filter: blur(24rpx);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 36rpx;
  padding: 16rpx;
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.08);
  opacity: 0;
  transform: translateY(-16rpx) scale(0.96);
  pointer-events: none;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 320;
}
.model-mini-dropdown.is-open {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}
.mini-menu-item {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  cursor: pointer;
  transition: background 0.15s;
}
.mini-menu-item:hover {
  background: rgba(125, 147, 114, 0.08);
}
.mini-menu-icon {
  font-size: 36rpx;
  color: var(--text-accent, #7D9372);
}
.mini-menu-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.mini-menu-label {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--color-zen-graphite, #1C1C1A);
}
.mini-menu-label.is-active {
  color: var(--text-accent, #7D9372);
}
.mini-menu-desc {
  font-size: 24rpx;
  color: var(--color-zen-stone, #A8A8A5);
}
.mini-check {
  font-size: 32rpx;
  color: var(--text-accent, #7D9372);
  font-weight: 800;
}
.dropdown-mask {
  position: absolute;
  inset: 0;
  z-index: 250;
}

/* Chat Content - Responsive Full Screen Adapted */
.chat-content {
  flex: 1;
  height: 0;
  padding: 0;
  box-sizing: border-box;
  position: relative;
  z-index: 1;
}
.content-container {
  width: 100%;
  padding: 0 clamp(36rpx, 6vw, 140rpx);
  box-sizing: border-box;
  height: 100%;
}

/* Welcome Section */
.welcome-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding-bottom: 200rpx;
  box-sizing: border-box;
  animation: welcomeFadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes welcomeFadeIn {
  from { opacity: 0; transform: translateY(40rpx); }
  to   { opacity: 1; transform: translateY(0); }
}

.spark-icon-wrap {
  position: relative;
  width: 160rpx;
  height: 160rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 48rpx;
}
.spark-ring {
  position: absolute;
  inset: -20rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(125, 147, 114, 0.2) 0%, transparent 70%);
  animation: sparkPulse 3s ease-in-out infinite;
}
@keyframes sparkPulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.15); opacity: 1; }
}
.spark-svg {
  animation: sparkFloat 4s ease-in-out infinite;
  filter: drop-shadow(0 8rpx 24rpx rgba(125, 147, 114, 0.3));
}
@keyframes sparkFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10rpx); }
}

.greeting-main {
  font-size: 64rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  letter-spacing: -0.5rpx;
  text-align: center;
  line-height: 1.2;
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}
.greeting-sub {
  font-size: 34rpx;
  font-weight: 500;
  color: var(--color-zen-stone, #A8A8A5);
  text-align: center;
  margin-top: 20rpx;
}

.minimal-chips-wrap {
  margin-top: 72rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
  width: 100%;
}
.chips-label {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--color-zen-stone, #A8A8A5);
  letter-spacing: 2rpx;
}
.chips-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 20rpx;
  max-width: min(92%, 1100px);
}
.minimal-chip {
  display: flex;
  align-items: center;
  padding: 24rpx 44rpx;
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 999rpx;
  cursor: pointer;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.02);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.minimal-chip:hover {
  border-color: var(--text-accent, #7D9372);
  transform: translateY(-4rpx);
  box-shadow: 0 12rpx 32rpx rgba(125, 147, 114, 0.12);
}
.minimal-chip:active {
  transform: scale(0.96);
}
.chip-text {
  font-size: 30rpx;
  color: var(--color-zen-graphite, #1C1C1A);
  font-weight: 500;
}

/* Chat Stream - Responsive Full Screen Adapted Bubbles */
.chat-stream {
  padding-top: 32rpx;
  padding-bottom: 240rpx;
}
.chat-bubble {
  display: flex;
  align-items: flex-start;
  margin-bottom: 48rpx;
  gap: 24rpx;
}
.chat-bubble.user {
  flex-direction: row-reverse;
}
.chat-bubble.assistant {
  flex-direction: row;
}
.assistant-avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.03);
}
.assistant-avatar.small {
  width: 56rpx;
  height: 56rpx;
}

.bubble-body {
  display: flex;
  flex-direction: column;
  max-width: min(85%, 1000px);
}
.chat-bubble.user .bubble-body {
  align-items: flex-end;
}

.chat-bubble.user .bubble-content {
  background: var(--color-zen-graphite, #1C1C1A);
  color: var(--color-zen-white, #FFFFFF);
  border-radius: 40rpx 40rpx 8rpx 40rpx;
  padding: 32rpx 44rpx;
  font-size: 34rpx;
  line-height: 1.6;
  box-shadow: 0 12rpx 36rpx rgba(28, 28, 26, 0.12);
}

.chat-bubble.assistant .bubble-content {
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 8rpx 40rpx 40rpx 40rpx;
  padding: 36rpx 48rpx;
  font-size: 34rpx;
  line-height: 1.7;
  box-shadow: 0 12rpx 36rpx rgba(0, 0, 0, 0.03);
}

.bubble-actions {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 16rpx;
}
.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s;
  cursor: pointer;
}
.action-btn.icon-only {
  width: 68rpx;
  height: 68rpx;
  border-radius: 50%;
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
}
.action-btn.icon-only:hover {
  opacity: 0.7;
}
.action-btn.text-btn {
  font-size: 26rpx;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 40rpx;
  padding: 12rpx 32rpx;
  font-weight: 600;
  color: #4b8054;
  background: var(--color-zen-white, #FFFFFF);
}
.action-btn.text-btn:hover {
  background: rgba(75, 128, 84, 0.08);
}

.typing-indicator {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 40rpx;
}
.typing-dots {
  display: flex;
  align-items: center;
  gap: 10rpx;
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 8rpx 28rpx 28rpx 28rpx;
  padding: 24rpx 36rpx;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.02);
}
.dot {
  width: 12rpx;
  height: 12rpx;
  background: #7D9372;
  border-radius: 50%;
  animation: dotBounce 1.4s ease-in-out infinite both;
}
.dot:nth-child(1) { animation-delay: -0.32s; }
.dot:nth-child(2) { animation-delay: -0.16s; }
@keyframes dotBounce {
  0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
  40% { transform: scale(1); opacity: 1; }
}
.bottom-anchor { height: 40rpx; }

/* Bottom Capsule Input - Responsive Full Screen Adapted */
.ai-capsule-wrapper {
  position: absolute;
  left: 0;
  right: 0;
  width: 100%;
  padding: 0 clamp(36rpx, 6vw, 140rpx);
  box-sizing: border-box;
  z-index: 100;
  transition: bottom 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}
.ai-capsule {
  height: 128rpx;
  background: var(--color-zen-white, rgba(255, 255, 255, 0.95));
  backdrop-filter: blur(24rpx);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 64rpx;
  display: flex;
  align-items: center;
  padding: 0 16rpx;
  box-shadow: 0 16rpx 48rpx rgba(0, 0, 0, 0.06);
  transition: all 0.25s ease;
}
.ai-capsule.is-focused {
  background: var(--color-zen-white, #FFFFFF);
  box-shadow: 0 20rpx 60rpx rgba(125, 147, 114, 0.15), 0 0 0 2rpx var(--text-accent, #7D9372);
}
.capsule-left {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: opacity 0.15s;
}
.capsule-left:hover { opacity: 0.7; }

.ai-capsule-input {
  flex: 1;
  height: 100%;
  font-size: 34rpx;
  color: var(--color-zen-graphite, #1C1C1A);
  background: transparent;
  border: none;
  margin: 0 16rpx;
}
.capsule-divider {
  width: 1px;
  height: 56rpx;
  background: var(--color-zen-hairline, #E6E6E4);
  margin: 0 8rpx;
  flex-shrink: 0;
}
.capsule-right {
  width: 96rpx;
  height: 96rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.mic-btn {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.15s;
}
.mic-btn:hover { opacity: 0.7; }

.send-btn {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  background: var(--color-zen-graphite, #1C1C1A);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(28, 28, 26, 0.2);
  cursor: pointer;
  transition: all 0.2s;
}
.send-btn:hover { transform: scale(1.05); }
.send-btn:active { transform: scale(0.92); }

.plus-icon-wrap {
  transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  display: flex;
  align-items: center;
  justify-content: center;
}
.plus-icon-wrap.is-rotated {
  transform: rotate(45deg);
}

/* Action Panel Overlay */
.action-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(4rpx);
  z-index: 98;
}
.action-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  transform: translateY(100%);
  width: 100%;
  z-index: 99;
  background: var(--color-zen-white, rgba(255, 255, 255, 0.98));
  backdrop-filter: blur(24rpx);
  border-top: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 36rpx 36rpx 0 0;
  padding: 24rpx clamp(36rpx, 6vw, 140rpx) calc(env(safe-area-inset-bottom) + 16rpx);
  box-sizing: border-box;
  box-shadow: 0 -12rpx 48rpx rgba(0, 0, 0, 0.08);
  transition: all 0.32s cubic-bezier(0.32, 0.72, 0, 1);
  opacity: 0;
  pointer-events: none;
}
.action-panel.is-open {
  transform: translateY(0);
  opacity: 1;
  pointer-events: auto;
}
.action-panel-row {
  display: flex;
  align-items: center;
  gap: 32rpx;
  padding: 32rpx 24rpx;
  cursor: pointer;
  transition: background 0.12s;
  border-radius: 20rpx;
}
.action-panel-row:hover {
  background: rgba(125, 147, 114, 0.08);
}
.action-panel-icon {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.action-panel-label {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--color-zen-graphite, #1C1C1A);
}
.action-panel-divider {
  height: 1px;
  background: var(--color-zen-hairline, #E6E6E4);
  margin: 0 24rpx;
}

/* ========================================================
   Responsive Media Queries for Full-Screen Widescreen & Tablet
   ======================================================== */
@media (min-width: 768px) {
  .header-content { padding: 0 64px; }
  .content-container { padding: 0 80px; }
  .ai-capsule-wrapper { padding: 0 80px; }
  .action-panel { padding: 32px 80px calc(env(safe-area-inset-bottom) + 24px); }
  .bubble-body { max-width: 82%; }
}

@media (min-width: 1100px) {
  .header-content { padding: 0 100px; }
  .content-container { padding: 0 160px; }
  .ai-capsule-wrapper { padding: 0 160px; }
  .action-panel { padding: 36px 160px calc(env(safe-area-inset-bottom) + 24px); }
  .bubble-body { max-width: 78%; }
}

@media (min-width: 1600px) {
  .header-content { padding: 0 160px; }
  .content-container { padding: 0 240px; }
  .ai-capsule-wrapper { padding: 0 240px; }
  .action-panel { padding: 40px 240px calc(env(safe-area-inset-bottom) + 24px); }
  .bubble-body { max-width: 72%; }
}
</style>
