<template>
  <ModalShell
    :model-value="true"
    size="md"
    :title="isEdit ? '编辑学科空间' : '创建学科空间'"
    :aria-label="isEdit ? '编辑学科空间' : '创建学科空间'"
    @update:model-value="$emit('close')"
    @close="$emit('close')"
  >
    <div class="subject-create-modal">
      <!-- Subject Icon Preview -->
      <div class="subject-preview-section">
        <div
          class="preview-card"
          style="background: #7D9372; color: #fff"
        >
          <ElIcon v-if="isSubjectIconKey(form.icon) || !getLegacySubjectIcon(form.icon)" :size="28">
            <component :is="getSubjectIconComponent(form.icon)" />
          </ElIcon>
          <span v-else>{{ getLegacySubjectIcon(form.icon) }}</span>
        </div>
        <div class="preview-meta">
          <span class="preview-title">{{ form.name || '学科名称预览' }}</span>
          <span class="preview-desc">{{ form.description || '这是您的专属学科知识沉淀空间' }}</span>
        </div>
      </div>

      <!-- Name Input -->
      <div class="modal-form-group">
        <label for="subj-name" class="modal-form-label">学科名称 <span class="required">*</span></label>
        <input
          type="text"
          id="subj-name"
          v-model="form.name"
          placeholder="例如: 算法与数据结构、应用物理学"
          maxlength="20"
          required
          autofocus
          class="modal-form-input"
        />
      </div>

      <!-- Description Input -->
      <div class="modal-form-group">
        <label for="subj-desc" class="modal-form-label">学科简述</label>
        <textarea
          id="subj-desc"
          v-model="form.description"
          placeholder="简短描述这个学科的研究方向或课程定位..."
          maxlength="100"
          rows="3"
          class="modal-form-textarea"
        ></textarea>
      </div>

      <!-- Icon Selector -->
      <div class="modal-form-group">
        <label class="modal-form-label">选择空间图标</label>
        <div class="icon-grid">
          <button
            v-for="option in subjectIconOptions"
            :key="option.key"
            type="button"
            class="icon-btn"
            :class="{ 'is-selected': form.icon === option.key }"
            :title="option.label"
            :aria-label="`选择${option.label}图标`"
            @click="form.icon = option.key"
          >
            <ElIcon :size="20"><component :is="option.component" /></ElIcon>
          </button>
        </div>
      </div>
    </div>

    <template #footer>
      <button type="button" class="modal-btn modal-btn-secondary" @click="$emit('close')">取消</button>
      <button type="button" class="modal-btn modal-btn-primary" :disabled="!form.name.trim()" @click="handleSave">
        {{ isEdit ? '保存修改' : '确认创建' }}
      </button>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElIcon } from 'element-plus'
import ModalShell from '@/components/modal/ModalShell.vue'
import {
  getLegacySubjectIcon,
  getSubjectIconComponent,
  isSubjectIconKey,
  subjectIconOptions
} from '@/utils/subjectIcon'

const props = defineProps({
  subjectData: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'save'])

const isEdit = ref(false)
const form = ref({
  id: '',
  name: '',
  description: '',
  icon: 'book',
  version: 0
})

onMounted(() => {
  if (props.subjectData) {
    isEdit.value = true
    form.value = {
      id: props.subjectData.id || '',
      name: props.subjectData.name || '',
      description: props.subjectData.description || '',
      icon: props.subjectData.icon || 'book',
      version: props.subjectData.version || 0
    }
  }
})

const handleSave = () => {
  if (!form.value.name.trim()) return
  emit('save', { ...form.value })
}
</script>

<style scoped>
.subject-create-modal {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Subject Preview */
.subject-preview-section {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  background: rgba(110, 129, 84, 0.07);
  border-radius: 8px;
  margin-bottom: 16px;
}

html.dark .subject-preview-section {
  background: rgba(163, 177, 155, 0.1);
}

.preview-card {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  background: #5B6C47 !important;
  color: #fff !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

html.dark .preview-card {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.preview-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.preview-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: -0.01em;
}

.preview-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

/* Icon Grid */
.icon-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 6px;
}

.icon-btn {
  background: var(--color-bg-primary, #FFFFFF);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  height: 38px;
  font-size: 18px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.icon-btn:hover {
  background: rgba(110, 129, 84, 0.08);
  border-color: rgba(0, 0, 0, 0.15);
}

.icon-btn.is-selected {
  background: rgba(110, 129, 84, 0.12);
  border-color: transparent;
  color: #5B6C47;
  font-weight: 600;
  box-shadow: 0 0 0 2px rgba(110, 129, 84, 0.3);
}

html.dark .icon-btn {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.08);
}

html.dark .icon-btn.is-selected {
  background: rgba(163, 177, 155, 0.18);
  color: #B4C4AA;
  box-shadow: 0 0 0 2px rgba(163, 177, 155, 0.4);
}
</style>
