<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-container">
      <div class="modal-header">
        <h3>{{ isEdit ? '编辑学科空间' : '创建学科空间' }}</h3>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-body">
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
        <div class="form-group">
          <label for="subj-name">学科名称 <span class="required">*</span></label>
          <input 
            type="text" 
            id="subj-name" 
            v-model="form.name" 
            placeholder="例如: 算法与数据结构、应用物理学" 
            maxlength="20"
            required
            class="styled-input"
          />
        </div>

        <!-- Description Input -->
        <div class="form-group">
          <label for="subj-desc">学科简述</label>
          <textarea 
            id="subj-desc" 
            v-model="form.description" 
            placeholder="简短描述这个学科的研究方向或课程定位..." 
            maxlength="100"
            rows="3"
            class="styled-textarea"
          ></textarea>
        </div>

        <!-- Icon Selector -->
        <div class="form-group">
          <label>选择空间图标</label>
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

      <div class="modal-footer">
        <button class="btn-secondary" @click="$emit('close')">取消</button>
        <button class="btn-primary" :disabled="!form.name.trim()" @click="handleSave">
          {{ isEdit ? '保存修改' : '确认创建' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElIcon } from 'element-plus'
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
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  animation: fade-in 0.25s ease-out;
}

.modal-container {
  width: 90%;
  max-width: 520px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.04);
  border: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: scale-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

html.dark .modal-container {
  background: #181D18;
  border-color: rgba(163, 177, 155, 0.25);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scale-up {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-subtle);
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all var(--transition-fast);
}

.close-btn:hover {
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-primary);
}

html.dark .close-btn:hover {
  background: rgba(255, 255, 255, 0.06);
}

.modal-body {
  padding: 22px 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: 70vh;
  overflow-y: auto;
}

/* Subject Preview */
.subject-preview-section {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border-radius: 16px;
  border: 1px solid var(--border-default);
}

html.dark .subject-preview-section {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.04);
}

.preview-card {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  box-shadow: 0 6px 16px rgba(125, 147, 114, 0.2);
  transition: all 0.3s ease;
  flex-shrink: 0;
}

html.dark .preview-card {
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
}

.preview-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.preview-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

/* Form Styles */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-group label {
  font-size: 12px;
  font-weight: 650;
  color: var(--text-secondary);
}

.required {
  color: #ff453a;
}

.styled-input, .styled-textarea {
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-default);
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
  font-family: inherit;
  transition: all 0.2s ease;
}

.styled-input:focus, .styled-textarea:focus {
  border-color: #8B9A6E;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18);
  background: var(--color-bg-tertiary, #FAF7F2);
}

html.dark .styled-input:focus, html.dark .styled-textarea:focus {
  background: rgba(255, 255, 255, 0.05);
  box-shadow: 0 0 0 3px rgba(125, 147, 114, 0.2);
}

.styled-textarea {
  resize: none;
}

/* Icon Grid */
.icon-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 8px;
}

.icon-btn {
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1.5px solid var(--border-default);
  border-radius: 10px;
  height: 44px;
  font-size: 20px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.icon-btn:hover {
  background: rgba(139, 154, 110, 0.1);
  border-color: rgba(139, 154, 110, 0.35);
  transform: translateY(-1px);
}

.icon-btn.is-selected {
  background: rgba(139, 154, 110, 0.14);
  border-color: #8B9A6E;
  color: #8B9A6E;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

html.dark .icon-btn.is-selected {
  background: rgba(125, 147, 114, 0.2);
}

/* Footer */
.modal-footer {
  padding: 16px 28px 22px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid var(--border-subtle);
  background: transparent;
}

.btn-secondary {
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  padding: 8px 20px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-primary);
}

.btn-primary {
  background: var(--btn-primary-bg, linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%));
  border: none;
  color: #FFFFFF;
  padding: 8px 26px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 8px rgba(125, 147, 114, 0.3);
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(125, 147, 114, 0.45);
}

.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}
</style>
