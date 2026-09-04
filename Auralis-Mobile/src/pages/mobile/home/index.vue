<template>
  <AppPageLayout custom-bg>
    <view class="home-page">
      <!-- 极简通用顶栏：左侧页面标题居左，右侧用户头像与用户名 -->
      <AppHeader title="日程" />

      <!-- 核心主体区域 -->
      <view class="main-body">
        <!-- 上方区域：问候语 + 周日期条 + 统计胶囊 -->
        <view class="top-section">
          <!-- 问候语主标题 + 添加按钮 -->
          <view class="greeting-row">
            <text class="greeting-title">{{ greetingText }}，{{ username }}</text>
            <view class="add-circle-btn" :class="{ 'is-active': showQuickAdd }" @click="showQuickAdd = !showQuickAdd">
              <LineIcon :name="showQuickAdd ? 'close' : 'plus'" size="40rpx" color="var(--color-zen-graphite)" />
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
                placeholder="输入日程内容，按回车添加..." 
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

          <!-- 周日期条 (Weekly Strip) -->
          <view class="week-strip">
            <view 
              class="w-day" 
              v-for="(day, index) in weekDays" 
              :key="day.dateStr"
              :class="{ active: swiperCurrent === index }"
              @click="swiperCurrent = index"
            >
              <text class="w-week">{{ day.weekdayShort }}</text>
              <text class="w-num">{{ day.day }}</text>
            </view>
          </view>

          <!-- 两个胶囊统计面板 (Focus Stats) -->
          <view class="focus-stats">
            <view class="stat-capsule">
              <text class="stat-label">专注时长</text>
              <text class="stat-value">{{ focusDurationDisplay }}</text>
            </view>
            <view class="stat-capsule">
              <text class="stat-label">已完成任务</text>
              <text class="stat-value">{{ completedCountDisplay }}</text>
            </view>
          </view>

          <!-- 今日日程 标题栏 -->
          <view class="section-header">
            <text class="section-title">今日日程</text>
          </view>
        </view>

        <!-- 下方左右滑动区域 Swiper（恢复左右滑切换日期逻辑） -->
        <swiper 
          class="day-swiper"
          :current="swiperCurrent"
          @change="onSwiperChange"
        >
          <swiper-item v-for="(day, index) in weekDays" :key="day.dateStr" class="swiper-item">
            <scroll-view scroll-y class="task-scroll-view" :show-scrollbar="false">
              <view class="task-list">
                <view v-if="dayTasksMap[day.dateStr]?.length === 0" class="empty-state">
                  <text class="empty-icon">🍃</text>
                  <text class="empty-text">本日无日程安排</text>
                  <text class="empty-sub">点击上方 + 创建专注任务</text>
                </view>

                <view 
                  v-else
                  v-for="task in dayTasksMap[day.dateStr]" 
                  :key="task.id"
                  class="zen-pill-task"
                  :class="{ 'is-completed': task.completed }"
                  @click="toggleTaskStatus(task)"
                >
                  <view class="pill-left">
                    <view class="checkbox-ring" :class="{ checked: task.completed }">
                      <LineIcon v-if="task.completed" name="check" size="24rpx" color="#FFFFFF" />
                    </view>
                    <text class="task-name">{{ task.name }}</text>
                  </view>
                  <view class="pill-right">
                    <text class="task-time" v-if="task.timeLabel">{{ task.timeLabel }}</text>
                    <view class="task-dur-badge" v-if="task.duration">
                      <text class="dur-num">{{ task.duration }}</text>
                      <text class="dur-unit">m</text>
                    </view>
                  </view>
                </view>
              </view>
              <!-- 底部留白以防遮挡 -->
              <view class="bottom-spacer"></view>
            </scroll-view>
          </swiper-item>
        </swiper>
      </view>

      <!-- 新建任务弹窗 -->
      <AddTaskSheet v-model:visible="showAddSheet" :subjects="subjects" @submit="handleAddTask" />
    </view>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import LineIcon from '@/components/LineIcon.vue'
import AppHeader from '@/components/AppHeader.vue'
import AddTaskSheet from '@/components/AddTaskSheet.vue'
import AppPageLayout from '@/components/AppPageLayout.vue'
import { useAuthStore } from '@/store/useAuthStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useSubjectStore } from '@/store/useSubjectStore'

const authStore = useAuthStore()
const taskStore = useTaskStore()
const subjectStore = useSubjectStore()
const { timeSlots } = storeToRefs(taskStore)
const { subjects } = storeToRefs(subjectStore)

const username = computed(() => authStore.username || 'Alex')

const greetingText = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return '早安'
  if (hour < 18) return '午后'
  return '晚安'
})

// 生成最近7天的周视图
const weekDays = computed(() => {
  const days = []
  const today = new Date()
  const currentDay = today.getDay()
  const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1
  
  const monday = new Date(today)
  monday.setDate(today.getDate() - distanceToMonday)
  
  const weekdaysShort = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    days.push({
      dateStr: `${yyyy}-${mm}-${dd}`,
      day: dd,
      weekdayShort: weekdaysShort[d.getDay()],
      isToday: d.toDateString() === today.toDateString()
    })
  }
  return days
})

const todayStr = () => {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

const getInitialTodayIndex = () => {
  const tStr = todayStr()
  const idx = weekDays.value.findIndex(d => d.dateStr === tStr)
  return idx !== -1 ? idx : 0
}

const swiperCurrent = ref(getInitialTodayIndex())

const onSwiperChange = (e: any) => {
  swiperCurrent.value = e.detail.current
}

onMounted(async () => {
  await subjectStore.loadSubjects()
  await taskStore.fetchTasks()
})

const dayTasksMap = computed(() => {
  const map: Record<string, any[]> = {}
  weekDays.value.forEach(d => {
    map[d.dateStr] = []
  })
  
  const today = todayStr()
  const realTasks: any[] = []
  timeSlots.value.forEach(slot => {
    if (slot.task) {
      realTasks.push({
        ...slot.task,
        completed: slot.task.status === 'completed',
        timeLabel: slot.task.startTime || slot.time || '',
        duration: slot.task.duration || 30
      })
    }
  })

  if (map[today]) map[today] = realTasks

  return map
})

const currentDayTasks = computed(() => {
  const selectedDate = weekDays.value[swiperCurrent.value]?.dateStr
  return dayTasksMap.value[selectedDate] || []
})

const focusDurationDisplay = computed(() => {
  let totalMin = 0
  currentDayTasks.value.forEach(t => {
    if (t.completed) totalMin += (t.duration || 30)
  })
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${m}m`
})

const completedCountDisplay = computed(() => {
  return currentDayTasks.value.filter(t => t.completed).length.toString()
})

const toggleTaskStatus = (task: any) => {
  const newCompleted = !task.completed
  task.completed = newCompleted
  taskStore.updateTask({
    ...task,
    status: newCompleted ? 'completed' : 'scheduled'
  })
}

const showAddSheet = ref(false)
const showQuickAdd = ref(false)
const quickTaskName = ref('')
const quickDuration = ref(30)
const quickSubject = ref<any>(null)
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
    uni.showToast({ title: '请先同步或创建学科', icon: 'none' })
    return
  }
  const now = new Date()
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  
  await taskStore.addTask({
    name,
    subject: selectedSub.name,
    subjectId: selectedSub.id,
    color: '#7D9372',
    duration: quickDuration.value,
    load: 'medium',
    loadText: '中负荷',
    status: 'scheduled',
    startTime: timeStr
  })

  quickTaskName.value = ''
  showQuickAdd.value = false
  uni.showToast({ title: '已添加日程', icon: 'none' })
}

const handleAddTask = async (taskData: any) => {
  await taskStore.addTask({
    ...taskData,
    status: 'pending'
  })
}
</script>

<style scoped>
.home-page {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--color-zen-ivory);
}

.main-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 0;
}

.top-section {
  padding: 24rpx 40rpx 16rpx;
  display: flex;
  flex-direction: column;
  gap: 36rpx;
  flex-shrink: 0;
  position: relative;
}

/* 问候语与新建按钮行 */
.greeting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
  z-index: 10000;
}
.greeting-title {
  font-size: 44rpx;
  font-weight: 700;
  color: var(--color-zen-graphite);
  font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
  letter-spacing: -1rpx;
}
.add-circle-btn {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background-color: var(--color-zen-white);
  border: 1px solid var(--color-zen-hairline);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.03);
}
.add-circle-btn:active {
  transform: scale(0.92);
  background-color: var(--color-zen-surface);
}
.add-circle-btn.is-active {
  transform: rotate(90deg);
  background-color: var(--color-zen-white);
  border-color: #7D9372;
  box-shadow: 0 4rpx 16rpx rgba(125, 147, 114, 0.2);
}
.add-circle-btn.is-active :deep(.line-icon text) {
  color: #7D9372 !important;
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
  top: 110rpx;
  left: 40rpx;
  right: 40rpx;
  z-index: 9999;
  padding: 28rpx 32rpx;
  background-color: var(--color-zen-white);
  border: 1px solid var(--color-zen-stone);
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
  color: var(--color-zen-graphite);
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
  border-top: 1px dashed var(--color-zen-hairline);
}
.quick-label {
  font-size: 24rpx;
  color: var(--color-zen-stone);
  flex-shrink: 0;
  width: 80rpx;
}
.quick-scroll {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
}
/* 单行选择触发器（带箭头） */
.subject-dropdown-btn {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 14rpx 24rpx;
  background-color: var(--color-zen-ivory);
  border: 1px solid var(--color-zen-hairline);
  border-radius: 999rpx;
  transition: all 0.2s;
}
.subject-dropdown-btn:active {
  background-color: var(--color-zen-surface);
  border-color: #7D9372;
}
.dropdown-text {
  flex: 1;
  font-size: 26rpx;
  font-weight: 600;
  color: var(--color-zen-graphite);
}

/* 弹出的竖直排列学科列表 */
.subject-vertical-popup {
  margin: 12rpx 0 6rpx;
  background-color: var(--color-zen-white);
  border: 1px solid var(--color-zen-hairline);
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
  background-color: var(--color-zen-ivory);
  border: 1px solid transparent;
  transition: all 0.2s;
}
.subject-vertical-item.active {
  background-color: rgba(125, 147, 114, 0.12);
  border-color: #7D9372;
}
.sub-item-name {
  flex: 1;
  font-size: 26rpx;
  font-weight: 600;
  color: var(--color-zen-graphite);
}

/* 连在一起的 0-2 小时可拖动分段选择器 */
.segmented-track {
  flex: 1;
  height: 68rpx;
  background-color: var(--color-zen-ivory);
  border: 1px solid var(--color-zen-hairline);
  border-radius: 999rpx;
  padding: 6rpx;
  display: flex;
  position: relative;
  overflow: hidden;
  user-select: none;
}
.segmented-thumb {
  position: absolute;
  top: 6rpx;
  left: 6rpx;
  bottom: 6rpx;
  width: calc((100% - 12rpx) / 4);
  background-color: var(--color-zen-white);
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
  font-size: 24rpx;
  font-weight: 500;
  color: var(--color-zen-stone);
  position: relative;
  z-index: 2;
  transition: color 0.2s;
}
.segmented-item.active {
  color: #7D9372;
  font-weight: 700;
}

/* 日期条 */
.week-strip {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.w-day {
  width: 86rpx;
  height: 124rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: var(--color-zen-white);
  border: 1px solid var(--color-zen-hairline);
  border-radius: 999rpx;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.w-week {
  font-size: 22rpx;
  font-weight: 500;
  color: var(--color-zen-stone);
  margin-bottom: 8rpx;
}
.w-num {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--color-zen-graphite);
}
.w-day.active {
  background-color: var(--color-zen-sage);
  border-color: var(--color-zen-sage);
  transform: scale(1.05);
  box-shadow: 0 8rpx 20rpx rgba(163, 177, 155, 0.3);
}
.w-day.active .w-week,
.w-day.active .w-num {
  color: var(--color-zen-white);
}

/* 两个胶囊统计面板 (Focus Stats - 并排胶囊) */
.focus-stats {
  display: flex;
  gap: 24rpx;
  width: 100%;
}
.stat-capsule {
  flex: 1;
  background-color: var(--color-zen-white);
  border: 1px solid var(--color-zen-hairline);
  border-radius: 999rpx;
  height: 116rpx;
  padding: 0 36rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: all 0.2s;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.02);
}
.stat-capsule:active {
  transform: scale(0.97);
  background-color: var(--color-zen-surface);
}
.stat-label {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--color-zen-stone);
}
.stat-value {
  font-size: 36rpx;
  font-weight: 700;
  color: var(--color-zen-graphite);
  font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
}

/* 今日日程 标题 */
.section-header {
  margin-top: 8rpx;
}
.section-title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--color-zen-graphite);
  font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
}

/* 左右滑动 Swiper 与日程卡片 */
.day-swiper {
  flex: 1;
  width: 100%;
}
.swiper-item {
  width: 100%;
  height: 100%;
}
.task-scroll-view {
  width: 100%;
  height: 100%;
  padding: 0 40rpx;
  box-sizing: border-box;
}
.task-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  padding-bottom: 40rpx;
}
.zen-pill-task {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32rpx 40rpx;
  background-color: var(--color-zen-white);
  border: 1px solid var(--color-zen-hairline);
  border-radius: 999rpx;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.zen-pill-task:active {
  transform: scale(0.98);
  background-color: var(--color-zen-surface);
}
.zen-pill-task.is-completed {
  opacity: 0.6;
  background-color: rgba(249, 249, 247, 0.6);
}
.pill-left {
  display: flex;
  align-items: center;
  gap: 24rpx;
  flex: 1;
  overflow: hidden;
}
.checkbox-ring {
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  border: 3rpx solid var(--color-zen-stone);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
}
.checkbox-ring.checked {
  background-color: #7D9372;
  border-color: #7D9372;
}
.task-name {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--color-zen-graphite);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.zen-pill-task.is-completed .task-name {
  text-decoration: line-through;
  color: var(--color-zen-stone);
}
.pill-right {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-left: 20rpx;
  flex-shrink: 0;
}
.task-time {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--color-zen-stone);
  font-family: 'DM Sans', -apple-system, sans-serif;
  letter-spacing: 0.5rpx;
}
.task-dur-badge {
  display: flex;
  align-items: baseline;
  padding: 4rpx 14rpx;
  background-color: var(--color-zen-surface);
  border: 1px solid var(--color-zen-hairline);
  border-radius: 999rpx;
}
.dur-num {
  font-size: 22rpx;
  font-weight: 700;
  color: var(--color-zen-graphite);
  font-family: 'DM Sans', -apple-system, sans-serif;
}
.dur-unit {
  font-size: 18rpx;
  font-weight: 600;
  color: var(--color-zen-stone);
  margin-left: 2rpx;
}
.zen-pill-task.is-completed .task-dur-badge {
  background-color: transparent;
  border-color: transparent;
  opacity: 0.7;
}
.zen-pill-task.is-completed .dur-num {
  color: var(--color-zen-stone);
}

/* 空状态与留白 */
.empty-state {
  padding: 80rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
}
.empty-icon {
  font-size: 64rpx;
}
.empty-text {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--color-zen-graphite);
}
.empty-sub {
  font-size: 24rpx;
  color: var(--color-zen-stone);
}
.bottom-spacer {
  height: calc(env(safe-area-inset-bottom) + 180rpx);
}
</style>
