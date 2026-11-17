<template>
  <view class="ai-panel zen-card">
    <view class="ai-header">
      <view class="ai-title-row">
        <LineIcon name="sparkles" size="15px" color="var(--color-zen-sage)" />
        <text class="ai-title">AI 伴读</text>
        <text class="ui-tag sage scope-pill">{{ scopeBadgeText }}</text>
      </view>
      <view class="ai-header-actions">
        <view class="ui-icon-btn sm" @click="toggleHistory">
          <LineIcon name="history" size="14px" color="var(--text-secondary)" />
        </view>
        <view class="ui-icon-btn sm" @click="resetConversation">
          <LineIcon name="plus" size="14px" color="var(--text-secondary)" />
        </view>
      </view>
    </view>

    <view v-if="showHistory" class="history-drawer">
      <view class="history-head">
        <text class="history-head-title">历史对话</text>
        <view class="ui-icon-btn sm" @click="showHistory = false">
          <LineIcon name="close" size="13px" color="var(--text-muted)" />
        </view>
      </view>

      <scroll-view scroll-y :show-scrollbar="false" class="history-list">
        <view v-if="loadingSessions" class="history-empty">加载中...</view>
        <view v-else-if="scopedConversations.length === 0" class="history-empty">暂无历史对话</view>

        <view
          v-for="item in scopedConversations"
          :key="item.id"
          class="history-row"
          :class="{ active: item.id === currentConversationId }"
          @click="item.id && selectConversation(item.id)"
        >
          <view class="history-row-main">
            <text class="history-row-title">{{ item.title || '新对话' }}</text>
            <text class="history-row-time num-tabular">{{ formatShortDateTime(item.updatedAt || item.createdAt) }}</text>
          </view>
          <view
            v-if="item.id"
            class="history-row-del"
            @click.stop="deleteScopedConversation(item.id, item.version ?? 0)"
          >
            <LineIcon name="trash" size="13px" color="var(--text-muted)" />
          </view>
        </view>
      </scroll-view>
    </view>

    <scroll-view
      v-else
      scroll-y
      :show-scrollbar="false"
      class="chat-scroll"
      :scroll-into-view="scrollTargetId"
    >
      <view v-if="messages.length === 0" class="chat-welcome">
        <view class="quick-prompts">
          <view
            v-for="prompt in quickPrompts"
            :key="prompt"
            class="prompt-pill"
            @click="query = prompt; sendMessage()"
          >
            <text>{{ prompt }}</text>
          </view>
        </view>
      </view>

      <view v-else class="chat-messages">
        <view
          v-for="(msg, index) in messages"
          :key="index"
          class="msg-row"
          :class="msg.role"
        >
          <view v-if="msg.role === 'user'" class="user-bubble">
            <text>{{ msg.content }}</text>
          </view>

          <view v-else class="assistant-bubble">
            <MarkdownText v-if="msg.content" :content="msg.content" />
            <text v-else class="typing-placeholder">{{ toolStatus || '思考中...' }}</text>

            <view v-if="msg.content && !(isTyping && index === messages.length - 1)" class="bubble-actions">
              <view class="copy-btn" @click="copyText(msg.content)">
                <LineIcon name="copy" size="12px" color="var(--text-muted)" />
                <text>复制</text>
              </view>
            </view>
          </view>
        </view>

        <view v-if="isTyping && toolStatus" class="tool-status-bar">
          <text>{{ toolStatus }}</text>
        </view>
        <view :id="anchorId" class="scroll-anchor"></view>
      </view>
    </scroll-view>

    <view class="composer-box">
      <textarea
        v-model="query"
        class="composer-input"
        :maxlength="2000"
        auto-height
        placeholder="提问"
        @confirm="sendMessage"
      />
      <button
        class="send-btn"
        :disabled="isTyping || !query.trim() || !subjectId"
        @click="sendMessage"
      >
        <LineIcon name="arrow-up" size="15px" color="#FFFFFF" />
      </button>
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

const scopeBadgeText = computed(() => {
  if (isSourceScoped.value && props.selectedSource) {
    return props.selectedSource.title || '当前资料'
  }
  return '全科'
})

const scopedConversations = computed(() => {
  const ctx = readingContext.value
  return conversations.value.filter(item => doesConversationMatchWorkspaceScope(item, ctx))
})

const quickPrompts = computed(() => (
  isSourceScoped.value
    ? ['提炼这篇资料的核心框架', '列出关键概念与易错点', '出 3 道自测练习题']
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
  if (event.phase === 'started') return `正在调用工具：${event.name}...`
  if (event.phase === 'error') return `工具调用失败：${event.name}`
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
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
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
  max-width: 112px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
}

.history-head-title {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
}

.history-list {
  flex: 1;
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
  background: var(--bg-primary);
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
}

.chat-scroll {
  flex: 1;
  min-height: 0;
  padding: 14px;
  box-sizing: border-box;
}

.chat-welcome {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 16px 0;
}

.quick-prompts {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prompt-pill {
  padding: 10px 13px;
  border-radius: 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
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

.chat-messages {
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
  padding: 10px 13px;
  border-radius: 14px 14px 4px 14px;
  background: var(--accent-gradient);
  color: #FFFFFF;
  font-size: var(--text-sm);
  line-height: 1.5;
}

.assistant-bubble {
  width: 100%;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--bg-primary);
  box-sizing: border-box;
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--text-primary);
}

.typing-placeholder {
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.bubble-actions {
  margin-top: 8px;
  padding-top: 7px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  justify-content: flex-end;
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-2xs);
  color: var(--text-muted);
  cursor: pointer;
}

.copy-btn:hover {
  color: var(--text-primary);
}

.tool-status-bar {
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--color-sage-bg);
  color: var(--color-sage-dark);
  font-size: var(--text-2xs);
  font-weight: 500;
}

.scroll-anchor {
  height: 2px;
}

.composer-box {
  padding: 10px 12px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--bg-card);
}

.composer-input {
  flex: 1;
  min-height: 36px;
  max-height: 112px;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  font-size: var(--text-sm);
  color: var(--text-primary);
  box-sizing: border-box;
}

.composer-input:focus {
  border-color: var(--color-zen-sage);
}

.send-btn {
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  flex-shrink: 0;
  transition: transform 0.14s var(--ease-out), opacity 0.14s var(--ease-out);
}

.send-btn:active {
  transform: scale(0.95);
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
    height: 320px;
  }
}
</style>
