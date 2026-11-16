<template>
  <TabletLayout>
    <view class="t-dashboard">
      <!-- Schedule and tasks -->
      <view class="left-column">
        <!-- Greeting Row & Quick Add Button -->
        <view class="greeting-row">
          <text class="greeting-title">{{ greeting }}，{{ username }}</text>
          <view class="add-circle-btn" :class="{ 'is-active': showQuickAdd }" @click="showQuickAdd = !showQuickAdd">
            <LineIcon :name="showQuickAdd ? 'close' : 'plus'" size="36rpx" :color="showQuickAdd ? '#FFFFFF' : '#1C1C1A'" />
          </view>
        </view>

        <!-- 悬浮最顶层的遮罩层 -->
        <view v-if="showQuickAdd" class="quick-add-mask" @click="showQuickAdd = false"></view>

        <!-- +号触发的快速创建输入框（覆盖在最顶层） -->
        <view v-if="showQuickAdd" class="quick-add-container">
          <view class="quick-input-row">
            <input 
              class="quick-input" 
              v-model="quickTaskName" 
              placeholder="输入日程或待办内容，按回车添加..." 
              confirm-type="done"
              :focus="showQuickAdd"
              @confirm="submitQuickAdd"
            />
            <view class="quick-submit-btn" :class="{ disabled: !quickTaskName.trim() }" @click="submitQuickAdd">
              <LineIcon name="check" size="32rpx" color="#FFFFFF" />
            </view>
          </view>

          <!-- 学科选择：带箭头的单行触发器 -->
          <view class="quick-select-row">
            <text class="quick-label">学科：</text>
            <view class="subject-dropdown-btn" @click="showSubjectList = !showSubjectList">
              <view class="sub-dot"></view>
              <text class="dropdown-text">{{ quickSubject?.name || '选择学科...' }}</text>
              <LineIcon :name="showSubjectList ? 'chevron-up' : 'chevron-down'" size="32rpx" color="var(--color-zen-stone)" />
            </view>
          </view>

          <!-- 点击箭头后弹出的竖直排列学科列表 -->
          <view v-if="showSubjectList" class="subject-vertical-popup">
            <scroll-view scroll-y class="subject-vertical-scroll" :show-scrollbar="false">
              <view class="subject-vertical-list">
                <view 
                  v-for="sub in displaySubjects" 
                  :key="sub.id || sub.name"
                  class="subject-vertical-item"
                  :class="{ active: quickSubject?.name === sub.name }"
                  @click="selectSubject(sub)"
                >
                  <view class="sub-dot"></view>
                  <text class="sub-item-name">{{ sub.name }}</text>
                  <LineIcon v-if="quickSubject?.name === sub.name" name="check" size="32rpx" color="#7D9372" />
                </view>
              </view>
            </scroll-view>
          </view>

          <!-- 整半小时时长选择（0-2小时每半小时一档，四段连在一起的可拖动选择器） -->
          <view class="quick-select-row">
            <text class="quick-label">时长：</text>
            <view 
              class="segmented-track"
              id="durTrack"
              @touchstart="onDurTouchStart"
              @touchmove="onDurTouchMove"
            >
              <!-- 滑动高亮滑块 -->
              <view 
                class="segmented-thumb" 
                :style="{ transform: `translateX(${durSelectedIndex * 100}%)` }"
              ></view>

              <!-- 4个连在一起的选项 -->
              <view 
                v-for="item in durationOptions" 
                :key="item.val"
                class="segmented-item"
                :class="{ active: quickDuration === item.val }"
                @click="quickDuration = item.val"
              >
                <text>{{ item.label }}</text>
              </view>
            </view>
          </view>
        </view>

        <!-- Week Strip (周视图) -->
        <view class="week-strip">
          <view 
            v-for="(day, idx) in weekDays" 
            :key="day.dateStr" 
            class="w-day" 
            :class="{ active: selectedDateIndex === idx, today: day.isToday }" 
            @click="selectedDateIndex = idx"
          >
            <text class="w-week">{{ day.weekdayShort }}</text>
            <text class="w-num">{{ day.day }}</text>
            <view v-if="day.isToday" class="today-dot"></view>
          </view>
        </view>

        <!-- Section Header -->
        <view class="section-header">
          <text class="section-title">待办与日程</text>
          <text class="section-count">{{ pendingTasks.length > 4 ? `显示前 4 项 · 共 ${pendingTasks.length} 项待办` : '点击左侧完成 · 右上方 + 新建' }}</text>
        </view>

        <!-- Task List (Zen Pills - Non-scrollable compact) -->
        <view class="task-list-container">
          <view v-if="pendingTasks.length === 0" class="empty-tasks">
            <text class="empty-icon">🍃</text>
            <text class="empty-text">当前无待办日程</text>
            <text class="empty-sub">点击右上方 + 创建专注任务</text>
          </view>
          <view 
            v-for="task in pendingTasks.slice(0, 4)" 
            :key="task.id" 
            class="zen-pill-task" 
            :class="{ completed: task.status === 'completed' }" 
            :style="{ borderLeftColor: 'var(--color-primary)' }"
          >
            <view class="task-left" @click="handleToggleTask(task)">
              <view 
                class="task-checkbox" 
                :class="{ checked: task.status === 'completed' }" 
                :style="{ 
                  borderColor: 'var(--color-primary)',
                  backgroundColor: task.status === 'completed' ? 'var(--color-primary)' : 'transparent'
                }"
              >
                <LineIcon v-if="task.status === 'completed'" name="check" size="20rpx" color="#FFFFFF" />
              </view>
              <view class="task-info">
                <text class="task-name" :class="{ done: task.status === 'completed' }">{{ task.name }}</text>
                <view class="task-meta">
                <text class="task-subject">{{ task.subject }}</text>
                  <text class="task-duration">· {{ task.duration }} 分钟</text>

                </view>
              </view>
            </view>
            <view class="task-actions">
              <view class="action-btn del-btn" @click.stop="handleDeleteTask(task.id)">
                <LineIcon name="close" size="22rpx" color="#A8A8A5" />
              </view>
            </view>
          </view>
        </view>
      </view>

      <view class="right-column">
        <StudyMetrics />
      </view>
    </view>
  </TabletLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import StudyMetrics from '@/components/StudyMetrics.vue'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useAuthStore } from '@/store/useAuthStore'

const subjectStore = useSubjectStore()
const taskStore = useTaskStore()
const authStore = useAuthStore()

const { subjects } = storeToRefs(subjectStore)
const { pendingTasks } = storeToRefs(taskStore)

const username = computed(() => authStore.username || '同学')

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 9) return '早上好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  if (h < 22) return '晚上好'
  return '夜深了'
})

// --- QUICK ADD LOGIC ---
const showQuickAdd = ref(false)
const quickTaskName = ref('')
const quickSubject = ref<any>(null)
const quickDuration = ref(30)
const showSubjectList = ref(false)

const selectSubject = (sub: any) => {
  quickSubject.value = sub
  showSubjectList.value = false
}

const durationOptions = [
  { label: '0.5h', val: 30 },
  { label: '1h', val: 60 },
  { label: '1.5h', val: 90 },
  { label: '2h', val: 120 }
]

const durSelectedIndex = computed(() => {
  const idx = durationOptions.findIndex(item => item.val === quickDuration.value)
  return idx !== -1 ? idx : 0
})

const durTrackRect = ref<any>(null)
const getDurTrackRect = () => {
  return new Promise((resolve) => {
    if (durTrackRect.value) {
      resolve(durTrackRect.value)
      return
    }
    const query = uni.createSelectorQuery()
    query.select('#durTrack').boundingClientRect((data: any) => {
      if (data) {
        durTrackRect.value = data
        resolve(data)
      }
    }).exec()
  })
}

const handleDurTouch = async (e: any) => {
  const touch = e.touches && e.touches[0]
  if (!touch) return
  const rect: any = await getDurTrackRect()
  if (!rect || !rect.width) return

  const clientX = touch.clientX
  let ratio = (clientX - rect.left) / rect.width
  if (ratio < 0) ratio = 0
  if (ratio > 0.999) ratio = 0.999

  const index = Math.floor(ratio * 4)
  if (durationOptions[index] && quickDuration.value !== durationOptions[index].val) {
    quickDuration.value = durationOptions[index].val
  }
}

const onDurTouchStart = (e: any) => {
  handleDurTouch(e)
}
const onDurTouchMove = (e: any) => {
  handleDurTouch(e)
}

const displaySubjects = computed(() => {
  return subjects.value || []
})

const submitQuickAdd = async () => {
  const name = quickTaskName.value.trim()
  if (!name) return

  const selectedSub = quickSubject.value || displaySubjects.value[0]
  if (!selectedSub) {
    uni.showToast({ title: '请先创建学科', icon: 'none' })
    return
  }
  const now = new Date()
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  await taskStore.addTask({
    name,
    subject: selectedSub.name,
    duration: quickDuration.value,

    status: 'scheduled',
    startTime: timeStr,
    subjectId: selectedSub.id
  })
  quickTaskName.value = ''
  showQuickAdd.value = false
  uni.showToast({ title: '已添加日程', icon: 'success' })
}

// --- WEEK STRIP LOGIC ---
const weekDays = computed(() => {
  const days = []
  const today = new Date()
  const dayOfWeek = today.getDay() || 7
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dayOfWeek - 1))
  
  const names = ['一', '二', '三', '四', '五', '六', '日']
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    days.push({
      day: d.getDate(),
      weekdayShort: names[i],
      dateStr,
      isToday: d.toDateString() === today.toDateString()
    })
  }
  return days
})
const selectedDateIndex = ref((new Date().getDay() || 7) - 1)

const handleToggleTask = async (task: any) => {
  if (task.status === 'completed') {
    task.status = 'pending'
    uni.showToast({ title: '已恢复待办', icon: 'none' })
  } else {
    task.status = 'completed'
    uni.showToast({ title: '任务已完成！', icon: 'success' })
  }
  await taskStore.updateTask(task)
  await taskStore.loadLocalTasks()
}

const handleDeleteTask = async (id?: string) => {
  if (!id) return
  uni.showModal({
    title: '确认删除',
    content: '删除后不可恢复',
    success: async (res) => {
      if (res.confirm) {
        await taskStore.removeTask(id)
        uni.showToast({ title: '已删除', icon: 'success' })
      }
    }
  })
}

onMounted(async () => {
  try {
    await Promise.all([
      subjectStore.loadSubjects(),
      taskStore.fetchTasks(),
    ])
    if (subjects.value.length > 0 && !quickSubject.value) {
      quickSubject.value = subjects.value[0]
    }
  } catch (error) {
    console.error('[TabletDashboard] Failed to load server data:', error)
    uni.showToast({ title: '看板数据加载失败', icon: 'none' })
  }
})
</script>

<style scoped>
.t-dashboard {
  display: flex;
  width: 100%;
  height: 100%;
  background: var(--color-zen-ivory, #F9F9F7);
  padding: 24rpx;
  box-sizing: border-box;
  gap: 24rpx;
}

/* Left Column (62%) */
.left-column {
  width: 62%;
  flex: 62;
  height: calc(100vh - 48rpx);
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  background: var(--color-zen-white, #FFFFFF);
  border-radius: 36rpx;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  padding: 32rpx;
  box-sizing: border-box;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.02);
  overflow: visible;
  position: relative;
}

/* Right Column (38%) */
.right-column {
  width: 38%;
  flex: 38;
  height: calc(100vh - 48rpx);
  display: flex;
  flex-direction: column;
  background: var(--color-zen-white, #FFFFFF);
  border-radius: 36rpx;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  padding: 28rpx;
  box-sizing: border-box;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.02);
  min-width: 0;
  overflow-y: auto;
}

/* Greeting Row */
.greeting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.greeting-title {
  font-size: 36rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  display: block;
}
.add-circle-btn {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}
.add-circle-btn:hover {
  transform: scale(1.05);
}
.add-circle-btn.is-active {
  background: #7D9372;
  border-color: #7D9372;
}

/* 悬浮最顶层的半透明遮罩 */
.quick-add-mask {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 9990;
  background-color: rgba(0, 0, 0, 0.15);
  animation: fadeIn 0.2s;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* +号下拉展开输入框（绝对定位覆盖在最顶层，不推挤下方元素） */
.quick-add-container {
  position: absolute;
  top: 130rpx;
  left: 32rpx;
  right: 32rpx;
  z-index: 9999;
  padding: 28rpx 32rpx;
  background-color: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-stone, #A8A8A5);
  border-radius: 28rpx;
  box-shadow: 0 24rpx 60rpx rgba(0, 0, 0, 0.14);
  animation: quickSlideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes quickSlideDown {
  from { opacity: 0; transform: translateY(-12rpx); }
  to { opacity: 1; transform: translateY(0); }
}
.quick-input-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.quick-input {
  flex: 1;
  height: 72rpx;
  font-size: 28rpx;
  color: var(--color-zen-graphite, #1C1C1A);
  background: #FFFFFF;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 16rpx;
  padding: 0 24rpx;
}
.quick-submit-btn {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background-color: #7D9372;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s;
  cursor: pointer;
}
.quick-submit-btn:active {
  transform: scale(0.92);
}
.quick-submit-btn.disabled {
  opacity: 0.3;
}
.quick-select-row {
  display: flex;
  align-items: center;
  margin-top: 20rpx;
  padding-top: 16rpx;
  border-top: 1px dashed var(--color-zen-hairline, #E6E6E4);
}
.quick-label {
  font-size: 24rpx;
  color: var(--color-zen-stone, #A8A8A5);
  flex-shrink: 0;
  width: 80rpx;
  font-weight: 600;
}
/* 单行选择触发器（带箭头） */
.subject-dropdown-btn {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 14rpx 24rpx;
  background-color: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 999rpx;
  transition: all 0.2s;
  cursor: pointer;
}
.subject-dropdown-btn:active {
  background-color: var(--color-zen-surface, #EEEEEC);
  border-color: #7D9372;
}
.sub-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  flex-shrink: 0;
}
.dropdown-text {
  flex: 1;
  font-size: 26rpx;
  font-weight: 600;
  color: var(--color-zen-graphite, #1C1C1A);
}

/* 弹出的竖直排列学科列表 */
.subject-vertical-popup {
  margin: 12rpx 0 6rpx;
  background-color: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 24rpx;
  box-shadow: 0 16rpx 40rpx rgba(0, 0, 0, 0.08);
  overflow: hidden;
  animation: dropdownSlide 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes dropdownSlide {
  from { opacity: 0; transform: translateY(-10rpx); }
  to { opacity: 1; transform: translateY(0); }
}
.subject-vertical-scroll {
  width: 100%;
  max-height: 360rpx;
}
.subject-vertical-list {
  display: flex;
  flex-direction: column;
  padding: 12rpx;
  gap: 8rpx;
}
.subject-vertical-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 24rpx;
  border-radius: 16rpx;
  background-color: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid transparent;
  transition: all 0.2s;
  cursor: pointer;
}
.subject-vertical-item.active {
  background-color: rgba(125, 147, 114, 0.12);
  border-color: #7D9372;
}
.sub-item-name {
  flex: 1;
  font-size: 26rpx;
  font-weight: 600;
  color: var(--color-zen-graphite, #1C1C1A);
}

/* 连在一起的 0-2 小时可拖动分段选择器 */
.segmented-track {
  flex: 1;
  height: 68rpx;
  background-color: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 999rpx;
  padding: 6rpx;
  display: flex;
  position: relative;
  overflow: hidden;
  user-select: none;
  cursor: pointer;
}
.segmented-thumb {
  position: absolute;
  top: 6rpx;
  left: 6rpx;
  bottom: 6rpx;
  width: calc((100% - 12rpx) / 4);
  background-color: var(--color-zen-white, #FFFFFF);
  border-radius: 999rpx;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(125, 147, 114, 0.35);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 1;
}
.segmented-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  font-size: 24rpx;
  font-weight: 600;
  color: var(--color-zen-stone, #A8A8A5);
  transition: color 0.2s;
}
.segmented-item.active {
  color: var(--color-zen-graphite, #1C1C1A);
  font-weight: 800;
}

/* Week Strip */
.week-strip {
  display: flex;
  justify-content: space-between;
  gap: 12rpx;
  margin: 8rpx 0;
}
.w-day {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20rpx 0;
  border-radius: 24rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}
.w-day:hover {
  background: #f0f0ee;
}
.w-day.active {
  background: #7D9372;
  color: #FFFFFF;
  border-color: #7D9372;
  box-shadow: 0 8rpx 20rpx rgba(125, 147, 114, 0.3);
}
.w-week {
  font-size: 22rpx;
  opacity: 0.8;
  margin-bottom: 6rpx;
}
.w-num {
  font-size: 32rpx;
  font-weight: 800;
}
.today-dot {
  width: 8rpx;
  height: 8rpx;
  border-radius: 50%;
  background: #7D9372;
  position: absolute;
  bottom: 8rpx;
}

/* Section Header */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8rpx;
}
.section-title {
  font-size: 30rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
}
.section-count {
  font-size: 24rpx;
  color: var(--color-zen-stone, #A8A8A5);
  font-weight: 600;
}

/* Task List Container (Non-scrollable) */
.task-list-container {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.empty-tasks {
  padding: 60rpx 0;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}
.empty-icon { font-size: 64rpx; }
.empty-text { font-size: 28rpx; font-weight: 700; color: var(--color-zen-graphite, #1C1C1A); }
.empty-sub { font-size: 24rpx; color: var(--color-zen-stone, #A8A8A5); }

.zen-pill-task {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 24rpx;
  background: #FFFFFF;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-left: 8rpx solid #7D9372;
  border-radius: 20rpx;
  margin-bottom: 12rpx;
  transition: all 0.2s;
  box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.01);
  cursor: pointer;
}
.zen-pill-task:hover {
  transform: translateY(-2rpx);
  box-shadow: 0 6rpx 16rpx rgba(0,0,0,0.03);
}
.zen-pill-task.completed {
  opacity: 0.5;
  background: var(--color-zen-ivory, #F9F9F7);
}
.task-left {
  display: flex;
  align-items: center;
  gap: 20rpx;
  flex: 1;
}
.task-checkbox {
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  border: 2px solid #7D9372;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.task-checkbox.checked {
  background: #7D9372;
}
.task-info {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.task-name {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--color-zen-graphite, #1C1C1A);
}
.task-name.done {
  text-decoration: line-through;
  color: var(--color-zen-stone, #A8A8A5);
}
.task-meta {
  display: flex;
  align-items: center;
  gap: 12rpx;
  font-size: 22rpx;
  color: var(--color-zen-stone, #A8A8A5);
}
.task-subject {
  font-weight: 700;
}

.task-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.action-btn {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}
.action-btn:hover {
  background: #f0f0ee;
}
</style>
