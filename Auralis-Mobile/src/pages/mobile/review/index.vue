<template>
  <AppPageLayout>
    <view class="review-page">
      <view class="status-bar-spacer"></view>

      <view class="review-toolbar">
        <view class="subject-switcher" @click="showSubjectPicker = true">
          <text class="switcher-label">{{ activeSubjectLabel }}</text>
          <LineIcon name="chevron-down" size="14px" color="var(--color-sage-dark)" />
        </view>

        <text class="summary-text num-tabular">{{ remainingCount }} 待复习 · {{ completedCount }} 完成</text>
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
          <LineIcon :name="loading ? 'refresh' : 'star'" size="32px" color="var(--color-sage-dark)" />
          <text class="empty-title">{{ loading ? '加载中' : loadError || '已清空' }}</text>
          <view v-if="!loading" class="ui-btn ui-btn-secondary refresh-pill" @click="loadReview">
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
          @click="refreshRequired ? loadReview() : retrySave()"
        >
          <text>{{ refreshRequired ? '刷新队列' : '重试' }}</text>
        </view>
      </view>

      <view v-else-if="activeCard" class="action-bar">
        <template v-if="!isFlipped">
          <view class="ui-btn ui-btn-secondary bar-btn" @click="skipCard">
            <text>跳过</text>
          </view>
          <view class="ui-btn ui-btn-primary bar-btn wide" @click="isFlipped = true">
            <text>显示答案</text>
          </view>
        </template>
        <template v-else>
          <view class="ui-btn bar-btn again-btn" :class="{ 'is-disabled': saving }" @click="rateCard('AGAIN')">
            <text>再记一次</text>
          </view>
          <view class="ui-btn ui-btn-primary bar-btn wide" :class="{ 'is-disabled': saving }" @click="rateCard('GOOD')">
            <text>已掌握</text>
          </view>
        </template>
      </view>

      <view v-if="showSubjectPicker" class="zen-sheet-mask" @click="showSubjectPicker = false">
        <view class="zen-sheet-body" @click.stop>
          <view class="sheet-header">
            <text class="sheet-title">学科范围</text>
            <view class="ui-icon-btn" @click="showSubjectPicker = false">
              <LineIcon name="close" size="16px" color="var(--text-muted)" />
            </view>
          </view>

          <scroll-view scroll-y :show-scrollbar="false" class="subject-sheet-scroll">
            <view
              class="subject-option"
              :class="{ active: !selectedSubjectId }"
              @click="selectSubjectScope('')"
            >
              <text class="subject-option-name">全部学科</text>
              <LineIcon v-if="!selectedSubjectId" name="check" size="16px" color="var(--color-sage-dark)" />
            </view>
            <view
              v-for="sub in subjectStore.subjects"
              :key="sub.id"
              class="subject-option"
              :class="{ active: selectedSubjectId === sub.id }"
              @click="selectSubjectScope(sub.id)"
            >
              <text class="subject-option-name">{{ sub.name }}</text>
              <LineIcon v-if="selectedSubjectId === sub.id" name="check" size="16px" color="var(--color-sage-dark)" />
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

.status-bar-spacer {
  height: var(--status-bar-height, 0px);
  flex-shrink: 0;
}

.review-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px 8px;
  flex-shrink: 0;
}

.subject-switcher {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background-color: var(--color-bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-sm);
  max-width: 54%;
  cursor: pointer;
}

.switcher-label {
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.summary-text {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
  flex-shrink: 0;
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
  margin: 4px 18px 14px;
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
  padding: 8px 18px 14px;
  flex-shrink: 0;
}

.bar-btn {
  flex: 1;
  height: 46px;
  border-radius: 14px;
  font-size: 14.5px;
}

.bar-btn.wide {
  flex: 1.6;
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
  margin-bottom: 6px;
  background-color: var(--color-bg-primary);
  cursor: pointer;
}

.subject-option.active {
  background-color: var(--color-sage-bg);
}

.subject-option-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}
</style>
