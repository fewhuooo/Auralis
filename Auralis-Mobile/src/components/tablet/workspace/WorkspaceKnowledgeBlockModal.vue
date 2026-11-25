<template>
  <view v-if="visible" class="zen-modal-mask kb-modal-mask" @click="handleClose">
    <view
      class="kb-modal-card"
      role="dialog"
      aria-modal="true"
      :aria-label="dialogAriaLabel"
      @click.stop
    >
      <view class="modal-header">
        <view v-if="mode === 'view'" class="kb-dialog-header-title">
          <text class="kb-dialog-main-title">知识块详情</text>
          <text v-if="displaySubject" class="kb-dialog-subject-pill" :style="subjectPillStyle">
            {{ displaySubject }}
          </text>
        </view>
        <text v-else class="modal-title">{{ dialogTitle }}</text>

        <view
          v-if="!saving"
          class="modal-close-btn"
          role="button"
          aria-label="关闭"
          @click="handleClose"
        >
          <LineIcon name="close" size="15px" color="var(--text-muted)" />
        </view>
      </view>

      <!-- 浏览模式 -->
      <scroll-view v-if="mode === 'view'" scroll-y :show-scrollbar="false" class="kb-view-scroll">
        <view class="kb-article-container">
          <view class="kb-meta-card">
            <text class="kb-title">{{ block?.title || '未命名知识块' }}</text>

            <view class="kb-meta-row">
              <view v-if="displaySource" class="kb-meta-item kb-meta-source">
                <LineIcon name="file-text" size="13px" color="var(--text-muted)" />
                <text class="kb-meta-source-text">{{ displaySource }}</text>
              </view>

              <view v-if="block?.time" class="kb-meta-item kb-meta-time">
                <LineIcon name="history" size="13px" color="var(--text-muted)" />
                <text class="num-tabular">{{ formatFriendlyTime(block.time) }}</text>
              </view>
            </view>
          </view>

          <view class="kb-content-card">
            <view v-if="rawContent.trim()" class="kb-markdown-content">
              <MarkdownText :content="rawContent" />
            </view>
            <view v-else class="kb-empty-content">
              <LineIcon name="file-text" size="32px" color="var(--text-muted)" />
              <text class="kb-empty-text">该知识块暂无详细内容</text>
            </view>
          </view>
        </view>
      </scroll-view>

      <!-- 编辑 / 创建模式 -->
      <scroll-view v-else scroll-y :show-scrollbar="false" class="kb-edit-scroll">
        <view class="edit-body">
          <view class="modal-form-group">
            <view class="modal-form-label">
              <text>标题</text>
              <text class="required">*</text>
            </view>
            <input
              v-model="draftTitle"
              :disabled="saving"
              class="modal-form-input"
              placeholder="输入知识块标题"
              maxlength="120"
            />
          </view>

          <view class="modal-form-group">
            <view class="modal-form-label">
              <text>颜色标记</text>
            </view>
            <view class="color-row">
              <view
                v-for="c in BLOCK_THEME_COLORS"
                :key="c.value"
                class="color-dot"
                :class="{ 'is-selected': draftColor === c.value }"
                :style="{ background: c.value }"
                :aria-label="c.name"
                role="button"
                @click="!saving && (draftColor = c.value)"
              ></view>
            </view>
          </view>

          <view class="modal-form-group kb-content-group">
            <view class="editor-label-row">
              <view class="modal-form-label">
                <text>知识内容</text>
                <text class="required">*</text>
              </view>
              <view class="render-toggle-group" role="tablist" aria-label="编辑与实时预览切换">
                <view
                  class="render-toggle-btn"
                  :class="{ 'is-active': !isRenderView }"
                  role="tab"
                  :aria-selected="!isRenderView"
                  @click="isRenderView = false"
                >
                  <text>编写</text>
                </view>
                <view
                  class="render-toggle-btn"
                  :class="{ 'is-active': isRenderView }"
                  role="tab"
                  :aria-selected="isRenderView"
                  @click="isRenderView = true"
                >
                  <text>实时预览</text>
                </view>
              </view>
            </view>

            <view v-if="isRenderView" class="edit-rendered-card">
              <MarkdownText v-if="draftContent.trim()" :content="draftContent" />
              <text v-else class="empty-render-tip">在此实时渲染 Markdown 排版与 LaTeX 数学公式...</text>
            </view>
            <textarea
              v-else
              v-model="draftContent"
              :disabled="saving"
              class="modal-form-textarea kb-form-textarea"
              :maxlength="-1"
              placeholder="在此编写详细知识点内容，支持 Markdown 语法与 LaTeX 数学公式（如 $E=mc^2$ 或 $$公式$$）..."
            />
          </view>
        </view>
      </scroll-view>

      <view class="modal-footer">
        <template v-if="mode !== 'view'">
          <button
            type="button"
            class="modal-btn modal-btn-secondary"
            :class="{ 'is-disabled': saving }"
            :disabled="saving"
            @click="handleCancelEdit"
          >
            取消
          </button>
          <button
            type="button"
            class="modal-btn modal-btn-primary"
            :class="{ 'is-disabled': saving || !draftTitle.trim() || !draftContent.trim() }"
            :disabled="saving || !draftTitle.trim() || !draftContent.trim()"
            @click="handleSave"
          >
            {{ saving ? '保存中…' : mode === 'create' ? '创建' : '保存' }}
          </button>
        </template>

        <view v-else class="footer-actions-between">
          <view class="footer-left-actions">
            <button
              type="button"
              class="modal-btn modal-btn-secondary"
              :class="{ 'is-disabled': !rawContent.trim() }"
              :disabled="!rawContent.trim()"
              @click="handleCopy"
            >
              <LineIcon
                :name="copied ? 'check' : 'copy'"
                size="14px"
                :color="copied ? '#2e7d32' : 'var(--text-primary)'"
              />
              <text>{{ copied ? '已复制' : '复制内容' }}</text>
            </button>
            <button
              type="button"
              class="modal-btn modal-btn-ghost-danger"
              :class="{ 'is-disabled': !block || saving }"
              :disabled="!block || saving"
              @click="handleDelete"
            >
              <LineIcon name="trash" size="14px" color="#C05646" />
              <text>删除</text>
            </button>
          </view>

          <view class="footer-right-actions">
            <button
              type="button"
              class="modal-btn modal-btn-secondary"
              :class="{ 'is-disabled': !block || saving }"
              :disabled="!block || saving"
              @click="handleStartEdit"
            >
              <LineIcon name="edit" size="14px" color="var(--text-primary)" />
              <text>编辑</text>
            </button>
            <button
              type="button"
              class="modal-btn modal-btn-primary"
              :class="{ 'is-disabled': saving }"
              :disabled="saving"
              @click="handleClose"
            >
              确定
            </button>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import MarkdownText from '@/components/MarkdownText.vue'
import type { SourceView } from '@/api/sourceApi'
import type { KnowledgeBlock } from '@/store/useBlockStore'
import {
  BLOCK_THEME_COLORS,
  DEFAULT_BLOCK_THEME_COLOR,
  normalizeBlockThemeColor,
  resolveBlockSourceLabel,
} from '@/utils/blockSyncMapper'
import { copyTextWithFallback } from '@/utils/mobileLearning'

const props = defineProps<{
  visible: boolean
  mode: 'view' | 'edit' | 'create'
  block: KnowledgeBlock | null
  activeSubjectName: string
  sources: SourceView[]
  saving: boolean
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'update:mode', mode: 'view' | 'edit' | 'create'): void
  (event: 'save', payload: { title: string; color: string; preview: string }): void
  (event: 'delete', block: KnowledgeBlock): void
}>()

const draftTitle = ref('')
const draftColor = ref(DEFAULT_BLOCK_THEME_COLOR)
const draftContent = ref('')
const isRenderView = ref(false)
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

function clearCopiedState() {
  if (copiedTimer) {
    clearTimeout(copiedTimer)
    copiedTimer = null
  }
  copied.value = false
}

onBeforeUnmount(() => {
  clearCopiedState()
})

watch(
  () => [props.visible, props.mode, props.block?.id],
  ([visible, mode]) => {
    if (!visible) {
      isRenderView.value = false
      clearCopiedState()
      return
    }
    if (mode === 'create') {
      draftTitle.value = ''
      draftColor.value = DEFAULT_BLOCK_THEME_COLOR
      draftContent.value = ''
      isRenderView.value = false
      return
    }
    if (mode === 'edit' && props.block) {
      draftTitle.value = props.block.title || ''
      draftColor.value = normalizeBlockThemeColor(props.block.color)
      draftContent.value = props.block.preview || ''
      isRenderView.value = false
      return
    }
    clearCopiedState()
  },
  { immediate: true },
)

const dialogTitle = computed(() => {
  if (props.mode === 'create') return '录入新知识块'
  if (props.mode === 'edit') return '编辑知识内容'
  return '知识块详情'
})

const dialogAriaLabel = computed(() => {
  if (props.mode === 'create') return '录入新知识块'
  if (props.mode === 'edit') return '编辑知识内容'
  return props.block?.title ? `知识块详情：${props.block.title}` : '知识块详情'
})

const displaySubject = computed(() => props.block?.subject || props.activeSubjectName || '')

const displaySource = computed(() => {
  if (!props.block) return ''
  return resolveBlockSourceLabel(props.block, props.sources)
})

const rawContent = computed(() => props.block?.preview || '')

const subjectPillStyle = computed(() => {
  const color = props.block?.color?.trim()
  if (!color) return undefined
  return {
    backgroundColor: color.startsWith('#') ? `${color}22` : color,
  }
})

function formatFriendlyTime(timeStr?: string): string {
  if (!timeStr) return '刚刚'
  try {
    const parsed = new Date(timeStr)
    if (Number.isNaN(parsed.getTime())) return timeStr
    const diff = (Date.now() - parsed.getTime()) / 1000
    if (diff < 60) return '刚刚'
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return timeStr
  }
}

function handleClose() {
  if (props.saving) return
  isRenderView.value = false
  clearCopiedState()
  emit('close')
}

function handleStartEdit() {
  if (!props.block || props.saving) return
  emit('update:mode', 'edit')
}

function handleCancelEdit() {
  if (props.saving) return
  if (props.mode === 'edit' && props.block) {
    isRenderView.value = false
    emit('update:mode', 'view')
    return
  }
  handleClose()
}

function handleSave() {
  if (props.saving) return
  const title = draftTitle.value.trim()
  const preview = draftContent.value.trim()
  if (!title || !preview) {
    uni.showToast({ title: '请填写标题与正文内容', icon: 'none' })
    return
  }
  emit('save', {
    title,
    color: draftColor.value,
    preview,
  })
}

async function handleCopy() {
  const text = rawContent.value.trim()
  if (!text) return
  const ok = await copyTextWithFallback(text)
  if (!ok) {
    uni.showToast({ title: '复制失败，请手动复制', icon: 'none' })
    return
  }
  clearCopiedState()
  copied.value = true
  uni.showToast({ title: '已复制到剪贴板', icon: 'none' })
  copiedTimer = setTimeout(() => {
    copiedTimer = null
    copied.value = false
  }, 2000)
}

function handleDelete() {
  if (!props.block || props.saving) return
  emit('delete', props.block)
}
</script>

<style scoped>
.kb-modal-mask {
  background-color: rgba(28, 28, 26, 0.42);
  backdrop-filter: blur(14px) saturate(180%);
  -webkit-backdrop-filter: blur(14px) saturate(180%);
  padding: 24px;
}

.kb-modal-card {
  width: 100%;
  max-width: 680px;
  max-height: calc(100vh - 48px);
  background: var(--color-bg-primary, #F7F2EB);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  box-shadow:
    0 24px 64px -12px rgba(0, 0, 0, 0.13),
    0 8px 24px -6px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  animation: uiModalIn 0.22s var(--ease-out) both;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 24px 28px 12px;
  flex-shrink: 0;
}

.modal-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  line-height: 1.4;
}

.kb-dialog-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.kb-dialog-main-title {
  font-size: 15.5px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.kb-dialog-subject-pill {
  font-size: 11.5px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 9999px;
  background: rgba(139, 154, 110, 0.12);
  color: var(--color-sage-dark, #76855B);
  border: 1px solid rgba(139, 154, 110, 0.22);
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-close-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  border: 1px solid transparent;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.18s ease;
}

.modal-close-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.05);
}

.kb-view-scroll,
.kb-edit-scroll {
  flex: 1;
  min-height: 0;
  max-height: 66vh;
  padding: 0;
  box-sizing: border-box;
}

.kb-article-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 28px 18px;
  box-sizing: border-box;
}

.kb-meta-card {
  padding: 16px 18px;
  border-radius: 12px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.kb-title {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--text-primary);
  letter-spacing: -0.015em;
  word-break: break-word;
}

.kb-meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  font-size: 12px;
  color: var(--text-muted);
}

.kb-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.kb-meta-source-text {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb-content-card {
  padding: 20px 22px;
  border-radius: 12px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
  min-height: 180px;
  box-sizing: border-box;
}

.kb-markdown-content {
  font-size: 14px;
  line-height: 1.76;
  color: var(--text-primary);
  word-break: break-word;
}

.kb-empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 42px 0;
  opacity: 0.72;
}

.kb-empty-text {
  font-size: 13px;
  font-style: italic;
  color: var(--text-muted);
}

.edit-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 28px 18px;
  box-sizing: border-box;
}

.modal-form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.modal-form-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.required {
  color: #D14343;
  font-weight: 700;
}

.modal-form-input {
  width: 100%;
  height: 40px;
  box-sizing: border-box;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: var(--color-bg-tertiary, #FAF7F2);
  color: var(--text-primary);
  font-size: 13.5px;
  box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.04), 0 0.5px 1.5px rgba(0, 0, 0, 0.02);
  transition: border-color 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out), background-color 0.2s ease;
}

/* #ifdef H5 */
.modal-form-input:focus,
.modal-form-input:focus-within,
.kb-form-textarea:focus,
.kb-form-textarea:focus-within {
  outline: none;
  border-color: var(--color-zen-sage);
  background: #FDFBF8;
  box-shadow: 0 0 0 3.5px rgba(139, 154, 110, 0.14), 0 2px 8px rgba(139, 154, 110, 0.12);
}
/* #endif */

.color-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 2px;
}

.color-dot {
  width: 26px;
  height: 26px;
  box-sizing: border-box;
  flex-shrink: 0;
  border-radius: 50%;
  cursor: pointer;
  border: 2.5px solid var(--color-bg-primary, #F7F2EB);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;
}

.color-dot:hover {
  transform: scale(1.18);
}

.color-dot.is-selected {
  box-shadow: 0 0 0 2px var(--color-bg-primary, #F7F2EB), 0 0 0 4.5px var(--color-zen-sage, #8B9A6E);
  transform: scale(1.15);
}

.editor-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.render-toggle-group {
  display: inline-flex;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 9999px;
  padding: 2px;
  gap: 2px;
}

.render-toggle-btn {
  padding: 4px 11px;
  border-radius: 9999px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.render-toggle-btn.is-active {
  background: var(--color-bg-primary, #F7F2EB);
  color: var(--color-sage-dark, #76855B);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.kb-form-textarea {
  width: 100%;
  height: 224px;
  min-height: 200px;
  box-sizing: border-box;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: var(--color-bg-tertiary, #FAF7F2);
  color: var(--text-primary);
  font-size: 13.5px;
  line-height: 1.65;
  box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.04), 0 0.5px 1.5px rgba(0, 0, 0, 0.02);
  transition: border-color 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out), background-color 0.2s ease;
}

.edit-rendered-card {
  min-height: 224px;
  padding: 14px 16px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: var(--radius-md);
  box-sizing: border-box;
}

.empty-render-tip {
  color: var(--text-muted);
  font-style: italic;
  font-size: 13.5px;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 28px 24px;
  flex-shrink: 0;
}

.footer-actions-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  flex-wrap: wrap;
}

.footer-left-actions,
.footer-right-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 18px;
  margin: 0;
  border-radius: var(--radius-full);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  border: none;
  cursor: pointer;
  box-sizing: border-box;
  transition: all 0.2s var(--ease-out);
}

.modal-btn::after {
  border: none;
}

.modal-btn:disabled,
.modal-btn[disabled],
.modal-btn.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
  pointer-events: none;
}

.modal-btn-secondary {
  background: rgba(0, 0, 0, 0.035);
  border: 1px solid rgba(0, 0, 0, 0.09);
  color: var(--text-primary);
  box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.04);
}

.modal-btn-secondary[disabled],
.modal-btn-secondary.is-disabled {
  background: rgba(0, 0, 0, 0.035);
  color: var(--text-primary);
}

.modal-btn-secondary:hover:not(:disabled):not([disabled]):not(.is-disabled) {
  background: rgba(0, 0, 0, 0.065);
  border-color: rgba(0, 0, 0, 0.16);
}

.modal-btn-ghost-danger {
  background: transparent;
  color: #C05646;
  border: 1px solid rgba(192, 86, 70, 0.25);
}

.modal-btn-ghost-danger[disabled],
.modal-btn-ghost-danger.is-disabled {
  background: transparent;
  color: #C05646;
}

.modal-btn-ghost-danger:hover:not(:disabled):not([disabled]):not(.is-disabled) {
  background: rgba(192, 86, 70, 0.08);
  border-color: rgba(192, 86, 70, 0.4);
}

.modal-btn-primary {
  background: var(--accent-gradient);
  color: #FFFFFF;
  box-shadow: 0 4px 14px rgba(118, 135, 88, 0.32), 0 1px 2px rgba(0, 0, 0, 0.06);
}

.modal-btn-primary[disabled],
.modal-btn-primary.is-disabled {
  background: var(--accent-gradient);
  color: #FFFFFF;
}

.modal-btn-primary:hover:not(:disabled):not([disabled]):not(.is-disabled) {
  box-shadow: 0 6px 18px rgba(118, 135, 88, 0.42), 0 2px 4px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}
</style>
