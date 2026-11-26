<template>
  <view class="study-metrics">
    <view v-if="error && !metrics" class="metrics-error" :class="{ 'zen-card': variant === 'bento', 'pc-sub-box': variant === 'pc' }">
      <text class="status-text">统计暂不可用</text>
      <view class="ui-btn ui-btn-secondary retry-btn" role="button" @click="load">重试</view>
    </view>

    <view v-else-if="loading && !metrics" class="bento-grid">
      <view
        v-for="n in 5"
        :key="n"
        :class="[
          variant === 'pc' ? 'pc-stat-cell' : 'bento-tile zen-card',
          variant === 'pc' ? (n === 5 ? 'is-wide' : '') : (n === 1 ? 'is-featured' : ''),
        ]"
      >
        <view class="ui-shimmer shimmer-val"></view>
        <view class="ui-shimmer shimmer-label"></view>
      </view>
    </view>

    <view v-else-if="metrics" class="bento-grid">
      <template v-if="variant === 'pc'">
        <view
          v-for="(metric, idx) in metrics"
          :key="metric.label"
          class="pc-stat-cell"
          :class="{ 'is-wide': idx === metrics.length - 1 && metrics.length % 2 === 1 }"
        >
          <view class="pc-stat-top">
            <view class="pc-stat-icon-wrap" aria-hidden="true">
              <LineIcon :name="metricIcon(idx)" size="13px" color="var(--color-sage-ink)" />
            </view>
            <text class="pc-stat-label">{{ metric.label }}</text>
          </view>
          <text class="pc-stat-value num-tabular" :class="{ 'is-accent': idx === 2 }">
            {{ metric.value }}
          </text>
        </view>
      </template>

      <template v-else>
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
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onScopeDispose, ref, watch } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import { statsApi } from '@/api/statsApi'
import { getStorageItem, setStorageItem } from '@/platform/storage'
import { useAuthStore } from '@/store/useAuthStore'
import { useFocusStore } from '@/store/useFocusStore'
import { useSyncStore } from '@/store/useSyncStore'
import { detectLocalTimeZone, getCurrentWeekBounds } from '@/utils/dateKey'
import { studyMetrics } from '@/utils/studyMetrics'

withDefaults(defineProps<{
  variant?: 'bento' | 'pc'
}>(), {
  variant: 'bento',
})

const emit = defineEmits<{
  (e: 'loaded', payload: { weeklyFocusDays: number }): void
}>()

const pcIcons = ['file-text', 'checklist', 'clock', 'fire', 'sparkles'] as const
function metricIcon(idx: number): string {
  return pcIcons[idx] || 'layers'
}

const auth = useAuthStore()
const focusStore = useFocusStore()
const syncStore = useSyncStore()
const metrics = ref<ReturnType<typeof studyMetrics> | null>(null)
const loading = ref(false)
const error = ref(false)
let requestId = 0
let pendingReload = false

function metricsCacheKey(userId: string | undefined, deviceId: string | undefined): string {
  return `auralis:metrics:cache:${userId || 'anon'}:${deviceId || 'dev'}`
}

function readCachedMetrics(userId: string | undefined, deviceId: string | undefined): ReturnType<typeof studyMetrics> | null {
  if (!userId) return null
  try {
    const raw = getStorageItem(metricsCacheKey(userId, deviceId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length !== 5) return null
    return parsed as ReturnType<typeof studyMetrics>
  } catch {
    return null
  }
}

function writeCachedMetrics(
  userId: string | undefined,
  deviceId: string | undefined,
  value: ReturnType<typeof studyMetrics>,
) {
  if (!userId) return
  try {
    setStorageItem(metricsCacheKey(userId, deviceId), JSON.stringify(value))
  } catch {
    // Ignore storage write failures cleanly
  }
}

async function load() {
  const userId = auth.user?.id
  const deviceId = auth.serverDeviceId
  const generation = auth.getLoginGeneration()
  if (!auth.isAuthenticated) return
  if (loading.value) {
    pendingReload = true
    return
  }
  pendingReload = false
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
    const nextMetrics = studyMetrics(overview, weekly)
    metrics.value = nextMetrics
    writeCachedMetrics(userId, deviceId, nextMetrics)
    const weeklyFocusDays = (weekly.days || []).filter(day => (day.focusSeconds ?? 0) > 0).length
    emit('loaded', { weeklyFocusDays })
  } catch (cause) {
    if (!isCurrent()) return
    console.error('[StudyMetrics] 统计数据加载失败', cause)
    error.value = true
  } finally {
    if (isCurrent()) {
      loading.value = false
      if (pendingReload) {
        pendingReload = false
        void load()
      }
    }
  }
}

watch(() => [auth.isAuthenticated, auth.user?.id, auth.serverDeviceId], () => {
  requestId++
  pendingReload = false
  metrics.value = auth.isAuthenticated ? readCachedMetrics(auth.user?.id, auth.serverDeviceId) : null
  error.value = false
  loading.value = false
  emit('loaded', { weeklyFocusDays: 0 })
  if (auth.isAuthenticated) {
    void load()
  }
}, { immediate: true })

watch(() => syncStore.metricsRevision, (rev) => {
  if (rev > 0 && auth.isAuthenticated) {
    void load()
  }
})

watch(
  () => [focusStore.todayRounds, focusStore.pendingOutboxCount] as const,
  ([nextRounds, nextPending], [prevRounds, prevPending]) => {
    if (!auth.isAuthenticated) return
    if (nextPending < prevPending || (nextRounds > prevRounds && nextPending === 0)) {
      void load()
    }
  },
)

onScopeDispose(() => { requestId++ })

defineExpose({
  reload: load,
})
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

.pc-stat-cell {
  background-color: var(--glass-sub-bg);
  backdrop-filter: var(--glass-blur-soft);
  -webkit-backdrop-filter: var(--glass-blur-soft);
  border: 1px solid var(--glass-border-subtle);
  box-shadow: var(--glass-shadow-subtle);
  border-radius: 14px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  min-width: 0;
  box-sizing: border-box;
}

.pc-stat-cell.is-wide {
  grid-column: 1 / -1;
}

.pc-stat-top {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.pc-stat-icon-wrap {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background-color: rgba(139, 154, 110, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pc-stat-label {
  font-size: 12px;
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pc-stat-value {
  font-size: 20px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.05;
  letter-spacing: -0.02em;
}

.pc-stat-value.is-accent {
  color: var(--color-sage-ink);
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

.pc-sub-box {
  background-color: var(--glass-sub-bg);
  border: 1px solid var(--glass-border-subtle);
  border-radius: 14px;
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
