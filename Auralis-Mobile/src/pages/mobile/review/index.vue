<template>
  <AppPageLayout>
    <view class="review-page">
      <AppHeader title="学习" />

      <view class="review-toolbar">
        <view class="subject-switcher" @click="showSubjectPicker = true">
          <text class="switcher-label">{{ activeSubjectLabel }}</text>
          <LineIcon name="chevron-down" size="28rpx" color="var(--color-zen-sage)" />
        </view>

        <view class="progress-summary">
          <text class="summary-text">待复习 {{ remainingCount }} · 已完成 {{ completedCount }}</text>
        </view>
      </view>

      <view class="card-stage">
        <FlashCard
          v-if="activeCard"
          v-model:flipped="isFlipped"
          :front="activeCard.title"
          :back="activeCard.preview"
          :subject="activeCard.subject"
        />

        <view v-else class="empty-card zen-card">
          <LineIcon :name="loading ? 'refresh' : 'star'" size="72rpx" color="var(--color-zen-sage)" />
          <text class="empty-title">{{ loading ? '正在加载待复习卡片…' : loadError || '本轮复习已完成' }}</text>
          <text class="empty-desc">
            {{ loading ? '请稍候' : loadError ? '请检查网络连接后重试' : '当前范围内已无到期知识卡片' }}
          </text>
          <view v-if="!loading" class="refresh-btn" @click="loadReview">
            <LineIcon name="refresh" size="28rpx" color="#FFFFFF" />
            <text>刷新复习队列</text>
          </view>
        </view>
      </view>

      <view v-if="saving || saveError" class="status-banner zen-card">
        <text class="status-msg">{{ saving ? '正在保存复习进度…' : saveError }}</text>
        <view
          v-if="saveError"
          class="status-retry"
          @click="refreshRequired ? loadReview() : retrySave()"
        >
          <text>{{ refreshRequired ? '刷新队列' : '重试保存' }}</text>
        </view>
      </view>

      <view v-else-if="activeCard" class="action-bar">
        <template v-if="!isFlipped">
          <view class="action-btn secondary" @click="skipCard">
            <text>跳过</text>
          </view>
          <view class="action-btn primary" @click="isFlipped = true">
            <text>显示答案</text>
          </view>
        </template>
        <template v-else>
          <view class="action-btn warn" :class="{ disabled: saving }" @click="rateCard('AGAIN')">
            <text>再记一次</text>
          </view>
          <view class="action-btn primary" :class="{ disabled: saving }" @click="rateCard('GOOD')">
            <text>已掌握</text>
          </view>
        </template>
      </view>

      <view v-if="showSubjectPicker" class="zen-sheet-mask" @click="showSubjectPicker = false">
        <view class="zen-sheet-body" @click.stop>
          <view class="sheet-header">
            <text class="sheet-title">选择复习学科范围</text>
            <view class="sheet-close" @click="showSubjectPicker = false">
              <LineIcon name="close" size="32rpx" color="var(--text-muted)" />
            </view>
          </view>

          <scroll-view scroll-y :show-scrollbar="false" class="subject-sheet-scroll">
            <view
              class="subject-option"
              :class="{ active: !selectedSubjectId }"
              @click="selectSubjectScope('')"
            >
              <text class="subject-option-name">全部学科</text>
              <LineIcon v-if="!selectedSubjectId" name="check" size="30rpx" color="var(--color-zen-sage)" />
            </view>
            <view
              v-for="sub in subjectStore.subjects"
              :key="sub.id"
              class="subject-option"
              :class="{ active: selectedSubjectId === sub.id }"
              @click="selectSubjectScope(sub.id)"
            >
              <text class="subject-option-name">{{ sub.name }}</text>
              <LineIcon v-if="selectedSubjectId === sub.id" name="check" size="30rpx" color="var(--color-zen-sage)" />
            </view>
          </scroll-view>
        </view>
      </view>
    </view>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { reviewApi } from '@/api/reviewApi'
import AppHeader from '@/components/AppHeader.vue'
import AppPageLayout from '@/components/AppPageLayout.vue'
import FlashCard from '@/components/FlashCard.vue'
import LineIcon from '@/components/LineIcon.vue'
import { useDueReview } from '@/composables/useDueReview'
import { useSubjectStore } from '@/store/useSubjectStore'

const subjectStore = useSubjectStore()
const selectedSubjectId = ref('')
const showSubjectPicker = ref(false)

const activeSubjectLabel = computed(() => {
  if (!selectedSubjectId.value) return '全部学科'
  return subjectStore.subjects.find(item => item.id === selectedSubjectId.value)?.name || '全部学科'
})

const {
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
  background-color: var(--color-bg-primary);
}

.review-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 18rpx 32rpx 12rpx;
  flex-shrink: 0;
}

.subject-switcher {
  display: inline-flex;
  align-items: center;
  gap: 10rpx;
  padding: 12rpx 24rpx;
  background-color: var(--color-bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-sm);
  max-width: 52%;
}

.switcher-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-summary {
  flex-shrink: 0;
}

.summary-text {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.card-stage {
  flex: 1;
  min-height: 0;
  padding: 16rpx 32rpx;
  display: flex;
  box-sizing: border-box;
}

.empty-card {
  width: 100%;
  height: 100%;
  min-height: 520rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18rpx;
  padding: 40rpx;
  box-sizing: border-box;
}

.empty-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  text-align: center;
}

.empty-desc {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  text-align: center;
}

.refresh-btn {
  margin-top: 12rpx;
  display: inline-flex;
  align-items: center;
  gap: 10rpx;
  padding: 18rpx 36rpx;
  border-radius: var(--radius-full);
  background: var(--accent-gradient);
  color: #FFFFFF;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.status-banner {
  margin: 0 32rpx 24rpx;
  padding: 20rpx 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  flex-shrink: 0;
}

.status-msg {
  font-size: var(--font-size-xs);
  color: var(--color-danger);
}

.status-retry {
  padding: 10rpx 22rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-danger-bg);
  color: var(--color-danger);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.action-bar {
  display: flex;
  gap: 20rpx;
  padding: 12rpx 32rpx 24rpx;
  flex-shrink: 0;
}

.action-btn {
  flex: 1;
  height: 88rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}

.action-btn.primary {
  background: var(--accent-gradient);
  color: #FFFFFF;
  box-shadow: 0 8rpx 20rpx rgba(139, 154, 110, 0.25);
}

.action-btn.secondary {
  background-color: var(--color-bg-card);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
}

.action-btn.warn {
  background-color: rgba(200, 155, 109, 0.16);
  border: 1px solid rgba(200, 155, 109, 0.45);
  color: #8C6235;
}

.action-btn.disabled {
  opacity: 0.55;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.sheet-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.sheet-close {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background-color: var(--color-bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.subject-sheet-scroll {
  max-height: 50vh;
}

.subject-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx;
  margin-bottom: 12rpx;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 22rpx;
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
