<template>
  <view class="ai-panel zen-panel">
    <view class="ai-header">
      <view class="ai-title-row">
        <LineIcon name="sparkles" size="15px" color="var(--color-sage-ink)" />
        <text class="ai-title">AI 伴读</text>
        <text v-if="isSourceScoped && selectedSource?.title" class="ui-tag sage scope-pill">
          {{ selectedSource.title }}
        </text>
      </view>
      <view class="ai-header-actions">
        <view class="ui-icon-btn sm" role="button" aria-label="历史对话" @click="toggleHistory">
          <LineIcon name="history" size="14px" color="var(--text-secondary)" />
        </view>
        <view class="ui-icon-btn sm" role="button" aria-label="新对话" @click="resetConversation">
          <LineIcon name="plus" size="14px" color="var(--text-secondary)" />
        </view>
      </view>
    </view>

    <view v-if="showHistory" class="history-drawer">
      <view class="history-head">
        <text class="history-head-title">历史对话</text>
        <view class="ui-icon-btn sm" role="button" aria-label="关闭历史" @click="showHistory = false">
          <LineIcon name="close" size="13px" color="var(--text-muted)" />
        </view>
      </view>

      <scroll-view scroll-y :show-scrollbar="false" class="history-list">
        <view v-if="loadingSessions" class="history-empty">加载中…</view>
        <view v-else-if="scopedConversations.length === 0" class="history-empty">暂无历史对话</view>

        <view
          v-for="item in scopedConversations"
          :key="item.id"
          class="history-row"
          :class="{ active: item.id === currentConversationId }"
          role="button"
          @click="item.id && selectConversation(item.id)"
        >
          <view class="history-row-main">
            <text class="history-row-title">{{ item.title || '新对话' }}</text>
            <text class="history-row-time num-tabular">{{ formatShortDateTime(item.updatedAt || item.createdAt) }}</text>
          </view>
          <view
            v-if="item.id"
            class="history-row-del"
            role="button"
            aria-label="删除对话"
            @click.stop="deleteScopedConversation(item.id, item.version ?? 0)"
          >
            <LineIcon name="trash" size="13px" color="var(--text-muted)" />
          </view>
        </view>
      </scroll-view>
    </view>

    <view v-else-if="messages.length === 0" class="chat-welcome">
      <view class="welcome-emblem">
        <LineIcon name="sparkles" size="20px" color="var(--color-sage-ink)" />
      </view>
      <view class="quick-prompts">
        <view
          v-for="prompt in quickPrompts"
          :key="prompt"
          class="prompt-pill zen-card"
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
      <view class="chat-messages">
        <view
          v-for="(msg, index) in messages"
          :key="index"
          class="msg-row"
          :class="msg.role"
        >
          <view v-if="msg.role === 'user'" class="user-bubble zen-chat-user-bubble">
            <text>{{ msg.content }}</text>
          </view>

          <view v-else class="assistant-bubble zen-chat-assistant-bubble">
            <view v-if="isTyping && index === messages.length - 1 && toolStatus" class="tool-pill">
              <text>{{ toolStatus }}</text>
            </view>

            <MarkdownText v-if="msg.content" :content="msg.content" />
            <view v-else class="zen-typing-dots" aria-label="思考中">
              <view class="zen-typing-dot"></view>
              <view class="zen-typing-dot"></view>
              <view class="zen-typing-dot"></view>
            </view>

            <view v-if="msg.content && !(isTyping && index === messages.length - 1)" class="bubble-actions">
              <view class="copy-btn" role="button" aria-label="复制回答" @click="copyText(msg.content)">
                <LineIcon name="copy" size="13px" color="var(--text-muted)" />
              </view>
            </view>
          </view>
        </view>

        <view :id="anchorId" class="scroll-anchor"></view>
      </view>
    </scroll-view>

    <view class="composer-box">
      <view class="input-capsule">
        <textarea
          v-model="query"
          class="composer-input"
          :maxlength="2000"
          auto-height
          placeholder="提问…"
          @confirm="sendMessage"
        />
        <button
          class="send-btn"
          :disabled="isTyping || !query.trim() || !subjectId"
          aria-label="发送"
          @click="sendMessage"
        >
          <LineIcon name="arrow-up" size="15px" color="#FFFFFF" />
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import MarkdownText from '@/components/MarkdownText.vue'
import { aiApi, type ConversationView } from '@/api/aiApi'
import { chatWithAI, type ChatToolEvent, type ReadingContext } from '@/api/aiClient'
import { ApiProblemError } from '@/api/protocol'
import type { SourceView } from '@/api/sourceApi'
import { useAuthStore } from '@/store/useAuthStore'
import { formatShortDateTime } from '@/utils/sourceFormat'
import { uuidv7 } from '@/utils/uuid'
import {
  buildWorkspaceReadingContext,
  doesConversationMatchWorkspaceScope,
} from '@/utils/workspaceChatScope'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const props = defineProps<{
  subjectId: string
  subjectName: string
  selectedSource: SourceView | null
}>()

const authStore = useAuthStore()
const conversations = ref<ConversationView[]>([])
const loadingSessions = ref(false)
const showHistory = ref(false)
const currentConversationId = ref('')
const messages = ref<ChatMessage[]>([])
const query = ref('')
const isTyping = ref(false)
const toolStatus = ref('')
const scrollTargetId = ref('')
const anchorId = 'workspace-ai-bottom'

let activeStreamToken = 0

const isSourceScoped = computed(() => Boolean(props.selectedSource && props.selectedSource.ingestionStatus === 'READY'))

const readingContext = computed<ReadingContext>(() => buildWorkspaceReadingContext(props.subjectId, props.selectedSource))

const scopeKey = computed(() => {
  const ctx = readingContext.value
  return `${ctx.subjectId}:${ctx.retrievalMode}:${ctx.currentSourceId || ''}`
})

const scopedConversations = computed(() => {
  const ctx = readingContext.value
  return conversations.value.filter(item => doesConversationMatchWorkspaceScope(item, ctx))
})

const quickPrompts = computed(() => (
  isSourceScoped.value
    ? ['提炼核心框架', '列出关键概念与易错点', '生成 3 道自测练习题']
    : [`梳理《${props.subjectName}》重点脉络`, '整理高频复习考点', '对比关键概念异同']
))

function scrollToBottom() {
  nextTick(() => {
    scrollTargetId.value = anchorId
    setTimeout(() => {
      scrollTargetId.value = ''
    }, 80)
  })
}

async function loadScopedHistory() {
  const generation = authStore.getLoginGeneration()
  const capturedScope = scopeKey.value
  loadingSessions.value = true
  try {
    const list = await aiApi.listConversations()
    if (generation !== authStore.getLoginGeneration() || capturedScope !== scopeKey.value) return
    conversations.value = list.filter(item => !item.deletedAt)
  } catch {
    // Keep silent if offline
  } finally {
    if (capturedScope === scopeKey.value) {
      loadingSessions.value = false
    }
  }
}

function resetConversation() {
  activeStreamToken++
  isTyping.value = false
  currentConversationId.value = ''
  messages.value = []
  toolStatus.value = ''
  showHistory.value = false
}

watch(scopeKey, () => {
  resetConversation()
  if (props.subjectId) {
    void loadScopedHistory()
  }
}, { immediate: true })

function toggleHistory() {
  showHistory.value = !showHistory.value
  if (showHistory.value) {
    void loadScopedHistory()
  }
}

async function selectConversation(conversationId: string) {
  if (isTyping.value) return
  const generation = authStore.getLoginGeneration()
  const capturedScope = scopeKey.value
  try {
    const detail = await aiApi.getConversation(conversationId)
    if (generation !== authStore.getLoginGeneration() || capturedScope !== scopeKey.value) return
    activeStreamToken++
    currentConversationId.value = detail.id || conversationId
    messages.value = (detail.messages || [])
      .filter(m => m.role === 'USER' || m.role === 'ASSISTANT')
      .map(m => ({
        role: m.role === 'USER' ? 'user' : 'assistant',
        content: m.content || '',
      }))
    showHistory.value = false
    scrollToBottom()
  } catch {
    uni.showToast({ title: '加载对话失败', icon: 'none' })
  }
}

async function deleteScopedConversation(conversationId: string, baseVersion: number) {
  if (isTyping.value && currentConversationId.value === conversationId) return
  const generation = authStore.getLoginGeneration()
  const capturedScope = scopeKey.value
  try {
    await aiApi.deleteConversation(conversationId, baseVersion)
    if (generation !== authStore.getLoginGeneration() || capturedScope !== scopeKey.value) return
    conversations.value = conversations.value.filter(item => item.id !== conversationId)
    if (currentConversationId.value === conversationId) {
      resetConversation()
    }
  } catch {
    if (generation !== authStore.getLoginGeneration() || capturedScope !== scopeKey.value) return
    uni.showToast({ title: '删除失败，请刷新重试', icon: 'none' })
  }
}

function formatToolLabel(event: ChatToolEvent): string {
  if (event.phase === 'started') return '检索资料中…'
  if (event.phase === 'error') return '检索未完成'
  return ''
}

function copyText(text: string) {
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '已复制', icon: 'none' }),
  })
}

async function ensureConversation(seedTitle: string, generation: symbol, capturedScope: string): Promise<string> {
  if (currentConversationId.value) return currentConversationId.value
  const created = await aiApi.createConversation({
    title: seedTitle.slice(0, 24) || 'AI 伴读',
    baseVersion: 0,
    clientRequestId: uuidv7(),
  })
  if (generation !== authStore.getLoginGeneration() || capturedScope !== scopeKey.value) {
    throw new Error('作用域已切换，请重试')
  }
  if (!created.id) throw new Error('创建对话失败')
  currentConversationId.value = created.id
  conversations.value = [created, ...conversations.value.filter(item => item.id !== created.id)]
  return created.id
}

async function sendMessage() {
  const text = query.value.trim()
  if (!text || isTyping.value || !props.subjectId) return

  const generation = authStore.getLoginGeneration()
  const capturedScope = scopeKey.value
  const capturedContext = readingContext.value
  const streamToken = ++activeStreamToken

  query.value = ''
  toolStatus.value = ''
  messages.value.push({ role: 'user', content: text })
  messages.value.push({ role: 'assistant', content: '' })
  const assistantIndex = messages.value.length - 1
  isTyping.value = true
  scrollToBottom()

  try {
    const conversationId = await ensureConversation(text, generation, capturedScope)
    await chatWithAI(
      text,
      [],
      (delta) => {
        if (
          streamToken !== activeStreamToken
          || generation !== authStore.getLoginGeneration()
          || capturedScope !== scopeKey.value
        ) return
        messages.value[assistantIndex].content += delta
        scrollToBottom()
      },
      conversationId,
      {
        readingContext: capturedContext,
        onToolEvent: (event) => {
          if (streamToken === activeStreamToken && capturedScope === scopeKey.value) {
            toolStatus.value = formatToolLabel(event)
          }
        },
      },
    )
  } catch (error) {
    if (
      streamToken === activeStreamToken
      && generation === authStore.getLoginGeneration()
      && capturedScope === scopeKey.value
    ) {
      if (!query.value.trim()) {
        query.value = text
      }
      const msg = error instanceof ApiProblemError && error.code === 'CHAT_SCOPE_CONFLICT'
        ? '当前会话作用域已发生变化，请点击右上角“新对话”后重新提问。'
        : (error instanceof Error && error.message ? error.message : '回复生成失败，请重试。')
      if (!messages.value[assistantIndex].content) {
        messages.value[assistantIndex].content = msg
      }
    }
  } finally {
    if (streamToken === activeStreamToken) {
      isTyping.value = false
      toolStatus.value = ''
    }
  }
}
</script>

<style scoped>
.ai-panel {
  width: 320px;
  height: 100%;
  flex-shrink: 0;
  border-radius: var(--radius-card);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.ai-header {
  height: 54px;
  padding: 0 14px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  box-sizing: border-box;
}

.ai-title-row {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
}

.ai-title {
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--text-primary);
  flex-shrink: 0;
}

.scope-pill {
  display: inline-block;
  max-width: 112px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.ai-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.history-drawer {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.history-head {
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.history-head-title {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
}

.history-list {
  flex: 1;
  height: 0;
  min-height: 0;
  padding: 0 10px 10px;
  box-sizing: border-box;
}

.history-empty {
  padding: 36px 12px;
  text-align: center;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.history-row {
  padding: 10px 11px;
  border-radius: 12px;
  background: var(--color-bg-tertiary);
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background-color 0.14s var(--ease-out), border-color 0.14s var(--ease-out);
}

.history-row.active {
  background: var(--color-sage-bg);
  border-color: var(--border-accent);
}

.history-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.history-row-title {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-row-time {
  font-size: var(--text-2xs);
  color: var(--text-muted);
}

.history-row-del {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0.72;
}

.history-row-del:hover {
  opacity: 1;
  background: var(--color-danger-bg);
}

.chat-welcome {
  flex: 1;
  min-height: 0;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 18px;
  box-sizing: border-box;
}

.welcome-emblem {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background-color: var(--color-sage-bg);
  border: 1px solid var(--border-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: center;
}

.quick-prompts {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prompt-pill {
  padding: 11px 14px;
  border-radius: 12px;
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: border-color 0.14s var(--ease-out), color 0.14s var(--ease-out), transform 0.14s var(--ease-out);
}

.prompt-pill:hover {
  border-color: var(--border-accent);
  color: var(--text-primary);
  transform: translateY(-1px);
}

.chat-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.chat-messages {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.msg-row {
  display: flex;
  flex-direction: column;
}

.msg-row.user {
  align-items: flex-end;
}

.msg-row.assistant {
  align-items: flex-start;
}

.user-bubble {
  max-width: 86%;
  font-size: var(--text-sm);
}

.assistant-bubble {
  padding: 12px 14px;
  font-size: var(--text-sm);
}

.tool-pill {
  display: inline-block;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  background: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-size: var(--text-2xs);
  font-weight: 500;
  margin-bottom: 8px;
}

.bubble-actions {
  margin-top: 6px;
  display: flex;
  justify-content: flex-end;
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

.scroll-anchor {
  height: 2px;
}

.composer-box {
  padding: 10px 12px 12px;
  background: var(--color-bg-primary);
  flex-shrink: 0;
}

.input-capsule {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 6px 6px 6px 14px;
  border-radius: 20px;
  background: var(--glass-surface-strong);
  backdrop-filter: var(--glass-blur-soft);
  -webkit-backdrop-filter: var(--glass-blur-soft);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow-subtle);
  transition: border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;
}

/* #ifdef H5 */
.input-capsule:focus-within {
  border-color: var(--color-zen-sage);
  background: #FFFFFF;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.16);
}
/* #endif */

.composer-input {
  flex: 1;
  min-width: 0;
  min-height: 22px;
  max-height: 96px;
  padding: 6px 0;
  font-size: var(--text-sm);
  line-height: 1.45;
  color: var(--text-primary);
  background: transparent;
  box-sizing: border-box;
}

.send-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.14s var(--ease-out), opacity 0.14s var(--ease-out);
}

.send-btn:active {
  transform: scale(0.92);
}

.send-btn[disabled] {
  opacity: 0.4;
}

@media (max-width: 1180px) {
  .ai-panel {
    width: 288px;
  }
}

@media (max-width: 900px) {
  .ai-panel {
    width: 100%;
    height: 360px;
  }

  .chat-scroll {
    flex: 1;
    height: 0;
  }
}
</style>
