<template>
  <AppPageLayout anim-origin="bottom-right" :show-tab-bar="false">
    <view class="ai-page">
      <AppHeader title="AI" show-back back-url="/pages/mobile/home/index">
        <template #right>
          <view class="ui-icon-btn" role="button" aria-label="历史对话" @click="openHistoryDrawer">
            <LineIcon name="history" size="17px" color="var(--text-primary)" />
          </view>
          <view class="ui-icon-btn" role="button" aria-label="新对话" @click="startNewChat">
            <LineIcon name="plus" size="17px" color="var(--text-primary)" />
          </view>
        </template>
      </AppHeader>

      <view v-if="messages.length === 0" class="welcome-state">
        <BrandLogo size="42px" />
        <view class="starter-pills">
          <view
            v-for="prompt in starterPrompts"
            :key="prompt"
            class="starter-pill zen-card"
            role="button"
            @click="query = prompt; sendMessage()"
          >
            <text>{{ prompt }}</text>
          </view>
        </view>
      </view>

      <scroll-view
        v-else
        scroll-y
        :show-scrollbar="false"
        class="chat-scroll"
        :scroll-into-view="scrollTargetId"
      >
        <view class="chat-list">
          <view
            v-for="(msg, idx) in messages"
            :key="idx"
            class="chat-row"
            :class="msg.role"
          >
            <view v-if="msg.role === 'user'" class="user-bubble zen-chat-user-bubble">
              <text class="user-text">{{ msg.content }}</text>
            </view>

            <view v-else class="assistant-bubble zen-chat-assistant-bubble">
              <view v-if="msg.toolHint" class="tool-pill">
                <text>{{ msg.toolHint }}</text>
              </view>

              <MarkdownText v-if="msg.content" :content="msg.content" />
              <view v-else-if="isTyping" class="zen-typing-dots" aria-label="思考中">
                <view class="zen-typing-dot"></view>
                <view class="zen-typing-dot"></view>
                <view class="zen-typing-dot"></view>
              </view>

              <view v-if="msg.content && !(isTyping && idx === messages.length - 1)" class="bubble-footer">
                <view class="copy-btn" role="button" aria-label="复制回答" @click="copyText(msg.content)">
                  <LineIcon name="copy" size="13px" color="var(--text-muted)" />
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
            placeholder="提问…"
            confirm-type="send"
            :disabled="isTyping"
            @confirm="sendMessage"
          />
          <view
            class="send-btn"
            :class="{ disabled: !query.trim() || isTyping }"
            role="button"
            aria-label="发送"
            @click="sendMessage"
          >
            <LineIcon name="arrow-up" size="17px" color="#FFFFFF" />
          </view>
        </view>
      </view>
    </view>

    <template #overlay>
      <view v-if="showHistorySheet" class="zen-sheet-mask" @click="showHistorySheet = false">
        <view class="zen-sheet-body" @click.stop>
          <view class="sheet-header">
            <text class="sheet-title">历史对话</text>
            <view class="ui-icon-btn" role="button" aria-label="关闭" @click="showHistorySheet = false">
              <LineIcon name="close" size="16px" color="var(--text-muted)" />
            </view>
          </view>

          <view v-if="loadingHistory" class="history-empty">加载中…</view>
          <view v-else-if="conversations.length === 0" class="history-empty">暂无历史对话</view>
          <scroll-view v-else scroll-y :show-scrollbar="false" class="history-scroll">
            <view
              v-for="conv in conversations"
              :key="conv.id"
              class="history-row"
              :class="{ active: conv.id === currentConversationId }"
              role="button"
              @click="conv.id && loadConversation(conv.id)"
            >
              <view class="history-meta">
                <text class="history-title">{{ conv.title || '新对话' }}</text>
                <text class="history-time num-tabular">{{ formatConvDate(conv.updatedAt || conv.createdAt) }}</text>
              </view>
              <view
                v-if="conv.id"
                class="history-delete"
                role="button"
                aria-label="删除对话"
                @click.stop="deleteConversation(conv.id, conv.version ?? 0)"
              >
                <LineIcon name="trash" size="14px" color="var(--text-muted)" />
              </view>
            </view>
          </scroll-view>
        </view>
      </view>
    </template>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { aiApi, type ConversationView } from '@/api/aiApi'
import { chatWithAI } from '@/api/aiClient'
import AppHeader from '@/components/AppHeader.vue'
import AppPageLayout from '@/components/AppPageLayout.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import LineIcon from '@/components/LineIcon.vue'
import MarkdownText from '@/components/MarkdownText.vue'
import { useEscapeKey } from '@/composables/useEscapeKey'
import { useAuthStore } from '@/store/useAuthStore'
import { uuidv7 } from '@/utils/uuid'

interface ChatMessageItem {
  role: 'user' | 'assistant'
  content: string
  toolHint?: string
}

const authStore = useAuthStore()

const query = ref('')
const messages = ref<ChatMessageItem[]>([])
const currentConversationId = ref('')
const isTyping = ref(false)
const scrollTargetId = ref('')
const anchorId = 'chat-bottom-anchor'

const showHistorySheet = ref(false)
const loadingHistory = ref(false)
const conversations = ref<ConversationView[]>([])
useEscapeKey(() => showHistorySheet.value, () => {
  showHistorySheet.value = false
})

let activeStreamToken = 0

const starterPrompts = [
  '梳理本周待复习重点',
  '对比易混淆概念',
  '生成 3 道自测练习题',
]

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
    uni.showToast({ title: '加载失败', icon: 'none' })
  } finally {
    loadingHistory.value = false
  }
}

async function loadConversation(conversationId: string) {
  if (isTyping.value) return
  const generation = authStore.getLoginGeneration()
  try {
    const detail = await aiApi.getConversation(conversationId)
    if (generation !== authStore.getLoginGeneration()) return
    activeStreamToken++
    isTyping.value = false
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
    if (generation !== authStore.getLoginGeneration()) return
    uni.showToast({ title: '加载失败', icon: 'none' })
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
      activeStreamToken++
      isTyping.value = false
      currentConversationId.value = ''
      messages.value = []
    }
    uni.showToast({ title: '已删除', icon: 'none' })
  } catch {
    if (generation !== authStore.getLoginGeneration()) return
    uni.showToast({ title: '删除失败', icon: 'none' })
  }
}

async function ensureConversation(seedTitle: string, generation: symbol): Promise<string> {
  if (currentConversationId.value) return currentConversationId.value
  const created = await aiApi.createConversation({
    title: seedTitle.slice(0, 20) || 'AI 问答',
    baseVersion: 0,
    clientRequestId: uuidv7(),
  })
  if (generation !== authStore.getLoginGeneration()) {
    throw new Error('登录状态已变化，请重试')
  }
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
          ? '检索资料中…'
          : ev.phase === 'completed'
            ? ''
            : '检索未完成'
      },
    })
  } catch (err) {
    if (!isCurrent()) return
    if (!query.value.trim()) {
      query.value = text
    }
    if (!messages.value[aiIndex].content) {
      messages.value[aiIndex].content = err instanceof Error ? err.message : '请求失败'
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

.welcome-state {
  flex: 1;
  min-height: 0;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  box-sizing: border-box;
}

.starter-pills {
  width: 100%;
  max-width: 300px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.starter-pill {
  padding: 12px 16px;
  border-radius: 14px;
  font-size: 13.5px;
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  text-align: center;
  cursor: pointer;
  transition: border-color 0.16s ease, transform 0.14s ease;
}

.starter-pill:hover {
  border-color: var(--border-accent);
}

.starter-pill:active {
  transform: scale(0.98);
}

.chat-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.chat-list {
  padding: 12px 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
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
}

.user-text {
  font-size: 14.5px;
  line-height: 1.5;
  color: #FFFFFF;
  word-break: break-word;
}

.assistant-bubble {
  padding: 14px 16px;
}

.tool-pill {
  display: inline-block;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-size: var(--text-2xs);
  font-weight: var(--font-weight-medium);
  margin-bottom: 8px;
}

.bubble-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 6px;
}

.copy-btn {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0.72;
  transition: opacity 0.14s ease, background-color 0.14s ease;
}

.copy-btn:hover {
  opacity: 1;
  background-color: rgba(28, 28, 26, 0.05);
}

.bottom-anchor {
  height: 12px;
}

.input-dock {
  padding: 8px 18px calc(16px + env(safe-area-inset-bottom));
  background-color: var(--color-bg-primary);
  flex-shrink: 0;
}

.input-capsule {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 6px 6px 16px;
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-md);
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

/* #ifdef H5 */
.input-capsule:focus-within {
  border-color: var(--color-zen-sage);
  background-color: #FFFFFF;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.16);
}
/* #endif */

.chat-input {
  flex: 1;
  min-width: 0;
  height: 36px;
  font-size: 14.5px;
  color: var(--text-primary);
}

.send-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.14s ease, opacity 0.14s ease;
}

.send-btn:active {
  transform: scale(0.92);
}

.send-btn.disabled {
  opacity: 0.4;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.sheet-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.history-empty {
  padding: 28px 0;
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
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  margin-bottom: 8px;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
}

.history-row.active {
  background-color: var(--color-sage-bg);
  border-color: var(--border-accent);
}

.history-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.history-title {
  font-size: 13.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-time {
  font-size: 11px;
  color: var(--text-muted);
}

.history-delete {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
</style>
