<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-container">
      <div class="modal-header">
        <h3>{{ isEdit ? '编辑学科空间' : '创建学科空间' }}</h3>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <!-- Subject Icon & Color Preview -->
        <div class="subject-preview-section">
          <div 
            class="preview-card"
            :style="{ backgroundColor: form.color || 'rgba(163, 177, 155, 0.2)', color: form.color ? 'var(--text-primary)' : 'inherit' }"
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

        <!-- Theme Color Selector -->
        <div class="form-group">
          <label>主题氛围颜色</label>
          <div class="color-row">
            <button 
              v-for="color in themeColors" 
              :key="color.value"
              type="button"
              class="color-btn"
              :class="{ 'is-selected': form.color === color.value }"
              :style="{ backgroundColor: color.value }"
              :title="color.name"
              @click="form.color = color.value"
            >
              <span class="check-mark" v-if="form.color === color.value">✓</span>
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
  color: 'rgba(163, 177, 155, 0.2)'
})

const themeColors = [
  { name: '极光蓝 (Aurora Blue)', value: 'rgba(59, 130, 246, 0.2)' },
  { name: '清新绿 (Mint Green)', value: 'rgba(16, 185, 129, 0.2)' },
  { name: '复古粉 (Dusty Rose)', value: 'rgba(244, 63, 94, 0.2)' },
  { name: '梦幻紫 (Dreamy Violet)', value: 'rgba(139, 92, 246, 0.2)' },
  { name: '日光黄 (Amber Yellow)', value: 'rgba(245, 158, 11, 0.2)' },
  { name: '活力橙 (Coral Orange)', value: 'rgba(239, 68, 68, 0.2)' },
  { name: '温柔沙 (Desert Sand)', value: 'rgba(180, 83, 9, 0.15)' },
  { name: '深幽灰 (Slate Gray)', value: 'rgba(107, 114, 128, 0.25)' }
]

onMounted(() => {
  if (props.subjectData) {
    isEdit.value = true
    form.value = {
      id: props.subjectData.id || '',
      name: props.subjectData.name || '',
      description: props.subjectData.description || '',
      icon: props.subjectData.icon || 'book',
      color: props.subjectData.color || 'rgba(163, 177, 155, 0.2)'
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
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  animation: fade-in 0.25s ease-out;
}

.modal-container {
  width: 90%;
  max-width: 480px;
  background: var(--glass-bg, rgba(28, 28, 30, 0.85));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius-xl, 24px);
  box-shadow: var(--glass-shadow, 0 32px 64px rgba(0, 0, 0, 0.4));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: scale-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
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
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.modal-header h3 {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary, #fff);
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--text-muted, #8e8e93);
  cursor: pointer;
  padding: 4px;
  transition: color 0.2s;
}

.close-btn:hover {
  color: var(--text-primary, #fff);
}

.modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: 60vh;
  overflow-y: auto;
}

/* Subject Preview */
.subject-preview-section {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.preview-card {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
  transition: all 0.3s ease;
  flex-shrink: 0;
}

.preview-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.preview-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary, #fff);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-desc {
  font-size: 12px;
  color: var(--text-muted, #8e8e93);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Form Styles */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #8e8e93);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.required {
  color: #ff453a;
}

.styled-input {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 14px;
  color: var(--text-primary, #fff);
  outline: none;
  transition: all 0.2s;
}

.styled-input:focus {
  border-color: var(--color-zen-sage, #A3B19B);
  background: rgba(255, 255, 255, 0.06);
}

.styled-textarea {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 14px;
  color: var(--text-primary, #fff);
  outline: none;
  resize: none;
  font-family: inherit;
  transition: all 0.2s;
}

.styled-textarea:focus {
  border-color: var(--color-zen-sage, #A3B19B);
  background: rgba(255, 255, 255, 0.06);
}

/* Icon Grid */
.icon-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 8px;
}

.icon-btn {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  height: 40px;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  transform: scale(1.08);
}

.icon-btn.custom-trigger:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: var(--color-zen-sage, #A3B19B);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.icon-btn.is-selected {
  background: rgba(255, 255, 255, 0.12);
  border-color: var(--color-zen-sage, #A3B19B);
  transform: scale(1.08);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

/* Color Palette Row */
.color-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.color-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.color-btn:hover {
  transform: scale(1.1);
}

.color-btn.is-selected {
  border-color: var(--text-primary, #fff);
  transform: scale(1.1);
}

.check-mark {
  font-size: 11px;
  color: var(--text-primary, #fff);
  font-weight: bold;
}

/* Footer */
.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--text-secondary, #d1d1d6);
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #fff);
}

.btn-primary {
  background: var(--accent-gradient, var(--color-zen-sage, #A3B19B));
  border: none;
  color: #fff;
  padding: 10px 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(163, 177, 155, 0.3);
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
