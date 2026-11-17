<template>
  <AppPageLayout>
    <view class="review-page">
      <view class="status-bar-spacer"></view>

      <view class="review-toolbar">
        <view
          class="subject-switcher"
          role="button"
          aria-label="切换学科"
          @click="showSubjectPicker = true"
        >
          <text class="switcher-label">{{ activeSubjectLabel }}</text>
          <LineIcon name="chevron-down" size="14px" color="var(--color-sage-ink)" />
        </view>

        <view class="progress-indicator">
          <view class="progress-track">
            <view class="progress-fill" :style="{ width: `${progressPercent}%` }"></view>
          </view>
          <text class="summary-text num-tabular">{{ counterText }}</text>
        </view>
      </view>

      <view class="card-stage">
        <FlashCard
          v-if="activeCard"
          v-model:flipped="isFlipped"
          :front="activeCard.title"
          :back="activeCard.preview"
          :subject="activeCard.subject"
          :has-next="remainingCount > 1"
        />

        <view v-else class="empty-card zen-card">
          <view class="empty-halo">
            <LineIcon :name="loading ? 'refresh' : 'check'" size="24px" color="var(--color-sage-ink)" />
          </view>
          <text class="empty-title">{{ loading ? '加载中' : loadError || emptyStateTitle }}</text>
          <view v-if="!loading" class="ui-btn ui-btn-secondary refresh-pill" role="button" @click="loadReview">
            <LineIcon name="refresh" size="14px" color="var(--text-primary)" />
            <text>刷新</text>
          </view>
        </view>
      </view>

      <view v-if="saving || saveError" class="status-banner zen-card">
        <text class="status-msg">{{ saving ? '保存中…' : saveError }}</text>
        <view
          v-if="saveError"
          class="ui-btn ui-btn-primary retry-pill"
          role="button"
          @click="refreshRequired ? loadReview() : retrySave()"
        >
          <text>{{ refreshRequired ? '刷新队列' : '重试' }}</text>
        </view>
      </view>

      <view v-else-if="activeCard" class="action-bar">
        <template v-if="!isFlipped">
          <view class="ui-btn ui-btn-secondary bar-btn" role="button" @click="skipCard">
            <text>跳过</text>
          </view>
          <view class="ui-btn ui-btn-primary bar-btn wide" role="button" @click="isFlipped = true">
            <text>显示答案</text>
          </view>
        </template>
        <template v-else>
          <view class="ui-btn bar-btn again-btn" :class="{ 'is-disabled': saving }" role="button" @click="rateCard('AGAIN')">
            <text>再记一次</text>
          </view>
          <view class="ui-btn ui-btn-primary bar-btn wide" :class="{ 'is-disabled': saving }" role="button" @click="rateCard('GOOD')">
            <text>已掌握</text>
          </view>
        </template>
      </view>
    </view>

    <template #overlay>
      <view v-if="showSubjectPicker" class="zen-sheet-mask" @click="showSubjectPicker = false">
        <view class="zen-sheet-body" @click.stop>
          <view class="sheet-header">
            <text class="sheet-title">学科</text>
            <view class="ui-icon-btn" role="button" aria-label="关闭" @click="showSubjectPicker = false">
              <LineIcon name="close" size="16px" color="var(--text-muted)" />
            </view>
          </view>

          <scroll-view scroll-y :show-scrollbar="false" class="subject-sheet-scroll">
            <view
              class="subject-option"
              :class="{ active: !selectedSubjectId }"
              role="button"
              @click="selectSubjectScope('')"
            >
              <text class="subject-option-name">全部学科</text>
              <LineIcon v-if="!selectedSubjectId" name="check" size="16px" color="var(--color-sage-ink)" />
            </view>
            <view
              v-for="sub in subjectStore.subjects"
              :key="sub.id"
              class="subject-option"
              :class="{ active: selectedSubjectId === sub.id }"
              role="button"
              @click="selectSubjectScope(sub.id)"
            >
              <text class="subject-option-name">{{ sub.name }}</text>
              <LineIcon v-if="selectedSubjectId === sub.id" name="check" size="16px" color="var(--color-sage-ink)" />
            </view>
          </scroll-view>
        </view>
      </view>
    </template>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { reviewApi } from '@/api/reviewApi'
import AppPageLayout from '@/components/AppPageLayout.vue'
import FlashCard from '@/components/FlashCard.vue'
import LineIcon from '@/components/LineIcon.vue'
import { useDueReview } from '@/composables/useDueReview'
import { useEscapeKey } from '@/composables/useEscapeKey'
import { useSubjectStore } from '@/store/useSubjectStore'

const subjectStore = useSubjectStore()
const selectedSubjectId = ref('')
const showSubjectPicker = ref(false)
useEscapeKey(() => showSubjectPicker.value, () => {
  showSubjectPicker.value = false
})

const activeSubjectLabel = computed(() => {
  if (!selectedSubjectId.value) return '全部学科'
  return subjectStore.subjects.find(item => item.id === selectedSubjectId.value)?.name || '全部学科'
})

const {
  sessionQueue,
  currentIndex,
  completedCount,
  remainingCount,
  activeCard,
  isFlipped,
  loading,
  saving,
  loadError,
  saveError,
  refreshRequired,
  loadReview,
  retrySave,
  skipCard,
  rateCard,
} = useDueReview(reviewApi, {
  subjectId: () => selectedSubjectId.value || undefined,
  enabled: () => true,
  allowAllSubjects: true,
})

const progressPercent = computed(() => {
  const total = sessionQueue.value.length
  if (!total) return 0
  return Math.min(100, Math.round((currentIndex.value / total) * 100))
})

const counterText = computed(() => {
  const total = sessionQueue.value.length
  if (!total) return '0 / 0'
  const current = Math.min(total, currentIndex.value + (activeCard.value ? 1 : 0))
  return `${current} / ${total}`
})

const emptyStateTitle = computed(() => (
  completedCount.value > 0 ? '本轮复习完成' : '暂无待复习'
))

onMounted(() => {
  void subjectStore.loadSubjects()
})

function selectSubjectScope(subjectId: string) {
  selectedSubjectId.value = subjectId
  showSubjectPicker.value = false
}
</script>

<style scoped>
.review-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-bottom: var(--tabbar-clearance);
  box-sizing: border-box;
  background-color: var(--color-bg-primary);
}

.status-bar-spacer {
  height: var(--status-bar-height, 0px);
  flex-shrink: 0;
}

.review-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 18px 8px;
  flex-shrink: 0;
}

.subject-switcher {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-sm);
  max-width: 52%;
  cursor: pointer;
  transition: border-color 0.16s ease;
}

.subject-switcher:hover {
  border-color: var(--border-accent);
}

.switcher-label {
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.progress-track {
  width: 64px;
  height: 4px;
  border-radius: var(--radius-full);
  background-color: rgba(139, 154, 110, 0.16);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--accent-gradient);
  transition: width 0.28s var(--ease-out);
}

.summary-text {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-muted);
}

.card-stage {
  flex: 1;
  min-height: 0;
  padding: 10px 18px;
  display: flex;
  box-sizing: border-box;
}

.empty-card {
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 24px;
  border-radius: 20px;
}

.empty-halo {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background-color: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-title {
  font-size: 16px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  text-align: center;
}

.refresh-pill {
  height: 36px;
  padding: 0 16px;
}

.status-banner {
  margin: 4px 18px 8px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.status-msg {
  flex: 1;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.retry-pill {
  height: 32px;
  padding: 0 14px;
  font-size: var(--font-size-xs);
}

.action-bar {
  display: flex;
  gap: 10px;
  padding: 8px 18px 4px;
  flex-shrink: 0;
}

.bar-btn {
  flex: 1;
  height: 48px;
  border-radius: 14px;
  font-size: 14.5px;
}

.bar-btn.wide {
  flex: 1.65;
}

.again-btn {
  background-color: var(--color-danger-bg);
  color: var(--color-danger);
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.sheet-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.subject-sheet-scroll {
  max-height: 52vh;
}

.subject-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 14px;
  border-radius: 12px;
  margin-bottom: 8px;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
}

.subject-option.active {
  background-color: var(--color-sage-bg);
  border-color: var(--border-accent);
}

.subject-option-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}
</style>
