<template>
  <view v-if="visible" class="save-block-mask" @click="handleClose">
    <view class="save-block-dialog" @click.stop>
      <view class="save-block-header">
        <text class="save-block-title">存为知识块</text>
        <view class="save-close-btn" role="button" aria-label="关闭" @click="handleClose">
          <LineIcon name="close" size="15px" color="var(--text-muted)" />
        </view>
      </view>

      <view class="save-block-field">
        <text class="save-block-label">所属学科</text>
        <scroll-view v-if="subjectStore.subjects.length > 0" scroll-x :show-scrollbar="false" class="save-subject-strip">
          <view class="save-subject-row">
            <view
              v-for="sub in subjectStore.subjects"
              :key="sub.id"
              class="save-subject-pill"
              :class="{ 'is-active': selectedSubjectId === sub.id }"
              role="button"
              @click="selectedSubjectId = sub.id"
            >
              <text>{{ sub.name }}</text>
            </view>
          </view>
        </scroll-view>
        <view v-else class="save-subject-empty-box">
          <text class="save-subject-empty">暂无可用学科，请先创建学科</text>
          <view class="save-quick-subject-row">
            <input
              v-model="quickSubjectName"
              class="save-block-input save-quick-subject-input"
              maxlength="20"
              placeholder="输入学科名称快速创建…"
              :disabled="creatingSubject || saving"
              @confirm="createQuickSubject"
            />
            <view
              class="save-quick-subject-btn"
              :class="{ disabled: creatingSubject || !quickSubjectName.trim() }"
              role="button"
              @click="createQuickSubject"
            >
              <text>{{ creatingSubject ? '创建中' : '创建学科' }}</text>
            </view>
          </view>
        </view>
      </view>

      <view class="save-block-field">
        <text class="save-block-label">标题</text>
        <input
          v-model="title"
          class="save-block-input"
          :maxlength="80"
          placeholder="输入知识块标题…"
          @confirm="confirmSave"
        />
      </view>

      <view class="save-block-field">
        <text class="save-block-label">内容</text>
        <textarea
          v-model="content"
          class="save-block-textarea"
          :maxlength="4000"
          auto-height
          placeholder="知识块正文…"
        />
      </view>

      <view class="save-block-actions">
        <view class="save-block-cancel" role="button" @click="handleClose">
          <text>取消</text>
        </view>
        <view
          class="save-block-confirm"
          :class="{ disabled: saving || !hasValidSubject || !title.trim() || !content.trim() }"
          role="button"
          @click="confirmSave"
        >
          <text>{{ saving ? '保存中…' : '保存' }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import { useEscapeKey } from '@/composables/useEscapeKey'
import { showToast } from '@/platform/feedback'
import { useAuthStore } from '@/store/useAuthStore'
import { useBlockStore } from '@/store/useBlockStore'
import { useSubjectStore } from '@/store/useSubjectStore'

const props = withDefaults(defineProps<{
  visible: boolean
  defaultSubjectId?: string | null
  initialTitle?: string
  initialPreview?: string
}>(), {
  defaultSubjectId: null,
  initialTitle: '',
  initialPreview: '',
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const authStore = useAuthStore()
const subjectStore = useSubjectStore()
const blockStore = useBlockStore()

const title = ref('')
const content = ref('')
const selectedSubjectId = ref('')
const saving = ref(false)
const quickSubjectName = ref('')
const creatingSubject = ref(false)
let openToken = 0

const hasValidSubject = computed(() => subjectStore.subjects.some(s => s.id === selectedSubjectId.value))

function resolveDefaultSubject() {
  const candidate = props.defaultSubjectId
  if (candidate && subjectStore.subjects.some(s => s.id === candidate)) {
    selectedSubjectId.value = candidate
    return
  }
  if (!subjectStore.subjects.some(s => s.id === selectedSubjectId.value)) {
    selectedSubjectId.value = subjectStore.subjects[0]?.id || ''
  }
}

watch(
  () => props.visible,
  (isOpen) => {
    if (!isOpen) return
    openToken += 1
    const capturedToken = openToken
    const generation = authStore.getLoginGeneration()
    title.value = props.initialTitle || ''
    content.value = (props.initialPreview || '').slice(0, 4000)
    saving.value = false
    resolveDefaultSubject()

    if (subjectStore.subjects.length === 0) {
      void Promise.all([
        subjectStore.loadSubjects(),
        blockStore.loadLocalBlocks(),
      ]).then(() => {
        if (!props.visible || capturedToken !== openToken || generation !== authStore.getLoginGeneration()) {
          return
        }
        resolveDefaultSubject()
      }).catch(() => {})
    }
  },
  { immediate: true },
)

watch(
  () => subjectStore.subjects,
  () => {
    if (props.visible) {
      resolveDefaultSubject()
    }
  },
)

watch(
  () => [authStore.isAuthenticated, authStore.user?.id, authStore.serverDeviceId],
  () => {
    openToken += 1
    saving.value = false
    selectedSubjectId.value = ''
    if (props.visible) {
      emit('close')
    }
  },
)

function handleClose() {
  if (saving.value) return
  emit('close')
}

useEscapeKey(() => props.visible && !saving.value, handleClose)

async function createQuickSubject() {
  if (creatingSubject.value || saving.value) return
  const name = quickSubjectName.value.trim()
  if (!name) {
    showToast('请输入学科名称')
    return
  }
  const generation = authStore.getLoginGeneration()
  creatingSubject.value = true
  try {
    const createdId = await subjectStore.addSubject(name, '', 'other')
    if (generation !== authStore.getLoginGeneration()) return
    quickSubjectName.value = ''
    if (createdId) {
      selectedSubjectId.value = createdId
    } else {
      resolveDefaultSubject()
    }
    showToast('已创建学科')
  } catch (err) {
    if (generation !== authStore.getLoginGeneration()) return
    showToast(err instanceof Error ? err.message : '创建学科失败')
  } finally {
    if (generation === authStore.getLoginGeneration()) {
      creatingSubject.value = false
    }
  }
}

async function confirmSave() {
  if (saving.value) return
  const targetSubject = subjectStore.subjects.find(s => s.id === selectedSubjectId.value)
  if (!targetSubject) {
    showToast('请先选择所属学科')
    return
  }
  const trimmedTitle = title.value.trim()
  const trimmedPreview = content.value.trim()
  if (!trimmedTitle || !trimmedPreview) {
    showToast('请填写标题和正文内容')
    return
  }

  const generation = authStore.getLoginGeneration()
  saving.value = true
  try {
    await blockStore.addBlock({
      subjectId: targetSubject.id,
      subject: targetSubject.name,
      title: trimmedTitle,
      preview: trimmedPreview,
      source: 'AI 对话',
      color: '',
    })
    if (generation !== authStore.getLoginGeneration()) return
    showToast({ title: '已存入知识库', tone: 'success' })
    emit('saved')
  } catch {
    if (generation !== authStore.getLoginGeneration()) return
    showToast('保存失败，请重试')
  } finally {
    if (generation === authStore.getLoginGeneration()) {
      saving.value = false
    }
  }
}
</script>

<style scoped>
.save-block-mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: var(--z-index-modal, 1200);
  background-color: rgba(28, 28, 26, 0.28);
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.save-block-dialog {
  width: 100%;
  max-width: 420px;
  padding: 18px;
  border-radius: 18px;
  background-color: #FAF7F2;
  border: 1px solid #EAE6DD;
  box-shadow: 0 18px 42px rgba(45, 55, 40, 0.14);
  max-height: 86vh;
  max-height: 86dvh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-sizing: border-box;
}

.save-block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.save-block-title {
  font-size: 16.5px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.save-close-btn {
  width: 28px;
  height: 28px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.save-block-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.save-block-label {
  font-size: 12px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-muted);
}

.save-subject-strip {
  width: 100%;
  white-space: nowrap;
}

.save-subject-row {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 2px 0;
}

.save-subject-pill {
  height: 30px;
  padding: 0 11px;
  border-radius: var(--radius-full);
  background-color: #FFFFFF;
  border: 1px solid #EAE6DD;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12.5px;
  color: var(--text-secondary);
  flex-shrink: 0;
  cursor: pointer;
}

.save-subject-pill.is-active {
  background-color: #EEF2E6;
  border-color: #8B9A6E;
  color: var(--color-sage-ink);
  font-weight: var(--font-weight-semibold);
}

.save-subject-empty-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.save-subject-empty {
  font-size: 12px;
  color: var(--color-warning-ink);
}

.save-quick-subject-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.save-quick-subject-input {
  flex: 1;
  min-width: 0;
}

.save-quick-subject-btn {
  height: 40px;
  padding: 0 12px;
  border-radius: 12px;
  background-color: #EEF2E6;
  border: 1px solid #8B9A6E;
  color: var(--color-sage-ink);
  font-size: 12.5px;
  font-weight: var(--font-weight-semibold);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
}

.save-quick-subject-btn.disabled {
  opacity: 0.45;
}

.save-block-input,
.save-block-textarea {
  width: 100%;
  padding: 9px 12px;
  border-radius: 12px;
  background-color: #FFFFFF;
  border: 1px solid #EAE6DD;
  font-size: 14px;
  color: var(--text-primary);
  box-sizing: border-box;
}

.save-block-input {
  height: 40px;
  min-height: 40px;
  line-height: 20px;
}

.save-block-textarea {
  min-height: 92px;
  max-height: 200px;
  line-height: 1.55;
  overflow-y: auto;
}

.save-block-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 2px;
}

.save-block-cancel,
.save-block-confirm {
  height: 36px;
  padding: 0 16px;
  border-radius: var(--radius-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.save-block-cancel {
  background-color: #FFFFFF;
  border: 1px solid #EAE6DD;
  color: var(--text-secondary);
}

.save-block-confirm {
  background-color: #556B3D;
  color: #FFFFFF;
}

.save-block-confirm.disabled {
  opacity: 0.42;
}
</style>
