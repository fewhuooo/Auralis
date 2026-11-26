<template>
  <TabletLayout>
    <div class="t-ai-layout">
      <div class="history-card">
        <div class="history-header-row">
          <span class="history-heading-title">历史对话</span>
          <span v-if="!loadingSessions && conversations.length > 0" class="history-heading-count num-tabular">
            {{ conversations.length }}
          </span>
        </div>

        <div
          class="history-new-btn"
          :class="{ disabled: isTyping || isStopping }"
          role="button"
          aria-label="开启新对话"
          @click="startNewChat"
        >
          <LineIcon name="plus" size="14px" color="var(--color-sage-ink)" />
          <span>开启新对话</span>
        </div>

        <div class="history-scroll zen-scroll-y">
          <div v-if="loadingSessions" class="history-empty">加载历史对话…</div>
          <div v-else-if="conversations.length === 0" class="history-empty">暂无历史对话</div>

          <div v-else class="history-list">
            <div
              v-for="item in conversations"
              :key="item.id"
              class="history-item"
              :class="{ active: currentConversationId === item.id }"
              role="button"
              @click="item.id && switchConversation(item.id)"
            >
              <div class="history-info">
                <span class="history-title">{{ item.title || '新对话' }}</span>
                <div class="history-subline">
                  <span class="history-time num-tabular">{{ formatConvDate(item.updatedAt || item.createdAt) }}</span>
                  <span v-if="item.chatScopeState === 'BOUND'" class="history-scope-tag">
                    {{ resolveConversationScope(item, subjectStore.subjects).label }}
                  </span>
                </div>
              </div>
              <div
                v-if="item.id"
                class="history-del"
                role="button"
                aria-label="删除对话"
                @click.stop="confirmDeleteConversation(item.id, item.version ?? 0)"
              >
                <LineIcon name="trash" size="14px" color="var(--text-muted)" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="chat-card">
        <div class="chat-header">
          <span class="chat-title">{{ currentConversationTitle }}</span>
          <span v-if="isConversationUnsupported" class="unsupported-badge">旧版对话只读</span>
        </div>

        <div v-if="messages.length === 0" class="welcome-stage">
          <div class="welcome-inner">
            <div class="welcome-hero">
              <span class="welcome-title">{{ welcomeTitle }}</span>
              <span class="welcome-subtitle num-tabular">{{ welcomeSubtitle }}</span>
            </div>

            <div class="starter-section">
              <div v-if="preSendError" class="pre-send-error" role="alert">
                <LineIcon name="alert" size="14px" color="var(--color-danger)" />
                <span class="pre-send-error-text">{{ preSendError }}</span>
              </div>

              <div class="starter-cards">
                <div
                  v-for="item in starterItems"
                  :key="item.prompt"
                  class="starter-card"
                  role="button"
                  @click="submitStarterPrompt(item.prompt)"
                >
                  <span class="starter-card-title">{{ item.prompt }}</span>
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
          <div class="chat-stream">
            <div
              v-for="(msg, index) in messages"
              :key="msg.id"
              class="chat-row"
              :class="msg.role"
            >
              <div v-if="msg.role === 'user'" class="user-bubble zen-chat-user-bubble">
                <span class="user-text">{{ msg.content }}</span>
              </div>

              <div v-else class="assistant-entry">
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

                <div v-if="msg.status === 'failed'" class="assistant-error-banner" role="alert">
                  <LineIcon name="alert" size="14px" color="var(--color-danger)" />
                  <span class="assistant-error-text">{{ msg.errorMessage || '请求失败，请重试' }}</span>
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
                    <LineIcon name="copy" size="13px" color="var(--text-muted)" />
                    <span class="footer-action-label">复制</span>
                  </div>
                  <div
                    v-if="isLastAssistantMessage(msg.id) && !isTyping && !isStopping && !isConversationUnsupported && (msg.originatingKind !== 'activity_submission' || Boolean((msg.status === 'failed' || msg.status === 'cancelled') && msg.runId))"
                    class="footer-action-chip"
                    role="button"
                    :aria-label="msg.status === 'failed' || msg.status === 'cancelled' ? '重试' : '重新生成'"
                    @click="regenerateAssistantMessage(msg.id)"
                  >
                    <LineIcon name="refresh" size="13px" color="var(--text-muted)" />
                    <span class="footer-action-label">{{ msg.status === 'failed' || msg.status === 'cancelled' ? '重试' : '重新生成' }}</span>
                  </div>
                  <div
                    v-if="hasCopyableContent(msg)"
                    class="footer-action-chip"
                    role="button"
                    aria-label="存为知识块"
                    @click="openSaveBlockModal(msg)"
                  >
                    <LineIcon name="plus" size="13px" color="var(--text-muted)" />
                    <span class="footer-action-label">存为知识块</span>
                  </div>
                  <span v-if="msg.status === 'cancelled'" class="assistant-status-note">已停止</span>
                </div>
              </div>
            </div>

            <div class="bottom-anchor"></div>
          </div>
        </div>

        <div class="input-dock">
          <div class="input-dock-inner">
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

            <div class="composer-card">
              <textarea
                ref="composerInputRef"
                v-model="query"
                class="composer-textarea"
                rows="1"
                :maxlength="2000"
                enterkeyhint="send"
                :disabled="isConversationUnsupported"
                :placeholder="composerPlaceholder"
                @input="handleQueryInput"
                @keydown="handleComposerKeydown"
              />

              <div class="composer-toolbar">
                <div class="composer-tools-left">
                  <div class="scope-dropdown-anchor">
                    <div
                      class="scope-capsule"
                      :class="{ 'is-locked': isScopeLocked || isTyping || isStopping, 'is-open': showScopeMenu }"
                      role="button"
                      :aria-expanded="showScopeMenu"
                      :aria-label="isScopeLocked ? `当前检索范围已锁定为${activeScopeLabel}` : `选择检索范围，当前为${activeScopeLabel}`"
                      @click="handleScopePillClick"
                    >
                      <div
                        class="scope-status-dot"
                        :class="{ 'is-locked': isScopeLocked }"
                        aria-hidden="true"
                      ></div>
                      <span class="scope-capsule-text">{{ activeScopeLabel }}</span>
                      <LineIcon
                        v-if="!isScopeLocked"
                        class="scope-capsule-chevron"
                        :class="{ 'is-rotated': showScopeMenu }"
                        name="chevron-down"
                        size="12px"
                        color="var(--text-muted)"
                      />
                    </div>

                    <div v-if="showScopeMenu" class="scope-dropdown-mask" @click="showScopeMenu = false"></div>

                    <div v-if="showScopeMenu" class="scope-dropdown-menu" @click.stop>
                      <div class="scope-dropdown-scroll zen-scroll-y">
                        <div class="dropdown-section-header">
                          <span>检索范围</span>
                        </div>
                        <div
                          class="dropdown-item"
                          :class="{ 'is-active': selectedSubjectId === null }"
                          role="button"
                          @click="selectScope(null)"
                        >
                          <div class="dropdown-item-icon">
                            <div
                              class="scope-status-dot"
                              :class="{ 'is-muted': selectedSubjectId !== null }"
                              aria-hidden="true"
                            ></div>
                          </div>
                          <div class="dropdown-item-text">
                            <span class="dropdown-item-label">全部资料</span>
                            <span class="dropdown-item-desc">检索全部学科已就绪资料</span>
                          </div>
                        </div>

                        <template v-if="subjectStore.subjects.length > 0">
                          <div class="dropdown-divider"></div>
                          <div class="dropdown-section-header">
                            <span>按学科限定</span>
                          </div>
                          <div
                            v-for="sub in subjectStore.subjects"
                            :key="sub.id"
                            class="dropdown-item"
                            :class="{ 'is-active': selectedSubjectId === sub.id }"
                            role="button"
                            @click="selectScope(sub.id)"
                          >
                            <div class="dropdown-item-icon">
                              <LineIcon
                                :name="resolveSubjectIcon(sub.icon)"
                                size="15px"
                                :color="selectedSubjectId === sub.id ? 'var(--color-sage-ink)' : 'var(--text-muted)'"
                              />
                            </div>
                            <div class="dropdown-item-text">
                              <span class="dropdown-item-label">{{ sub.name }}</span>
                              <span class="dropdown-item-desc num-tabular">{{ formatSubjectStats(sub) }}</span>
                            </div>
                          </div>
                        </template>

                        <div v-else class="dropdown-empty-hint">
                          <span>暂无学科，可先使用「全部资料」</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    v-if="messages.length > 0 || currentConversationId"
                    class="composer-tool-btn"
                    :class="{ disabled: isTyping || isStopping }"
                    role="button"
                    aria-label="开启新对话"
                    @click="startNewChat"
                  >
                    <LineIcon name="plus" size="15px" color="var(--color-sage-ink)" />
                  </div>
                </div>

                <div
                  v-if="isTyping || isStopping"
                  class="composer-action-btn stop-btn"
                  :class="{ disabled: isStopping }"
                  role="button"
                  aria-label="停止生成"
                  @click="stopGeneration"
                >
                  <div class="stop-square"></div>
                </div>
                <div
                  v-else
                  class="composer-action-btn send-btn"
                  :class="{ disabled: isConversationUnsupported || !query.trim() }"
                  role="button"
                  aria-label="发送"
                  @click="sendMessage"
                >
                  <LineIcon name="arrow-up" size="17px" color="#FFFFFF" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #modal>
      <SaveKnowledgeBlockModal
        :visible="showSaveBlockModal"
        :default-subject-id="selectedSubjectId"
        :initial-title="saveBlockSeedTitle"
        :initial-preview="saveBlockSeedContent"
        @close="showSaveBlockModal = false"
        @saved="showSaveBlockModal = false"
      />
    </template>
  </TabletLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { aiApi, type ConversationView } from '@/api/aiApi'
import {
  chatWithAI,
  retryChatRun,
  submitChatActivity,
  type ChatStreamEnvelope,
  type ChatWithAiOptions,
} from '@/api/aiClient'
import { ApiProblemError } from '@/api/protocol'
import LineIcon from '@/components/LineIcon.vue'
import MobileChatPartList from '@/components/MobileChatPartList.vue'
import MobileChatProcessArea from '@/components/MobileChatProcessArea.vue'
import SaveKnowledgeBlockModal from '@/components/SaveKnowledgeBlockModal.vue'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import { useEscapeKey } from '@/composables/useEscapeKey'
import { confirmDialog, showToast } from '@/platform/feedback'
import { onPageLoad } from '@/platform/lifecycle'
import { useAuthStore } from '@/store/useAuthStore'
import { useBlockStore } from '@/store/useBlockStore'
import { useSubjectStore, type Subject } from '@/store/useSubjectStore'
import { handleEnterKey, resetTextareaHeight, syncTextareaAutoHeight } from '@/utils/domHelpers'
import {
  applyContentDelta,
  applyReasoningDelta,
  applyRunStatusSnapshot,
  applyTerminalState,
  applyToolEvent,
  buildMobileReadingContext,
  buildMobileStarterPrompts,
  canSelectMobileScope,
  createAssistantPlaceholder,
  deriveKnowledgeBlockTitle,
  evaluateSmartScroll,
  formatMobileAiScopeAnchor,
  isConversationProtocolSupported,
  resolveConversationScope,
  restoreConversationMessages,
  safeDecodeQueryParam,
  type MobileChatMessage,
} from '@/utils/mobileAiChat'
import {
  extractPartsPlainText,
  reduceMobileChatPartEvent,
  type MobileChatActivityAnswer,
} from '@/utils/mobileChatParts'
import { copyTextWithFallback } from '@/utils/mobileLearning'
import { isSubjectIconKey } from '@/utils/subjectIcon'
import { uuidv7 } from '@/utils/uuid'

const STARTER_HINTS = [
  '定位高频考点与薄弱项',
  '拆解核心异同与边界',
  '随堂检验掌握度并附解析',
] as const

const authStore = useAuthStore()
const blockStore = useBlockStore()
const subjectStore = useSubjectStore()
const chatScrollRef = ref<HTMLElement | null>(null)
const composerInputRef = ref<HTMLElement | null>(null)

const conversations = ref<ConversationView[]>([])
const loadingSessions = ref(false)
const currentConversationId = ref('')
const currentConversationTitle = ref('新对话')
const conversationScopeState = ref<'UNBOUND' | 'BOUND'>('UNBOUND')
const selectedSubjectId = ref<string | null>(null)
const boundScopeLabelOverride = ref<string | null>(null)
const messages = ref<MobileChatMessage[]>([])
const query = ref('')

watch(
  query,
  (val) => {
    if (!val) {
      void nextTick(() => resetTextareaHeight(composerInputRef.value))
    }
  },
)
const isTyping = ref(false)
const isStopping = ref(false)
const activeRunId = ref('')
const activeAttemptId = ref('')
const isConversationUnsupported = ref(false)
const preSendError = ref('')
const autoScrollLocked = ref(false)
const drainingMessageIds = ref<Record<string, boolean>>({})

const showScopeMenu = ref(false)
const showSaveBlockModal = ref(false)
const saveBlockSeedTitle = ref('')
const saveBlockSeedContent = ref('')

useEscapeKey(() => showScopeMenu.value, () => {
  showScopeMenu.value = false
})

let activeStreamToken = 0
let activeViewToken = 0
let scrollTimer: ReturnType<typeof setTimeout> | null = null
let runPollTimer: ReturnType<typeof setTimeout> | null = null
let abortLocalStream: (() => void) | null = null
let subjectsLoadPromise: Promise<void> | null = null
let hydratedUserKey = ''
let prevScrollTop = 0
let chatViewportHeight = 0
let touchStartY = 0
let touchPullUpDetected = false
let programmaticScrollUntil = 0
const pendingSubmissionIds: Record<string, string> = {}
const activityVersions: Record<string, number> = {}

const selectedSubject = computed(() => (
  selectedSubjectId.value
    ? subjectStore.subjects.find(item => item.id === selectedSubjectId.value) || null
    : null
))

const selectedSubjectName = computed(() => selectedSubject.value?.name?.trim() || null)

const isScopeLocked = computed(() => conversationScopeState.value === 'BOUND' || messages.value.length > 0)

const activeScopeLabel = computed(() => {
  if (boundScopeLabelOverride.value) return boundScopeLabelOverride.value
  if (selectedSubjectId.value) return selectedSubjectName.value || '指定学科'
  return '全部资料'
})

const totalBlockCount = computed(() => (
  blockStore.recentBlocks.length > 0
    ? blockStore.recentBlocks.filter(item => !item.is_deleted).length
    : undefined
))

const welcomeTitle = computed(() => (
  selectedSubjectName.value ? `《${selectedSubjectName.value}》想先看哪部分？` : '想先攻克哪部分？'
))

const welcomeSubtitle = computed(() => formatMobileAiScopeAnchor({
  selectedSubject: selectedSubject.value,
  subjects: subjectStore.subjects,
  totalBlockCount: totalBlockCount.value,
}))

const composerPlaceholder = computed(() => {
  if (isConversationUnsupported.value) return '旧版对话仅供查看，请开启新对话继续提问'
  return selectedSubjectName.value ? `在《${selectedSubjectName.value}》中提问…` : '输入学习问题…'
})

const starterItems = computed(() => (
  buildMobileStarterPrompts(selectedSubjectName.value).map((prompt, index) => ({
    prompt,
    hint: STARTER_HINTS[index] || STARTER_HINTS[STARTER_HINTS.length - 1],
  }))
))

function resolveSubjectIcon(icon?: string | null): string {
  const key = icon?.trim()
  if (key && isSubjectIconKey(key)) return `subj-${key}`
  return 'subj-book'
}

function formatSubjectStats(subject: Subject): string {
  const files = subject.fileCount ?? 0
  const blocks = subject.blockCount ?? 0
  if (files === 0 && blocks === 0) return '暂无资料与知识块'
  return `${files} 份资料 · ${blocks} 个知识块`
}

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
  syncTextareaAutoHeight(event, 124)
  onQueryInput()
}

function onQueryInput() {
  if (preSendError.value) {
    preSendError.value = ''
  }
}

function handleComposerKeydown(event: unknown) {
  handleEnterKey(event, () => {
    void sendMessage()
  }, { allowShiftNewline: true, preventDefault: true })
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

function ensureSubjectsLoaded(): Promise<void> {
  const currentUserKey = `${authStore.user?.id || 'anon'}:${authStore.serverDeviceId || 'dev'}`
  if (hydratedUserKey === currentUserKey && subjectStore.subjects.length > 0) {
    return Promise.resolve()
  }
  if (!subjectsLoadPromise) {
    subjectsLoadPromise = Promise.all([
      subjectStore.loadSubjects(),
      blockStore.loadLocalBlocks(),
    ]).then(() => {
      if (currentUserKey === `${authStore.user?.id || 'anon'}:${authStore.serverDeviceId || 'dev'}`) {
        hydratedUserKey = currentUserKey
      }
    }).finally(() => {
      subjectsLoadPromise = null
    })
  }
  return subjectsLoadPromise
}

function handleScopePillClick() {
  if (isTyping.value || isStopping.value || isScopeLocked.value) {
    showScopeMenu.value = false
    notifyScopeLocked()
    return
  }
  if (showScopeMenu.value) {
    showScopeMenu.value = false
    return
  }
  void openScopeMenu()
}

async function openScopeMenu() {
  if (!canSelectMobileScope({ isTyping: isTyping.value, isStopping: isStopping.value, scopeLocked: isScopeLocked.value })) {
    notifyScopeLocked()
    return
  }
  await ensureSubjectsLoaded()
  if (!canSelectMobileScope({ isTyping: isTyping.value, isStopping: isStopping.value, scopeLocked: isScopeLocked.value })) return
  showScopeMenu.value = true
}

function notifyScopeLocked() {
  showToast('当前对话范围已锁定，切换范围可点击左侧开启新对话')
}

function selectScope(subjectId: string | null) {
  if (!canSelectMobileScope({ isTyping: isTyping.value, isStopping: isStopping.value, scopeLocked: isScopeLocked.value })) {
    showScopeMenu.value = false
    notifyScopeLocked()
    return
  }
  selectedSubjectId.value = subjectId
  boundScopeLabelOverride.value = null
  showScopeMenu.value = false
}

async function loadHistory() {
  const generation = authStore.getLoginGeneration()
  loadingSessions.value = true
  try {
    await ensureSubjectsLoaded()
    const list = await aiApi.listConversations()
    if (generation !== authStore.getLoginGeneration()) return
    conversations.value = list.filter(item => !item.deletedAt)
  } catch {
    // Keep silent offline
  } finally {
    if (generation === authStore.getLoginGeneration()) {
      loadingSessions.value = false
    }
  }
}

function resetChatState() {
  activeStreamToken += 1
  activeViewToken += 1
  stopRunPolling()
  const abortFn = abortLocalStream
  abortLocalStream = null
  abortFn?.()
  currentConversationId.value = ''
  currentConversationTitle.value = '新对话'
  conversationScopeState.value = 'UNBOUND'
  selectedSubjectId.value = null
  boundScopeLabelOverride.value = null
  showScopeMenu.value = false
  messages.value = []
  query.value = ''
  isTyping.value = false
  isStopping.value = false
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

function startNewChat() {
  if (isTyping.value || isStopping.value) {
    showToast('请先停止当前回答')
    return
  }
  resetChatState()
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
      scheduleRunPolling(convIdOrFallback(conversationId), recovered.runId, viewToken, generation)
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

function convIdOrFallback(id: string): string {
  return id || currentConversationId.value
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
    showToast('请先停止当前回答')
    return
  }
  const generation = authStore.getLoginGeneration()
  const viewToken = ++activeViewToken
  showScopeMenu.value = false
  try {
    await ensureSubjectsLoaded()
    const detail = await aiApi.getConversation(conversationId)
    if (generation !== authStore.getLoginGeneration() || viewToken !== activeViewToken || isTyping.value || isStopping.value) {
      return
    }
    activeStreamToken += 1
    stopRunPolling()
    isTyping.value = false
    activeRunId.value = ''
    activeAttemptId.value = ''
    const abortFn = abortLocalStream
    abortLocalStream = null
    abortFn?.()
    drainingMessageIds.value = {}
    clearMapKeys(pendingSubmissionIds)
    clearMapKeys(activityVersions)

    currentConversationId.value = detail.id || conversationId
    currentConversationTitle.value = detail.title || '新对话'
    isConversationUnsupported.value = !isConversationProtocolSupported(detail)
    preSendError.value = isConversationUnsupported.value ? '旧版对话仅供查看，请开启新对话继续提问' : ''

    const resolvedScope = resolveConversationScope(detail, subjectStore.subjects)
    conversationScopeState.value = resolvedScope.locked ? 'BOUND' : 'UNBOUND'
    selectedSubjectId.value = resolvedScope.subjectId
    boundScopeLabelOverride.value = resolvedScope.locked && resolvedScope.label.includes('指定资料')
      ? resolvedScope.label
      : null

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
    if (isConversationUnsupported.value && messages.value.length > 0) {
      showToast('旧版对话仅供查看，请开启新对话继续提问')
    }
    scrollToBottom(true)
  } catch {
    if (generation !== authStore.getLoginGeneration() || viewToken !== activeViewToken) return
    showToast('加载失败')
  }
}

async function confirmDeleteConversation(conversationId: string, baseVersion: number) {
  if ((isTyping.value || isStopping.value) && currentConversationId.value === conversationId) {
    showToast('请先停止当前回答')
    return
  }
  const generation = authStore.getLoginGeneration()
  const confirmed = await confirmDialog({
    title: '删除对话',
    content: '删除后无法恢复该对话记录',
    confirmText: '删除',
    confirmTone: 'danger',
  })
  if (!confirmed || generation !== authStore.getLoginGeneration()) return
  void deleteConversation(conversationId, baseVersion)
}

async function syncConversationMeta(conversationId: string, generation: symbol) {
  try {
    const detail = await aiApi.getConversation(conversationId)
    if (generation !== authStore.getLoginGeneration()) return
    const idx = conversations.value.findIndex(item => item.id === conversationId)
    const nextItem: ConversationView = {
      id: detail.id ?? conversationId,
      title: detail.title,
      version: detail.version,
      chatScopeState: detail.chatScopeState,
      chatScope: detail.chatScope,
      updatedAt: detail.updatedAt,
      createdAt: detail.createdAt,
    }
    if (idx >= 0) {
      conversations.value = conversations.value.map(item => (
        item.id === conversationId ? { ...item, ...nextItem } : item
      ))
    } else {
      conversations.value = [nextItem, ...conversations.value]
    }
  } catch {
    // Keep existing conversation list item when offline
  }
}

async function deleteConversation(conversationId: string, baseVersion: number) {
  if ((isTyping.value || isStopping.value) && currentConversationId.value === conversationId) return
  const generation = authStore.getLoginGeneration()
  try {
    try {
      await aiApi.deleteConversation(conversationId, baseVersion)
    } catch (error) {
      if (error instanceof ApiProblemError && error.status === 409) {
        const latest = await aiApi.getConversation(conversationId)
        if (generation !== authStore.getLoginGeneration()) return
        await aiApi.deleteConversation(conversationId, Number(latest.version ?? baseVersion))
      } else {
        throw error
      }
    }
    if (generation !== authStore.getLoginGeneration()) return
    conversations.value = conversations.value.filter(item => item.id !== conversationId)
    if (currentConversationId.value === conversationId) {
      resetChatState()
    }
    showToast('已删除')
  } catch {
    if (generation !== authStore.getLoginGeneration()) return
    showToast('删除失败')
  }
}

async function ensureConversation(seedTitle: string, generation: symbol, isCurrent: () => boolean): Promise<string> {
  if (currentConversationId.value) return currentConversationId.value
  const created = await aiApi.createConversation({
    title: seedTitle.slice(0, 24) || 'AI 问答',
    baseVersion: 0,
    clientRequestId: uuidv7(),
  })
  if (generation !== authStore.getLoginGeneration()) {
    throw new Error('登录状态已变化，请重试')
  }
  if (!created.id) throw new Error('创建对话失败')
  if (isCurrent()) {
    currentConversationId.value = created.id
    currentConversationTitle.value = created.title || seedTitle.slice(0, 24) || '新对话'
  }
  conversations.value = [created, ...conversations.value.filter(item => item.id !== created.id)]
  return created.id
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
    // Server-side run may have settled already
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
  readingContext?: ReturnType<typeof buildMobileReadingContext>
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

  const markAdmitted = () => {
    if (admittedTurn) return
    admittedTurn = true
    conversationScopeState.value = 'BOUND'
  }

  try {
    const conversationId = await params.resolveConversationId()
    if (!isCurrent()) return

    await params.invoke(conversationId, (delta) => {
      if (!isCurrent()) return
      markAdmitted()
      messages.value[aiIndex] = applyContentDelta(messages.value[aiIndex], delta)
      scrollToBottom(false)
    }, {
      readingContext: params.readingContext,
      onRunStarted: ({ runId, attemptId }) => {
        if (!isCurrent()) return
        markAdmitted()
        activeRunId.value = runId
        activeAttemptId.value = attemptId
        messages.value[aiIndex] = { ...messages.value[aiIndex], runId }
      },
      onEnvelope: (envelope) => {
        if (!isCurrent()) return
        markAdmitted()
        applyEnvelopeToSlot(aiIndex, envelope)
      },
      onReasoningDelta: (delta) => {
        if (!isCurrent()) return
        markAdmitted()
        messages.value[aiIndex] = applyReasoningDelta(messages.value[aiIndex], delta)
        scrollToBottom(false)
      },
      onToolEvent: (ev) => {
        if (!isCurrent()) return
        markAdmitted()
        messages.value[aiIndex] = applyToolEvent(messages.value[aiIndex], ev)
      },
      onTerminal: ({ status }) => {
        if (!isCurrent()) return
        markAdmitted()
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
      if (admittedTurn && currentConversationId.value) {
        void syncConversationMeta(currentConversationId.value, generation)
      }
      scrollToBottom(false)
    }
  }
}

async function sendMessage() {
  if (isConversationUnsupported.value) {
    showToast('旧版对话仅供查看，请开启新对话继续提问')
    return
  }
  const text = query.value.trim()
  if (!text || isTyping.value || isStopping.value) return

  stopRunPolling()
  activeViewToken += 1
  const streamToken = ++activeStreamToken
  const generation = authStore.getLoginGeneration()
  const wasEmptyConversation = messages.value.length === 0
  const chosenSubjectId = selectedSubjectId.value
  const readingContext = buildMobileReadingContext(chosenSubjectId, conversationScopeState.value)

  preSendError.value = ''
  query.value = ''
  showScopeMenu.value = false
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
    readingContext,
    resolveConversationId: () => ensureConversation(text, generation, () => (
      streamToken === activeStreamToken && generation === authStore.getLoginGeneration()
    )),
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

  if (target.status === 'failed' || target.status === 'cancelled') {
    stopRunPolling()
    activeViewToken += 1
    const streamToken = ++activeStreamToken
    const generation = authStore.getLoginGeneration()
    const readingContext = buildMobileReadingContext(selectedSubjectId.value, conversationScopeState.value)
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
      readingContext,
      resolveConversationId: () => ensureConversation(promptText, generation, () => (
        streamToken === activeStreamToken && generation === authStore.getLoginGeneration()
      )),
      invoke: (conversationId, onDelta, options) => chatWithAI(promptText, [], onDelta, conversationId, options),
    })
    return
  }

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
  showScopeMenu.value = false
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

watch(
  () => [authStore.sessionId, authStore.user?.id, authStore.serverDeviceId],
  () => {
    hydratedUserKey = ''
    subjectsLoadPromise = null
    showSaveBlockModal.value = false
    conversations.value = []
    resetChatState()
    if (authStore.isAuthenticated) {
      void loadHistory()
    }
  },
)

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

onPageLoad((options) => {
  if (options?.subjectId) {
    const incomingSubjectId = safeDecodeQueryParam(options.subjectId).trim()
    if (incomingSubjectId && !isScopeLocked.value) {
      selectedSubjectId.value = incomingSubjectId
    }
  }
  if (options?.q) {
    const initialQuestion = safeDecodeQueryParam(options.q)
    if (!initialQuestion.trim()) return
    const viewToken = activeViewToken
    const generation = authStore.getLoginGeneration()
    query.value = initialQuestion
    void ensureSubjectsLoaded().then(() => {
      if (viewToken !== activeViewToken || generation !== authStore.getLoginGeneration()) return
      void sendMessage()
    })
  }
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
  width: 260px;
  flex-shrink: 0;
  height: 100%;
  background-color: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid #EAE6DD;
  border-radius: 20px;
  box-shadow: var(--glass-shadow-subtle);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.history-header-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 18px 16px 12px;
  flex-shrink: 0;
}

.history-heading-title {
  font-size: 16px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.015em;
}

.history-heading-count {
  font-size: 12px;
  color: var(--text-muted);
}

.history-new-btn {
  margin: 0 14px 12px;
  height: 40px;
  padding: 0 14px;
  border-radius: 12px;
  background-color: #EEF2E6;
  border: 1px solid #DCE3CE;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-sage-ink);
  flex-shrink: 0;
  cursor: pointer;
  box-sizing: border-box;
  transition: transform 0.14s var(--ease-out), background-color 0.16s ease;
}

.history-new-btn:hover:not(.disabled) {
  background-color: #E5ECD9;
}

.history-new-btn:active {
  transform: scale(0.98);
}

.history-new-btn.disabled {
  opacity: 0.42;
}

.history-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.history-empty {
  padding: 36px 16px;
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.history-list {
  padding: 2px 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 12px;
  border-radius: 12px;
  background-color: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

/* #ifdef H5 */
.history-item:hover {
  background-color: rgba(28, 28, 26, 0.035);
}
/* #endif */

.history-item.active {
  background-color: #FFFFFF;
  border-color: #EAE6DD;
  box-shadow: 0 1px 3px rgba(72, 62, 46, 0.04);
}

.history-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-title {
  font-size: 13.5px;
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-item.active .history-title {
  font-weight: var(--font-weight-semibold);
  color: var(--color-sage-ink);
}

.history-subline {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.history-time {
  font-size: 11px;
  color: var(--text-muted);
}

.history-scope-tag {
  font-size: 10.5px;
  font-weight: var(--font-weight-medium);
  color: var(--color-sage-ink);
  background-color: #EEF2E6;
  padding: 1px 7px;
  border-radius: var(--radius-full);
}

.history-del {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0.68;
  transition: opacity 0.14s ease, background-color 0.14s ease;
}

/* #ifdef H5 */
.history-del:hover {
  opacity: 1;
  background-color: var(--color-danger-bg);
}
/* #endif */

.chat-card {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
  background-color: var(--color-bg-primary, #F7F2EB);
  border: 1px solid #EAE6DD;
  border-radius: 20px;
  box-shadow: var(--glass-shadow-subtle);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.chat-header {
  height: 52px;
  padding: 0 24px;
  border-bottom: 1px solid rgba(45, 55, 40, 0.06);
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

.welcome-stage {
  flex: 1;
  min-height: 0;
  padding: 28px 28px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
  box-sizing: border-box;
}

.welcome-inner {
  width: 100%;
  max-width: 680px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 22px;
}

.welcome-hero {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  gap: 8px;
}

.welcome-title {
  font-size: 26px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.025em;
  line-height: 1.25;
}

.welcome-subtitle {
  font-size: 13.5px;
  color: var(--text-muted);
  line-height: 1.45;
}

.starter-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pre-send-error {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 12px;
  border-radius: 12px;
  background-color: var(--color-danger-bg);
  border: 1px solid rgba(201, 59, 59, 0.22);
}

.pre-send-error-text {
  flex: 1;
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--color-danger);
  line-height: 1.45;
  word-break: break-word;
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
  padding: 14px 16px;
  border-radius: 15px;
  background-color: #FFFFFF;
  border: 1px solid #EAE6DD;
  box-shadow: 0 1px 2px rgba(72, 62, 46, 0.03);
  cursor: pointer;
  transition: transform 0.14s var(--ease-out), border-color 0.16s ease, box-shadow 0.16s ease;
  box-sizing: border-box;
}

/* #ifdef H5 */
.starter-card:hover {
  border-color: #D7D0C2;
  box-shadow: 0 4px 14px rgba(72, 62, 46, 0.06);
  transform: translateY(-1px);
}
/* #endif */

.starter-card:active {
  transform: scale(0.988);
}

.starter-card-title {
  font-size: 15px;
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

.chat-stream {
  width: 100%;
  max-width: 780px;
  margin: 0 auto;
  padding: 20px 28px 36px;
  box-sizing: border-box;
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

.chat-row.user:not(:first-child) {
  margin-top: 12px;
}

.chat-row.assistant {
  align-items: stretch;
}

.user-bubble {
  max-width: 72%;
}

.user-text {
  font-size: 15px;
  line-height: 1.55;
  color: var(--text-primary, #262522);
  letter-spacing: -0.005em;
  word-break: break-word;
}

.assistant-entry {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 2px 2px 4px;
  box-sizing: border-box;
}

.assistant-error-banner {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 12px;
  border-radius: 12px;
  background-color: var(--color-danger-bg);
  border: 1px solid rgba(201, 59, 59, 0.22);
}

.assistant-error-text {
  flex: 1;
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--color-danger);
  line-height: 1.45;
  word-break: break-word;
}

.assistant-status-note {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.assistant-footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
  animation: footerFadeIn 0.22s ease both;
}

@keyframes footerFadeIn {
  0% { opacity: 0; transform: translateY(3px); }
  100% { opacity: 1; transform: translateY(0); }
}

.footer-action-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 7px;
  border-radius: 8px;
  background-color: transparent;
  cursor: pointer;
  transition: background-color 0.14s ease, transform 0.12s ease;
}

.footer-action-chip:active {
  transform: scale(0.96);
  background-color: rgba(28, 28, 26, 0.05);
}

/* #ifdef H5 */
.footer-action-chip:hover {
  background-color: rgba(28, 28, 26, 0.05);
}
/* #endif */

.footer-action-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-weight: var(--font-weight-medium);
}

.bottom-anchor {
  height: 24px;
}

.input-dock {
  position: relative;
  z-index: 120;
  padding: 6px 28px 18px;
  background-color: var(--color-bg-primary, #F7F2EB);
  flex-shrink: 0;
}

.input-dock::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: -26px;
  height: 26px;
  background: linear-gradient(to bottom, rgba(247, 242, 235, 0) 0%, #F7F2EB 100%);
  pointer-events: none;
}

.input-dock-inner {
  position: relative;
  width: 100%;
  max-width: 780px;
  margin: 0 auto;
}

.scroll-resume-pill {
  position: absolute;
  top: -42px;
  right: 4px;
  z-index: 125;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  background-color: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(28, 28, 26, 0.08);
  box-shadow: 0 4px 12px rgba(72, 62, 46, 0.09);
  cursor: pointer;
  white-space: nowrap;
}

.scroll-resume-pill:active {
  transform: scale(0.96);
}

.scroll-resume-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #556B3D;
  animation: zenTypingPulse 1.2s ease-in-out infinite;
}

.scroll-resume-text {
  font-size: 12px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-sage-ink);
}

.composer-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px 10px 18px;
  border-radius: 22px;
  background-color: #FFFFFF;
  border: 1px solid rgba(28, 28, 26, 0.08);
  box-shadow: 0 6px 20px rgba(72, 62, 46, 0.07), 0 1px 3px rgba(72, 62, 46, 0.03);
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
  box-sizing: border-box;
}

/* #ifdef H5 */
.composer-card:focus-within {
  border-color: rgba(110, 127, 80, 0.55);
  box-shadow: 0 12px 32px rgba(72, 62, 46, 0.14), 0 4px 12px rgba(85, 107, 61, 0.10);
}
/* #endif */

.composer-textarea {
  width: 100%;
  min-height: 28px;
  max-height: 124px;
  padding: 2px 4px 0 0;
  font-size: 14.5px;
  line-height: 1.5;
  color: var(--text-primary);
  background-color: transparent;
  box-sizing: border-box;
  overflow-y: auto;
}

.composer-textarea::placeholder {
  color: #8A8A85;
}

.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.composer-tools-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.scope-dropdown-anchor {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
}

.scope-capsule {
  position: relative;
  z-index: 35;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  min-width: 0;
  max-width: 100%;
  padding: 0 11px;
  border-radius: var(--radius-full);
  background-color: #F6F3EC;
  border: 1px solid #EAE6DD;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease, transform 0.14s ease;
  box-sizing: border-box;
}

/* #ifdef H5 */
.scope-capsule:hover {
  background-color: #EFF3E8;
  border-color: rgba(85, 107, 61, 0.35);
}

.scope-capsule.is-locked:hover {
  background-color: #F4F1EA;
  border-color: #EAE6DD;
}
/* #endif */

.scope-capsule:active {
  transform: scale(0.97);
}

.scope-capsule.is-open {
  background-color: #EFF3E8;
  border-color: rgba(85, 107, 61, 0.35);
}

.scope-capsule.is-locked {
  background-color: #F4F1EA;
  border-color: #EAE6DD;
}

.scope-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--color-sage-ink);
  flex-shrink: 0;
}

.scope-status-dot.is-locked,
.scope-status-dot.is-muted {
  background-color: var(--color-zen-stone);
}

.scope-capsule-text {
  font-size: 12.5px;
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

.scope-capsule.is-locked .scope-capsule-text {
  color: var(--text-secondary);
}

.scope-capsule-chevron {
  flex-shrink: 0;
  opacity: 0.7;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.scope-capsule-chevron.is-rotated {
  transform: rotate(180deg);
  opacity: 1;
}

.scope-dropdown-mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 25;
  background-color: transparent;
}

.scope-dropdown-menu {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 0;
  z-index: 40;
  width: 268px;
  max-width: calc(100vw - 48px);
  padding: 8px;
  background-color: #FCFBF9;
  border: 1px solid #EAE6DD;
  border-radius: 16px;
  box-shadow: 0 8px 22px rgba(72, 62, 46, 0.08);
  box-sizing: border-box;
  transform-origin: bottom left;
  animation: scopePopUp 0.18s var(--ease-out) both;
}

@keyframes scopePopUp {
  0% {
    opacity: 0;
    transform: translateY(6px) scale(0.98);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.scope-dropdown-scroll {
  max-height: 290px;
  max-height: min(290px, 46vh);
}

.dropdown-section-header {
  padding: 6px 10px 4px;
  font-size: 11.5px;
  font-weight: var(--font-weight-bold);
  color: var(--text-muted);
  letter-spacing: 0.03em;
}

.dropdown-divider {
  height: 1px;
  background-color: var(--border-subtle);
  margin: 4px 6px;
}

.dropdown-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

/* #ifdef H5 */
.dropdown-item:hover {
  background-color: rgba(28, 28, 26, 0.04);
}
/* #endif */

.dropdown-item:active {
  background-color: rgba(28, 28, 26, 0.06);
}

.dropdown-item.is-active {
  background-color: var(--color-sage-bg);
}

.dropdown-item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  border-radius: 2px;
  background-color: var(--color-zen-sage);
}

.dropdown-item-icon {
  width: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.dropdown-item-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.dropdown-item-label {
  font-size: 12.5px;
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-item.is-active .dropdown-item-label {
  color: var(--color-sage-ink);
  font-weight: var(--font-weight-bold);
}

.dropdown-item-desc {
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-item.is-active .dropdown-item-desc {
  color: var(--color-sage-ink);
  opacity: 0.85;
}

.dropdown-empty-hint {
  padding: 10px 10px 6px;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.composer-tool-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background-color: #F6F3EC;
  border: 1px solid #EAE6DD;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.14s ease, opacity 0.14s ease;
}

.composer-tool-btn:active {
  transform: scale(0.92);
}

.composer-tool-btn.disabled {
  opacity: 0.4;
}

.composer-action-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.14s ease, opacity 0.14s ease;
}

.composer-action-btn:active {
  transform: scale(0.92);
}

.composer-action-btn.disabled {
  opacity: 0.36;
  box-shadow: none;
}

.send-btn {
  background-color: #556B3D;
  background-image: linear-gradient(135deg, #6B7D4D 0%, #556B3D 100%);
}

.stop-btn {
  background-color: #556B3D;
  background-image: linear-gradient(135deg, #6B7D4D 0%, #556B3D 100%);
}

.stop-square {
  width: 11px;
  height: 11px;
  border-radius: 2px;
  background-color: #FFFFFF;
}

@media (max-width: 820px) {
  .history-card {
    width: 204px;
  }

  .welcome-stage {
    padding: 20px 18px 16px;
  }

  .chat-stream {
    padding: 16px 18px 32px;
  }

  .input-dock {
    padding: 6px 16px 14px;
  }
}
</style>
