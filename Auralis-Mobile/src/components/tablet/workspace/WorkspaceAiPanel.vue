<template>
  <view class="ai-panel zen-card">
    <view class="ai-header">
      <view class="ai-title-row">
        <LineIcon name="sparkles" size="26rpx" color="var(--color-zen-sage)" />
        <text class="ai-title">AI 伴读</text>
      </view>
      <view class="ai-header-actions">
        <view class="mini-pill" @click="toggleHistory">
          <LineIcon name="history" size="22rpx" color="var(--text-secondary)" />
          <text>历史</text>
        </view>
        <view class="mini-pill" @click="resetConversation">
          <LineIcon name="plus" size="22rpx" color="var(--text-secondary)" />
          <text>新对话</text>
        </view>
      </view>
    </view>

    <view class="scope-bar">
      <text class="scope-label">{{ scopeBadgeText }}</text>
    </view>

    <view v-if="showHistory" class="history-drawer">
      <view class="history-head">
        <text class="history-head-title">当前范围历史对话</text>
        <view class="history-close" @click="showHistory = false">
          <LineIcon name="close" size="22rpx" color="var(--text-muted)" />
        </view>
      </view>

      <scroll-view scroll-y :show-scrollbar="false" class="history-list">
        <view v-if="loadingSessions" class="history-empty">正在加载对话...</view>
        <view v-else-if="scopedConversations.length === 0" class="history-empty">当前范围暂无历史对话</view>

        <view
          v-for="item in scopedConversations"
          :key="item.id"
          class="history-row"
          :class="{ active: item.id === currentConversationId }"
          @click="item.id && selectConversation(item.id)"
        >
          <view class="history-row-main">
            <text class="history-row-title">{{ item.title || '新对话' }}</text>
            <text class="history-row-time">{{ formatShortDateTime(item.updatedAt || item.createdAt) }}</text>
          </view>
          <view
            v-if="item.id"
            class="history-row-del"
            @click.stop="deleteScopedConversation(item.id, item.version ?? 0)"
          >
            <LineIcon name="trash" size="20rpx" color="var(--text-muted)" />
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
        <text class="welcome-heading">围绕{{ isSourceScoped ? '当前资料' : '当前学科' }}提问</text>
        <text class="welcome-sub">
          {{
            isSourceScoped
              ? `优先围绕《${selectedSource?.title || '当前资料'}》展开分析与检索`
              : `在《${subjectName}》全科范围内检索已就绪资料并回答`
          }}
        </text>
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
            <text v-else class="typing-placeholder">{{ toolStatus || '正在思考...' }}</text>

            <view v-if="msg.content && !(isTyping && index === messages.length - 1)" class="bubble-actions">
              <view class="copy-btn" @click="copyText(msg.content)">
                <LineIcon name="copy" size="22rpx" color="var(--text-muted)" />
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
        placeholder="输入问题开始伴读..."
        @confirm="sendMessage"
      />
      <button
        class="send-btn"
        :disabled="isTyping || !query.trim() || !subjectId"
        @click="sendMessage"
      >
        <LineIcon name="arrow-up" size="26rpx" color="#FFFFFF" />
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

const readingContext = computed<ReadingContext>(() => {
  if (props.selectedSource && props.selectedSource.ingestionStatus === 'READY' && props.selectedSource.id) {
    return {
      subjectId: props.subjectId,
      retrievalMode: 'AUTO',
      currentSourceId: props.selectedSource.id,
    }
  }
  return {
    subjectId: props.subjectId,
    retrievalMode: 'SUBJECT',
  }
})

const scopeKey = computed(() => {
  const ctx = readingContext.value
  return `${ctx.subjectId}:${ctx.retrievalMode}:${ctx.currentSourceId || ''}`
})

const scopeBadgeText = computed(() => {
  if (isSourceScoped.value && props.selectedSource) {
    return `单资料检索 · ${props.selectedSource.title || '当前资料'}`
  }
  if (props.selectedSource) {
    return `学科全科检索（当前资料尚未就绪，未绑定单文件）`
  }
  return `学科全科检索 · ${props.subjectName}`
})

const scopedConversations = computed(() => {
  const ctx = readingContext.value
  return conversations.value.filter((item) => {
    if (item.deletedAt) return false
    if (item.chatScopeState !== 'BOUND' || !item.chatScope) return false
    if (item.chatScope.subjectId !== ctx.subjectId) return false
    if (ctx.currentSourceId) return item.chatScope.currentSourceId === ctx.currentSourceId
    return !item.chatScope.currentSourceId
  })
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
  try {
    await aiApi.deleteConversation(conversationId, baseVersion)
    conversations.value = conversations.value.filter(item => item.id !== conversationId)
    if (currentConversationId.value === conversationId) {
      resetConversation()
    }
  } catch {
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
  width: 380rpx;
  height: 100%;
  flex-shrink: 0;
  background: var(--bg-card);
  border-radius: 28rpx;
  border: 1rpx solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.ai-header {
  padding: 20rpx 22rpx 14rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10rpx;
}

.ai-title-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.ai-title {
  font-size: 27rpx;
  font-weight: 700;
  color: var(--text-primary);
}

.ai-header-actions {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.mini-pill {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  padding: 8rpx 14rpx;
  border-radius: 12rpx;
  background: var(--bg-primary);
  font-size: 21rpx;
  color: var(--text-secondary);
  cursor: pointer;
}

.scope-bar {
  margin: 0 22rpx 14rpx;
  padding: 10rpx 14rpx;
  border-radius: 12rpx;
  background: var(--color-sage-bg);
}

.scope-label {
  font-size: 21rpx;
  color: var(--color-sage-dark);
  font-weight: 600;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-drawer {
  flex: 1;
  min-height: 0;
  border-top: 1rpx solid var(--border-subtle);
  display: flex;
  flex-direction: column;
}

.history-head {
  padding: 16rpx 22rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.history-head-title {
  font-size: 23rpx;
  font-weight: 600;
  color: var(--text-secondary);
}

.history-close {
  width: 44rpx;
  height: 44rpx;
  border-radius: 12rpx;
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.history-list {
  flex: 1;
  min-height: 0;
  padding: 0 18rpx 18rpx;
  box-sizing: border-box;
}

.history-empty {
  padding: 48rpx 16rpx;
  text-align: center;
  font-size: 23rpx;
  color: var(--text-muted);
}

.history-row {
  padding: 16rpx;
  border-radius: 16rpx;
  background: var(--bg-primary);
  margin-bottom: 10rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10rpx;
  border: 1rpx solid transparent;
  cursor: pointer;
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
  gap: 4rpx;
}

.history-row-title {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-row-time {
  font-size: 20rpx;
  color: var(--text-muted);
}

.history-row-del {
  width: 40rpx;
  height: 40rpx;
  border-radius: 10rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.chat-scroll {
  flex: 1;
  min-height: 0;
  padding: 12rpx 20rpx;
  box-sizing: border-box;
  border-top: 1rpx solid var(--border-subtle);
}

.chat-welcome {
  padding: 40rpx 12rpx;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.welcome-heading {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--text-primary);
}

.welcome-sub {
  font-size: 23rpx;
  color: var(--text-muted);
  line-height: 1.5;
}

.quick-prompts {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  margin-top: 10rpx;
}

.prompt-pill {
  padding: 14rpx 18rpx;
  border-radius: 16rpx;
  background: var(--bg-primary);
  border: 1rpx solid var(--border-subtle);
  font-size: 23rpx;
  color: var(--text-secondary);
  cursor: pointer;
}

.chat-messages {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
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
  padding: 16rpx 20rpx;
  border-radius: 20rpx 20rpx 6rpx 20rpx;
  background: var(--accent-gradient);
  color: #FFFFFF;
  font-size: 24rpx;
  line-height: 1.5;
}

.assistant-bubble {
  width: 100%;
  padding: 18rpx 20rpx;
  border-radius: 20rpx;
  background: var(--bg-primary);
  box-sizing: border-box;
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--text-primary);
}

.typing-placeholder {
  color: var(--text-muted);
  font-size: 23rpx;
}

.bubble-actions {
  margin-top: 12rpx;
  padding-top: 10rpx;
  border-top: 1rpx solid var(--border-subtle);
  display: flex;
  justify-content: flex-end;
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  font-size: 21rpx;
  color: var(--text-muted);
  cursor: pointer;
}

.tool-status-bar {
  padding: 8rpx 14rpx;
  border-radius: 12rpx;
  background: var(--color-sage-bg);
  color: var(--color-sage-dark);
  font-size: 21rpx;
}

.scroll-anchor {
  height: 4rpx;
}

.composer-box {
  padding: 16rpx 20rpx;
  border-top: 1rpx solid var(--border-subtle);
  display: flex;
  align-items: flex-end;
  gap: 12rpx;
  background: var(--bg-card);
}

.composer-input {
  flex: 1;
  min-height: 64rpx;
  max-height: 160rpx;
  padding: 14rpx 18rpx;
  border-radius: 18rpx;
  background: var(--bg-primary);
  font-size: 24rpx;
  color: var(--text-primary);
  box-sizing: border-box;
}

.send-btn {
  width: 68rpx;
  height: 68rpx;
  border-radius: 18rpx;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  flex-shrink: 0;
}

.send-btn::after {
  border: none;
}

.send-btn[disabled] {
  opacity: 0.45;
}
</style>
