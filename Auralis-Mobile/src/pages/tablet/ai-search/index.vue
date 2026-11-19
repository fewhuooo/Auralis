<template>
  <TabletLayout>
    <view class="t-ai-layout">
      <view class="history-card zen-panel">
        <view class="history-header">
          <view class="ui-btn ui-btn-primary new-chat-btn" role="button" @click="startNewChat">
            <LineIcon name="plus" size="15px" color="#FFFFFF" />
            <text>新对话</text>
          </view>
        </view>

        <scroll-view scroll-y :show-scrollbar="false" class="history-scroll">
          <view v-if="loadingSessions" class="history-empty">加载中…</view>
          <view v-else-if="conversations.length === 0" class="history-empty">暂无历史</view>

          <view
            v-for="item in conversations"
            :key="item.id"
            class="history-item"
            :class="{ active: currentConversationId === item.id }"
            role="button"
            @click="item.id && switchConversation(item.id)"
          >
            <view class="history-info">
              <text class="history-title">{{ item.title || '新对话' }}</text>
              <text class="history-time num-tabular">{{ formatConvDate(item.updatedAt || item.createdAt) }}</text>
            </view>
            <view
              v-if="item.id"
              class="history-del"
              role="button"
              aria-label="删除对话"
              @click.stop="deleteConversation(item.id, item.version ?? 0)"
            >
              <LineIcon name="close" size="13px" color="var(--text-muted)" />
            </view>
          </view>
        </scroll-view>
      </view>

      <view class="chat-card zen-panel">
        <view class="chat-header">
          <text class="chat-title">{{ currentConversationTitle }}</text>
          <text v-if="isConversationUnsupported" class="unsupported-badge">旧版对话只读</text>
        </view>

        <view v-if="messages.length === 0" class="welcome-box">
          <BrandLogo size="44px" />
          <view v-if="preSendError" class="pre-send-error" role="alert">
            <LineIcon name="alert" size="14px" color="var(--color-danger)" />
            <text class="pre-send-error-text">{{ preSendError }}</text>
          </view>
          <view class="prompt-chips">
            <view
              v-for="prompt in quickPrompts"
              :key="prompt"
              class="prompt-chip"
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
          <view class="chat-stream">
            <view
              v-for="(msg, index) in messages"
              :key="msg.id"
              class="chat-row"
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
                  <LineIcon name="alert" size="14px" color="var(--color-danger)" />
                  <text class="assistant-error-text">{{ msg.errorMessage || '请求失败，请重试' }}</text>
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
                    <LineIcon name="copy" size="13px" color="var(--text-muted)" />
                    <text class="footer-action-label">复制</text>
                  </view>
                  <view
                    v-if="isLastAssistantMessage(msg.id) && !isTyping && !isStopping && !isConversationUnsupported && (msg.originatingKind !== 'activity_submission' || Boolean((msg.status === 'failed' || msg.status === 'cancelled') && msg.runId))"
                    class="footer-action-chip"
                    role="button"
                    aria-label="重新生成"
                    @click="regenerateAssistantMessage(msg.id)"
                  >
                    <LineIcon name="refresh" size="13px" color="var(--text-muted)" />
                    <text class="footer-action-label">重新生成</text>
                  </view>
                  <view
                    v-if="hasCopyableContent(msg)"
                    class="footer-action-chip"
                    role="button"
                    aria-label="存为知识块"
                    @click="openSaveBlockModal(msg)"
                  >
                    <LineIcon name="plus" size="13px" color="var(--text-muted)" />
                    <text class="footer-action-label">存为知识块</text>
                  </view>
                  <text v-if="msg.status === 'cancelled'" class="assistant-status-note">已停止</text>
                </view>
              </view>
            </view>

            <view :id="anchorId" class="bottom-anchor"></view>
          </view>
        </scroll-view>

        <view class="input-dock">
          <view
            v-if="autoScrollLocked && messages.length > 0"
            class="scroll-resume-pill"
            role="button"
            aria-label="回到最新"
            @click="resumeAutoScroll"
          >
            <view v-if="isTyping" class="scroll-resume-dot" aria-hidden="true"></view>
            <text class="scroll-resume-text">↓ 回到最新</text>
          </view>

          <view class="input-capsule">
            <input
              class="chat-input"
              v-model="query"
              :placeholder="composerPlaceholder"
              confirm-type="send"
              :disabled="isConversationUnsupported"
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
              :class="{ disabled: !query.trim() || isConversationUnsupported }"
              role="button"
              aria-label="发送"
              @click="sendMessage"
            >
              <LineIcon name="arrow-up" size="16px" color="#FFFFFF" />
            </view>
          </view>
        </view>
      </view>
    </view>

    <SaveKnowledgeBlockModal
      :visible="showSaveBlockModal"
      :initial-title="saveBlockSeedTitle"
      :initial-preview="saveBlockSeedContent"
      @close="showSaveBlockModal = false"
      @saved="showSaveBlockModal = false"
    />
  </TabletLayout>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { aiApi, type ConversationView } from '@/api/aiApi'
import {
  chatWithAI,
  retryChatRun,
  submitChatActivity,
  type ChatStreamEnvelope,
  type ChatWithAiOptions,
} from '@/api/aiClient'
import BrandLogo from '@/components/BrandLogo.vue'
import LineIcon from '@/components/LineIcon.vue'
import MobileChatPartList from '@/components/MobileChatPartList.vue'
import MobileChatProcessArea from '@/components/MobileChatProcessArea.vue'
import SaveKnowledgeBlockModal from '@/components/SaveKnowledgeBlockModal.vue'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
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
import { uuidv7 } from '@/utils/uuid'

const authStore = useAuthStore()
const instanceProxy = getCurrentInstance()?.proxy

const conversations = ref<ConversationView[]>([])
const loadingSessions = ref(false)
const currentConversationId = ref('')
const currentConversationTitle = ref('新对话')
const messages = ref<MobileChatMessage[]>([])
const query = ref('')
const isTyping = ref(false)
const isStopping = ref(false)
const activeRunId = ref('')
const activeAttemptId = ref('')
const isConversationUnsupported = ref(false)
const preSendError = ref('')
const scrollTargetId = ref('')
const anchorId = 'tablet-chat-anchor'
const autoScrollLocked = ref(false)
const drainingMessageIds = ref<Record<string, boolean>>({})

const showSaveBlockModal = ref(false)
const saveBlockSeedTitle = ref('')
const saveBlockSeedContent = ref('')

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

const quickPrompts = [
  '梳理本周重点待复习知识块',
  '对比几种常见正则化方法',
  '用清晰结构总结一个核心定理',
]

const composerPlaceholder = computed(() => (
  isConversationUnsupported.value ? '旧版对话仅供查看，请开启新对话继续提问' : '提问…'
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
    // Keep silent offline
  } finally {
    loadingSessions.value = false
  }
}

function startNewChat() {
  if (isTyping.value || isStopping.value) {
    uni.showToast({ title: '请先停止当前回答', icon: 'none' })
    return
  }
  activeStreamToken += 1
  activeViewToken += 1
  stopRunPolling()
  abortLocalStream = null
  currentConversationId.value = ''
  currentConversationTitle.value = '新对话'
  messages.value = []
  query.value = ''
  activeRunId.value = ''
  activeAttemptId.value = ''
  isConversationUnsupported.value = false
  preSendError.value = ''
  autoScrollLocked.value = false
  drainingMessageIds.value = {}
  prevScrollTop = 0
  touchPullUpDetected = false
  clearMapKeys(pendingSubmissionIds)
  clearMapKeys(activityVersions)
}

async function recoverUnknownRun(
  conversationId: string,
  runId: string,
  attemptId: string,
  viewToken: number,
  generation: symbol,
) {
  try {
    const recovered = await aiApi.recoverRunAttempt(conversationId, runId, attemptId)
    if (viewToken !== activeViewToken || generation !== authStore.getLoginGeneration()) return
    messages.value = applyRunStatusSnapshot(messages.value, recovered)
    scrollToBottom(false)
    if (recovered.executionActive && recovered.runId && recovered.status !== 'UNKNOWN') {
      activeRunId.value = recovered.runId
      activeAttemptId.value = recovered.currentAttemptId || attemptId
      isTyping.value = true
      scheduleRunPolling(conversationId, recovered.runId, viewToken, generation)
      return
    }
    isTyping.value = false
    activeRunId.value = ''
    activeAttemptId.value = ''
  } catch {
    if (viewToken !== activeViewToken || generation !== authStore.getLoginGeneration()) return
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
  failureCount = 0,
) {
  stopRunPolling()
  const delayMs = failureCount > 0 ? 2000 : 1500
  runPollTimer = setTimeout(() => {
    void (async () => {
      if (viewToken !== activeViewToken || generation !== authStore.getLoginGeneration()) return
      try {
        const statusView = await aiApi.getRunStatus(conversationId, runId)
        if (viewToken !== activeViewToken || generation !== authStore.getLoginGeneration()) return
        messages.value = applyRunStatusSnapshot(messages.value, statusView)
        scrollToBottom(false)
        if (statusView.executionActive && statusView.status !== 'UNKNOWN') {
          scheduleRunPolling(conversationId, runId, viewToken, generation, 0)
          return
        }
        if (statusView.status === 'UNKNOWN' && statusView.currentAttemptId) {
          await recoverUnknownRun(conversationId, runId, statusView.currentAttemptId, viewToken, generation)
          return
        }
        isTyping.value = false
        activeRunId.value = ''
        activeAttemptId.value = ''
      } catch {
        if (viewToken !== activeViewToken || generation !== authStore.getLoginGeneration()) return
        if (failureCount < 2) {
          scheduleRunPolling(conversationId, runId, viewToken, generation, failureCount + 1)
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

async function switchConversation(conversationId: string) {
  if (isTyping.value || isStopping.value) {
    uni.showToast({ title: '请先停止当前回答', icon: 'none' })
    return
  }
  const generation = authStore.getLoginGeneration()
  const viewToken = ++activeViewToken
  try {
    const detail = await aiApi.getConversation(conversationId)
    if (generation !== authStore.getLoginGeneration() || viewToken !== activeViewToken || isTyping.value || isStopping.value) {
      return
    }
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
    currentConversationTitle.value = detail.title || '新对话'
    isConversationUnsupported.value = !isConversationProtocolSupported(detail)
    preSendError.value = isConversationUnsupported.value ? '旧版对话仅供查看，请开启新对话继续提问' : ''
    messages.value = restoreConversationMessages(detail)

    if (detail.activeRun?.executionActive && detail.activeRun.runId) {
      if (detail.activeRun.status === 'UNKNOWN' && detail.activeRun.currentAttemptId) {
        void recoverUnknownRun(
          currentConversationId.value,
          detail.activeRun.runId,
          detail.activeRun.currentAttemptId,
          viewToken,
          generation,
        )
      } else {
        activeRunId.value = detail.activeRun.runId
        activeAttemptId.value = detail.activeRun.currentAttemptId || ''
        isTyping.value = true
        scheduleRunPolling(currentConversationId.value, detail.activeRun.runId, viewToken, generation)
      }
    }
    scrollToBottom(true)
  } catch {
    if (generation !== authStore.getLoginGeneration() || viewToken !== activeViewToken) return
    uni.showToast({ title: '加载失败', icon: 'none' })
  }
}

async function deleteConversation(conversationId: string, baseVersion: number) {
  if ((isTyping.value || isStopping.value) && currentConversationId.value === conversationId) {
    uni.showToast({ title: '请先停止当前回答', icon: 'none' })
    return
  }
  const generation = authStore.getLoginGeneration()
  try {
    await aiApi.deleteConversation(conversationId, baseVersion)
    if (generation !== authStore.getLoginGeneration()) return
    conversations.value = conversations.value.filter(item => item.id !== conversationId)
    if (currentConversationId.value === conversationId) {
      startNewChat()
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
    title: seedTitle.slice(0, 24) || 'AI 问答',
    baseVersion: 0,
    clientRequestId: uuidv7(),
  })
  if (generation !== authStore.getLoginGeneration()) {
    throw new Error('登录状态已变化，请重试')
  }
  if (!created.id) throw new Error('创建失败')
  currentConversationId.value = created.id
  currentConversationTitle.value = created.title || seedTitle.slice(0, 24) || '新对话'
  conversations.value = [created, ...conversations.value.filter(item => item.id !== created.id)]
  return created.id
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
  saveBlockSeedTitle.value = deriveKnowledgeBlockTitle(precedingQuestion, plainContent)
  saveBlockSeedContent.value = plainContent.slice(0, 4000)
  showSaveBlockModal.value = true
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
    // Server-side run may have settled already
  } finally {
    isStopping.value = false
    isTyping.value = false
    activeRunId.value = ''
    activeAttemptId.value = ''
    scrollToBottom(false)
  }
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
  resolveConversationId: () => Promise<string>
  invoke: (conversationId: string, onDelta: (delta: string) => void, options: ChatWithAiOptions) => Promise<void>
  restoreDraftText?: string
  dropPairOnPreAdmitError?: boolean
}) {
  const { aiIndex, streamToken, generation } = params
  const isCurrent = () => streamToken === activeStreamToken && generation === authStore.getLoginGeneration()
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
        scheduleRunPolling(convId, recovered.runId, activeViewToken, generation)
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
        '连接中断，请稍后重新切换对话查看结果',
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
        '连接意外结束，响应可能不完整，请稍后确认或重试',
      )
      return
    }
    messages.value[aiIndex] = applyTerminalState(messages.value[aiIndex], 'completed')
  } catch (err) {
    if (!isCurrent()) return
    if ((terminalStatus === 'UNKNOWN' || terminalStatus === null) && currentConversationId.value) {
      const recovery = await recoverInterruptedSlot(currentConversationId.value)
      if (!isCurrent() || recovery !== 'none') return
    }
    const errMessage = err instanceof Error ? err.message : '请求失败，请重试'
    if (params.restoreDraftText && !admittedTurn && !query.value.trim()) {
      query.value = params.restoreDraftText
    }
    if (params.dropPairOnPreAdmitError && !admittedTurn && messages.value.length === 2) {
      messages.value = []
      preSendError.value = errMessage
      return
    }
    messages.value[aiIndex] = applyTerminalState(messages.value[aiIndex], 'failed', errMessage)
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
    uni.showToast({ title: '旧版对话仅供查看，请开启新对话继续提问', icon: 'none' })
    return
  }
  const text = query.value.trim()
  if (!text || isTyping.value || isStopping.value) return

  stopRunPolling()
  activeViewToken += 1
  const streamToken = ++activeStreamToken
  const generation = authStore.getLoginGeneration()
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
    restoreDraftText: text,
    dropPairOnPreAdmitError: wasEmptyConversation,
    resolveConversationId: () => ensureConversation(text, generation),
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
    const streamToken = ++activeStreamToken
    const generation = authStore.getLoginGeneration()
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
  const streamToken = ++activeStreamToken
  const generation = authStore.getLoginGeneration()

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
    resolveConversationId: async () => convId,
    invoke: (conversationId, onDelta, options) => submitChatActivity(
      conversationId,
      { activityId: questionId, questionVersion, submissionId, answer: apiAnswer },
      onDelta,
      options,
    ),
  })
}

onMounted(() => {
  void loadHistory()
  void measureChatViewport()
})

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
.t-ai-layout {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  padding: 14px;
  gap: 14px;
  background-color: transparent;
  box-sizing: border-box;
  overflow: hidden;
}

.history-card {
  width: 244px;
  flex-shrink: 0;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  box-sizing: border-box;
}

.history-header {
  flex-shrink: 0;
}

.new-chat-btn {
  width: 100%;
  height: 40px;
}

.history-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.history-empty {
  padding: 28px 0;
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  margin-bottom: 4px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease;
}

.history-item:hover {
  background-color: var(--color-bg-tertiary);
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
  gap: 2px;
}

.history-title {
  font-size: 13px;
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

.history-del {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0.72;
  transition: opacity 0.14s ease, background-color 0.14s ease;
}

.history-del:hover {
  opacity: 1;
  background-color: var(--color-danger-bg);
}

.chat-card {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-header {
  height: 52px;
  padding: 0 24px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}

.chat-title {
  font-size: 15px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.unsupported-badge {
  font-size: 11px;
  padding: 3px 9px;
  border-radius: var(--radius-full);
  background-color: var(--color-warning-bg, rgba(217, 130, 43, 0.12));
  color: var(--color-warning-ink, #9A5513);
  flex-shrink: 0;
}

.welcome-box {
  flex: 1;
  min-height: 0;
  padding: 40px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  box-sizing: border-box;
}

.pre-send-error {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 10px;
  background-color: var(--color-danger-bg);
  border: 1px solid rgba(201, 59, 59, 0.22);
}

.pre-send-error-text {
  font-size: 12.5px;
  color: var(--color-danger);
}

.prompt-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  max-width: 560px;
}

.prompt-chip {
  padding: 10px 16px;
  border-radius: var(--radius-full);
  background-color: var(--glass-sub-bg);
  backdrop-filter: var(--glass-blur-soft);
  -webkit-backdrop-filter: var(--glass-blur-soft);
  border: 1px solid var(--glass-border-subtle);
  box-shadow: var(--glass-shadow-subtle);
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color 0.16s ease, background-color 0.16s ease, transform 0.14s ease;
}

.prompt-chip:hover {
  border-color: var(--border-accent);
  background-color: var(--color-sage-bg);
  transform: translateY(-1px);
}

.chat-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.chat-stream {
  width: 100%;
  padding: 20px clamp(24px, 5vw, 80px);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
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
}

.user-text {
  font-size: 14.5px;
  line-height: 1.55;
  color: #FFFFFF;
  word-break: break-word;
}

.assistant-bubble {
  width: 100%;
  max-width: 760px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
}

.assistant-error-banner {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 12px;
  border-radius: 10px;
  background-color: var(--color-danger-bg);
  border: 1px solid rgba(201, 59, 59, 0.22);
}

.assistant-error-text {
  font-size: 12.5px;
  color: var(--color-danger);
  line-height: 1.45;
  word-break: break-word;
}

.assistant-status-note {
  font-size: 12px;
  color: var(--text-muted);
}

.assistant-footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}

.footer-action-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  background-color: rgba(28, 28, 26, 0.045);
  cursor: pointer;
}

.footer-action-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.bottom-anchor {
  height: 8px;
}

.input-dock {
  position: relative;
  padding: 12px clamp(24px, 5vw, 80px) 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.scroll-resume-pill {
  position: absolute;
  top: -34px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
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
  font-size: 11.5px;
  color: var(--color-sage-ink);
  font-weight: 500;
}

.input-capsule {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 6px 6px 16px;
  border-radius: var(--radius-full);
  background-color: var(--glass-surface-strong);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  transition: border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;
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

.send-btn,
.stop-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.14s ease, opacity 0.14s ease;
}

.send-btn {
  background: var(--accent-gradient);
}

.stop-btn {
  background-color: #2C2C28;
}

.stop-square {
  width: 11px;
  height: 11px;
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

@media (max-width: 820px) {
  .history-card {
    width: 196px;
  }
}
</style>
