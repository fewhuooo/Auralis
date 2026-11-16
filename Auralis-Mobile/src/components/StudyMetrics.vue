<template>
  <view class="study-metrics zen-card">
    <view v-if="error && !metrics" class="metrics-status">
      <text class="status-text">统计数据加载失败</text>
      <view class="metrics-retry" @click="load">重试</view>
    </view>
    <text v-else-if="loading && !metrics" class="metrics-status status-text">正在加载统计…</text>
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
import { detectLocalTimeZone, getCurrentWeekBounds } from '@/utils/dateKey'
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
    const bounds = getCurrentWeekBounds()
    const timeZone = detectLocalTimeZone()
    const [overview, weekly] = await Promise.all([
      statsApi.overview(),
      statsApi.weekly(bounds.from, bounds.to, timeZone),
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
  padding: 8rpx 28rpx;
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
  font-size: var(--font-size-xs);
  color: var(--text-primary);
}

.metric + .metric {
  border-top: 1px solid var(--border-subtle);
}

.metric-label {
  color: var(--text-secondary);
  min-width: 0;
}

.metric-value {
  flex-shrink: 0;
  font-size: 30rpx;
  font-weight: var(--font-weight-semibold);
  font-family: var(--font-family-mono);
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.status-text {
  color: var(--text-muted);
}

.metrics-retry {
  padding: 10rpx 22rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-zen-sage);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}
</style>
