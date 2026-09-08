<template>
  <view>
    <!-- Overlay -->
    <view class="overlay" v-if="visible" @click="close" @touchmove.stop.prevent></view>

    <!-- Bottom Sheet -->
    <view class="sheet" :class="{ 'sheet-open': visible }">
      <view class="sheet-header">
        <text class="sheet-title">新建任务</text>
        <view class="close-btn" @click="close">×</view>
      </view>
      
      <view class="sheet-body">
        <view class="form-group">
          <text class="form-label">任务名称</text>
          <input class="form-input" v-model="form.name" placeholder="请输入任务名称..." />
        </view>
        
        <view class="form-group">
          <text class="form-label">所属学科</text>
          <picker :range="subjects" range-key="name" @change="onSubjectChange">
            <view class="picker-view">
              <text v-if="form.subjectName">{{ form.subjectName }}</text>
              <text v-else class="placeholder">请选择学科</text>
            </view>
          </picker>
        </view>
        
        <view class="form-group">
          <text class="form-label">专注时长 ({{ form.duration }}分钟)</text>
          <slider :value="form.duration" min="30" max="120" step="30" @change="onDurationChange" activeColor="var(--text-primary)" />
        </view>

      </view>

      <view class="sheet-footer">
        <button class="submit-btn" :disabled="!isValid" @click="submit">添加到待办</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  subjects: { id: string, name: string }[]
}>()

const emit = defineEmits(['update:visible', 'submit'])

const form = ref({
  name: '',
  subjectId: '',
  subjectName: '',
  duration: 30
})

const isValid = computed(() => form.value.name.trim() && form.value.subjectId)

watch(() => props.visible, (val) => {
  if (val) {
    // Reset form on open
    form.value.name = ''
    if (props.subjects.length > 0 && !form.value.subjectId) {
      form.value.subjectId = props.subjects[0].id
      form.value.subjectName = props.subjects[0].name
    }
  }
})

const close = () => {
  emit('update:visible', false)
}

const onSubjectChange = (e: any) => {
  const idx = e.detail.value
  const subj = props.subjects[idx]
  if (subj) {
    form.value.subjectId = subj.id
    form.value.subjectName = subj.name
  }
}

const onDurationChange = (e: any) => {
  form.value.duration = e.detail.value
}

const submit = () => {
  if (!isValid.value) return
  
  emit('submit', {
    name: form.value.name,
    subjectId: form.value.subjectId,
    subject: form.value.subjectName,
    duration: form.value.duration
  })
  
  close()
}
</script>

<style scoped>
.overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.4);
  z-index: 1000;
}

.sheet {
  position: fixed;
  left: 0; right: 0; bottom: -100%;
  background: var(--color-bg-primary);
  border-radius: 32rpx 32rpx 0 0;
  z-index: 1001;
  transition: bottom 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  padding-bottom: env(safe-area-inset-bottom);
}
.sheet-open {
  bottom: 0;
}

.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx 40rpx;
  border-bottom: 2rpx solid var(--border-subtle);
}
.sheet-title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--text-primary);
}
.close-btn {
  font-size: 40rpx;
  color: var(--text-muted);
  padding: 10rpx;
}

.sheet-body {
  padding: 40rpx;
  display: flex;
  flex-direction: column;
  gap: 32rpx;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.form-label {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--text-secondary);
}
.form-input {
  background: var(--color-bg-secondary);
  border: 2rpx solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 20rpx 24rpx;
  font-size: 30rpx;
  color: var(--text-primary);
}
.picker-view {
  background: var(--color-bg-secondary);
  border: 2rpx solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 24rpx;
  font-size: 30rpx;
  color: var(--text-primary);
}
.placeholder {
  color: var(--text-muted);
}

.sheet-footer {
  padding: 20rpx 40rpx 40rpx;
}
.submit-btn {
  background: var(--text-primary);
  color: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  font-size: 32rpx;
  font-weight: 700;
  padding: 20rpx 0;
}
.submit-btn[disabled] {
  opacity: 0.5;
}
</style>
