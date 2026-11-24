<template>
  <view class="ai-panel zen-panel" :class="{ 'is-floating': floating }">
    <view
      class="ai-header"
      :class="{ 'is-draggable': floating && !expanded }"
      @mousedown="onHeaderMouseDown"
      @touchstart="onHeaderTouchStart"
    >
      <view class="ai-title-row">
        <LineIcon name="sparkles" size="15px" color="var(--color-sage-ink)" />
        <text class="ai-title">AI 伴读</text>
        <text v-if="isSourceScoped && selectedSource?.title" class="ui-tag sage scope-pill">
          {{ selectedSource.title }}
        </text>
      </view>
      <view class="ai-header-actions" @mousedown.stop @touchstart.stop>
        <view class="ui-icon-btn sm" role="button" aria-label="历史对话" @click="toggleHistory">
          <LineIcon name="history" size="14px" color="var(--text-secondary)" />
        </view>
        <view class="ui-icon-btn sm" role="button" aria-label="新对话" @click="resetConversation">
          <LineIcon name="plus" size="14px" color="var(--text-secondary)" />
        </view>
        <view
          v-if="floating"
          class="ui-icon-btn sm"
          role="button"
          :aria-label="expanded ? '还原浮窗' : '放大浮窗'"
          @click="emit('toggle-expand')"
        >
          <LineIcon :name="expanded ? 'minimize' : 'maximize'" size="14px" color="var(--text-secondary)" />
        </view>
        <view
          v-if="floating"
          class="ui-icon-btn sm"
          role="button"
          aria-label="收起 AI 伴读"
          @click="emit('close')"
        >
          <LineIcon name="close" size="14px" color="var(--text-secondary)" />
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
      <view v-if="preSendError" class="pre-send-error" role="alert">
        <LineIcon name="alert" size="13px" color="var(--color-danger)" />
        <text class="pre-send-error-text">{{ preSendError }}</text>
      </view>
      <view class="quick-prompts">
        <view
          v-for="prompt in quickPrompts"
          :key="prompt"
          class="prompt-pill zen-card"
          role="button"
          @click="submitStarterPrompt(prompt)"
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
      @scroll="handleChatScroll"
      @wheel="handleChatWheel"
      @touchstart="handleChatTouchStart"
      @touchmove="handleChatTouchMove"
    >
      <view class="chat-messages">
        <view v-if="isConversationUnsupported" class="unsupported-banner">
          <text class="unsupported-banner-text">旧版对话仅供查看，请点击右上角开启新对话</text>
        </view>

        <view
          v-for="(msg, index) in messages"
          :key="msg.id"
          class="msg-row"
          :class="msg.role"
        >
          <view v-if="msg.role === 'user'" class="user-bubble zen-chat-user-bubble">
            <text class="user-text">{{ msg.content }}</text>
          </view>

          <view v-else class="assistant-bubble zen-chat-assistant-bubble">
            <MobileChatProcessArea
              :reasoning="msg.reasoningText"
              :tools="msg.tools"
              :timeline="msg.processTimeline"
              :streaming="msg.status === 'streaming'"
              :has-content="hasVisibleAssistantContent(msg)"
              :expanded="msg.processExpanded"
              :error-highlight="hasFailedToolWithoutAnswer(msg)"
              @toggle="toggleProcess(index)"
              @progress="handleStreamingTextProgress"
            />

            <MobileChatPartList
              v-if="hasVisibleAssistantContent(msg)"
              :parts="msg.parts"
              :fallback-text="msg.content"
              :streaming="msg.status === 'streaming'"
              :settling="Boolean(msg.animateOnMount && msg.status === 'completed')"
              :busy="isTyping || isStopping"
              :read-only="isConversationUnsupported"
              @submit="handleSubmitActivity"
              @drain-change="(draining) => setMessageDraining(msg.id, draining)"
              @text-progress="handleStreamingTextProgress"
            />

            <view v-if="msg.status === 'failed'" class="assistant-error-banner" role="alert">
              <LineIcon name="alert" size="13px" color="var(--color-danger)" />
              <text class="assistant-error-text">{{ msg.errorMessage || '回复生成失败，请重试。' }}</text>
            </view>

            <text
              v-else-if="msg.status === 'cancelled' && !hasVisibleAssistantContent(msg)"
              class="assistant-status-note"
            >
              已停止生成
            </text>

            <view
              v-if="msg.status !== 'streaming' && !drainingMessageIds[msg.id] && (hasCopyableContent(msg) || msg.status === 'failed' || msg.status === 'cancelled')"
              class="assistant-footer"
            >
              <view
                v-if="hasCopyableContent(msg)"
                class="footer-action-chip"
                role="button"
                aria-label="复制回答"
                @click="copyAssistantMessage(msg)"
              >
                <LineIcon name="copy" size="12px" color="var(--text-muted)" />
                <text class="footer-action-label">复制</text>
              </view>
              <view
                v-if="isLastAssistantMessage(msg.id) && !isTyping && !isStopping && !isConversationUnsupported && (msg.originatingKind !== 'activity_submission' || Boolean((msg.status === 'failed' || msg.status === 'cancelled') && msg.runId))"
                class="footer-action-chip"
                role="button"
                aria-label="重新生成"
                @click="regenerateAssistantMessage(msg.id)"
              >
                <LineIcon name="refresh" size="12px" color="var(--text-muted)" />
                <text class="footer-action-label">重试</text>
              </view>
              <view
                v-if="hasCopyableContent(msg)"
                class="footer-action-chip"
                role="button"
                aria-label="存为知识块"
                @click="openSaveBlockModal(msg)"
              >
                <LineIcon name="plus" size="12px" color="var(--text-muted)" />
                <text class="footer-action-label">存块</text>
              </view>
              <text v-if="msg.status === 'cancelled'" class="assistant-status-note">已停止</text>
            </view>
          </view>
        </view>

        <view :id="anchorId" class="scroll-anchor"></view>
      </view>
    </scroll-view>

    <view class="composer-box">
      <view
        v-if="autoScrollLocked && messages.length > 0 && !showHistory"
        class="scroll-resume-pill"
        role="button"
        aria-label="回到最新"
        @click="resumeAutoScroll"
      >
        <view v-if="isTyping" class="scroll-resume-dot" aria-hidden="true"></view>
        <text class="scroll-resume-text">↓ 回到最新</text>
      </view>

      <view class="input-capsule">
        <textarea
          v-model="query"
          class="composer-input"
          :maxlength="2000"
          auto-height
          :disabled="isConversationUnsupported"
          :placeholder="composerPlaceholder"
          @input="onQueryInput"
          @confirm="sendMessage"
        />
        <view
          v-if="isTyping || isStopping"
          class="stop-btn"
          :class="{ disabled: isStopping }"
          role="button"
          aria-label="停止生成"
          @click="stopGeneration"
        >
          <view class="stop-square"></view>
        </view>
        <view
          v-else
          class="send-btn"
          :class="{ disabled: !query.trim() || !subjectId || isConversationUnsupported }"
          role="button"
          aria-label="发送"
          @click="sendMessage"
        >
          <LineIcon name="arrow-up" size="15px" color="#FFFFFF" />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import MobileChatPartList from '@/components/MobileChatPartList.vue'
import MobileChatProcessArea from '@/components/MobileChatProcessArea.vue'
import { aiApi, type ConversationView } from '@/api/aiApi'
import {
  chatWithAI,
  retryChatRun,
  submitChatActivity,
  type ChatStreamEnvelope,
  type ChatWithAiOptions,
  type ReadingContext,
} from '@/api/aiClient'
import { ApiProblemError } from '@/api/protocol'
import type { SourceView } from '@/api/sourceApi'
import { useAuthStore } from '@/store/useAuthStore'
import {
  applyContentDelta,
  applyReasoningDelta,
  applyRunStatusSnapshot,
  applyTerminalState,
  applyToolEvent,
  createAssistantPlaceholder,
  deriveKnowledgeBlockTitle,
  evaluateSmartScroll,
  isConversationProtocolSupported,
  restoreConversationMessages,
  type MobileChatMessage,
} from '@/utils/mobileAiChat'
import {
  extractPartsPlainText,
  reduceMobileChatPartEvent,
  type MobileChatActivityAnswer,
} from '@/utils/mobileChatParts'
import { formatShortDateTime } from '@/utils/sourceFormat'
import { uuidv7 } from '@/utils/uuid'
import {
  buildWorkspaceReadingContext,
  doesConversationMatchWorkspaceScope,
} from '@/utils/workspaceChatScope'

const props = defineProps<{
  subjectId: string
  subjectName: string
  selectedSource: SourceView | null
  floating?: boolean
  expanded?: boolean
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'toggle-expand'): void
  (event: 'header-pointerdown', value: unknown): void
  (event: 'header-touchstart', value: unknown): void
  (event: 'typing-change', value: boolean): void
  (event: 'request-save-block', value: { title: string; preview: string }): void
}>()

function onHeaderMouseDown(event: unknown) {
  if (props.floating && !props.expanded) {
    emit('header-pointerdown', event)
  }
}

function onHeaderTouchStart(event: unknown) {
  if (props.floating && !props.expanded) {
    emit('header-touchstart', event)
  }
}

const authStore = useAuthStore()
const instanceProxy = getCurrentInstance()?.proxy

const conversations = ref<ConversationView[]>([])
const loadingSessions = ref(false)
const showHistory = ref(false)
const currentConversationId = ref('')
const messages = ref<MobileChatMessage[]>([])
const query = ref('')
const isTyping = ref(false)
const isStopping = ref(false)

watch(
  () => isTyping.value || isStopping.value,
  (typing) => emit('typing-change', typing),
  { immediate: true },
)
const activeRunId = ref('')
const activeAttemptId = ref('')
const isConversationUnsupported = ref(false)
const preSendError = ref('')
const scrollTargetId = ref('')
const anchorId = 'workspace-ai-bottom'
const autoScrollLocked = ref(false)
const drainingMessageIds = ref<Record<string, boolean>>({})

let activeStreamToken = 0
let activeViewToken = 0
let scrollTimer: ReturnType<typeof setTimeout> | null = null
let runPollTimer: ReturnType<typeof setTimeout> | null = null
let abortLocalStream: (() => void) | null = null
let prevScrollTop = 0
let chatViewportHeight = 0
let touchStartY = 0
let touchPullUpDetected = false
let programmaticScrollUntil = 0
const pendingSubmissionIds: Record<string, string> = {}
const activityVersions: Record<string, number> = {}

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

const composerPlaceholder = computed(() => (
  isConversationUnsupported.value ? '旧版对话仅供查看，请开启新对话' : '提问…'
))

function clearMapKeys(map: Record<string, string> | Record<string, number>) {
  for (const key of Object.keys(map)) {
    delete map[key]
  }
}

function stopRunPolling() {
  if (runPollTimer) {
    clearTimeout(runPollTimer)
    runPollTimer = null
  }
}

function hasFailedToolWithoutAnswer(msg: MobileChatMessage): boolean {
  return !msg.content && msg.parts.length === 0 && msg.tools.some(step => step.status === 'FAILED')
}

function hasVisibleAssistantContent(msg: MobileChatMessage): boolean {
  return msg.parts.length > 0 || Boolean(msg.content)
}

function hasCopyableContent(msg: MobileChatMessage): boolean {
  return Boolean(extractPartsPlainText(msg.parts, msg.content).trim())
}

function isLastAssistantMessage(msgId: string): boolean {
  for (let i = messages.value.length - 1; i >= 0; i -= 1) {
    if (messages.value[i].role === 'assistant') {
      return messages.value[i].id === msgId
    }
  }
  return false
}

function setMessageDraining(msgId: string, draining: boolean) {
  if (draining) {
    drainingMessageIds.value = { ...drainingMessageIds.value, [msgId]: true }
    return
  }
  if (Object.hasOwn(drainingMessageIds.value, msgId)) {
    const next = { ...drainingMessageIds.value }
    delete next[msgId]
    drainingMessageIds.value = next
  }
}

function measureChatViewport(): Promise<number> {
  if (chatViewportHeight > 0) return Promise.resolve(chatViewportHeight)
  return new Promise((resolve) => {
    const queryBuilder = instanceProxy
      ? uni.createSelectorQuery().in(instanceProxy)
      : uni.createSelectorQuery()
    queryBuilder.select('.chat-scroll').boundingClientRect((rect) => {
      const box = Array.isArray(rect) ? rect[0] : rect
      if (box && typeof box.height === 'number' && box.height > 0) {
        chatViewportHeight = box.height
      }
      resolve(chatViewportHeight)
    }).exec()
  })
}

function scrollToBottom(force = false) {
  if (!force && autoScrollLocked.value) return
  if (force) {
    autoScrollLocked.value = false
    touchPullUpDetected = false
  }
  if (scrollTimer) return
  void measureChatViewport()
  nextTick(() => {
    programmaticScrollUntil = Date.now() + 180
    scrollTargetId.value = anchorId
    scrollTimer = setTimeout(() => {
      scrollTargetId.value = ''
      scrollTimer = null
    }, 90)
  })
}

function resumeAutoScroll() {
  scrollToBottom(true)
}

function handleStreamingTextProgress() {
  if (!autoScrollLocked.value) {
    scrollToBottom(false)
  }
}

function handleChatTouchStart(event: unknown) {
  const payload = event as { touches?: Array<{ clientY?: number }> }
  const y = payload?.touches?.[0]?.clientY
  if (typeof y === 'number') {
    touchStartY = y
    touchPullUpDetected = false
  }
}

function handleChatTouchMove(event: unknown) {
  const payload = event as { touches?: Array<{ clientY?: number }> }
  const y = payload?.touches?.[0]?.clientY
  if (typeof y === 'number' && y > touchStartY + 12) {
    touchPullUpDetected = true
    autoScrollLocked.value = true
  }
}

function handleChatWheel(event: unknown) {
  const payload = event as { deltaY?: number }
  if (typeof payload?.deltaY !== 'number') return
  if (payload.deltaY < 0) {
    programmaticScrollUntil = 0
    touchPullUpDetected = true
    autoScrollLocked.value = true
  } else if (payload.deltaY > 0 && autoScrollLocked.value) {
    touchPullUpDetected = false
  }
}

function handleChatScroll(event: unknown) {
  const payload = event as { detail?: { scrollTop?: number; scrollHeight?: number } }
  const scrollTop = Number(payload?.detail?.scrollTop ?? 0)
  const scrollHeight = Number(payload?.detail?.scrollHeight ?? 0)
  const isProgrammatic = Date.now() < programmaticScrollUntil
  if (chatViewportHeight <= 0) {
    void measureChatViewport()
    prevScrollTop = scrollTop
    return
  }
  const decision = evaluateSmartScroll({
    scrollTop,
    scrollHeight,
    viewportHeight: chatViewportHeight,
    prevScrollTop,
    touchPullUpDetected,
  }, autoScrollLocked.value, isProgrammatic)
  autoScrollLocked.value = decision.locked
  prevScrollTop = decision.nextPrevScrollTop
  if (!decision.locked) {
    touchPullUpDetected = false
  }
}

function onQueryInput() {
  if (preSendError.value) {
    preSendError.value = ''
  }
}

function toggleProcess(index: number) {
  const target = messages.value[index]
  if (!target || (!target.reasoningText && target.tools.length === 0)) return
  messages.value[index] = {
    ...target,
    processExpanded: !target.processExpanded,
    processManuallyToggled: true,
  }
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
    if (generation === authStore.getLoginGeneration() && capturedScope === scopeKey.value) {
      loadingSessions.value = false
    }
  }
}

function resetConversation() {
  activeStreamToken += 1
  activeViewToken += 1
  stopRunPolling()
  const abortFn = abortLocalStream
  abortLocalStream = null
  abortFn?.()
  isTyping.value = false
  isStopping.value = false
  currentConversationId.value = ''
  messages.value = []
  activeRunId.value = ''
  activeAttemptId.value = ''
  isConversationUnsupported.value = false
  preSendError.value = ''
  autoScrollLocked.value = false
  drainingMessageIds.value = {}
  prevScrollTop = 0
  touchPullUpDetected = false
  showHistory.value = false
  clearMapKeys(pendingSubmissionIds)
  clearMapKeys(activityVersions)
}

watch(scopeKey, () => {
  resetConversation()
  if (props.subjectId && authStore.isAuthenticated) {
    void loadScopedHistory()
  }
}, { immediate: true })

watch(
  () => [authStore.isAuthenticated, authStore.user?.id, authStore.serverDeviceId, authStore.sessionId],
  () => {
    resetConversation()
    conversations.value = []
    loadingSessions.value = false
    if (authStore.isAuthenticated && props.subjectId) {
      void loadScopedHistory()
    }
  },
)

function toggleHistory() {
  showHistory.value = !showHistory.value
  if (showHistory.value) {
    void loadScopedHistory()
  }
}

async function recoverUnknownRun(
  conversationId: string,
  runId: string,
  attemptId: string,
  viewToken: number,
  generation: symbol,
  capturedScope: string,
) {
  try {
    const recovered = await aiApi.recoverRunAttempt(conversationId, runId, attemptId)
    if (
      viewToken !== activeViewToken
      || generation !== authStore.getLoginGeneration()
      || capturedScope !== scopeKey.value
    ) return
    messages.value = applyRunStatusSnapshot(messages.value, recovered)
    scrollToBottom(false)
    if (recovered.executionActive && recovered.runId && recovered.status !== 'UNKNOWN') {
      activeRunId.value = recovered.runId
      activeAttemptId.value = recovered.currentAttemptId || attemptId
      isTyping.value = true
      scheduleRunPolling(conversationId, recovered.runId, viewToken, generation, capturedScope)
      return
    }
    isTyping.value = false
    activeRunId.value = ''
    activeAttemptId.value = ''
  } catch {
    if (
      viewToken !== activeViewToken
      || generation !== authStore.getLoginGeneration()
      || capturedScope !== scopeKey.value
    ) return
    isTyping.value = false
    activeRunId.value = ''
    activeAttemptId.value = ''
  }
}

function scheduleRunPolling(
  conversationId: string,
  runId: string,
  viewToken: number,
  generation: symbol,
  capturedScope: string,
  failureCount = 0,
) {
  stopRunPolling()
  const delayMs = failureCount > 0 ? 2000 : 1500
  runPollTimer = setTimeout(() => {
    void (async () => {
      if (
        viewToken !== activeViewToken
        || generation !== authStore.getLoginGeneration()
        || capturedScope !== scopeKey.value
      ) return
      try {
        const statusView = await aiApi.getRunStatus(conversationId, runId)
        if (
          viewToken !== activeViewToken
          || generation !== authStore.getLoginGeneration()
          || capturedScope !== scopeKey.value
        ) return
        messages.value = applyRunStatusSnapshot(messages.value, statusView)
        scrollToBottom(false)
        if (statusView.executionActive && statusView.status !== 'UNKNOWN') {
          scheduleRunPolling(conversationId, runId, viewToken, generation, capturedScope, 0)
          return
        }
        if (statusView.status === 'UNKNOWN' && statusView.currentAttemptId) {
          await recoverUnknownRun(
            conversationId,
            runId,
            statusView.currentAttemptId,
            viewToken,
            generation,
            capturedScope,
          )
          return
        }
        isTyping.value = false
        activeRunId.value = ''
        activeAttemptId.value = ''
      } catch {
        if (
          viewToken !== activeViewToken
          || generation !== authStore.getLoginGeneration()
          || capturedScope !== scopeKey.value
        ) return
        if (failureCount < 2) {
          scheduleRunPolling(conversationId, runId, viewToken, generation, capturedScope, failureCount + 1)
          return
        }
        messages.value = messages.value.map(item => (
          item.role === 'assistant' && item.status === 'streaming' && (!item.runId || item.runId === runId)
            ? applyTerminalState(item, 'failed', '网络波动，暂未获取到最新生成状态，请点击重试')
            : item
        ))
        isTyping.value = false
        activeRunId.value = ''
        activeAttemptId.value = ''
      }
    })()
  }, delayMs)
}

async function selectConversation(conversationId: string) {
  if (isTyping.value || isStopping.value) {
    uni.showToast({ title: '请先停止当前回答', icon: 'none' })
    return
  }
  const generation = authStore.getLoginGeneration()
  const capturedScope = scopeKey.value
  const viewToken = ++activeViewToken
  try {
    const detail = await aiApi.getConversation(conversationId)
    if (
      generation !== authStore.getLoginGeneration()
      || capturedScope !== scopeKey.value
      || viewToken !== activeViewToken
      || isTyping.value
      || isStopping.value
    ) return

    activeStreamToken += 1
    stopRunPolling()
    isTyping.value = false
    activeRunId.value = ''
    activeAttemptId.value = ''
    abortLocalStream = null
    drainingMessageIds.value = {}
    clearMapKeys(pendingSubmissionIds)
    clearMapKeys(activityVersions)

    currentConversationId.value = detail.id || conversationId
    isConversationUnsupported.value = !isConversationProtocolSupported(detail)
    preSendError.value = isConversationUnsupported.value ? '旧版对话仅供查看，请开启新对话' : ''
    messages.value = restoreConversationMessages(detail)
    showHistory.value = false

    if (detail.activeRun?.executionActive && detail.activeRun.runId) {
      if (detail.activeRun.status === 'UNKNOWN' && detail.activeRun.currentAttemptId) {
        void recoverUnknownRun(
          currentConversationId.value,
          detail.activeRun.runId,
          detail.activeRun.currentAttemptId,
          viewToken,
          generation,
          capturedScope,
        )
      } else {
        activeRunId.value = detail.activeRun.runId
        activeAttemptId.value = detail.activeRun.currentAttemptId || ''
        isTyping.value = true
        scheduleRunPolling(currentConversationId.value, detail.activeRun.runId, viewToken, generation, capturedScope)
      }
    }
    scrollToBottom(true)
  } catch {
    if (generation !== authStore.getLoginGeneration() || capturedScope !== scopeKey.value || viewToken !== activeViewToken) return
    uni.showToast({ title: '加载对话失败', icon: 'none' })
  }
}

async function deleteScopedConversation(conversationId: string, baseVersion: number) {
  if ((isTyping.value || isStopping.value) && currentConversationId.value === conversationId) {
    uni.showToast({ title: '请先停止当前回答', icon: 'none' })
    return
  }
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

function copyText(text: string) {
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '已复制', icon: 'none' }),
  })
}

function copyAssistantMessage(msg: MobileChatMessage) {
  const text = extractPartsPlainText(msg.parts, msg.content).trim()
  if (!text) return
  copyText(text)
}

function openSaveBlockModal(msg: MobileChatMessage) {
  const plainContent = extractPartsPlainText(msg.parts, msg.content).trim()
  if (!plainContent) return
  const msgIdx = messages.value.findIndex(item => item.id === msg.id)
  let precedingQuestion = ''
  for (let i = msgIdx - 1; i >= 0; i -= 1) {
    if (messages.value[i].role === 'user') {
      precedingQuestion = messages.value[i].content
      break
    }
  }
  emit('request-save-block', {
    title: deriveKnowledgeBlockTitle(precedingQuestion, plainContent),
    preview: plainContent.slice(0, 4000),
  })
}

function submitStarterPrompt(prompt: string) {
  if (isTyping.value || isStopping.value || isConversationUnsupported.value) return
  query.value = prompt
  void sendMessage()
}

async function stopGeneration() {
  if (!isTyping.value || isStopping.value) return
  stopRunPolling()
  isStopping.value = true
  const targetConversationId = currentConversationId.value
  const targetRunId = activeRunId.value
  const lastIndex = messages.value.length - 1
  if (lastIndex >= 0 && messages.value[lastIndex].role === 'assistant') {
    const targetMsg = messages.value[lastIndex]
    setMessageDraining(targetMsg.id, false)
    messages.value[lastIndex] = applyTerminalState(targetMsg, 'cancelled')
  }

  activeStreamToken += 1
  activeViewToken += 1
  const abortFn = abortLocalStream
  abortLocalStream = null
  abortFn?.()

  try {
    if (targetConversationId && targetRunId) {
      await aiApi.cancelRun(targetConversationId, targetRunId)
    }
  } catch {
    // Ignore when server run has already completed
  } finally {
    isStopping.value = false
    isTyping.value = false
    activeRunId.value = ''
    activeAttemptId.value = ''
    scrollToBottom(false)
  }
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

function applyEnvelopeToSlot(aiIndex: number, envelope: ChatStreamEnvelope) {
  if (envelope.event === 'activity.ready') {
    const qId = typeof envelope.payload.questionId === 'string'
      ? envelope.payload.questionId
      : (typeof envelope.payload.activityId === 'string' ? envelope.payload.activityId : '')
    const qVer = typeof envelope.payload.questionVersion === 'number' ? envelope.payload.questionVersion : 1
    if (qId) {
      activityVersions[qId] = qVer
    }
  }

  if (envelope.event === 'activity.submitted') {
    const rawPart = envelope.payload.part as { componentId?: unknown; questionId?: unknown } | undefined
    const targetCompId = typeof rawPart?.componentId === 'string' ? rawPart.componentId : ''
    const targetQId = typeof envelope.payload.questionId === 'string'
      ? envelope.payload.questionId
      : (typeof rawPart?.questionId === 'string' ? rawPart.questionId : '')
    if (targetQId && Object.hasOwn(pendingSubmissionIds, targetQId)) {
      delete pendingSubmissionIds[targetQId]
    }
    for (let i = messages.value.length - 1; i >= 0; i -= 1) {
      const m = messages.value[i]
      if (m.role !== 'assistant') continue
      const ownsTarget = m.parts.some(
        p => p.kind === 'block' && ((targetCompId && p.componentId === targetCompId) || (targetQId && p.questionId === targetQId)),
      )
      if (ownsTarget) {
        messages.value[i] = {
          ...m,
          parts: reduceMobileChatPartEvent(m.parts, envelope, m.id),
        }
        break
      }
    }
    return
  }

  const target = messages.value[aiIndex]
  if (!target) return
  messages.value[aiIndex] = {
    ...target,
    parts: reduceMobileChatPartEvent(target.parts, envelope, envelope.replyMessageId || target.id),
  }
  if (envelope.event.startsWith('block.') || envelope.event === 'activity.ready') {
    scrollToBottom(false)
  }
}

async function runStreamIntoSlot(params: {
  aiIndex: number
  streamToken: number
  generation: symbol
  capturedScope: string
  resolveConversationId: () => Promise<string>
  invoke: (conversationId: string, onDelta: (delta: string) => void, options: ChatWithAiOptions) => Promise<void>
  restoreDraftText?: string
  dropPairOnPreAdmitError?: boolean
  readingContext?: ReadingContext
}) {
  const { aiIndex, streamToken, generation, capturedScope } = params
  const isCurrent = () => (
    streamToken === activeStreamToken
    && generation === authStore.getLoginGeneration()
    && capturedScope === scopeKey.value
  )
  let admittedTurn = false
  let resumedPolling = false
  let terminalStatus: 'COMPLETED' | 'CANCELLED' | 'UNKNOWN' | 'FAILED' | null = null

  const recoverInterruptedSlot = async (convId: string): Promise<'resolved' | 'polling' | 'none'> => {
    if (!activeRunId.value || !activeAttemptId.value) return 'none'
    try {
      const recovered = await aiApi.recoverRunAttempt(convId, activeRunId.value, activeAttemptId.value)
      if (!isCurrent()) return 'resolved'
      messages.value = applyRunStatusSnapshot(messages.value, recovered)
      if (recovered.executionActive && recovered.runId && recovered.status !== 'UNKNOWN') {
        activeRunId.value = recovered.runId
        activeAttemptId.value = recovered.currentAttemptId || activeAttemptId.value
        resumedPolling = true
        scheduleRunPolling(convId, recovered.runId, activeViewToken, generation, capturedScope)
        return 'polling'
      }
      if (recovered.status === 'COMPLETED' || recovered.status === 'FAILED' || recovered.status === 'CANCELLED') {
        return 'resolved'
      }
      return 'none'
    } catch {
      return 'none'
    }
  }

  try {
    const conversationId = await params.resolveConversationId()
    if (!isCurrent()) return

    await params.invoke(conversationId, (delta) => {
      if (!isCurrent()) return
      admittedTurn = true
      messages.value[aiIndex] = applyContentDelta(messages.value[aiIndex], delta)
      scrollToBottom(false)
    }, {
      readingContext: params.readingContext,
      onRunStarted: ({ runId, attemptId }) => {
        if (!isCurrent()) return
        admittedTurn = true
        activeRunId.value = runId
        activeAttemptId.value = attemptId
        messages.value[aiIndex] = { ...messages.value[aiIndex], runId }
      },
      onEnvelope: (envelope) => {
        if (!isCurrent()) return
        admittedTurn = true
        applyEnvelopeToSlot(aiIndex, envelope)
      },
      onReasoningDelta: (delta) => {
        if (!isCurrent()) return
        admittedTurn = true
        messages.value[aiIndex] = applyReasoningDelta(messages.value[aiIndex], delta)
        scrollToBottom(false)
      },
      onToolEvent: (ev) => {
        if (!isCurrent()) return
        admittedTurn = true
        messages.value[aiIndex] = applyToolEvent(messages.value[aiIndex], ev)
      },
      onTerminal: ({ status }) => {
        if (!isCurrent()) return
        admittedTurn = true
        terminalStatus = status
      },
      onAbortReady: (abortFn) => {
        if (!isCurrent()) {
          abortFn()
          return
        }
        abortLocalStream = abortFn
      },
    })

    if (!isCurrent()) return
    if (terminalStatus === 'CANCELLED') {
      messages.value[aiIndex] = applyTerminalState(messages.value[aiIndex], 'cancelled')
      return
    }
    if (terminalStatus === 'UNKNOWN') {
      const recovery = await recoverInterruptedSlot(conversationId)
      if (!isCurrent() || recovery !== 'none') return
      messages.value[aiIndex] = applyTerminalState(
        messages.value[aiIndex],
        'failed',
        '连接中断，请在历史记录中重新打开查看结果',
      )
      return
    }
    if (terminalStatus === null) {
      const recovery = await recoverInterruptedSlot(conversationId)
      if (!isCurrent() || recovery !== 'none') return
      if (params.restoreDraftText && !admittedTurn && !query.value.trim()) {
        query.value = params.restoreDraftText
      }
      if (params.dropPairOnPreAdmitError && !admittedTurn && messages.value.length === 2) {
        messages.value = []
        preSendError.value = '连接已中断，未收到模型响应，请重试'
        return
      }
      messages.value[aiIndex] = applyTerminalState(
        messages.value[aiIndex],
        'failed',
        '连接意外结束，请确认或重试。',
      )
      return
    }
    messages.value[aiIndex] = applyTerminalState(messages.value[aiIndex], 'completed')
  } catch (error) {
    if (!isCurrent()) return
    if ((terminalStatus === 'UNKNOWN' || terminalStatus === null) && currentConversationId.value) {
      const recovery = await recoverInterruptedSlot(currentConversationId.value)
      if (!isCurrent() || recovery !== 'none') return
    }
    if (params.restoreDraftText && !admittedTurn && !query.value.trim()) {
      query.value = params.restoreDraftText
    }
    const errMsg = error instanceof ApiProblemError && error.code === 'CHAT_SCOPE_CONFLICT'
      ? '当前会话作用域已发生变化，请点击右上角“新对话”后重新提问。'
      : (error instanceof Error && error.message ? error.message : '回复生成失败，请重试。')
    if (params.dropPairOnPreAdmitError && !admittedTurn && messages.value.length === 2) {
      messages.value = []
      preSendError.value = errMsg
      return
    }
    messages.value[aiIndex] = applyTerminalState(messages.value[aiIndex], 'failed', errMsg)
  } finally {
    if (isCurrent()) {
      abortLocalStream = null
      if (!resumedPolling) {
        isTyping.value = false
        activeRunId.value = ''
        activeAttemptId.value = ''
      }
      scrollToBottom(false)
    }
  }
}

async function sendMessage() {
  if (isConversationUnsupported.value) {
    uni.showToast({ title: '旧版对话仅供查看，请开启新对话', icon: 'none' })
    return
  }
  const text = query.value.trim()
  if (!text || isTyping.value || isStopping.value || !props.subjectId) return

  stopRunPolling()
  activeViewToken += 1
  const generation = authStore.getLoginGeneration()
  const capturedScope = scopeKey.value
  const capturedContext = readingContext.value
  const streamToken = ++activeStreamToken
  const wasEmptyConversation = messages.value.length === 0

  preSendError.value = ''
  query.value = ''
  showHistory.value = false
  messages.value.push({
    id: `user-${uuidv7()}`,
    role: 'user',
    content: text,
    parts: [],
    reasoningText: '',
    tools: [],
    processTimeline: [],
    processExpanded: false,
    processManuallyToggled: false,
    status: 'completed',
  })
  messages.value.push(createAssistantPlaceholder(`assistant-${uuidv7()}`))
  const aiIndex = messages.value.length - 1
  isTyping.value = true
  activeRunId.value = ''
  activeAttemptId.value = ''
  scrollToBottom(true)

  await runStreamIntoSlot({
    aiIndex,
    streamToken,
    generation,
    capturedScope,
    restoreDraftText: text,
    dropPairOnPreAdmitError: wasEmptyConversation,
    readingContext: capturedContext,
    resolveConversationId: () => ensureConversation(text, generation, capturedScope),
    invoke: (conversationId, onDelta, options) => chatWithAI(text, [], onDelta, conversationId, options),
  })
}

async function regenerateAssistantMessage(msgId: string) {
  if (isTyping.value || isStopping.value || isConversationUnsupported.value) return
  const msgIndex = messages.value.findIndex(m => m.id === msgId)
  if (msgIndex < 0) return
  const target = messages.value[msgIndex]

  if ((target.status === 'failed' || target.status === 'cancelled') && target.runId && currentConversationId.value) {
    stopRunPolling()
    activeViewToken += 1
    const generation = authStore.getLoginGeneration()
    const capturedScope = scopeKey.value
    const streamToken = ++activeStreamToken
    const targetRunId = target.runId
    const convId = currentConversationId.value
    setMessageDraining(target.id, false)
    messages.value[msgIndex] = {
      ...createAssistantPlaceholder(target.id, target.originatingKind),
      runId: targetRunId,
    }
    isTyping.value = true
    activeRunId.value = targetRunId
    activeAttemptId.value = ''
    scrollToBottom(true)

    await runStreamIntoSlot({
      aiIndex: msgIndex,
      streamToken,
      generation,
      capturedScope,
      resolveConversationId: async () => convId,
      invoke: (conversationId, onDelta, options) => retryChatRun(conversationId, targetRunId, onDelta, options),
    })
    return
  }

  if (target.originatingKind === 'activity_submission') return

  let promptText = ''
  for (let i = msgIndex - 1; i >= 0; i -= 1) {
    if (messages.value[i].role === 'user') {
      promptText = messages.value[i].content.trim()
      break
    }
  }
  if (!promptText) return
  query.value = promptText
  await sendMessage()
}

async function handleSubmitActivity(questionId: string, answer: MobileChatActivityAnswer) {
  if (isTyping.value || isStopping.value || isConversationUnsupported.value || !currentConversationId.value) return
  stopRunPolling()
  const convId = currentConversationId.value
  const submissionId = pendingSubmissionIds[questionId] ?? (pendingSubmissionIds[questionId] = uuidv7())
  const questionVersion = activityVersions[questionId] ?? 1
  const apiAnswer: MobileChatActivityAnswer = typeof answer === 'string' ? answer : [...answer]

  activeViewToken += 1
  const generation = authStore.getLoginGeneration()
  const capturedScope = scopeKey.value
  const streamToken = ++activeStreamToken

  preSendError.value = ''
  showHistory.value = false
  messages.value.push(createAssistantPlaceholder(`assistant-${uuidv7()}`, 'activity_submission'))
  const aiIndex = messages.value.length - 1
  isTyping.value = true
  activeRunId.value = ''
  activeAttemptId.value = ''
  scrollToBottom(true)

  await runStreamIntoSlot({
    aiIndex,
    streamToken,
    generation,
    capturedScope,
    resolveConversationId: async () => convId,
    invoke: (conversationId, onDelta, options) => submitChatActivity(
      conversationId,
      { activityId: questionId, questionVersion, submissionId, answer: apiAnswer },
      onDelta,
      options,
    ),
  })
}

onBeforeUnmount(() => {
  activeStreamToken += 1
  activeViewToken += 1
  stopRunPolling()
  if (scrollTimer) {
    clearTimeout(scrollTimer)
    scrollTimer = null
  }
  abortLocalStream?.()
  abortLocalStream = null
})
</script>

<style scoped>
.ai-panel {
  position: relative;
  width: 320px;
  height: 100%;
  flex-shrink: 0;
  border-radius: var(--radius-card);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.ai-panel.is-floating {
  width: 100%;
  height: 100%;
  border-radius: 20px;
  border: 1px solid var(--glass-border);
  box-shadow: none;
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

.ai-header.is-draggable {
  cursor: grab;
  user-select: none;
}

.ai-header.is-draggable:active {
  cursor: grabbing;
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

.pre-send-error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  background-color: var(--color-danger-bg);
  border: 1px solid rgba(201, 59, 59, 0.22);
}

.pre-send-error-text {
  font-size: 12px;
  color: var(--color-danger);
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

.unsupported-banner {
  padding: 8px 10px;
  border-radius: 10px;
  background-color: var(--color-warning-bg, rgba(217, 130, 43, 0.12));
}

.unsupported-banner-text {
  font-size: 11.5px;
  color: var(--color-warning-ink, #9A5513);
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

.user-text {
  color: var(--text-primary, #262522);
  line-height: 1.5;
  word-break: break-word;
}

.assistant-bubble {
  width: 100%;
  padding: 12px 14px;
  font-size: var(--text-sm);
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
}

.assistant-error-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  background-color: var(--color-danger-bg);
  border: 1px solid rgba(201, 59, 59, 0.22);
}

.assistant-error-text {
  font-size: 12px;
  color: var(--color-danger);
  line-height: 1.45;
  word-break: break-word;
}

.assistant-status-note {
  font-size: 11.5px;
  color: var(--text-muted);
}

.assistant-footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.footer-action-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 25px;
  padding: 0 8px;
  border-radius: var(--radius-full);
  background-color: rgba(28, 28, 26, 0.045);
  cursor: pointer;
}

.footer-action-label {
  font-size: 11.5px;
  color: var(--text-secondary);
}

.scroll-anchor {
  height: 2px;
}

.composer-box {
  position: relative;
  padding: 10px 12px 12px;
  background: var(--color-bg-primary);
  flex-shrink: 0;
}

.scroll-resume-pill {
  position: absolute;
  top: -32px;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 11px;
  border-radius: var(--radius-full);
  background-color: #FFFFFF;
  border: 1px solid #EAE6DD;
  box-shadow: 0 4px 12px rgba(28, 28, 26, 0.08);
  cursor: pointer;
}

.scroll-resume-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #556B3D;
}

.scroll-resume-text {
  font-size: 11px;
  color: var(--color-sage-ink);
  font-weight: 500;
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

.send-btn,
.stop-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.14s var(--ease-out), opacity 0.14s var(--ease-out);
}

.send-btn {
  background: var(--accent-gradient);
}

.stop-btn {
  background-color: #2C2C28;
}

.stop-square {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background-color: #FFFFFF;
}

.send-btn:active,
.stop-btn:active {
  transform: scale(0.92);
}

.send-btn.disabled,
.stop-btn.disabled {
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
