<template>
  <AppPageLayout anim-origin="bottom-right" :show-tab-bar="false">
    <view class="ai-page">
      <AppHeader title="AI 助手" show-back back-url="/pages/mobile/home/index">
        <template #right>
          <view class="icon-pill-btn" @click="openHistoryDrawer">
            <LineIcon name="history" size="34rpx" color="var(--text-primary)" />
          </view>
          <view class="icon-pill-btn" @click="startNewChat">
            <LineIcon name="plus" size="34rpx" color="var(--text-primary)" />
          </view>
        </template>
      </AppHeader>

      <scroll-view
        scroll-y
        :show-scrollbar="false"
        class="chat-scroll"
        :scroll-into-view="scrollTargetId"
      >
        <view v-if="messages.length === 0" class="welcome-state">
          <view class="welcome-icon">
            <LineIcon name="sparkles" size="56rpx" color="var(--color-zen-sage)" />
          </view>
          <text class="welcome-title">{{ displayName }}，有什么想探讨的？</text>
          <text class="welcome-sub">支持基于已解析学科资料检索与学习问答</text>
        </view>

        <view v-else class="chat-list">
          <view
            v-for="(msg, idx) in messages"
            :key="idx"
            class="chat-row"
            :class="msg.role"
          >
            <view v-if="msg.role === 'user'" class="user-bubble">
              <text class="user-text">{{ msg.content }}</text>
            </view>

            <view v-else class="assistant-bubble zen-card">
              <view class="assistant-head">
                <LineIcon name="sparkles" size="26rpx" color="var(--color-zen-sage)" />
                <text class="assistant-name">Auralis AI</text>
              </view>

              <view v-if="msg.toolHint" class="tool-pill">
                <text>{{ msg.toolHint }}</text>
              </view>

              <MarkdownText v-if="msg.content" :content="msg.content" />
              <text v-else-if="isTyping" class="typing-placeholder">正在思考并检索资料…</text>

              <view v-if="msg.content && !(isTyping && idx === messages.length - 1)" class="bubble-footer">
                <view class="copy-btn" @click="copyText(msg.content)">
                  <LineIcon name="copy" size="24rpx" color="var(--text-muted)" />
                  <text>复制</text>
                </view>
              </view>
            </view>
          </view>
        </view>

        <view :id="anchorId" class="bottom-anchor"></view>
      </scroll-view>

      <view class="input-dock">
        <view class="input-capsule zen-card">
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

      <view v-if="showHistorySheet" class="zen-sheet-mask" @click="showHistorySheet = false">
        <view class="zen-sheet-body" @click.stop>
          <view class="sheet-header">
            <text class="sheet-title">历史对话</text>
            <view class="sheet-close" @click="showHistorySheet = false">
              <LineIcon name="close" size="30rpx" color="var(--text-muted)" />
            </view>
          </view>

          <view v-if="loadingHistory" class="history-empty">正在加载对话记录…</view>
          <view v-else-if="conversations.length === 0" class="history-empty">暂无历史对话</view>
          <scroll-view v-else scroll-y :show-scrollbar="false" class="history-scroll">
            <view
              v-for="conv in conversations"
              :key="conv.id"
              class="history-row"
              :class="{ active: conv.id === currentConversationId }"
              @click="conv.id && loadConversation(conv.id)"
            >
              <view class="history-meta">
                <text class="history-title">{{ conv.title || '新对话' }}</text>
                <text class="history-time">{{ formatConvDate(conv.updatedAt || conv.createdAt) }}</text>
              </view>
              <view
                v-if="conv.id"
                class="history-delete"
                @click.stop="deleteConversation(conv.id, conv.version ?? 0)"
              >
                <LineIcon name="trash" size="26rpx" color="var(--text-muted)" />
              </view>
            </view>
          </scroll-view>
        </view>
      </view>
    </view>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { aiApi, type ConversationView } from '@/api/aiApi'
import { chatWithAI } from '@/api/aiClient'
import AppHeader from '@/components/AppHeader.vue'
import AppPageLayout from '@/components/AppPageLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import MarkdownText from '@/components/MarkdownText.vue'
import { useAuthStore } from '@/store/useAuthStore'
import { uuidv7 } from '@/utils/uuid'

interface ChatMessageItem {
  role: 'user' | 'assistant'
  content: string
  toolHint?: string
}

const authStore = useAuthStore()
const displayName = computed(() => authStore.user?.displayName || authStore.username || '同学')

const query = ref('')
const messages = ref<ChatMessageItem[]>([])
const currentConversationId = ref('')
const isTyping = ref(false)
const scrollTargetId = ref('')
const anchorId = 'chat-bottom-anchor'

const showHistorySheet = ref(false)
const loadingHistory = ref(false)
const conversations = ref<ConversationView[]>([])

let activeStreamToken = 0

function scrollToBottom() {
  nextTick(() => {
    scrollTargetId.value = anchorId
    setTimeout(() => {
      scrollTargetId.value = ''
    }, 80)
  })
}

function startNewChat() {
  if (isTyping.value) return
  activeStreamToken++
  currentConversationId.value = ''
  messages.value = []
  query.value = ''
}

function copyText(text: string) {
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '已复制', icon: 'none' }),
  })
}

function formatConvDate(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function openHistoryDrawer() {
  showHistorySheet.value = true
  loadingHistory.value = true
  const generation = authStore.getLoginGeneration()
  try {
    const list = await aiApi.listConversations()
    if (generation !== authStore.getLoginGeneration()) return
    conversations.value = list.filter(item => !item.deletedAt)
  } catch {
    uni.showToast({ title: '历史对话加载失败', icon: 'none' })
  } finally {
    loadingHistory.value = false
  }
}

async function loadConversation(conversationId: string) {
  const generation = authStore.getLoginGeneration()
  try {
    const detail = await aiApi.getConversation(conversationId)
    if (generation !== authStore.getLoginGeneration()) return
    activeStreamToken++
    currentConversationId.value = detail.id || conversationId
    messages.value = (detail.messages || [])
      .filter(m => m.role === 'USER' || m.role === 'ASSISTANT')
      .map(m => ({
        role: m.role === 'USER' ? 'user' : 'assistant',
        content: m.content || '',
      }))
    showHistorySheet.value = false
    scrollToBottom()
  } catch {
    uni.showToast({ title: '加载对话内容失败', icon: 'none' })
  }
}

async function deleteConversation(conversationId: string, baseVersion: number) {
  try {
    await aiApi.deleteConversation(conversationId, baseVersion)
    conversations.value = conversations.value.filter(item => item.id !== conversationId)
    if (currentConversationId.value === conversationId) {
      currentConversationId.value = ''
      messages.value = []
    }
    uni.showToast({ title: '已删除对话', icon: 'none' })
  } catch {
    uni.showToast({ title: '删除失败，请刷新重试', icon: 'none' })
  }
}

async function ensureConversation(): Promise<string> {
  if (currentConversationId.value) return currentConversationId.value
  const created = await aiApi.createConversation({
    title: query.value.trim().slice(0, 20) || 'AI 问答',
    baseVersion: 0,
    clientRequestId: uuidv7(),
  })
  if (!created.id) throw new Error('创建对话失败')
  currentConversationId.value = created.id
  return created.id
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
    const conversationId = await ensureConversation()
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
            : `工具调用未完成`
      },
    })
  } catch (err) {
    if (!isCurrent()) return
    if (!messages.value[aiIndex].content) {
      messages.value[aiIndex].content = err instanceof Error ? err.message : '请求失败，请稍后重试。'
    }
  } finally {
    if (isCurrent()) {
      isTyping.value = false
      scrollToBottom()
    }
  }
}

onLoad((options) => {
  if (options?.q) {
    query.value = decodeURIComponent(String(options.q))
    void nextTick(() => sendMessage())
  }
})
</script>

<style scoped>
.ai-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-primary);
}

.icon-pill-btn {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background-color: var(--color-bg-card);
  border: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
}

.chat-scroll {
  flex: 1;
  min-height: 0;
  padding: 20rpx 28rpx;
  box-sizing: border-box;
}

.welcome-state {
  min-height: 55vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  text-align: center;
  padding: 40rpx;
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

.chat-list {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
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
  max-width: 82%;
  padding: 20rpx 26rpx;
  border-radius: 28rpx 28rpx 8rpx 28rpx;
  background: var(--accent-gradient);
  color: #FFFFFF;
}

.user-text {
  font-size: var(--font-size-sm);
  line-height: 1.55;
  word-break: break-word;
}

.assistant-bubble {
  width: 100%;
  padding: 24rpx 26rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.assistant-head {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.assistant-name {
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

.typing-placeholder {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.bubble-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 10rpx;
  border-top: 1px solid var(--border-subtle);
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 8rpx 18rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-primary);
  color: var(--text-muted);
  font-size: 22rpx;
}

.bottom-anchor {
  height: 24rpx;
}

.input-dock {
  padding: 16rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
  background-color: var(--color-bg-primary);
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.input-capsule {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 10rpx 12rpx 10rpx 26rpx;
  border-radius: var(--radius-full);
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
  flex-shrink: 0;
}

.send-btn.disabled {
  opacity: 0.45;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.sheet-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.sheet-close {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background-color: var(--color-bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.history-empty {
  padding: 36rpx 0;
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.history-scroll {
  max-height: 52vh;
}

.history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 20rpx 22rpx;
  margin-bottom: 12rpx;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 20rpx;
}

.history-row.active {
  border-color: var(--border-accent);
  background-color: var(--color-sage-bg);
}

.history-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.history-title {
  font-size: var(--font-size-sm);
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

.history-delete {
  padding: 10rpx;
  flex-shrink: 0;
}
</style>
