<template>
  <AppPageLayout :disableAnimation="isSeamless">
    <view class="ai-chat-page">

      <!-- Ambient background gradient orbs -->
      <view class="bg-orb bg-orb--top" />
      <view class="bg-orb bg-orb--bottom" />

      <!-- ===== Custom Header ===== -->
      <view class="custom-header">
        <view class="header-content">
          <!-- Left: Menu + Model Selector (贴紧左侧) -->
          <view class="header-left">
            <view class="icon-btn" @click.stop="openDrawer">
              <LineIcon name="menu" size="52rpx" color="var(--text-primary)" />
            </view>
            <!-- Model name 点击弹出小菜单 -->
            <view class="model-name-btn" @click.stop="isModelMenuOpen = !isModelMenuOpen">
              <text class="model-text">{{ currentModel }}</text>
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
                <text class="mini-menu-label" :class="{ 'is-active': currentModel === m.label }">
                  {{ m.label }}
                </text>
                <view v-if="currentModel === m.label" class="mini-check">✓</view>
              </view>
            </view>
          </view>

          <!-- Right: New Chat -->
          <view class="icon-btn" @click="startNewChat">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14.5 3L19 7.5L8.5 18H4V13.5L14.5 3Z" stroke="var(--text-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M12 5.5L16.5 10" stroke="var(--text-primary)" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </view>
        </view>
      </view>

      <!-- Dropdown Mask -->
      <view class="dropdown-mask" v-if="isModelMenuOpen" @click="isModelMenuOpen = false" />

      <!-- ===== Content Area ===== -->
      <scroll-view
        :scroll-y="messages.length > 0"
        class="chat-content"
        :scroll-into-view="bottomId"
        :style="{ paddingBottom: scrollPaddingBottom + 'px' }"
      >

        <!-- ===== Welcome / Empty State ===== -->
        <view class="welcome-section" v-if="messages.length === 0">
          <!-- AI Spark Icon -->
          <view class="spark-icon-wrap">
            <view class="spark-ring" />
            <svg class="spark-svg" width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
              <!-- 四芒星 star shape -->
              <path d="M26 4C26 4 27.8 16 32 20.5C36.2 25 48 26 48 26C48 26 36.2 27 32 31.5C27.8 36 26 48 26 48C26 48 24.2 36 20 31.5C15.8 27 4 26 4 26C4 26 15.8 25 20 20.5C24.2 16 26 4 26 4Z"
                fill="url(#sparkGrad)" />
              <defs>
                <linearGradient id="sparkGrad" x1="4" y1="4" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="#C4A882"/>
                  <stop offset="50%" stop-color="#D4B896"/>
                  <stop offset="100%" stop-color="#B8956A"/>
                </linearGradient>
              </defs>
            </svg>
          </view>

          <!-- Greeting -->
          <text class="greeting-main">{{ username }}，</text>
          <text class="greeting-sub">今天想探索点什么？</text>
        </view>

        <!-- ===== Chat Stream ===== -->
        <view class="chat-stream" v-if="messages.length > 0">
          <view
            v-for="(msg, index) in messages"
            :key="index"
            class="chat-bubble"
            :class="msg.role"
          >
            <!-- Assistant avatar dot -->
            <view v-if="msg.role === 'assistant'" class="assistant-avatar">
              <svg width="18" height="18" viewBox="0 0 52 52" fill="none">
                <path d="M26 4C26 4 27.8 16 32 20.5C36.2 25 48 26 48 26C48 26 36.2 27 32 31.5C27.8 36 26 48 26 48C26 48 24.2 36 20 31.5C15.8 27 4 26 4 26C4 26 15.8 25 20 20.5C24.2 16 26 4 26 4Z"
                  fill="url(#avatarGrad)"/>
                <defs>
                  <linearGradient id="avatarGrad" x1="4" y1="4" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#C4A882"/>
                    <stop offset="100%" stop-color="#B8956A"/>
                  </linearGradient>
                </defs>
              </svg>
            </view>

            <view class="bubble-body">
              <view class="bubble-content" :class="{ 'rich-text': msg.role === 'assistant' }">
                <rich-text :nodes="formatMarkdown(msg.content)" />
              </view>

              <!-- Actions for assistant -->
              <view class="bubble-actions" v-if="msg.role === 'assistant' && msg.content">
                <view class="action-btn icon-only" @click="copyText(msg.content)">
                  <LineIcon name="copy" size="30rpx" color="var(--text-muted)" />
                </view>
                <button class="action-btn text-btn" @click="extractToBlock(msg.content)">
                  ✨ 存为知识块
                </button>
              </view>
            </view>
          </view>

          <!-- Typing indicator -->
          <view class="typing-indicator" v-if="isAiTyping">
            <view class="assistant-avatar small">
              <svg width="14" height="14" viewBox="0 0 52 52" fill="none">
                <path d="M26 4C26 4 27.8 16 32 20.5C36.2 25 48 26 48 26C48 26 36.2 27 32 31.5C27.8 36 26 48 26 48C26 48 24.2 36 20 31.5C15.8 27 4 26 4 26C4 26 15.8 25 20 20.5C24.2 16 26 4 26 4Z"
                  fill="url(#typingGrad)"/>
                <defs>
                  <linearGradient id="typingGrad" x1="4" y1="4" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#C4A882"/>
                    <stop offset="100%" stop-color="#B8956A"/>
                  </linearGradient>
                </defs>
              </svg>
            </view>
            <view class="typing-dots">
              <view class="dot" /><view class="dot" /><view class="dot" />
            </view>
          </view>
        </view>

        <view id="bottom-anchor" class="bottom-anchor" />
      </scroll-view>

      <!-- ===== Custom Bottom Action Panel ===== -->
      <!-- Overlay -->
      <view
        v-if="isActionOpen"
        class="action-overlay"
        @click="closeActionPanel"
      />
      <!-- Panel -->
      <view class="action-panel" :class="{ 'is-open': isActionOpen }">
        <view class="action-panel-row" @click="onActionTap(0)">
          <view class="action-panel-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 20h9" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round"/>
              <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </view>
          <text class="action-panel-label">拍照</text>
        </view>
        <view class="action-panel-divider" />
        <view class="action-panel-row" @click="onActionTap(1)">
          <view class="action-panel-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="3" stroke="var(--text-muted)" stroke-width="2"/>
              <circle cx="8.5" cy="8.5" r="1.5" fill="var(--text-muted)"/>
              <path d="M21 15l-5-5L5 21" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </view>
          <text class="action-panel-label">选择照片</text>
        </view>
        <view class="action-panel-divider" />
        <view class="action-panel-row" @click="onActionTap(2)">
          <view class="action-panel-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h10M4 18h7" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round"/>
              <circle cx="19" cy="18" r="3" stroke="#C4A882" stroke-width="2"/>
              <path d="M19 16v2l1 1" stroke="#C4A882" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </view>
          <text class="action-panel-label">从知识块导入</text>
        </view>
      </view>

      <!-- ===== Bottom Capsule Input ===== -->
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
            placeholder="问问 StudyCore AI..."
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
  </AppPageLayout>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, inject, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { useBlockStore } from '@/store/useBlockStore'
import { chatWithAI } from '@/api/aiClient'
import { uuidv7 } from '@/utils/uuid'
import LineIcon from '@/components/LineIcon.vue'
import AppPageLayout from '@/components/AppPageLayout.vue'
import { useAuthStore } from '@/store/useAuthStore'
import { useLayoutStore } from '@/store/useLayoutStore'

const layoutStore = useLayoutStore()
const openDrawer = () => layoutStore.openDrawer()

const authStore = useAuthStore()
const username = computed(() => authStore.username || '同学')

const blockStore = useBlockStore()
const { recentBlocks } = storeToRefs(blockStore)

const query = ref('')
const messages = ref<{role: 'user' | 'assistant', content: string}[]>([])
const isAiTyping = ref(false)
const bottomId = ref('')
const isInputFocused = ref(false)
const isSeamless = ref(false)
const isModelMenuOpen = ref(false)
const isActionOpen = ref(false)
const ACTION_PANEL_HEIGHT = 180 // px

const keyboardHeight = ref(0)
const capsuleBottom = computed(() =>
  isActionOpen.value
    ? ACTION_PANEL_HEIGHT + keyboardHeight.value
    : keyboardHeight.value
)
const scrollPaddingBottom = computed(() => keyboardHeight.value + 120)
const currentModel = ref('StudyCore')

const modelOptions = [
  { id: 1, icon: '🧠', label: '学霸模式', desc: '深度分析，逻辑严谨' },
  { id: 2, icon: '💬', label: '通用模式', desc: '全能助手，轻松对话' },
  { id: 3, icon: '🌐', label: '翻译模式', desc: '精准翻译，流畅润色' },
]

const suggestions = [
  { icon: '✨', title: '整理课堂大纲', prompt: '帮我把今天的课堂笔记整理成重点大纲' },
  { icon: '📅', title: '制定冲刺计划', prompt: '下周要考高数，帮我做个5天冲刺复习计划' },
  { icon: '✍️', title: '英文翻译润色', prompt: '帮我把这段学术翻译润色得更地道一些' },
]

const useSuggestion = (prompt: string) => {
  query.value = prompt
  nextTick(() => { handleSearch() })
}

// Markdown rich-text parser
const formatMarkdown = (text: string) => {
  if (!text) return ''
  const lines = text.split('\n')
  const htmlLines = []
  for (let line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('### ')) {
      htmlLines.push(`<h3 style="font-size: 34rpx; font-weight: 700; margin: 18rpx 0 10rpx; color: var(--text-primary);">${trimmed.slice(4)}</h3>`)
      continue
    }
    if (trimmed.startsWith('## ')) {
      htmlLines.push(`<h2 style="font-size: 38rpx; font-weight: 700; margin: 26rpx 0 14rpx; color: var(--text-primary); border-bottom: 1rpx solid var(--border-subtle); padding-bottom: 6rpx;">${trimmed.slice(3)}</h2>`)
      continue
    }
    if (trimmed.startsWith('# ')) {
      htmlLines.push(`<h1 style="font-size: 42rpx; font-weight: 700; margin: 34rpx 0 18rpx; color: var(--text-primary);">${trimmed.slice(2)}</h1>`)
      continue
    }
    if (trimmed.startsWith('> ')) {
      htmlLines.push(`<blockquote style="border-left: 6rpx solid var(--border-strong); padding-left: 20rpx; margin: 16rpx 0; color: var(--text-secondary); font-style: italic;">${trimmed.slice(2)}</blockquote>`)
      continue
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const content = trimmed.slice(2)
      htmlLines.push(`<div style="display:flex;align-items:flex-start;margin:10rpx 0;padding-left:12rpx;"><span style="color:var(--text-accent);margin-right:12rpx;font-weight:bold;">•</span><div style="flex:1;font-size:32rpx;color:var(--text-primary);">${content}</div></div>`)
      continue
    }
    const numMatch = trimmed.match(/^(\d+)\.\s(.*)/)
    if (numMatch) {
      htmlLines.push(`<div style="display:flex;align-items:flex-start;margin:10rpx 0;padding-left:12rpx;"><span style="color:var(--text-accent);margin-right:12rpx;font-weight:bold;">${numMatch[1]}.</span><div style="flex:1;font-size:32rpx;color:var(--text-primary);">${numMatch[2]}</div></div>`)
      continue
    }
    if (trimmed === '') {
      htmlLines.push('<div style="height:12rpx;"></div>')
    } else {
      htmlLines.push(`<div style="margin-bottom:6rpx;min-height:38rpx;">${line}</div>`)
    }
  }
  let formatted = htmlLines.join('')
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight:700;color:var(--text-primary);">$1</strong>')
  formatted = formatted.replace(/`(.*?)`/g, '<code style="font-family:monospace;background:var(--color-bg-tertiary);padding:4rpx 10rpx;border-radius:8rpx;font-size:28rpx;color:var(--text-accent);border:1rpx solid var(--border-subtle);">$1</code>')
  return `<div style="line-height:1.65;font-size:32rpx;color:var(--text-primary);">${formatted}</div>`
}

const copyText = (text: string) => {
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '已复制', icon: 'none' })
  })
}

const startNewChat = () => {
  messages.value = []
  query.value = ''
}

const selectModel = (model: string) => {
  currentModel.value = model
  isModelMenuOpen.value = false
}

const closeActionPanel = () => {
  isActionOpen.value = false
}

const openActionSheet = () => {
  isActionOpen.value = !isActionOpen.value
}

const onActionTap = (index: number) => {
  closeActionPanel()
  if (index === 0 || index === 1) {
    scanPhoto()
  } else {
    uni.showToast({ title: '知识块导入开发中...', icon: 'none' })
  }
}

if (uni.onKeyboardHeightChange) {
  uni.onKeyboardHeightChange((res) => { keyboardHeight.value = res.height })
}

const onInputFocus = () => {
  isInputFocused.value = true
  scrollToBottom()
}

const onInputBlur = () => {
  isInputFocused.value = false
}

onLoad((options) => {
  if (options && options.seamless) isSeamless.value = true
  if (options && options.q) {
    query.value = decodeURIComponent(options.q)
    nextTick(() => { handleSearch() })
  }
})

const extractToBlock = (content: string) => {
  uni.showModal({
    title: '提炼为知识块',
    content: '确认将此回复保存到本地知识库吗？',
    success: (res) => {
      if (res.confirm) {
        blockStore.addBlock({
          subject: 'AI 问答',
          title: 'AI 提炼笔记',
          preview: content,
          source: 'StudyCore AI',
          color: '#C4A882',
          id: uuidv7()
        })
        uni.showToast({ title: '已保存', icon: 'success' })
      }
    }
  })
}

const scanPhoto = () => uni.showToast({ title: '相机调用中...', icon: 'none' })
const startVoice = () => uni.showToast({ title: '正在录音...', icon: 'none' })

const scrollToBottom = () => {
  nextTick(() => {
    bottomId.value = 'bottom-anchor'
    setTimeout(() => { bottomId.value = '' }, 100)
  })
}

const handleSearch = async () => {
  if (!query.value.trim()) return
  const text = query.value.trim()
  messages.value.push({ role: 'user', content: text })
  query.value = ''
  scrollToBottom()
  isAiTyping.value = true
  messages.value.push({ role: 'assistant', content: '' })
  const aiMsgIndex = messages.value.length - 1
  try {
    const history = messages.value.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
    await chatWithAI(text, history, (delta) => {
      messages.value[aiMsgIndex].content += delta
      scrollToBottom()
    })
  } catch (err) {
    console.error(err)
    messages.value[aiMsgIndex].content = '网络请求失败，请稍后再试。'
  } finally {
    isAiTyping.value = false
    scrollToBottom()
  }
}
</script>

<style scoped>
/* ========================================
   Page Shell
   ======================================== */
.ai-chat-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: relative;
  /* Gemini-inspired: white top → warm oat bottom (lightened) */
  background: linear-gradient(
    180deg,
    #ffffff 0%,
    #fcfbfa 40%,
    #faf8f4 80%,
    #f5f2eb 100%
  );
  overflow: hidden;
}

/* ---- Ambient orbs ---- */
.bg-orb {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  z-index: 0;
}
.bg-orb--top {
  width: 700rpx;
  height: 700rpx;
  background: radial-gradient(circle, rgba(212, 184, 150, 0.10) 0%, transparent 70%);
  top: -200rpx;
  right: -150rpx;
}
.bg-orb--bottom {
  width: 900rpx;
  height: 900rpx;
  background: radial-gradient(circle, rgba(196, 168, 130, 0.07) 0%, transparent 70%);
  bottom: -300rpx;
  left: -200rpx;
}

/* ========================================
   Header
   ======================================== */
.custom-header {
  padding-top: calc(var(--status-bar-height, 44px) + 16rpx);
  position: sticky;
  top: 0;
  z-index: 100;
  background: transparent;
}
.header-content {
  height: 112rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 36rpx;
}

.icon-btn {
  width: 88rpx;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.15s ease;
}
.icon-btn:active {
  background: rgba(180, 150, 110, 0.12);
  transform: scale(0.92);
}

/* Header left group */
.header-left {
  display: flex;
  align-items: center;
  gap: 4rpx;
  position: relative;
}
.model-text {
  font-size: 36rpx;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.5rpx;
}

/* Model name button (clickable area with chevron) */
.model-name-btn {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 10rpx 16rpx 10rpx 8rpx;
  border-radius: 32rpx;
  transition: background 0.15s;
}
.model-name-btn:active {
  background: rgba(180, 150, 110, 0.1);
}
.chevron-icon {
  transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
  flex-shrink: 0;
  margin-top: 2rpx;
}
.chevron-icon.is-rotated {
  transform: rotate(180deg);
}

/* Small inline dropdown */
.model-mini-dropdown {
  position: absolute;
  top: calc(100% + 8rpx);
  left: 32rpx;
  background: rgba(255, 253, 250, 0.97);
  backdrop-filter: blur(24rpx);
  border: 1.5rpx solid rgba(200, 180, 155, 0.3);
  border-radius: 22rpx;
  box-shadow: 0 12rpx 40rpx rgba(140, 110, 70, 0.12), 0 2rpx 8rpx rgba(0,0,0,0.04);
  padding: 10rpx 0;
  width: 280rpx;
  z-index: 200;
  opacity: 0;
  transform: translateY(-8rpx) scale(0.96);
  pointer-events: none;
  transition: all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.model-mini-dropdown.is-open {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}
.mini-menu-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 28rpx;
  transition: background 0.12s;
}
.mini-menu-item:active {
  background: rgba(196, 168, 130, 0.1);
}
.mini-menu-icon {
  font-size: 32rpx;
  width: 36rpx;
  text-align: center;
}
.mini-menu-label {
  flex: 1;
  font-size: 30rpx;
  font-weight: 500;
  color: var(--text-primary);
}
.mini-menu-label.is-active {
  color: #B8956A;
  font-weight: 600;
}
.mini-check {
  font-size: 28rpx;
  color: #B8956A;
  font-weight: 700;
}

/* Dropdown backdrop mask */
.dropdown-mask {
  position: fixed;
  inset: 0;
  z-index: 150;
}


/* ========================================
   Chat Content
   ======================================== */
.chat-content {
  flex: 1;
  height: 0;
  padding: 0 40rpx;
  box-sizing: border-box;
  position: relative;
  z-index: 1;
}

/* ========================================
   Welcome / Empty State  (Gemini-style)
   ======================================== */
.welcome-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 600rpx;
  animation: welcomeFadeIn 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes welcomeFadeIn {
  from { opacity: 0; transform: translateY(32rpx); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Spark icon */
.spark-icon-wrap {
  position: relative;
  width: 120rpx;
  height: 120rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 48rpx;
}
.spark-ring {
  position: absolute;
  inset: -12rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(196, 168, 130, 0.25) 0%, transparent 70%);
  animation: sparkPulse 3s ease-in-out infinite;
}
@keyframes sparkPulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.15); opacity: 1; }
}
.spark-svg {
  animation: sparkFloat 4s ease-in-out infinite;
  filter: drop-shadow(0 8rpx 24rpx rgba(196, 168, 130, 0.4));
}
@keyframes sparkFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8rpx); }
}

/* Greeting text */
.greeting-main {
  font-size: 60rpx;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.5rpx;
  text-align: center;
  line-height: 1.2;
}
.greeting-sub {
  font-size: 40rpx;
  font-weight: 400;
  color: var(--text-secondary);
  text-align: center;
  margin-top: 12rpx;
}


/* ========================================
   Chat Stream
   ======================================== */
.chat-stream {
  padding: 24rpx 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.chat-bubble {
  display: flex;
  align-items: flex-start;
  margin-bottom: 40rpx;
  gap: 16rpx;
}
.chat-bubble.user {
  flex-direction: row-reverse;
}
.chat-bubble.assistant {
  flex-direction: row;
}

/* Assistant avatar */
.assistant-avatar {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(245, 238, 226, 0.9) 0%, rgba(230, 215, 193, 0.9) 100%);
  border: 1.5rpx solid rgba(200, 178, 150, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4rpx 16rpx rgba(180, 150, 110, 0.12);
}
.assistant-avatar.small {
  width: 52rpx;
  height: 52rpx;
}

.bubble-body {
  display: flex;
  flex-direction: column;
  max-width: 82%;
}

/* User bubble */
.chat-bubble.user .bubble-body {
  align-items: flex-end;
}
.chat-bubble.user .bubble-content {
  background: linear-gradient(135deg, #2E2B26 0%, #3A362F 100%);
  color: #FAF8F5;
  border-radius: 28rpx 28rpx 8rpx 28rpx;
  padding: 24rpx 36rpx;
  font-size: 32rpx;
  line-height: 1.55;
  box-shadow: 0 6rpx 24rpx rgba(40, 35, 25, 0.12);
}

/* Assistant bubble */
.chat-bubble.assistant .bubble-content {
  background: rgba(255, 252, 248, 0.9);
  border: 1.5rpx solid rgba(210, 190, 160, 0.3);
  border-radius: 8rpx 28rpx 28rpx 28rpx;
  padding: 24rpx 36rpx;
  font-size: 32rpx;
  line-height: 1.65;
  box-shadow: 0 4rpx 20rpx rgba(180, 150, 110, 0.06);
  backdrop-filter: blur(8rpx);
}

/* Actions */
.bubble-actions {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 14rpx;
  padding-left: 4rpx;
}
.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s;
}
.action-btn.icon-only {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: rgba(255, 252, 248, 0.9);
  border: 1.5rpx solid rgba(210, 190, 160, 0.35);
  box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.04);
}
.action-btn.icon-only:active { opacity: 0.7; }
.action-btn.text-btn {
  font-size: 26rpx;
  border: 1.5rpx solid rgba(196, 168, 130, 0.4);
  border-radius: 40rpx;
  padding: 10rpx 28rpx;
  font-weight: 500;
  color: #B8956A;
  background: rgba(245, 238, 226, 0.7);
  box-shadow: 0 2rpx 8rpx rgba(180, 150, 110, 0.06);
}
.action-btn.text-btn:active { opacity: 0.7; }

/* Typing indicator */
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 40rpx;
}
.typing-dots {
  display: flex;
  align-items: center;
  gap: 8rpx;
  background: rgba(255, 252, 248, 0.9);
  border: 1.5rpx solid rgba(210, 190, 160, 0.3);
  border-radius: 8rpx 28rpx 28rpx 28rpx;
  padding: 20rpx 28rpx;
}
.dot {
  width: 10rpx;
  height: 10rpx;
  background: #C4A882;
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

/* ========================================
   Bottom Capsule Input  (Gemini-style)
   ======================================== */
.ai-capsule-wrapper {
  position: absolute;
  left: 32rpx;
  right: 32rpx;
  z-index: 100;
  transition: bottom 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  padding-bottom: calc(env(safe-area-inset-bottom) + 28rpx);
}

.ai-capsule {
  height: 148rpx;
  background: rgba(255, 253, 250, 0.95);
  border-radius: 74rpx;
  display: flex;
  align-items: center;
  padding: 0 12rpx;
  box-shadow:
    0 4rpx 6rpx rgba(0,0,0,0.02),
    0 12rpx 40rpx rgba(180, 150, 110, 0.1),
    0 0 0 1.5rpx rgba(210, 190, 160, 0.3);
  transition: all 0.25s ease;
  backdrop-filter: blur(20rpx);
}
.ai-capsule.is-focused {
  box-shadow:
    0 4rpx 6rpx rgba(0,0,0,0.02),
    0 20rpx 60rpx rgba(180, 150, 110, 0.16),
    0 0 0 2rpx rgba(196, 168, 130, 0.45);
}

.capsule-left {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity 0.15s;
}
.capsule-left:active { opacity: 0.5; }

.ai-capsule-input {
  flex: 1;
  height: 100%;
  font-size: 32rpx;
  color: var(--text-primary);
  background: transparent;
  border: none;
  margin: 0 8rpx;
}

.capsule-divider {
  width: 1.5rpx;
  height: 40rpx;
  background: rgba(196, 168, 130, 0.35);
  border-radius: 2rpx;
  flex-shrink: 0;
}

.capsule-right {
  width: 88rpx;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mic-btn {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s;
}
.mic-btn:active { opacity: 0.5; }

.send-btn {
  width: 76rpx;
  height: 76rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #2E2B26 0%, #3A362F 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6rpx 20rpx rgba(40, 35, 25, 0.25);
  transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
}
.send-btn:active {
  transform: scale(0.88);
  box-shadow: 0 2rpx 8rpx rgba(40, 35, 25, 0.15);
}

/* ========================================
   Plus icon rotation
   ======================================== */
.plus-icon-wrap {
  transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  display: flex;
  align-items: center;
  justify-content: center;
}
.plus-icon-wrap.is-rotated {
  transform: rotate(45deg);
}

/* ========================================
   Bottom Action Panel
   ======================================== */
.action-overlay {
  position: fixed;
  inset: 0;
  background: transparent;
  z-index: 98;
}

.action-panel {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 99;
  background: rgba(255, 253, 250, 0.98);
  backdrop-filter: blur(24rpx);
  border-top: 1.5rpx solid rgba(200, 180, 155, 0.25);
  border-radius: 36rpx 36rpx 0 0;
  padding: 20rpx 0 calc(env(safe-area-inset-bottom) + 4rpx);
  box-shadow: 0 -8rpx 40rpx rgba(180, 150, 110, 0.1);
  /* Positioned just above capsule; bottom driven by capsuleBottom */
  bottom: 0;
  transform: translateY(100%);
  transition: transform 0.32s cubic-bezier(0.32, 0.72, 0, 1);
}
.action-panel.is-open {
  transform: translateY(0);
}

.action-panel-row {
  display: flex;
  align-items: center;
  gap: 28rpx;
  padding: 28rpx 48rpx;
  transition: background 0.12s;
}
.action-panel-row:active {
  background: rgba(196, 168, 130, 0.1);
}
.action-panel-icon {
  width: 52rpx;
  height: 52rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.action-panel-label {
  font-size: 34rpx;
  font-weight: 500;
  color: var(--text-primary);
}
.action-panel-divider {
  height: 1rpx;
  background: rgba(200, 180, 155, 0.2);
  margin: 0 40rpx;
}
</style>
