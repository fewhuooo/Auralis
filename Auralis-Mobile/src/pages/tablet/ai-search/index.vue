<template>
  <TabletLayout>
    <view class="t-ai-layout">
      <view class="history-card zen-card">
        <view class="history-header">
          <view class="new-chat-btn" @click="startNewChat">
            <LineIcon name="plus" size="26rpx" color="#FFFFFF" />
            <text>开启新对话</text>
          </view>
        </view>

        <text class="history-label">历史会话</text>

        <scroll-view scroll-y :show-scrollbar="false" class="history-scroll">
          <view v-if="loadingSessions" class="history-empty">正在加载会话…</view>
          <view v-else-if="conversations.length === 0" class="history-empty">暂无历史会话</view>

          <view
            v-for="item in conversations"
            :key="item.id"
            class="history-item"
            :class="{ active: currentConversationId === item.id }"
            @click="item.id && switchConversation(item.id)"
          >
            <LineIcon
              name="ai"
              size="28rpx"
              :color="currentConversationId === item.id ? '#8B9A6E' : '#7A7A75'"
            />
            <view class="history-info">
              <text class="history-title">{{ item.title || '新对话' }}</text>
              <text class="history-time">{{ formatConvDate(item.updatedAt || item.createdAt) }}</text>
            </view>
            <view
              v-if="item.id"
              class="history-del"
              @click.stop="deleteConversation(item.id, item.version ?? 0)"
            >
              <LineIcon name="close" size="22rpx" color="var(--text-muted)" />
            </view>
          </view>
        </scroll-view>
      </view>

      <view class="chat-card zen-card">
        <view class="chat-header">
          <view class="header-title-row">
            <LineIcon name="sparkles" size="30rpx" color="var(--color-zen-sage)" />
            <text class="chat-title">AI 学习助手</text>
          </view>
          <text class="chat-scope-note">{{ currentConversationTitle }}</text>
        </view>

        <scroll-view
          scroll-y
          :show-scrollbar="false"
          class="chat-scroll"
          :scroll-into-view="scrollTargetId"
        >
          <view v-if="messages.length === 0" class="welcome-box">
            <view class="welcome-icon">
              <LineIcon name="sparkles" size="60rpx" color="var(--color-zen-sage)" />
            </view>
            <text class="welcome-title">{{ displayName }}，今天想探讨什么问题？</text>
            <text class="welcome-sub">支持跨学科检索已解析学习资料与结构化解答</text>

            <view class="prompt-chips">
              <view
                v-for="prompt in quickPrompts"
                :key="prompt"
                class="prompt-chip"
                @click="query = prompt; sendMessage()"
              >
                <text>{{ prompt }}</text>
              </view>
            </view>
          </view>

          <view v-else class="chat-stream">
            <view
              v-for="(msg, index) in messages"
              :key="index"
              class="chat-row"
              :class="msg.role"
            >
              <view v-if="msg.role === 'user'" class="user-bubble">
                <text class="user-text">{{ msg.content }}</text>
              </view>

              <view v-else class="assistant-bubble">
                <view class="assistant-head">
                  <LineIcon name="sparkles" size="24rpx" color="var(--color-zen-sage)" />
                  <text class="assistant-label">Auralis AI</text>
                </view>

                <view v-if="msg.toolHint" class="tool-pill">
                  <text>{{ msg.toolHint }}</text>
                </view>

                <MarkdownText v-if="msg.content" :content="msg.content" />
                <text v-else-if="isTyping" class="typing-hint">正在检索与思考…</text>

                <view v-if="msg.content && !(isTyping && index === messages.length - 1)" class="bubble-actions">
                  <view class="copy-btn" @click="copyText(msg.content)">
                    <LineIcon name="copy" size="22rpx" color="var(--text-muted)" />
                    <text>复制</text>
                  </view>
                </view>
              </view>
            </view>

            <view :id="anchorId" class="bottom-anchor"></view>
          </view>
        </scroll-view>

        <view class="input-dock">
          <view class="input-capsule">
            <input
              class="chat-input"
              v-model="query"
              placeholder="输入问题，问问 Auralis AI…"
              confirm-type="send"
              :disabled="isTyping"
              @confirm="sendMessage"
            />
            <view
              class="send-btn"
              :class="{ disabled: !query.trim() || isTyping }"
              @click="sendMessage"
            >
              <LineIcon name="arrow-up" size="34rpx" color="#FFFFFF" />
            </view>
          </view>
        </view>
      </view>
    </view>
  </TabletLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { aiApi, type ConversationView } from '@/api/aiApi'
import { chatWithAI } from '@/api/aiClient'
import LineIcon from '@/components/LineIcon.vue'
import MarkdownText from '@/components/MarkdownText.vue'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import { useAuthStore } from '@/store/useAuthStore'
import { uuidv7 } from '@/utils/uuid'

interface ChatBubbleItem {
  role: 'user' | 'assistant'
  content: string
  toolHint?: string
}

const authStore = useAuthStore()
const displayName = computed(() => authStore.user?.displayName || authStore.username || '同学')

const conversations = ref<ConversationView[]>([])
const loadingSessions = ref(false)
const currentConversationId = ref('')
const currentConversationTitle = ref('新对话')
const messages = ref<ChatBubbleItem[]>([])
const query = ref('')
const isTyping = ref(false)
const scrollTargetId = ref('')
const anchorId = 'tablet-chat-anchor'

let activeStreamToken = 0

const quickPrompts = [
  '帮我梳理本周重点待复习知识块',
  '对比几种常见机器学习正则化方法',
  '用清晰框架总结一个复杂的数学定理',
]

function scrollToBottom() {
  nextTick(() => {
    scrollTargetId.value = anchorId
    setTimeout(() => {
      scrollTargetId.value = ''
    }, 80)
  })
}

function formatConvDate(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function loadHistory() {
  const generation = authStore.getLoginGeneration()
  loadingSessions.value = true
  try {
    const list = await aiApi.listConversations()
    if (generation !== authStore.getLoginGeneration()) return
    conversations.value = list.filter(item => !item.deletedAt)
  } catch {
    // Keep silent if offline
  } finally {
    loadingSessions.value = false
  }
}

function startNewChat() {
  if (isTyping.value) return
  activeStreamToken++
  currentConversationId.value = ''
  currentConversationTitle.value = '新对话'
  messages.value = []
  query.value = ''
}

async function switchConversation(conversationId: string) {
  if (isTyping.value) return
  const generation = authStore.getLoginGeneration()
  try {
    const detail = await aiApi.getConversation(conversationId)
    if (generation !== authStore.getLoginGeneration()) return
    activeStreamToken++
    currentConversationId.value = detail.id || conversationId
    currentConversationTitle.value = detail.title || '历史对话'
    messages.value = (detail.messages || [])
      .filter(m => m.role === 'USER' || m.role === 'ASSISTANT')
      .map(m => ({
        role: m.role === 'USER' ? 'user' : 'assistant',
        content: m.content || '',
      }))
    scrollToBottom()
  } catch {
    uni.showToast({ title: '加载对话失败', icon: 'none' })
  }
}

async function deleteConversation(conversationId: string, baseVersion: number) {
  if (isTyping.value && currentConversationId.value === conversationId) return
  const generation = authStore.getLoginGeneration()
  try {
    await aiApi.deleteConversation(conversationId, baseVersion)
    if (generation !== authStore.getLoginGeneration()) return
    conversations.value = conversations.value.filter(item => item.id !== conversationId)
    if (currentConversationId.value === conversationId) {
      startNewChat()
    }
    uni.showToast({ title: '已删除会话', icon: 'none' })
  } catch {
    if (generation !== authStore.getLoginGeneration()) return
    uni.showToast({ title: '删除失败，请刷新重试', icon: 'none' })
  }
}

async function ensureConversation(seedTitle: string, generation: symbol): Promise<string> {
  if (currentConversationId.value) return currentConversationId.value
  const created = await aiApi.createConversation({
    title: seedTitle.slice(0, 24) || 'AI 问答',
    baseVersion: 0,
    clientRequestId: uuidv7(),
  })
  if (generation !== authStore.getLoginGeneration()) {
    throw new Error('登录状态已变化，请重试。')
  }
  if (!created.id) throw new Error('创建对话失败')
  currentConversationId.value = created.id
  currentConversationTitle.value = created.title || seedTitle.slice(0, 24) || 'AI 问答'
  conversations.value = [created, ...conversations.value.filter(item => item.id !== created.id)]
  return created.id
}

function copyText(text: string) {
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '已复制', icon: 'none' }),
  })
}

async function sendMessage() {
  const text = query.value.trim()
  if (!text || isTyping.value) return

  const streamToken = ++activeStreamToken
  const generation = authStore.getLoginGeneration()
  const isCurrent = () => streamToken === activeStreamToken && generation === authStore.getLoginGeneration()

  query.value = ''
  messages.value.push({ role: 'user', content: text })
  messages.value.push({ role: 'assistant', content: '' })
  const aiIndex = messages.value.length - 1
  isTyping.value = true
  scrollToBottom()

  try {
    const conversationId = await ensureConversation(text, generation)
    if (!isCurrent()) return
    await chatWithAI(text, [], (delta) => {
      if (!isCurrent()) return
      messages.value[aiIndex].content += delta
      scrollToBottom()
    }, conversationId, {
      onToolEvent: (ev) => {
        if (!isCurrent()) return
        messages.value[aiIndex].toolHint = ev.phase === 'started'
          ? `正在调用 ${ev.name || '资料工具'}…`
          : ev.phase === 'completed'
            ? ''
            : '工具调用未完成'
      },
    })
  } catch (err) {
    if (!isCurrent()) return
    if (!query.value.trim()) {
      query.value = text
    }
    if (!messages.value[aiIndex].content) {
      messages.value[aiIndex].content = err instanceof Error ? err.message : '网络请求失败，请稍后重试。'
    }
  } finally {
    if (isCurrent()) {
      isTyping.value = false
      scrollToBottom()
    }
  }
}

onMounted(() => {
  void loadHistory()
})
</script>

<style scoped>
.t-ai-layout {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  padding: 28rpx;
  gap: 24rpx;
  background-color: var(--color-bg-primary);
  box-sizing: border-box;
  overflow: hidden;
}

.history-card {
  width: 380rpx;
  flex-shrink: 0;
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  height: 100%;
  box-sizing: border-box;
}

.new-chat-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  padding: 18rpx 20rpx;
  border-radius: 22rpx;
  background: var(--accent-gradient);
  color: #FFFFFF;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.history-label {
  font-size: 22rpx;
  font-weight: var(--font-weight-semibold);
  color: var(--text-muted);
  padding-left: 6rpx;
}

.history-scroll {
  flex: 1;
  min-height: 0;
}

.history-empty {
  padding: 36rpx 12rpx;
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.history-item {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 18rpx 16rpx;
  margin-bottom: 10rpx;
  border-radius: 20rpx;
  background-color: var(--color-bg-primary);
  border: 1px solid transparent;
  cursor: pointer;
}

.history-item.active {
  background-color: var(--color-sage-bg);
  border-color: var(--border-accent);
}

.history-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.history-title {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-time {
  font-size: 20rpx;
  color: var(--text-muted);
}

.history-del {
  padding: 6rpx;
  flex-shrink: 0;
}

.chat-card {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-header {
  padding: 24rpx 32rpx;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.header-title-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.chat-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.chat-scope-note {
  font-size: 22rpx;
  color: var(--text-muted);
}

.chat-scroll {
  flex: 1;
  min-height: 0;
  padding: 24rpx 36rpx;
  box-sizing: border-box;
}

.welcome-box {
  min-height: 54vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  text-align: center;
}

.welcome-icon {
  width: 112rpx;
  height: 112rpx;
  border-radius: 32rpx;
  background-color: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.welcome-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.welcome-sub {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.prompt-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12rpx;
  margin-top: 12rpx;
  max-width: 820rpx;
}

.prompt-chip {
  padding: 12rpx 24rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  cursor: pointer;
}

.chat-stream {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.chat-row {
  display: flex;
  flex-direction: column;
}

.chat-row.user {
  align-items: flex-end;
}

.chat-row.assistant {
  align-items: flex-start;
}

.user-bubble {
  max-width: 72%;
  padding: 18rpx 26rpx;
  border-radius: 24rpx 24rpx 8rpx 24rpx;
  background: var(--accent-gradient);
  color: #FFFFFF;
}

.user-text {
  font-size: var(--font-size-sm);
  line-height: 1.55;
  word-break: break-word;
}

.assistant-bubble {
  max-width: 86%;
  padding: 24rpx 28rpx;
  border-radius: 26rpx;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  box-sizing: border-box;
}

.assistant-head {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.assistant-label {
  font-size: 22rpx;
  font-weight: var(--font-weight-semibold);
  color: var(--color-zen-sage);
}

.tool-pill {
  align-self: flex-start;
  padding: 6rpx 16rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-zen-sage);
  font-size: 22rpx;
}

.typing-hint {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.bubble-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 8rpx;
  border-top: 1px solid var(--border-subtle);
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 8rpx 18rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-card);
  color: var(--text-muted);
  font-size: 22rpx;
  cursor: pointer;
}

.bottom-anchor {
  height: 24rpx;
}

.input-dock {
  padding: 20rpx 32rpx 24rpx;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.input-capsule {
  display: flex;
  align-items: center;
  gap: 16rpx;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  padding: 10rpx 12rpx 10rpx 28rpx;
}

.chat-input {
  flex: 1;
  min-width: 0;
  height: 72rpx;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.send-btn {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.send-btn.disabled {
  opacity: 0.45;
}
</style>
