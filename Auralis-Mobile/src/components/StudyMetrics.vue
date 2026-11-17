<template>
  <view class="study-metrics">
    <view v-if="error && !metrics" class="metrics-error zen-card">
      <text class="status-text">统计暂不可用</text>
      <view class="ui-btn ui-btn-secondary retry-btn" role="button" @click="load">重试</view>
    </view>

    <view v-else-if="loading && !metrics" class="bento-grid">
      <view v-for="n in 4" :key="n" class="bento-tile zen-card">
        <view class="ui-shimmer shimmer-val"></view>
        <view class="ui-shimmer shimmer-label"></view>
      </view>
    </view>

    <view v-else-if="metrics" class="bento-grid">
      <view
        v-for="(metric, idx) in metrics"
        :key="metric.label"
        class="bento-tile zen-card"
        :class="{ 'is-featured': idx === 0 && metrics.length % 2 === 1 }"
      >
        <view class="tile-main">
          <text class="metric-value num-tabular">{{ metric.value }}</text>
          <text class="metric-label">{{ metric.label }}</text>
        </view>
        <view v-if="idx === 0 && metrics.length % 2 === 1" class="featured-mark" aria-hidden="true">
          <LineIcon name="layers" size="18px" color="var(--color-sage-ink)" />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onScopeDispose, ref, watch } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
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
  width: 100%;
}

.bento-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.bento-tile {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.tile-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.bento-tile.is-featured {
  grid-column: 1 / -1;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  background: linear-gradient(135deg, rgba(139, 154, 110, 0.14) 0%, var(--color-bg-tertiary) 76%);
  border-color: var(--border-accent);
}

.featured-mark {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background-color: rgba(139, 154, 110, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.metric-value {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.15;
  letter-spacing: -0.025em;
}

.bento-tile.is-featured .metric-value {
  font-size: 28px;
  color: var(--color-sage-ink);
}

.metric-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.metrics-error {
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.status-text {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.retry-btn {
  height: 30px;
  padding: 0 12px;
  font-size: var(--font-size-xs);
}

.shimmer-val {
  width: 48px;
  height: 24px;
}

.shimmer-label {
  width: 72px;
  height: 12px;
  margin-top: 6px;
}
</style>
