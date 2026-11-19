<template>
  <AppPageLayout anim-origin="bottom-right" :show-tab-bar="false" custom-bg>
    <view class="ai-page">
      <AppHeader
        show-back
        back-url="/pages/mobile/home/index"
        right-icon="history"
        right-aria-label="历史对话"
        @right-click="openHistoryDrawer"
      />

      <view v-if="messages.length === 0" class="welcome-stage">
        <view class="welcome-hero">
          <text class="welcome-title">{{ welcomeTitle }}</text>
          <text class="welcome-subtitle num-tabular">{{ welcomeSubtitle }}</text>
        </view>

        <view class="starter-section">
          <view v-if="preSendError" class="pre-send-error" role="alert">
            <LineIcon name="alert" size="14px" color="var(--color-danger)" />
            <text class="pre-send-error-text">{{ preSendError }}</text>
          </view>

          <view class="starter-cards">
            <view
              v-for="item in starterItems"
              :key="item.prompt"
              class="starter-card"
              role="button"
              @click="submitStarterPrompt(item.prompt)"
            >
              <text class="starter-card-title">{{ item.prompt }}</text>
              <text class="starter-card-hint">{{ item.hint }}</text>
            </view>
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
        <view class="chat-list">
          <view
            v-for="(msg, idx) in messages"
            :key="msg.id"
            class="chat-row"
            :class="msg.role"
          >
            <view v-if="msg.role === 'user'" class="user-bubble zen-chat-user-bubble">
              <text class="user-text">{{ msg.content }}</text>
            </view>

            <view v-else class="assistant-entry">
              <MobileChatProcessArea
                :reasoning="msg.reasoningText"
                :tools="msg.tools"
                :timeline="msg.processTimeline"
                :streaming="msg.status === 'streaming'"
                :has-content="hasVisibleAssistantContent(msg)"
                :expanded="msg.processExpanded"
                :error-highlight="hasFailedToolWithoutAnswer(msg)"
                @toggle="toggleProcess(idx)"
                @progress="handleStreamingTextProgress"
              />

              <MobileChatPartList
                v-if="hasVisibleAssistantContent(msg)"
                :parts="msg.parts"
                :fallback-text="msg.content"
                :streaming="msg.status === 'streaming'"
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
                  v-if="isLastAssistantMessage(msg.id) && !isTyping && !isStopping && !isConversationUnsupported"
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
        </view>

        <view :id="anchorId" class="bottom-anchor"></view>
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

        <view class="composer-card">
          <textarea
            v-model="query"
            class="composer-textarea"
            auto-height
            :maxlength="2000"
            :show-confirm-bar="false"
            confirm-type="send"
            :disabled="isConversationUnsupported"
            :placeholder="composerPlaceholder"
            placeholder-style="color: #8A8A85"
            @input="onQueryInput"
            @confirm="sendMessage"
          />

          <view class="composer-toolbar">
            <view class="composer-tools-left">
              <view class="scope-dropdown-anchor">
                <view
                  class="scope-capsule"
                  :class="{ 'is-locked': isScopeLocked || isTyping || isStopping, 'is-open': showScopeMenu }"
                  role="button"
                  :aria-expanded="showScopeMenu"
                  :aria-label="isScopeLocked ? `当前检索范围已锁定为${activeScopeLabel}` : `选择检索范围，当前为${activeScopeLabel}`"
                  @click="handleScopePillClick"
                >
                  <view
                    class="scope-status-dot"
                    :class="{ 'is-locked': isScopeLocked }"
                    aria-hidden="true"
                  ></view>
                  <text class="scope-capsule-text">{{ activeScopeLabel }}</text>
                  <LineIcon
                    v-if="!isScopeLocked"
                    class="scope-capsule-chevron"
                    :class="{ 'is-rotated': showScopeMenu }"
                    name="chevron-down"
                    size="12px"
                    color="var(--text-muted)"
                  />
                </view>

                <view v-if="showScopeMenu" class="scope-dropdown-mask" @click="showScopeMenu = false"></view>

                <view v-if="showScopeMenu" class="scope-dropdown-menu" @click.stop>
                  <scroll-view scroll-y :show-scrollbar="false" class="scope-dropdown-scroll">
                    <view class="dropdown-section-header">
                      <text>检索范围</text>
                    </view>
                    <view
                      class="dropdown-item"
                      :class="{ 'is-active': selectedSubjectId === null }"
                      role="button"
                      @click="selectScope(null)"
                    >
                      <view class="dropdown-item-icon">
                        <view
                          class="scope-status-dot"
                          :class="{ 'is-muted': selectedSubjectId !== null }"
                          aria-hidden="true"
                        ></view>
                      </view>
                      <view class="dropdown-item-text">
                        <text class="dropdown-item-label">全部资料</text>
                        <text class="dropdown-item-desc">检索全部学科已就绪资料</text>
                      </view>
                    </view>

                    <template v-if="subjectStore.subjects.length > 0">
                      <view class="dropdown-divider"></view>
                      <view class="dropdown-section-header">
                        <text>按学科限定</text>
                      </view>
                      <view
                        v-for="sub in subjectStore.subjects"
                        :key="sub.id"
                        class="dropdown-item"
                        :class="{ 'is-active': selectedSubjectId === sub.id }"
                        role="button"
                        @click="selectScope(sub.id)"
                      >
                        <view class="dropdown-item-icon">
                          <LineIcon
                            :name="resolveSubjectIcon(sub.icon)"
                            size="15px"
                            :color="selectedSubjectId === sub.id ? 'var(--color-sage-ink)' : 'var(--text-muted)'"
                          />
                        </view>
                        <view class="dropdown-item-text">
                          <text class="dropdown-item-label">{{ sub.name }}</text>
                          <text class="dropdown-item-desc num-tabular">{{ formatSubjectStats(sub) }}</text>
                        </view>
                      </view>
                    </template>

                    <view v-else class="dropdown-empty-hint">
                      <text>暂无学科，可先使用「全部资料」</text>
                    </view>
                  </scroll-view>
                </view>
              </view>

              <view
                v-if="messages.length > 0 || currentConversationId"
                class="composer-tool-btn"
                :class="{ disabled: isTyping || isStopping }"
                role="button"
                aria-label="开启新对话"
                @click="startNewChat"
              >
                <LineIcon name="plus" size="15px" color="var(--color-sage-ink)" />
              </view>
            </view>

            <view
              v-if="isTyping || isStopping"
              class="composer-action-btn stop-btn"
              :class="{ disabled: isStopping }"
              role="button"
              aria-label="停止生成"
              @click="stopGeneration"
            >
              <view class="stop-square"></view>
            </view>
            <view
              v-else
              class="composer-action-btn send-btn"
              :class="{ disabled: isConversationUnsupported || !query.trim() }"
              role="button"
              aria-label="发送"
              @click="sendMessage"
            >
              <LineIcon name="arrow-up" size="17px" color="#FFFFFF" />
            </view>
          </view>
        </view>
      </view>
    </view>

    <template #overlay>
      <view v-if="showHistorySheet" class="history-drawer-mask" @click="showHistorySheet = false">
        <view class="history-drawer-panel" @click.stop>
          <view class="history-drawer-header" :style="historyDrawerHeaderStyle">
            <view class="history-drawer-heading">
              <text class="history-drawer-title">历史对话</text>
              <text v-if="!loadingHistory && conversations.length > 0" class="history-drawer-count num-tabular">
                {{ conversations.length }}
              </text>
            </view>
            <view class="history-close-btn" role="button" aria-label="关闭" @click="showHistorySheet = false">
              <LineIcon name="close" size="15px" color="var(--text-muted)" />
            </view>
          </view>

          <view
            v-if="messages.length > 0 || currentConversationId"
            class="history-new-btn"
            :class="{ disabled: isTyping || isStopping }"
            role="button"
            aria-label="开启新对话"
            @click="startNewChat"
          >
            <LineIcon name="plus" size="14px" color="var(--color-sage-ink)" />
            <text>开启新对话</text>
          </view>

          <view v-if="loadingHistory" class="history-empty">加载历史对话…</view>
          <view v-else-if="conversations.length === 0" class="history-empty">暂无历史对话</view>
          <scroll-view v-else scroll-y :show-scrollbar="false" class="history-drawer-scroll">
            <view class="history-drawer-list">
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
                  <view class="history-subline">
                    <text class="history-time num-tabular">{{ formatConvDate(conv.updatedAt || conv.createdAt) }}</text>
                    <text v-if="conv.chatScopeState === 'BOUND'" class="history-scope-tag">
                      {{ resolveConversationScope(conv, subjectStore.subjects).label }}
                    </text>
                  </view>
                </view>
                <view
                  v-if="conv.id"
                  class="history-delete"
                  role="button"
                  aria-label="删除对话"
                  @click.stop="confirmDeleteConversation(conv.id, conv.version ?? 0)"
                >
                  <LineIcon name="trash" size="14px" color="var(--text-muted)" />
                </view>
              </view>
            </view>
          </scroll-view>
        </view>
      </view>

      <SaveKnowledgeBlockModal
        :visible="showSaveBlockModal"
        :default-subject-id="selectedSubjectId"
        :initial-title="saveBlockSeedTitle"
        :initial-preview="saveBlockSeedContent"
        @close="showSaveBlockModal = false"
        @saved="showSaveBlockModal = false"
      />
    </template>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { aiApi, type ConversationView } from '@/api/aiApi'
import {
  chatWithAI,
  retryChatRun,
  submitChatActivity,
  type ChatStreamEnvelope,
  type ChatWithAiOptions,
} from '@/api/aiClient'
import AppHeader from '@/components/AppHeader.vue'
import AppPageLayout from '@/components/AppPageLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import MobileChatPartList from '@/components/MobileChatPartList.vue'
import MobileChatProcessArea from '@/components/MobileChatProcessArea.vue'
import SaveKnowledgeBlockModal from '@/components/SaveKnowledgeBlockModal.vue'
import { useEscapeKey } from '@/composables/useEscapeKey'
import { useAuthStore } from '@/store/useAuthStore'
import { useBlockStore } from '@/store/useBlockStore'
import { useSubjectStore, type Subject } from '@/store/useSubjectStore'
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
const instanceProxy = getCurrentInstance()?.proxy

const query = ref('')
const messages = ref<MobileChatMessage[]>([])
const currentConversationId = ref('')
const conversationScopeState = ref<'UNBOUND' | 'BOUND'>('UNBOUND')
const selectedSubjectId = ref<string | null>(null)
const boundScopeLabelOverride = ref<string | null>(null)
const isTyping = ref(false)
const isStopping = ref(false)
const activeRunId = ref('')
const activeAttemptId = ref('')
const isConversationUnsupported = ref(false)
const preSendError = ref('')
const scrollTargetId = ref('')
const anchorId = 'chat-bottom-anchor'
const autoScrollLocked = ref(false)
const drainingMessageIds = ref<Record<string, boolean>>({})

const showScopeMenu = ref(false)
const showHistorySheet = ref(false)
const loadingHistory = ref(false)
const conversations = ref<ConversationView[]>([])

const showSaveBlockModal = ref(false)
const saveBlockSeedTitle = ref('')
const saveBlockSeedContent = ref('')

useEscapeKey(() => showScopeMenu.value, () => {
  showScopeMenu.value = false
})
useEscapeKey(() => showHistorySheet.value, () => {
  showHistorySheet.value = false
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

const historyDrawerHeaderStyle = computed(() => {
  // #ifdef MP-WEIXIN
  try {
    const menuRect = (uni as unknown as {
      getMenuButtonBoundingClientRect?: () => { bottom: number }
    }).getMenuButtonBoundingClientRect?.()
    if (menuRect && menuRect.bottom > 0) {
      return { paddingTop: `${Math.max(48, Math.round(menuRect.bottom + 10))}px` }
    }
  } catch {
    // Fallback to default Mini Program capsule clearance
  }
  return { paddingTop: '88px' }
  // #endif
  // #ifndef MP-WEIXIN
  return {}
  // #endif
})

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

function hasFailedToolWithoutAnswer(msg: MobileChatMessage): boolean {
  return !msg.content && msg.parts.length === 0 && msg.tools.some(step => step.status === 'FAILED')
}

function hasVisibleAssistantContent(msg: MobileChatMessage): boolean {
  return msg.parts.length > 0 || Boolean(msg.content)
}

function hasCopyableContent(msg: MobileChatMessage): boolean {
  return Boolean(extractPartsPlainText(msg.parts, msg.content).trim())
}

function stopRunPolling() {
  if (runPollTimer) {
    clearTimeout(runPollTimer)
    runPollTimer = null
  }
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

function isLastAssistantMessage(msgId: string): boolean {
  for (let i = messages.value.length - 1; i >= 0; i -= 1) {
    if (messages.value[i].role === 'assistant') {
      return messages.value[i].id === msgId
    }
  }
  return false
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
  uni.showToast({
    title: '当前对话范围已锁定，切换范围可在历史对话中开启新对话',
    icon: 'none',
  })
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

function clearMapKeys(map: Record<string, string> | Record<string, number>) {
  for (const key of Object.keys(map)) {
    delete map[key]
  }
}

function resetChatState() {
  activeStreamToken += 1
  activeViewToken += 1
  stopRunPolling()
  currentConversationId.value = ''
  conversationScopeState.value = 'UNBOUND'
  selectedSubjectId.value = null
  boundScopeLabelOverride.value = null
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
  abortLocalStream = null
  clearMapKeys(pendingSubmissionIds)
  clearMapKeys(activityVersions)
}

function startNewChat() {
  if (isTyping.value || isStopping.value) {
    uni.showToast({ title: '请先停止当前回答', icon: 'none' })
    return
  }
  showHistorySheet.value = false
  resetChatState()
}

function submitStarterPrompt(prompt: string) {
  if (isTyping.value || isStopping.value) return
  query.value = prompt
  void sendMessage()
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

function formatConvDate(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function openHistoryDrawer() {
  showScopeMenu.value = false
  showHistorySheet.value = true
  loadingHistory.value = true
  const generation = authStore.getLoginGeneration()
  try {
    if (subjectStore.subjects.length === 0) {
      await subjectStore.loadSubjects()
    }
    const list = await aiApi.listConversations()
    if (generation !== authStore.getLoginGeneration()) return
    conversations.value = list.filter(item => !item.deletedAt)
  } catch {
    if (generation !== authStore.getLoginGeneration()) return
    uni.showToast({ title: '加载失败', icon: 'none' })
  } finally {
    loadingHistory.value = false
  }
}

async function loadConversation(conversationId: string) {
  if (isTyping.value || isStopping.value) {
    uni.showToast({ title: '请先停止当前回答', icon: 'none' })
    return
  }
  const generation = authStore.getLoginGeneration()
  const viewToken = ++activeViewToken
  try {
    await ensureSubjectsLoaded()
    const detail = await aiApi.getConversation(conversationId)
    if (
      generation !== authStore.getLoginGeneration()
      || viewToken !== activeViewToken
      || isTyping.value
      || isStopping.value
    ) {
      return
    }

    activeStreamToken += 1
    stopRunPolling()
    isTyping.value = false
    activeRunId.value = ''
    activeAttemptId.value = ''
    isConversationUnsupported.value = !isConversationProtocolSupported(detail)
    preSendError.value = isConversationUnsupported.value ? '旧版对话仅供查看，请在历史对话中开启新对话' : ''
    abortLocalStream = null
    drainingMessageIds.value = {}
    clearMapKeys(pendingSubmissionIds)
    clearMapKeys(activityVersions)
    currentConversationId.value = detail.id || conversationId

    const resolvedScope = resolveConversationScope(detail, subjectStore.subjects)
    conversationScopeState.value = resolvedScope.locked ? 'BOUND' : 'UNBOUND'
    selectedSubjectId.value = resolvedScope.subjectId
    boundScopeLabelOverride.value = resolvedScope.locked && resolvedScope.label.includes('指定资料')
      ? resolvedScope.label
      : null

    messages.value = restoreConversationMessages(detail)

    if (detail.activeRun?.executionActive && detail.activeRun.runId) {
      if (detail.activeRun.status === 'UNKNOWN' && detail.activeRun.currentAttemptId) {
        void aiApi.recoverRunAttempt(currentConversationId.value, detail.activeRun.runId, detail.activeRun.currentAttemptId).catch(() => {})
      } else {
        activeRunId.value = detail.activeRun.runId
        activeAttemptId.value = detail.activeRun.currentAttemptId || ''
        isTyping.value = true
        scheduleRunPolling(currentConversationId.value, detail.activeRun.runId, viewToken, generation)
      }
    }
    if (isConversationUnsupported.value && messages.value.length > 0) {
      uni.showToast({ title: '旧版对话仅供查看，请开启新对话继续提问', icon: 'none' })
    }

    showHistorySheet.value = false
    scrollToBottom(true)
  } catch {
    if (generation !== authStore.getLoginGeneration() || viewToken !== activeViewToken) return
    uni.showToast({ title: '加载失败', icon: 'none' })
  }
}

function scheduleRunPolling(conversationId: string, runId: string, viewToken: number, generation: symbol) {
  stopRunPolling()
  runPollTimer = setTimeout(() => {
    void (async () => {
      if (viewToken !== activeViewToken || generation !== authStore.getLoginGeneration()) return
      try {
        const statusView = await aiApi.getRunStatus(conversationId, runId)
        if (viewToken !== activeViewToken || generation !== authStore.getLoginGeneration()) return
        messages.value = applyRunStatusSnapshot(messages.value, statusView)
        scrollToBottom(false)
        if (statusView.executionActive && statusView.status !== 'UNKNOWN') {
          scheduleRunPolling(conversationId, runId, viewToken, generation)
          return
        }
        if (statusView.status === 'UNKNOWN' && statusView.currentAttemptId) {
          void aiApi.recoverRunAttempt(conversationId, runId, statusView.currentAttemptId).catch(() => {})
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
    })()
  }, 1500)
}

function confirmDeleteConversation(conversationId: string, baseVersion: number) {
  if ((isTyping.value || isStopping.value) && currentConversationId.value === conversationId) {
    uni.showToast({ title: '请先停止当前回答', icon: 'none' })
    return
  }
  uni.showModal({
    title: '删除对话',
    content: '删除后无法恢复该对话记录',
    confirmText: '删除',
    confirmColor: '#C93B3B',
    success: (res) => {
      if (res.confirm) {
        void deleteConversation(conversationId, baseVersion)
      }
    },
  })
}

async function deleteConversation(conversationId: string, baseVersion: number) {
  if ((isTyping.value || isStopping.value) && currentConversationId.value === conversationId) return
  const generation = authStore.getLoginGeneration()
  try {
    await aiApi.deleteConversation(conversationId, baseVersion)
    if (generation !== authStore.getLoginGeneration()) return
    conversations.value = conversations.value.filter(item => item.id !== conversationId)
    if (currentConversationId.value === conversationId) {
      resetChatState()
    }
    uni.showToast({ title: '已删除', icon: 'none' })
  } catch {
    if (generation !== authStore.getLoginGeneration()) return
    uni.showToast({ title: '删除失败', icon: 'none' })
  }
}

async function ensureConversation(seedTitle: string, generation: symbol, isCurrent: () => boolean): Promise<string> {
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
  if (isCurrent()) {
    currentConversationId.value = created.id
  }
  return created.id
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
    // Server-side run may have already settled; UI stays safely unlocked.
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
  readingContext?: ReturnType<typeof buildMobileReadingContext>
}) {
  const { aiIndex, streamToken, generation } = params
  const isCurrent = () => streamToken === activeStreamToken && generation === authStore.getLoginGeneration()
  let admittedTurn = false
  let terminalStatus: 'COMPLETED' | 'CANCELLED' | 'UNKNOWN' | 'FAILED' | null = null

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
      if (activeRunId.value && activeAttemptId.value) {
        void aiApi.recoverRunAttempt(conversationId, activeRunId.value, activeAttemptId.value).catch(() => {})
      }
      messages.value[aiIndex] = applyTerminalState(
        messages.value[aiIndex],
        'failed',
        '连接中断，请稍后在历史对话中确认最终结果',
      )
      return
    }
    if (terminalStatus === null) {
      if (activeRunId.value && activeAttemptId.value) {
        void aiApi.recoverRunAttempt(conversationId, activeRunId.value, activeAttemptId.value).catch(() => {})
      }
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
    if ((terminalStatus === 'UNKNOWN' || terminalStatus === null) && currentConversationId.value && activeRunId.value && activeAttemptId.value) {
      void aiApi.recoverRunAttempt(currentConversationId.value, activeRunId.value, activeAttemptId.value).catch(() => {})
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
      isTyping.value = false
      activeRunId.value = ''
      activeAttemptId.value = ''
      abortLocalStream = null
      scrollToBottom(false)
    }
  }
}

async function sendMessage() {
  if (isConversationUnsupported.value) {
    uni.showToast({ title: '旧版对话仅供查看，请在历史对话中开启新对话', icon: 'none' })
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
    activeViewToken += 1
    const streamToken = ++activeStreamToken
    const generation = authStore.getLoginGeneration()
    const targetRunId = target.runId
    const convId = currentConversationId.value
    setMessageDraining(target.id, false)
    messages.value[msgIndex] = {
      ...createAssistantPlaceholder(target.id),
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

  if (target.originatingKind === 'activity_submission' && !target.runId) return

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

onMounted(() => {
  void ensureSubjectsLoaded()
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

onLoad((options) => {
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
.ai-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-primary, #F7F2EB);
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
  max-width: 148px;
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
  top: auto;
  z-index: 40;
  width: 260px;
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
  height: 0.5px;
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
  border-radius: 1.5px;
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

.welcome-stage {
  flex: 1;
  min-height: 0;
  padding: 20px 18px 24px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 20px;
  box-sizing: border-box;
}

.welcome-hero {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  gap: 8px;
  width: 100%;
}

.welcome-title {
  font-size: 24px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.025em;
  line-height: 1.25;
}

.welcome-subtitle {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.45;
}

.starter-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
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
  transition: transform 0.14s var(--ease-out), border-color 0.16s ease;
  box-sizing: border-box;
}

/* #ifdef H5 */
.starter-card:hover {
  border-color: #D7D0C2;
}
/* #endif */

.starter-card:active {
  transform: scale(0.985);
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

.chat-list {
  padding: 10px 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.chat-row {
  display: flex;
  flex-direction: column;
}

.chat-row.user {
  align-items: flex-end;
}

.chat-row.assistant {
  align-items: stretch;
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
  padding: 0 9px;
  border-radius: 8px;
  background-color: transparent;
  border: 1px solid #EAE6DD;
  cursor: pointer;
  transition: background-color 0.14s ease, border-color 0.14s ease, transform 0.12s ease;
}

.footer-action-chip:active {
  transform: scale(0.96);
  background-color: rgba(139, 154, 110, 0.1);
}

/* #ifdef H5 */
.footer-action-chip:hover {
  border-color: rgba(110, 127, 80, 0.42);
  background-color: rgba(139, 154, 110, 0.08);
}
/* #endif */

.footer-action-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-weight: var(--font-weight-medium);
}

.assistant-status-note {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.bottom-anchor {
  height: 12px;
}

.input-dock {
  position: relative;
  z-index: 120;
  padding: 12px 18px calc(20px + env(safe-area-inset-bottom));
  background-color: var(--color-bg-primary, #F7F2EB);
  flex-shrink: 0;
}

.scroll-resume-pill {
  position: absolute;
  top: -42px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 125;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: var(--radius-full);
  background-color: #FFFFFF;
  border: 1px solid #EAE6DD;
  box-shadow: 0 6px 18px rgba(72, 62, 46, 0.12), 0 2px 5px rgba(72, 62, 46, 0.05);
  cursor: pointer;
  white-space: nowrap;
}

.scroll-resume-pill:active {
  transform: translateX(-50%) scale(0.96);
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
  gap: 6px;
  padding: 10px 12px 10px 15px;
  border-radius: 20px;
  background-color: #FFFFFF;
  border: 1px solid #EAE6DD;
  box-shadow: 0 10px 28px rgba(72, 62, 46, 0.11), 0 3px 10px rgba(72, 62, 46, 0.06);
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
  max-height: 112px;
  padding: 2px 4px 0 0;
  font-size: 14.5px;
  line-height: 1.5;
  color: var(--text-primary);
  background-color: transparent;
  box-sizing: border-box;
  overflow-y: auto;
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
  box-shadow: none;
}

.stop-btn {
  background-color: #556B3D;
  background-image: linear-gradient(135deg, #6B7D4D 0%, #556B3D 100%);
}

.stop-square {
  width: 11px;
  height: 11px;
  border-radius: 2.5px;
  background-color: #FFFFFF;
}

.history-drawer-mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: var(--z-index-sheet, 1100);
  background-color: rgba(28, 28, 26, 0.24);
  display: flex;
  justify-content: flex-end;
  align-items: stretch;
  animation: historyMaskFade 0.2s ease both;
}

.history-drawer-panel {
  width: 82%;
  max-width: 340px;
  min-width: 268px;
  height: 100%;
  background-color: var(--color-bg-tertiary, #FAF7F2);
  border-left: 1px solid #EAE6DD;
  box-shadow: -12px 0 32px rgba(45, 55, 40, 0.12);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  animation: historyDrawerIn 0.24s var(--ease-out) both;
}

.history-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: calc(18px + env(safe-area-inset-top) + var(--status-bar-height, 0px)) 16px 14px;
  flex-shrink: 0;
  box-sizing: border-box;
}

.history-drawer-heading {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.history-drawer-title {
  font-size: 17px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.015em;
}

.history-drawer-count {
  font-size: 12px;
  color: var(--text-muted);
}

.history-close-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background-color: #FFFFFF;
  border: 1px solid #EAE6DD;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.14s var(--ease-out), border-color 0.16s ease;
}

.history-close-btn:active {
  transform: scale(0.92);
}

.history-new-btn {
  margin: 0 16px 12px;
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

.history-new-btn:active {
  transform: scale(0.98);
}

.history-new-btn.disabled {
  opacity: 0.42;
}

.history-drawer-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.history-drawer-list {
  padding: 2px 12px calc(20px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;
}

.history-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.history-row {
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
.history-row:hover {
  background-color: rgba(28, 28, 26, 0.035);
}
/* #endif */

.history-row.active {
  background-color: #FFFFFF;
  border-color: #EAE6DD;
  box-shadow: 0 1px 3px rgba(72, 62, 46, 0.04);
}

.history-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-title {
  font-size: 14px;
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-row.active .history-title {
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

.history-delete {
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
.history-delete:hover {
  opacity: 1;
  background-color: var(--color-danger-bg);
}
/* #endif */

@keyframes historyMaskFade {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

@keyframes historyDrawerIn {
  0% { transform: translateX(100%); }
  100% { transform: translateX(0); }
}

</style>
