<template>
  <view class="study-metrics">
    <view v-if="error" class="metrics-status">
      <text>统计数据加载失败</text>
      <button class="metrics-retry" size="mini" @click="load">重试</button>
    </view>
    <text v-else-if="loading && !metrics" class="metrics-status">正在加载统计…</text>
    <view v-if="metrics" class="metrics-grid">
      <view v-for="metric in metrics" :key="metric.label" class="metric">
        <text class="metric-label">{{ metric.label }}</text>
        <text class="metric-value">{{ metric.value }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onScopeDispose, ref, watch } from 'vue'
import { statsApi } from '@/api/statsApi'
import { useAuthStore } from '@/store/useAuthStore'
import { studyMetrics } from '@/utils/studyMetrics'

const auth = useAuthStore()
const metrics = ref<ReturnType<typeof studyMetrics> | null>(null)
const loading = ref(false)
const error = ref(false)
let requestId = 0

async function load() {
  const userId = auth.user?.id
  const deviceId = auth.serverDeviceId
  const generation = auth.getLoginGeneration()
  if (!auth.isAuthenticated || loading.value) return
  const id = ++requestId
  const isCurrent = () => id === requestId && generation === auth.getLoginGeneration()
    && userId === auth.user?.id && deviceId === auth.serverDeviceId
  loading.value = true
  error.value = false
  try {
    const start = new Date()
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 6)
    const [overview, weekly] = await Promise.all([
      statsApi.overview(),
      statsApi.weekly(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)),
    ])
    if (!isCurrent()) return
    metrics.value = studyMetrics(overview, weekly)
  } catch (cause) {
    if (!isCurrent()) return
    console.error('[StudyMetrics] 统计数据加载失败', cause)
    error.value = true
  } finally {
    if (isCurrent()) loading.value = false
  }
}

watch(() => [auth.sessionId, auth.user?.id, auth.serverDeviceId], () => {
  requestId++
  metrics.value = null
  error.value = false
  loading.value = false
  void load()
}, { immediate: true })

onScopeDispose(() => { requestId++ })
</script>

<style scoped>
.study-metrics {
  background: var(--color-bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 24rpx;
  padding: 6rpx 26rpx;
}

.metrics-grid {
  display: flex;
  flex-direction: column;
}

.metric,
.metrics-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  min-height: 82rpx;
  font-size: 26rpx;
  color: var(--text-primary);
}

.metric + .metric {
  border-top: 1px solid var(--border-subtle);
}

.metric-label {
  min-width: 0;
}

.metric-value {
  flex-shrink: 0;
  font-size: 30rpx;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.metrics-retry {
  flex-shrink: 0;
  margin: 0;
}
</style>
