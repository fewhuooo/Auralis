<template>
  <div class="ai-panel zen-panel" :class="{ 'is-floating': floating }">
    <div
      class="ai-header"
      :class="{ 'is-draggable': floating }"
      @mousedown="onHeaderMouseDown"
      @touchstart="onHeaderTouchStart"
    >
      <div class="ai-scope-pill" :title="isSourceScoped ? (selectedSource?.title || '当前资料') : '全学科资料'">
        <LineIcon
          :name="isSourceScoped ? 'file-text' : 'sparkles'"
          size="14px"
          color="var(--color-zen-sage)"
        />
        <span class="ai-scope-text">
          {{ isSourceScoped ? (selectedSource?.title || '当前资料') : '全学科资料' }}
        </span>
      </div>
      <div class="ai-header-actions" @mousedown.stop @touchstart.stop>
        <div
          class="ai-header-btn"
          role="button"
          title="开启新对话"
          aria-label="刷新对话"
          @click="resetConversation"
        >
          <LineIcon name="rotate" size="14px" color="var(--text-secondary)" />
        </div>
        <div
          v-if="floating"
          class="ai-header-btn"
          role="button"
          title="收起"
          aria-label="收起 AI 浮窗"
          @click="emit('close')"
        >
          <LineIcon name="close" size="14px" color="var(--text-secondary)" />
        </div>
      </div>
    </div>

    <div v-if="messages.length === 0" class="welcome-stage">
      <div class="welcome-inner">
        <div class="welcome-hero">
          <span class="welcome-title">想先攻克哪部分？</span>
          <span class="welcome-subtitle">{{ welcomeSubtitle }}</span>
        </div>
        <div class="starter-section">
          <div v-if="preSendError" class="pre-send-error" role="alert">
            <LineIcon name="alert" size="13px" color="var(--color-danger)" />
            <span class="pre-send-error-text">{{ preSendError }}</span>
          </div>
          <div class="starter-cards">
            <div
              v-for="item in presetQuestions"
              :key="item.label"
              class="starter-card"
              role="button"
              @click="submitStarterPrompt(item.prompt)"
            >
              <span class="starter-card-title">{{ item.label }}</span>
              <span class="starter-card-hint">{{ item.hint }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-else
      ref="chatScrollRef"
      class="chat-scroll zen-scroll-y"
      @scroll="handleChatScroll"
      @wheel="handleChatWheel"
      @touchstart="handleChatTouchStart"
      @touchmove="handleChatTouchMove"
    >
      <div class="chat-messages">
        <div
          v-for="(msg, index) in messages"
          :key="msg.id"
          class="msg-row"
          :class="msg.role"
        >
          <div v-if="msg.role === 'user'" class="user-bubble">
            <span class="user-text">{{ msg.content }}</span>
          </div>

          <div v-else class="assistant-bubble">
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
              @submit="handleSubmitActivity"
              @drain-change="(draining) => setMessageDraining(msg.id, draining)"
              @text-progress="handleStreamingTextProgress"
            />

            <div v-if="msg.status === 'failed'" class="assistant-error-banner" role="alert">
              <LineIcon name="alert" size="13px" color="var(--color-danger)" />
              <span class="assistant-error-text">{{ msg.errorMessage || '回复生成失败，请重试。' }}</span>
            </div>

            <span
              v-else-if="msg.status === 'cancelled' && !hasVisibleAssistantContent(msg)"
              class="assistant-status-note"
            >
              已停止生成
            </span>

            <div
              v-if="msg.status !== 'streaming' && !drainingMessageIds[msg.id] && (hasCopyableContent(msg) || msg.status === 'failed' || msg.status === 'cancelled')"
              class="assistant-footer"
            >
              <div
                v-if="hasCopyableContent(msg)"
                class="footer-action-chip"
                role="button"
                aria-label="复制回答"
                @click="copyAssistantMessage(msg)"
              >
                <LineIcon name="copy" size="12px" color="var(--text-muted)" />
                <span class="footer-action-label">复制</span>
              </div>
              <div
                v-if="isLastAssistantMessage(msg.id) && !isTyping && !isStopping && (msg.originatingKind !== 'activity_submission' || Boolean((msg.status === 'failed' || msg.status === 'cancelled') && msg.runId))"
                class="footer-action-chip"
                role="button"
                :aria-label="msg.status === 'failed' || msg.status === 'cancelled' ? '重试' : '重新生成'"
                @click="regenerateAssistantMessage(msg.id)"
              >
                <LineIcon name="refresh" size="12px" color="var(--text-muted)" />
                <span class="footer-action-label">{{ msg.status === 'failed' || msg.status === 'cancelled' ? '重试' : '重新生成' }}</span>
              </div>
              <div
                v-if="hasCopyableContent(msg)"
                class="footer-action-chip"
                role="button"
                aria-label="存为知识块"
                @click="openSaveBlockModal(msg)"
              >
                <LineIcon name="plus" size="12px" color="var(--text-muted)" />
                <span class="footer-action-label">存块</span>
              </div>
              <span v-if="msg.status === 'cancelled'" class="assistant-status-note">已停止</span>
            </div>
          </div>
        </div>

        <div class="scroll-anchor"></div>
      </div>
    </div>

    <div class="composer-box">
      <div
        v-if="autoScrollLocked && messages.length > 0"
        class="scroll-resume-pill"
        role="button"
        aria-label="回到最新"
        @click="resumeAutoScroll"
      >
        <div v-if="isTyping" class="scroll-resume-dot" aria-hidden="true"></div>
        <span class="scroll-resume-text">↓ 回到最新</span>
      </div>

      <div class="input-capsule">
        <textarea
          ref="composerInputRef"
          v-model="query"
          class="composer-input"
          rows="1"
          :maxlength="2000"
          placeholder="问问 Auralis AI..."
          @input="handleQueryInput"
          @keydown="handleEnterKey($event, sendMessage, { allowShiftNewline: true, preventDefault: true })"
        />
        <div
          v-if="isTyping || isStopping"
          class="stop-btn"
          :class="{ disabled: isStopping }"
          role="button"
          aria-label="停止生成"
          @click="stopGeneration"
        >
          <div class="stop-square"></div>
        </div>
        <div
          v-else
          class="send-btn"
          :class="{ 'is-ready': Boolean(query.trim() && subjectId) }"
          role="button"
          aria-label="发送"
          @click="sendMessage"
        >
          <LineIcon
            name="arrow-up"
            size="15px"
            :color="query.trim() && subjectId ? '#FFFFFF' : 'var(--color-zen-sage)'"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import MobileChatPartList from '@/components/MobileChatPartList.vue'
import MobileChatProcessArea from '@/components/MobileChatProcessArea.vue'
import { aiApi } from '@/api/aiApi'
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
  type MobileChatMessage,
} from '@/utils/mobileAiChat'
import {
  extractPartsPlainText,
  reduceMobileChatPartEvent,
  type MobileChatActivityAnswer,
} from '@/utils/mobileChatParts'
import { showToast } from '@/platform/feedback'
import { handleEnterKey, resetTextareaHeight, syncTextareaAutoHeight } from '@/utils/domHelpers'
import { copyTextWithFallback } from '@/utils/mobileLearning'
import { uuidv7 } from '@/utils/uuid'
import { buildWorkspaceReadingContext } from '@/utils/workspaceChatScope'

const props = defineProps<{
  subjectId: string
  subjectName: string
  selectedSource: SourceView | null
  floating?: boolean
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'header-pointerdown', value: unknown): void
  (event: 'header-touchstart', value: unknown): void
  (event: 'typing-change', value: boolean): void
  (event: 'request-save-block', value: { title: string; preview: string }): void
}>()

function onHeaderMouseDown(event: unknown) {
  if (props.floating) {
    emit('header-pointerdown', event)
  }
}

function onHeaderTouchStart(event: unknown) {
  if (props.floating) {
    emit('header-touchstart', event)
  }
}

const authStore = useAuthStore()
const chatScrollRef = ref<HTMLElement | null>(null)
const composerInputRef = ref<HTMLElement | null>(null)

const currentConversationId = ref('')
const messages = ref<MobileChatMessage[]>([])
const query = ref('')
const isTyping = ref(false)
const isStopping = ref(false)

watch(
  query,
  (val) => {
    if (!val) {
      void nextTick(() => resetTextareaHeight(composerInputRef.value))
    }
  },
)

watch(
  () => isTyping.value || isStopping.value,
  (typing) => emit('typing-change', typing),
  { immediate: true },
)
const activeRunId = ref('')
const activeAttemptId = ref('')
const preSendError = ref('')
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

const welcomeSubtitle = computed(() => {
  if (isSourceScoped.value) {
    return `当前参考：${props.selectedSource?.title || '当前资料'}`
  }
  return `当前参考：${props.subjectName ? `${props.subjectName} · ` : ''}全学科资料`
})

const presetQuestions = computed(() => [
  {
    label: '提炼当前核心要点',
    hint: '快速梳理重点脉络与核心结论',
    prompt: isSourceScoped.value ? '总结当前文件的核心要点与关键脉络' : '总结当前学科的核心要点与关键脉络',
  },
  {
    label: '梳理本章关键概念',
    hint: '拆解核心定义、异同与易错边界',
    prompt: '查找并梳理本章的核心概念与权威解释',
  },
  {
    label: '生成 3 道自测练习题',
    hint: '随堂检验掌握度并附解析',
    prompt: '针对当前内容生成 3 道自测题以巩固记忆',
  },
])

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

function measureChatViewport(): number {
  if (chatScrollRef.value && chatScrollRef.value.clientHeight > 0) {
    chatViewportHeight = chatScrollRef.value.clientHeight
  }
  return chatViewportHeight
}

function scrollToBottom(force = false) {
  if (!force && autoScrollLocked.value) return
  if (force) {
    autoScrollLocked.value = false
    touchPullUpDetected = false
  }
  if (scrollTimer) return
  measureChatViewport()
  nextTick(() => {
    programmaticScrollUntil = Date.now() + 180
    const el = chatScrollRef.value
    if (el) {
      el.scrollTop = el.scrollHeight
    }
    scrollTimer = setTimeout(() => {
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

function handleChatScroll(event: Event) {
  const el = (event.currentTarget as HTMLElement | null) ?? chatScrollRef.value
  if (!el) return
  if (el.clientHeight > 0) {
    chatViewportHeight = el.clientHeight
  }
  const scrollTop = el.scrollTop
  const scrollHeight = el.scrollHeight
  const isProgrammatic = Date.now() < programmaticScrollUntil
  if (chatViewportHeight <= 0) {
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

function handleQueryInput(event: unknown) {
  syncTextareaAutoHeight(event, 96)
  onQueryInput()
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
  preSendError.value = ''
  autoScrollLocked.value = false
  drainingMessageIds.value = {}
  prevScrollTop = 0
  touchPullUpDetected = false
  clearMapKeys(pendingSubmissionIds)
  clearMapKeys(activityVersions)
}

watch(scopeKey, () => {
  resetConversation()
})

watch(
  () => [authStore.isAuthenticated, authStore.user?.id, authStore.serverDeviceId, authStore.sessionId],
  () => {
    resetConversation()
  },
)

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

async function copyText(text: string) {
  const ok = await copyTextWithFallback(text)
  showToast(ok ? '已复制' : '复制失败，请手动复制')
}

function copyAssistantMessage(msg: MobileChatMessage) {
  const text = extractPartsPlainText(msg.parts, msg.content).trim()
  if (!text) return
  void copyText(text)
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
  if (isTyping.value || isStopping.value) return
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

  const stopStreamToken = ++activeStreamToken
  const stopViewToken = ++activeViewToken
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
    if (stopStreamToken === activeStreamToken && stopViewToken === activeViewToken) {
      isStopping.value = false
      isTyping.value = false
      activeRunId.value = ''
      activeAttemptId.value = ''
      scrollToBottom(false)
    }
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
        '连接中断，请重试或在 AI 助手页查看结果',
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
  if (isTyping.value || isStopping.value) return
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

  if (target.status === 'failed' || target.status === 'cancelled') {
    stopRunPolling()
    activeViewToken += 1
    const generation = authStore.getLoginGeneration()
    const capturedScope = scopeKey.value
    const capturedContext = readingContext.value
    const streamToken = ++activeStreamToken
    setMessageDraining(target.id, false)
    messages.value[msgIndex] = createAssistantPlaceholder(target.id, target.originatingKind)
    isTyping.value = true
    activeRunId.value = ''
    activeAttemptId.value = ''
    scrollToBottom(true)

    await runStreamIntoSlot({
      aiIndex: msgIndex,
      streamToken,
      generation,
      capturedScope,
      readingContext: capturedContext,
      resolveConversationId: () => ensureConversation(promptText, generation, capturedScope),
      invoke: (conversationId, onDelta, options) => chatWithAI(promptText, [], onDelta, conversationId, options),
    })
    return
  }

  query.value = promptText
  await sendMessage()
}

async function handleSubmitActivity(questionId: string, answer: MobileChatActivityAnswer) {
  if (isTyping.value || isStopping.value || !currentConversationId.value) return
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
  border-radius: 18px;
  border: 1px solid var(--glass-border);
  box-shadow: none;
}

.ai-header {
  padding: 14px 16px 6px;
  background: transparent;
  border-bottom: none;
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

.ai-scope-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  max-width: 220px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-subtle);
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04);
  box-sizing: border-box;
}

.ai-scope-text {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
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

.ai-header-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-subtle);
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, transform 0.16s var(--ease-out);
}

.ai-header-btn:hover {
  background: rgba(139, 154, 110, 0.12);
  border-color: rgba(139, 154, 110, 0.36);
}

.ai-header-btn:active {
  transform: scale(0.92);
}

.welcome-stage {
  flex: 1;
  min-height: 0;
  padding: 16px 18px 20px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  overflow-y: auto;
  box-sizing: border-box;
}

.welcome-inner {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 18px;
}

.welcome-hero {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  gap: 6px;
}

.welcome-title {
  font-size: 21px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.025em;
  line-height: 1.25;
}

.welcome-subtitle {
  font-size: 12.5px;
  color: var(--text-muted);
  line-height: 1.45;
  word-break: break-word;
}

.starter-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pre-send-error {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  background-color: var(--color-danger-bg);
  border: 1px solid rgba(201, 59, 59, 0.22);
  text-align: left;
  box-sizing: border-box;
}

.pre-send-error-text {
  font-size: 12px;
  color: var(--color-danger);
}

.starter-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.starter-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 13px 15px;
  border-radius: 15px;
  background-color: #FFFFFF;
  border: 1px solid #EAE6DD;
  box-shadow: 0 1px 2px rgba(72, 62, 46, 0.03);
  cursor: pointer;
  transition: transform 0.14s var(--ease-out), border-color 0.16s ease, box-shadow 0.16s ease;
  box-sizing: border-box;
}

.starter-card:hover {
  border-color: #D7D0C2;
  box-shadow: 0 4px 14px rgba(72, 62, 46, 0.06);
  transform: translateY(-1px);
}

.starter-card:active {
  transform: scale(0.988);
}

.starter-card-title {
  font-size: 14px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  line-height: 1.38;
  letter-spacing: -0.015em;
}

.starter-card-hint {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.45;
}

.chat-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.chat-messages {
  padding: 12px 16px;
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
  padding: 9px 14px;
  border-radius: 18px 18px 5px 18px;
  background: #FFFFFF;
  border: 1px solid rgba(45, 55, 40, 0.08);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  font-size: var(--text-sm);
  box-sizing: border-box;
}

.user-text {
  color: var(--text-primary);
  line-height: 1.55;
  word-break: break-word;
}

.assistant-bubble {
  width: 100%;
  padding: 2px 0 12px;
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
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
  padding: 8px 16px 16px;
  background: transparent;
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
  min-height: 46px;
  padding: 5px 6px 5px 16px;
  border-radius: 24px;
  background: #FFFFFF;
  border: 1px solid var(--border-default);
  box-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.05), 0 2px 8px rgba(0, 0, 0, 0.02);
  box-sizing: border-box;
  transition: border-color 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out);
}

.input-capsule:focus-within {
  border-color: var(--color-zen-sage);
  background: #FFFFFF;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18), 0 4px 14px rgba(0, 0, 0, 0.05);
}

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
  transition: transform 0.16s var(--ease-out), background 0.16s ease, box-shadow 0.16s ease;
}

.send-btn {
  background: #FFFFFF;
  border: 0.5px solid var(--border-subtle);
}

.send-btn.is-ready {
  background: linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%);
  border-color: transparent;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.4);
}

.send-btn.is-ready:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(139, 154, 110, 0.5);
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
