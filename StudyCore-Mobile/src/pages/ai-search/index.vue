<template>
  <AppPageLayout :disableAnimation="isSeamless">
    <view class="ai-chat-page">
      
      <!-- Custom Header (Level 3: Control - Receding) -->
      <view class="custom-header">
        <view class="header-content">
          <view class="header-left" style="display: flex; flex-direction: row; align-items: center;">
            <view class="icon-btn menu-btn" @click.stop="openDrawer" style="margin-right: 16rpx;">
              <LineIcon name="menu" size="44rpx" />
            </view>
            
            <!-- Model Selector Wrapper -->
            <view class="model-selector-wrapper">
              <view class="model-selector" @click="isModelMenuOpen = !isModelMenuOpen">
                <text class="model-text">{{ currentModel }}</text>
                <LineIcon name="chevron-down" size="24rpx" class="model-icon" />
              </view>
              
              <!-- Dropdown Menu -->
              <view class="model-dropdown-menu" v-if="isModelMenuOpen">
                <view class="model-menu-item" @click="selectModel('Gemini Flash')">
                  <text :class="{ 'active-model': currentModel === 'Gemini Flash' }">Gemini Flash</text>
                </view>
                <view class="model-menu-item" @click="selectModel('Gemini Pro')">
                  <text :class="{ 'active-model': currentModel === 'Gemini Pro' }">Gemini Pro</text>
                </view>
                <view class="model-menu-item" @click="selectModel('StudyCore Model')">
                  <text :class="{ 'active-model': currentModel === 'StudyCore Model' }">StudyCore Model</text>
                </view>
              </view>
            </view>
          </view>

          <!-- New Chat Btn -->
          <view class="icon-btn new-chat-btn" @click="startNewChat">
            <LineIcon name="edit" size="44rpx" />
          </view>
        </view>
      </view>

      <!-- Dropdown Mask -->
      <view class="dropdown-mask" v-if="isModelMenuOpen" @click="isModelMenuOpen = false"></view>

      <!-- Content Area -->
      <scroll-view 
        :scroll-y="messages.length > 0" 
        class="chat-content" 
        :scroll-into-view="bottomId"
        :style="{ paddingBottom: scrollPaddingBottom + 'px' }"
      >
        
        <!-- Empty State / Welcome -->
        <view class="welcome-section" v-if="messages.length === 0">
            <view class="spark-icon-wrapper">
               <LineIcon name="ai" size="80rpx" color="var(--color-primary)" />
            </view>
            <text class="greeting">{{ username.toUpperCase() }}，需要我帮你做点什么？</text>
        </view>

        <!-- AI Chat Stream -->
        <view class="chat-stream" v-if="messages.length > 0">
          <view 
            v-for="(msg, index) in messages" 
            :key="index"
            class="chat-bubble"
            :class="msg.role"
          >
            <view class="bubble-content" :class="{ 'rich-text': msg.role === 'assistant' }">
              <rich-text :nodes="formatMarkdown(msg.content)"></rich-text>
            </view>
            <view class="bubble-actions" v-if="msg.role === 'assistant'">
              <view class="action-btn-group">
                <view class="action-btn icon-only" @click="copyText(msg.content)">
                  <LineIcon name="copy" size="28rpx" />
                </view>
                <button class="action-btn text-btn" @click="extractToBlock(msg.content)">✨ 存为知识块</button>
              </view>
            </view>
          </view>
          <!-- Loading indicator -->
          <view class="typing-indicator" v-if="isAiTyping">
             <view class="dot"></view><view class="dot"></view><view class="dot"></view>
          </view>
        </view>

        <view id="bottom-anchor" class="bottom-anchor"></view>
      </scroll-view>

      <!-- Bottom Fixed Input (Pill Capsule) (Level 1: Core - Integrated) -->
      <view class="ai-capsule-wrapper" :style="{ bottom: keyboardHeight + 'px' }">
        <view class="ai-capsule" :class="{ 'is-focused': isInputFocused }">
          <view class="capsule-left" @click="openActionSheet">
            <LineIcon name="plus" size="44rpx" color="var(--text-secondary)" />
          </view>
          <input 
            class="ai-capsule-input"
            v-model="query"
            placeholder="问问 StudyCore"
            placeholder-style="color: var(--text-muted); font-weight: 400;"
            :focus="isInputFocused"
            :adjust-position="false"
            @focus="onInputFocus"
            @blur="onInputBlur"
            @confirm="handleSearch"
            :cursor-spacing="20"
          />
          <view class="capsule-right">
             <view v-if="query.trim().length === 0" class="mic-btn" @click="startVoice">
                <LineIcon name="mic" size="44rpx" color="var(--text-secondary)" />
             </view>
             <view v-else class="send-btn" @click="handleSearch">
                <LineIcon name="arrow-up" size="32rpx" color="var(--color-bg-primary)" />
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

const keyboardHeight = ref(0)
const scrollPaddingBottom = computed(() => keyboardHeight.value + 120) // space for capsule
const currentModel = ref('Gemini Flash')

// Markdown formatting mock (use rich-text)
const formatMarkdown = (text: string) => {
  if (!text) return ''
  // Simple bold and line break formatting for rich-text
  let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  formatted = formatted.replace(/\n/g, '<br/>')
  return `<div style="line-height: 1.6; font-size: 15px;">${formatted}</div>`
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

const openModelSheet = () => {
  isModelMenuOpen.value = !isModelMenuOpen.value
}

const openActionSheet = () => {
  uni.showActionSheet({
    itemList: ['拍照', '选择照片', '从知识块导入'],
    success: (res) => {
      if (res.tapIndex === 0 || res.tapIndex === 1) {
        scanPhoto()
      } else {
        uni.showToast({ title: '知识块导入开发中...', icon: 'none' })
      }
    }
  })
}

// Keyboard handling safe check
if (uni.onKeyboardHeightChange) {
  uni.onKeyboardHeightChange((res) => {
    keyboardHeight.value = res.height
  })
}

const onInputFocus = () => {
  isInputFocused.value = true
  scrollToBottom()
}

const onInputBlur = () => {
  isInputFocused.value = false
  // keyboardHeight will reset via listener
}

onLoad((options) => {
  if (options && options.seamless) {
    isSeamless.value = true
  }
  if (options && options.q) {
    query.value = decodeURIComponent(options.q)
    nextTick(() => {
      handleSearch()
    })
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
          color: '#0284c7',
          id: uuidv7()
        })
        uni.showToast({ title: '已保存', icon: 'success' })
      }
    }
  })
}

const scanPhoto = () => {
  uni.showToast({ title: '相机调用中...', icon: 'none' })
}

const startVoice = () => {
  uni.showToast({ title: '正在录音...', icon: 'none' })
}

const scrollToBottom = () => {
  nextTick(() => {
    bottomId.value = 'bottom-anchor'
    setTimeout(() => { bottomId.value = '' }, 100)
  })
}

const handleSearch = async () => {
  if (!query.value.trim()) return
  
  const text = query.value.trim()
  
  // Add user message
  messages.value.push({ role: 'user', content: text })
  query.value = ''
  scrollToBottom()
  
  // Trigger AI
  isAiTyping.value = true
  messages.value.push({ role: 'assistant', content: '' })
  const aiMsgIndex = messages.value.length - 1
  
  try {
    const history = messages.value.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
    
    await chatWithAI(text, history, (contentDelta) => {
      messages.value[aiMsgIndex].content += contentDelta
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
.ai-chat-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: relative;
  background: var(--color-bg-primary);
}

/* Header */
.custom-header {
  padding-top: calc(var(--status-bar-height, 44px) + 40rpx); /* 上方防误触留白 */
  z-index: 100;
  position: sticky;
  top: 0;
  background: var(--color-bg-primary);
}
.header-content {
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 40rpx; /* 左右防误触留白 */
}
.header-left {
  display: flex;
  align-items: center;
  flex-direction: row;
}
.icon-btn {
  width: 76rpx;
  height: 76rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--text-primary);
  background: transparent; /* Level 3: No background */
  border: 2rpx solid var(--border-subtle); /* Added circular border */
  transition: opacity 0.2s, border-color 0.2s;
}
.icon-btn:active {
  opacity: 0.5;
  border-color: rgba(0,0,0,0.2);
}

/* Dropdown Menu Styles */
.model-selector-wrapper {
  position: relative;
}
.model-selector {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx 20rpx;
  border-radius: 40rpx;
  background: transparent; /* Level 3: No background */
}
.model-selector:active {
  opacity: 0.5;
}
.model-text {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text-primary);
}
.model-dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 12rpx;
  background: var(--color-bg-elevated);
  border-radius: 20rpx;
  box-shadow: 0 8rpx 32rpx rgba(0,0,0,0.12);
  padding: 12rpx 0;
  width: 320rpx;
  z-index: 200;
}
.model-menu-item {
  padding: 24rpx 32rpx;
  font-size: 28rpx;
  color: var(--text-primary);
  font-weight: 500;
}
.model-menu-item:active {
  background: rgba(0,0,0,0.04);
}
.active-model {
  color: var(--color-primary);
  font-weight: 600;
}
.dropdown-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 150;
}
.model-selector:active {
  opacity: 0.5;
}
.model-text {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text-primary);
}

/* Chat Content */
.chat-content {
  flex: 1;
  height: 0;
  padding: 20rpx 40rpx; /* 防误触等宽留白 */
  box-sizing: border-box;
  transition: padding-bottom 0.3s ease;
}

/* Welcome Section */
.welcome-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-top: 25vh;
}
.spark-icon-wrapper {
  margin-bottom: 24rpx;
  display: flex;
  justify-content: center;
  opacity: 0.8;
}

.greeting {
  font-family: ui-rounded, 'SF Pro Rounded', 'Nunito', sans-serif;
  font-size: 44rpx;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 40rpx;
  letter-spacing: 2rpx;
  text-align: center;
}

/* Chat Stream */
.chat-stream {
  padding: 20rpx 0;
}
.chat-bubble {
  margin: 0 0 40rpx;
  max-width: 90%;
  display: flex;
  flex-direction: column;
}
.chat-bubble.user {
  align-self: flex-end;
  margin-left: auto;
}
.chat-bubble.user .bubble-content {
  background: var(--color-primary);
  color: #fff;
  border-radius: 40rpx 40rpx 8rpx 40rpx;
  padding: 24rpx 36rpx;
  font-size: 32rpx;
  line-height: 1.5;
}
.chat-bubble.assistant .bubble-content {
  color: var(--text-primary);
  background: var(--color-bg-secondary);
  border-radius: 40rpx 40rpx 40rpx 8rpx;
  padding: 24rpx 36rpx;
  font-size: 32rpx;
  line-height: 1.6;
}
.bubble-actions {
  margin-top: 12rpx;
  padding-left: 20rpx;
}
.action-btn-group {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--text-secondary);
  padding: 8rpx;
}
.action-btn.icon-only {
  width: 60rpx;
  height: 60rpx;
  border-radius: 50%;
  background: var(--color-bg-elevated);
  box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.03);
}
.action-btn.icon-only:active {
  opacity: 0.8;
}
.action-btn.text-btn {
  font-size: 24rpx;
  border: 1px solid var(--border-subtle);
  border-radius: 30rpx;
  padding: 10rpx 28rpx;
  font-weight: 500;
  background: var(--color-bg-elevated);
  box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.03);
}
.action-btn.text-btn:active {
  opacity: 0.8;
}

.typing-indicator {
  display: flex;
  gap: 8rpx;
  margin-left: 20rpx;
  padding: 24rpx 32rpx;
  background: var(--color-bg-secondary);
  border-radius: 40rpx 40rpx 40rpx 8rpx;
  width: max-content;
}
.dot {
  width: 12rpx;
  height: 12rpx;
  background: var(--text-muted);
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out both;
}
.dot:nth-child(1) { animation-delay: -0.32s; }
.dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

.bottom-anchor {
  height: 40rpx;
}

/* Bottom Capsule Input */
.ai-capsule-wrapper {
  position: absolute;
  left: 40rpx; /* 防误触等宽留白 */
  right: 40rpx; /* 防误触等宽留白 */
  z-index: 100;
  transition: bottom 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  padding-bottom: env(safe-area-inset-bottom);
}
.ai-capsule-wrapper[style*="bottom: 0px"] {
  bottom: calc(env(safe-area-inset-bottom) + 40rpx) !important;
}

.ai-capsule {
  flex: 1;
  height: 110rpx;
  background: var(--color-bg-elevated);
  border-radius: 55rpx;
  display: flex;
  align-items: center;
  padding: 0 16rpx;
  box-shadow: 0 8rpx 30rpx rgba(0,0,0,0.05);
  border: 2rpx solid var(--border-subtle);
  transition: all 0.3s;
}

.ai-capsule.is-focused {
  box-shadow: 0 12rpx 48rpx rgba(0,0,0,0.1);
  border-color: rgba(99, 102, 241, 0.3);
}

.capsule-left {
  width: 76rpx;
  height: 76rpx;
  border-radius: 50%;
  background: transparent; /* Level 1: Integrated */
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s;
}
.capsule-left:active {
  opacity: 0.5;
}

.ai-capsule-input {
  flex: 1;
  height: 100%;
  font-size: 32rpx;
  color: var(--text-primary);
  margin: 0 16rpx;
  background: transparent;
  border: none;
}

.capsule-right {
  width: 76rpx;
  height: 76rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mic-btn {
  width: 76rpx;
  height: 76rpx;
  border-radius: 50%;
  background: transparent; /* Level 1: Integrated */
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s;
}
.mic-btn:active {
  opacity: 0.5;
}

.send-btn {
  width: 76rpx;
  height: 76rpx;
  border-radius: 50%;
  background: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4rpx 12rpx rgba(0,0,0,0.1);
}
.send-btn:active {
  transform: scale(0.95);
}
</style>
