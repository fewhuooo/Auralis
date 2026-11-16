<template>
  <ModalShell
    :model-value="modelValue"
    :prevent-close="saving"
    size="md"
    :title="isEdit ? t({ 'zh-CN': '编辑学科空间', en: 'Edit subject', ja: '科目を編集' }) : t({ 'zh-CN': '创建学科空间', en: 'Create subject', ja: '科目を作成' })"
    :aria-label="isEdit ? t({ 'zh-CN': '编辑学科空间', en: 'Edit subject', ja: '科目を編集' }) : t({ 'zh-CN': '创建学科空间', en: 'Create subject', ja: '科目を作成' })"
    @update:model-value="handleClose"
    @close="handleClose"
  >
    <div class="subject-form">
      <!-- Subject Icon Preview -->
      <div class="preview-row">
        <div
          class="preview-icon"
          style="background: #7D9372; color: #fff"
        >
          <ElIcon :size="28">
            <component :is="getSubjectIconComponent(form.icon)" />
          </ElIcon>
        </div>
        <div class="preview-info">
          <span class="preview-name">{{ form.name || t({ 'zh-CN': '学科名称预览', en: 'Subject name preview', ja: '科目名のプレビュー' }) }}</span>
          <span class="preview-desc">{{ form.description || t({ 'zh-CN': '这是您的专属学科知识沉淀空间', en: 'A workspace for this subject', ja: 'この科目専用のワークスペース' }) }}</span>
        </div>
      </div>

      <!-- Name Input -->
      <div class="modal-form-group">
        <label for="subj-name" class="modal-form-label">{{ t({ 'zh-CN': '学科名称', en: 'Subject name', ja: '科目名' }) }} <span class="required">*</span></label>
        <input
          type="text"
          id="subj-name"
          v-model="form.name"
          :placeholder="t({ 'zh-CN': '例如: 算法与数据结构、应用物理学', en: 'For example: Algorithms, Applied Physics', ja: '例：アルゴリズム、応用物理学' })"
          maxlength="20"
          required
          autofocus
          class="modal-form-input"
        />
      </div>

      <!-- Description Input -->
      <div class="modal-form-group">
        <label for="subj-desc" class="modal-form-label">{{ t({ 'zh-CN': '学科简述', en: 'Description', ja: '説明' }) }}</label>
        <textarea
          id="subj-desc"
          v-model="form.description"
          :placeholder="t({ 'zh-CN': '简短描述这个学科的研究方向或课程定位...', en: 'Briefly describe the subject or course…', ja: '科目や授業の概要を入力…' })"
          maxlength="100"
          rows="3"
          class="modal-form-textarea"
        ></textarea>
      </div>

      <!-- Icon Selector -->
      <div class="modal-form-group">
        <label class="modal-form-label">{{ t({ 'zh-CN': '选择空间图标', en: 'Subject icon', ja: '科目のアイコン' }) }}</label>
        <div class="icon-grid">
          <button
            v-for="option in subjectIconOptions"
            :key="option.key"
            type="button"
            class="icon-btn"
            :class="{ 'is-selected': form.icon === option.key }"
            :title="t(iconLabels[option.key])"
            :aria-label="t({ 'zh-CN': '选择{name}图标', en: 'Select {name} icon', ja: '{name}のアイコンを選択' }, { name: t(iconLabels[option.key]) })"
            @click="form.icon = option.key"
          >
            <ElIcon :size="20"><component :is="option.component" /></ElIcon>
          </button>
        </div>
      </div>
    </div>

    <template #footer>
      <button type="button" class="modal-btn modal-btn-secondary" :disabled="saving" @click="handleClose">{{ t({ 'zh-CN': '取消', en: 'Cancel', ja: 'キャンセル' }) }}</button>
      <button type="button" class="modal-btn modal-btn-primary" :disabled="saving || !form.name.trim()" @click="handleSave">
        {{ isEdit ? t({ 'zh-CN': '保存修改', en: 'Save changes', ja: '変更を保存' }) : t({ 'zh-CN': '确认创建', en: 'Create subject', ja: '科目を作成' }) }}
      </button>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { t } from '@/i18n'
import { ref, watch } from 'vue'
import { ElIcon } from 'element-plus'
import ModalShell from '@/components/modal/ModalShell.vue'
import {
  getSubjectIconComponent,
  subjectIconOptions
} from '@/utils/subjectIcon'

interface SubjectProps {
  modelValue?: boolean
  saving?: boolean
  subjectData?: any
}

const props = withDefaults(defineProps<SubjectProps>(), {
  modelValue: true,
  saving: false,
  subjectData: null
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'close'): void
  (e: 'save', data: any): void
}>()

const iconLabels = {
  math: { 'zh-CN': '高等数学', en: 'Mathematics', ja: '数学' },
  code: { 'zh-CN': '程序设计', en: 'Programming', ja: 'プログラミング' },
  physics: { 'zh-CN': '大学物理', en: 'Physics', ja: '物理学' },
  chemistry: { 'zh-CN': '基础化学', en: 'Chemistry', ja: '化学' },
  biology: { 'zh-CN': '生命科学', en: 'Life sciences', ja: '生命科学' },
  computer: { 'zh-CN': '电子信息', en: 'Electronics and information technology', ja: '電子情報' },
  analysis: { 'zh-CN': '数据与AI', en: 'Data and AI', ja: 'データと AI' },
  language: { 'zh-CN': '学术外语', en: 'Academic languages', ja: '学術外国語' },
  book: { 'zh-CN': '文学传播', en: 'Literature and communication', ja: '文学・コミュニケーション' },
  economics: { 'zh-CN': '经济金融', en: 'Economics and finance', ja: '経済・金融' },
  business: { 'zh-CN': '工商管理', en: 'Business administration', ja: '経営学' },
  law: { 'zh-CN': '法律法学', en: 'Law', ja: '法学' },
  medicine: { 'zh-CN': '临床医学', en: 'Clinical medicine', ja: '臨床医学' },
  engineering: { 'zh-CN': '建筑土木', en: 'Architecture and civil engineering', ja: '建築・土木工学' },
  art: { 'zh-CN': '艺术设计', en: 'Art and design', ja: '芸術・デザイン' },
  school: { 'zh-CN': '通识思政', en: 'General and civic education', ja: '教養・市民教育' },
}

const isEdit = ref(false)
const form = ref({
  id: '',
  name: '',
  description: '',
  icon: 'book',
  version: 0
})

const initForm = () => {
  if (props.subjectData) {
    isEdit.value = true
    form.value = {
      id: props.subjectData.id || '',
      name: props.subjectData.name || '',
      description: props.subjectData.description || '',
      icon: props.subjectData.iconKey || props.subjectData.icon || 'book',
      version: props.subjectData.version || 0
    }
  } else {
    isEdit.value = false
    form.value = {
      id: '',
      name: '',
      description: '',
      icon: 'book',
      version: 0
    }
  }
}

watch(
  () => props.subjectData,
  () => {
    initForm()
  },
  { immediate: true }
)

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      initForm()
    }
  }
)

const handleClose = () => {
  if (props.saving) return
  emit('update:modelValue', false)
  emit('close')
}

const handleSave = () => {
  if (props.saving || !form.value.name.trim()) return
  emit('save', { ...form.value })
}
</script>

<style scoped>
.subject-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Preview */
.preview-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: var(--modal-inset-bg, #FAF7F2);
  border: 1px solid var(--modal-inset-border, rgba(0, 0, 0, 0.06));
  border-radius: var(--radius-md, 10px);
  margin-bottom: 4px;
}

html.dark .preview-row {
  background: var(--modal-inset-bg, #2e2c29);
  border-color: var(--modal-inset-border, rgba(255, 255, 255, 0.08));
}

.preview-icon {
  width: 50px;
  height: 50px;
  border-radius: var(--radius-md, 10px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  box-shadow: 0 3px 10px rgba(139, 154, 110, 0.3);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

html.dark .preview-icon {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.preview-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.preview-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary, #1C1C1A);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

html.dark .preview-name {
  color: var(--text-primary, #e6dfd8);
}

.preview-desc {
  font-size: 13px;
  color: var(--text-muted, #7A7A75);
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

/* Icon Grid */
.icon-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 8px;
}

.icon-btn {
  background: var(--modal-inset-bg, #FAF7F2);
  border: 1px solid var(--modal-inset-border, rgba(0, 0, 0, 0.08));
  border-radius: var(--radius-md, 10px);
  height: 44px;
  font-size: 20px;
  color: var(--text-secondary, #2C2C28);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.05);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.icon-btn:hover {
  background: #FFFFFF;
  border-color: var(--modal-accent, #8B9A6E);
  color: var(--text-primary, #1C1C1A);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.icon-btn.is-selected {
  background: var(--modal-accent-subtle, rgba(139, 154, 110, 0.16));
  border-color: var(--modal-accent, #8B9A6E);
  color: var(--modal-accent, #76855B);
  font-weight: 700;
  box-shadow: 0 0 0 2px rgba(139, 154, 110, 0.35), 0 3px 8px rgba(0, 0, 0, 0.08);
  transform: scale(1.04);
}

html.dark .icon-btn {
  background: var(--modal-inset-bg, #2e2c29);
  border-color: var(--modal-inset-border, rgba(255, 255, 255, 0.08));
  color: var(--text-primary, #e6dfd8);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
}

html.dark .icon-btn:hover {
  background: var(--color-bg-secondary, #292825);
  border-color: var(--modal-accent, #A3B19B);
  color: #FFFFFF;
}

html.dark .icon-btn.is-selected {
  background: rgba(163, 177, 155, 0.2);
  border-color: var(--modal-accent, #A3B19B);
  color: #B4C4AA;
  box-shadow: 0 0 0 2px rgba(163, 177, 155, 0.4);
}
</style>
