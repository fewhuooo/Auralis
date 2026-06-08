<template>
  <view class="modal-root" v-if="visible" @click.stop="close">
    <view class="modal-overlay"></view>
    <view class="editor-modal glass-card" :class="{'is-open': visible}" @click.stop>
      <view class="modal-header">
        <text class="modal-title">完善知识内容</text>
        <text class="close-btn" @click="close">✕</text>
      </view>
      
      <view class="modal-body">
        <input 
          class="block-title-input" 
          v-model="editTitle" 
          placeholder="给知识块起个标题..." 
          placeholder-class="placeholder-style"
        />
        <textarea 
          class="block-content-textarea" 
          v-model="editContent" 
          placeholder="在此编辑识别或生成的内容..." 
          placeholder-class="placeholder-style"
          :maxlength="-1"
        ></textarea>
      </view>
      
      <view class="modal-footer">
        <view class="tbtn tbtn-cancel" @click="close"><text class="tbtn-text">取消</text></view>
        <view class="tbtn tbtn-save" @click="save"><text class="tbtn-text-save">确认归档</text></view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { vibrate } from '@/api/device'
import { useBlockStore } from '@/store/useBlockStore'

const blockStore = useBlockStore()

const visible = ref(false)
const editTitle = ref('')
const editContent = ref('')
const sourceLabel = ref('')

const open = (content: string, defaultTitle: string = '快速捕获', source: string = 'Quick Capture') => {
  vibrate('light')
  editTitle.value = defaultTitle
  editContent.value = content
  sourceLabel.value = source
  visible.value = true
}

const close = () => {
  visible.value = false
}

const save = () => {
  if (!editTitle.value.trim()) {
    uni.showToast({ title: '请输入标题', icon: 'none' })
    return
  }
  if (!editContent.value.trim()) {
    uni.showToast({ title: '内容不能为空', icon: 'none' })
    return
  }
  
  vibrate('light')
  blockStore.addBlock({
    id: `capture-${Date.now()}`,
    subject: '捕获收集',
    title: editTitle.value,
    preview: editContent.value,
    source: sourceLabel.value,
    time: '刚刚',
    color: '#8b5cf6' // Default accent
  })
  
  close()
  uni.showToast({ title: '知识块已归档', icon: 'success' })
}

defineExpose({
  open,
  close
})
</script>

<style scoped>
.modal-root {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.modal-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 1;
}

.editor-modal {
  position: relative;
  z-index: 2;
  height: 85vh;
  background: var(--color-bg-primary);
  border-radius: 40rpx 40rpx 0 0;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  box-shadow: 0 -10rpx 40rpx rgba(0,0,0,0.1);
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.glass-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-top: 2rpx solid var(--glass-border);
}

.modal-header {
  padding: 40rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2rpx solid var(--border-subtle);
}

.modal-title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--text-primary);
}

.close-btn {
  font-size: 40rpx;
  color: var(--text-muted);
  padding: 10rpx;
}

.modal-body {
  flex: 1;
  padding: 40rpx;
  display: flex;
  flex-direction: column;
  gap: 32rpx;
  overflow-y: auto;
}

.block-title-input {
  font-size: 36rpx;
  font-weight: 700;
  color: var(--text-primary);
  border-bottom: 2rpx solid var(--border-default);
  padding-bottom: 16rpx;
}

.placeholder-style {
  color: var(--text-muted);
}

.block-content-textarea {
  flex: 1;
  width: 100%;
  font-size: 30rpx;
  line-height: 1.6;
  color: var(--text-secondary);
  background: var(--color-bg-secondary);
  border-radius: 20rpx;
  padding: 24rpx;
  border: 2rpx solid var(--border-subtle);
  box-sizing: border-box;
}

.modal-footer {
  padding: 32rpx 40rpx;
  padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
  display: flex;
  justify-content: flex-end;
  gap: 20rpx;
  border-top: 2rpx solid var(--border-subtle);
  background: var(--color-bg-primary);
}

.tbtn {
  padding: 16rpx 40rpx;
  border-radius: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tbtn-cancel {
  background: var(--color-bg-tertiary);
}
.tbtn-text {
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 28rpx;
}

.tbtn-save {
  background: var(--text-primary);
}
.tbtn-text-save {
  color: var(--color-bg-primary);
  font-weight: 600;
  font-size: 28rpx;
}
</style>
