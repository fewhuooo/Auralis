<template>
  <TabletLayout>
    <view class="t-ai-layout">
      <view class="history-card zen-card">
        <view class="history-header">
          <view class="ui-btn ui-btn-primary new-chat-btn" @click="startNewChat">
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
            @click="item.id && switchConversation(item.id)"
          >
            <view class="history-info">
              <text class="history-title">{{ item.title || '新对话' }}</text>
              <text class="history-time num-tabular">{{ formatConvDate(item.updatedAt || item.createdAt) }}</text>
            </view>
            <view
              v-if="item.id"
              class="history-del"
              @click.stop="deleteConversation(item.id, item.version ?? 0)"
            >
              <LineIcon name="close" size="13px" color="var(--text-muted)" />
            </view>
          </view>
        </scroll-view>
      </view>

      <view class="chat-card zen-card">
        <view class="chat-header">
          <text class="chat-title">{{ currentConversationTitle }}</text>
        </view>

        <scroll-view
          scroll-y
          :show-scrollbar="false"
          class="chat-scroll"
          :scroll-into-view="scrollTargetId"
        >
          <view v-if="messages.length === 0" class="welcome-box">
            <BrandLogo size="44px" />
            <view class="prompt-chips">
              <view
                v-for="prompt in quickPrompts"
                :key="prompt"
                class="prompt-chip"
                @click="query = prompt; sendMessage()"
              >
                <text>{{ prompt }}</text>
              </view>
            </view>
          </view>

          <view v-else class="chat-stream">
            <view
              v-for="(msg, index) in messages"
              :key="index"
              class="chat-row"
              :class="msg.role"
            >
              <view v-if="msg.role === 'user'" class="user-bubble">
                <text class="user-text">{{ msg.content }}</text>
              </view>

              <view v-else class="assistant-bubble">
                <view v-if="msg.toolHint" class="tool-pill">
                  <text>{{ msg.toolHint }}</text>
                </view>

                <MarkdownText v-if="msg.content" :content="msg.content" />
                <text v-else-if="isTyping" class="typing-dot">···</text>

                <view v-if="msg.content && !(isTyping && index === messages.length - 1)" class="bubble-actions">
                  <view class="copy-btn" @click="copyText(msg.content)">
                    <LineIcon name="copy" size="14px" color="var(--text-muted)" />
                  </view>
                </view>
              </view>
            </view>

            <view :id="anchorId" class="bottom-anchor"></view>
          </view>
        </scroll-view>

        <view class="input-dock">
          <view class="input-capsule">
            <input
              class="chat-input"
              v-model="query"
              placeholder="输入问题…"
              confirm-type="send"
              :disabled="isTyping"
              @confirm="sendMessage"
            />
            <view
              class="send-btn"
              :class="{ disabled: !query.trim() || isTyping }"
              @click="sendMessage"
            >
              <LineIcon name="arrow-up" size="16px" color="#FFFFFF" />
            </view>
          </view>
        </view>
      </view>
    </view>
  </TabletLayout>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { aiApi, type ConversationView } from '@/api/aiApi'
import { chatWithAI } from '@/api/aiClient'
import BrandLogo from '@/components/BrandLogo.vue'
import LineIcon from '@/components/LineIcon.vue'
import MarkdownText from '@/components/MarkdownText.vue'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import { useAuthStore } from '@/store/useAuthStore'
import { uuidv7 } from '@/utils/uuid'

interface ChatBubbleItem {
  role: 'user' | 'assistant'
  content: string
  toolHint?: string
}

const authStore = useAuthStore()

const conversations = ref<ConversationView[]>([])
const loadingSessions = ref(false)
const currentConversationId = ref('')
const currentConversationTitle = ref('新对话')
const messages = ref<ChatBubbleItem[]>([])
const query = ref('')
const isTyping = ref(false)
const scrollTargetId = ref('')
const anchorId = 'tablet-chat-anchor'

let activeStreamToken = 0

const quickPrompts = [
  '梳理本周重点待复习知识块',
  '对比几种常见正则化方法',
  '用清晰结构总结一个核心定理',
]

function scrollToBottom() {
  nextTick(() => {
    scrollTargetId.value = anchorId
    setTimeout(() => {
      scrollTargetId.value = ''
    }, 80)
  })
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
  if (isTyping.value) return
  activeStreamToken++
  currentConversationId.value = ''
  currentConversationTitle.value = '新对话'
  messages.value = []
  query.value = ''
}

async function switchConversation(conversationId: string) {
  if (isTyping.value) return
  const generation = authStore.getLoginGeneration()
  try {
    const detail = await aiApi.getConversation(conversationId)
    if (generation !== authStore.getLoginGeneration()) return
    activeStreamToken++
    currentConversationId.value = detail.id || conversationId
    currentConversationTitle.value = detail.title || '新对话'
    messages.value = (detail.messages || [])
      .filter(m => m.role === 'USER' || m.role === 'ASSISTANT')
      .map(m => ({
        role: m.role === 'USER' ? 'user' : 'assistant',
        content: m.content || '',
      }))
    scrollToBottom()
  } catch {
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
          ? `检索 ${ev.name || '资料'}…`
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

onMounted(() => {
  void loadHistory()
})
</script>

<style scoped>
.t-ai-layout {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  padding: 16px;
  gap: 14px;
  background-color: var(--color-bg-primary);
  box-sizing: border-box;
  overflow: hidden;
}

.history-card {
  width: 248px;
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
  cursor: pointer;
  transition: background-color 0.16s ease;
}

.history-item:hover {
  background-color: var(--color-bg-primary);
}

.history-item.active {
  background-color: var(--color-sage-bg);
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
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0.65;
}

.chat-card {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-header {
  height: 52px;
  padding: 0 22px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
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

.chat-scroll {
  flex: 1;
  min-height: 0;
}

.welcome-box {
  min-height: 100%;
  padding: 40px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  box-sizing: border-box;
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
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color 0.16s ease, background-color 0.16s ease;
}

.prompt-chip:hover {
  border-color: var(--border-accent);
  background-color: var(--color-sage-bg);
}

.chat-stream {
  max-width: 760px;
  margin: 0 auto;
  padding: 20px 24px;
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
  align-items: flex-start;
}

.user-bubble {
  max-width: 72%;
  padding: 10px 16px;
  background-color: var(--color-zen-graphite);
  color: #FFFFFF;
  border-radius: 16px 16px 4px 16px;
}

.user-text {
  font-size: 14.5px;
  line-height: 1.55;
  color: #FFFFFF;
}

.assistant-bubble {
  width: 100%;
  padding: 16px 20px;
  border-radius: 16px;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  box-sizing: border-box;
}

.tool-pill {
  display: inline-block;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-size: var(--text-2xs);
  margin-bottom: 8px;
}

.typing-dot {
  font-size: 18px;
  color: var(--text-muted);
  letter-spacing: 3px;
}

.bubble-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.copy-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background-color: var(--color-bg-card);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.bottom-anchor {
  height: 8px;
}

.input-dock {
  padding: 12px 24px 18px;
  display: flex;
  justify-content: center;
  flex-shrink: 0;
}

.input-capsule {
  width: 100%;
  max-width: 760px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 6px 6px 16px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-sm);
}

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
  cursor: pointer;
  flex-shrink: 0;
}

.send-btn.disabled {
  opacity: 0.4;
}

@media (max-width: 820px) {
  .history-card {
    width: 196px;
  }
}
</style>
