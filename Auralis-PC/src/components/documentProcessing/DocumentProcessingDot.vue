<template>
  <span
    v-if="visible"
    :class="['processing-dot', { 'processing-dot--error': failed }]"
    :title="label"
    role="status"
    aria-label="文件解析状态"
  ></span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDocumentProcessingStore } from '@/store/useDocumentProcessingStore'

const props = defineProps<{ sourceId: string }>()
const store = useDocumentProcessingStore()
const job = computed(() => store.jobs.find((item) => item.sourceId === props.sourceId))
const visible = computed(() => Boolean(job.value && job.value.phase !== 'READY'))
const failed = computed(() => ['FAILED_LOCAL', 'FAILED_SERVER'].includes(job.value?.phase || ''))
const label = computed(() => {
  const phase = job.value?.phase
  if (phase === 'FAILED_LOCAL') return '本地解析失败，请前往个人中心重试'
  if (phase === 'FAILED_SERVER') return '服务端索引失败，请前往个人中心重试'
  if (phase === 'OCR_RUNNING') return '正在 OCR 识别'
  if (phase === 'EXTRACTING') return '正在解析文本'
  if (phase === 'UPLOADING' || phase === 'SERVER_INDEXING' || phase === 'SERVER_VALIDATING') return '正在上传并建立索引'
  if (phase === 'PAUSED_NETWORK') return '等待网络恢复'
  return '正在解析文件'
})
</script>

<style scoped>
.processing-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-left: 7px;
  border-radius: 50%;
  background: #d39b46;
  box-shadow: 0 0 0 3px rgba(211, 155, 70, 0.14);
  animation: processing-pulse 1.4s ease-in-out infinite;
  vertical-align: middle;
}

.processing-dot--error {
  background: #d85c5c;
  box-shadow: 0 0 0 3px rgba(216, 92, 92, 0.14);
  animation: none;
}

@keyframes processing-pulse {
  0%, 100% { opacity: .45; transform: scale(.9); }
  50% { opacity: 1; transform: scale(1); }
}
</style>
