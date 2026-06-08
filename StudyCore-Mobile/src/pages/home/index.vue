<template>
  <AppPageLayout custom-bg>
    <!-- Foreground Home Page Layer -->
    <view class="home-page">
      <!-- AI Overlay -->
      <view class="ai-overlay" :class="{ 'is-active': isAiMode }" @click="cancelAiMode"></view>
      
      <!-- Ambient Glow Backgrounds -->
    <view class="bg-glow bg-glow--1"></view>
    <view class="bg-glow bg-glow--2"></view>

    <!-- Top Nav -->
    <view class="top-nav">
      <view class="nav-left">
        <view class="icon-btn menu-btn" @click.stop="openDrawer">
          <LineIcon name="menu" size="44rpx" />
        </view>
        <view class="greeting-box">
          <text class="nav-greeting">欢迎回来, {{ username }}</text>
          <text class="nav-month">今日已专注 0h · 剩余 {{ pendingTasksCount }} 个任务</text>
        </view>
      </view>
      <view class="nav-right">
        <view class="icon-btn" @click="showAddSheet = true">
          <LineIcon name="plus" size="44rpx" />
        </view>
      </view>
    </view>

    <!-- Weekly Strip -->
    <view class="week-strip">
      <view class="strip-mask-left"></view>
      <view 
        class="w-day" 
        v-for="(day, index) in weekDays" 
        :key="day.dateStr"
        :class="{ active: swiperCurrent === index }"
        @click="swiperCurrent = index"
      >
        <text class="w-week">{{ day.weekdayShort }}</text>
        <view class="w-num-box">
          <text class="w-num">{{ day.day }}</text>
        </view>
        <view class="w-indicator"></view>
      </view>
      <view class="strip-mask-right"></view>
    </view>

    <!-- Swiper -->
    <swiper 
      class="day-swiper"
      :current="swiperCurrent"
      @change="onSwiperChange"
      previous-margin="40rpx"
      next-margin="40rpx"
    >
      <swiper-item v-for="(day, index) in weekDays" :key="day.dateStr" class="swiper-item">
        <view class="day-card" :class="{ 'is-active': swiperCurrent === index }">
          
          <scroll-view scroll-y class="card-body">
            <view v-if="!dayTasks[day.dateStr]?.length" class="empty-state">
              <text class="empty-icon">🌱</text>
              <text class="empty-text">今日待办已清空，尽情享受闲暇时光</text>
              <text class="empty-subtext">点击右上角 + 或直接在此处唤醒 AI 开始排期</text>
            </view>
            <view 
              v-else 
              v-for="task in dayTasks[day.dateStr]" 
              :key="task.id"
              class="t-item"
            >
              <view class="t-color-bar" :style="{ background: task.color || '#6366f1' }"></view>
              <view class="t-info">
                <text class="t-name">{{ task.name }}</text>
                <text class="t-time">{{ task.subject }} · {{ task.duration }} 分钟</text>
              </view>
              <view class="t-action">
                <view class="check-ring"></view>
              </view>
            </view>
          </scroll-view>
          
          <!-- Linear Gradient Mask -->
          <view class="scroll-mask"></view>
        </view>
      </swiper-item>
    </swiper>

    <!-- Bottom AI Capsule -->
    <view class="ai-capsule-wrapper" :class="{ 'is-ai-mode': isAiMode }">
      <view class="ai-capsule" @click="enterAiMode">
        <LineIcon name="ai" size="40rpx" color="var(--text-muted)" class="ai-capsule-icon" />
        <input 
          class="ai-capsule-input"
          v-model="aiQuery"
          :focus="inputFocus"
          :adjust-position="false"
          placeholder="有什么我可以帮你的？"
          @confirm="submitAiQuery"
        />
        <view class="ai-capsule-cam" @click.stop="() => {}">
          <LineIcon name="camera" size="36rpx" color="var(--text-primary)" />
        </view>
      </view>
    </view>

    <AddTaskSheet v-model:visible="showAddSheet" :subjects="subjects" @submit="handleAddTask" />
    </view>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, inject } from 'vue'
import { storeToRefs } from 'pinia'
import LineIcon from '@/components/LineIcon.vue'
import AddTaskSheet from '@/components/AddTaskSheet.vue'
import AppPageLayout from '@/components/AppPageLayout.vue'
import { useAuthStore } from '@/store/useAuthStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useLayoutStore } from '@/store/useLayoutStore'

const layoutStore = useLayoutStore()
const openDrawer = () => layoutStore.openDrawer()

const authStore = useAuthStore()
const taskStore = useTaskStore()
const subjectStore = useSubjectStore()
const settingsStore = useSettingsStore()
const { timeSlots } = storeToRefs(taskStore)
const { subjects } = storeToRefs(subjectStore)

const username = computed(() => authStore.username || '同学')

const weekDays = computed(() => {
  const days = []
  const today = new Date()
  const currentDay = today.getDay()
  const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1
  
  const monday = new Date(today)
  monday.setDate(today.getDate() - distanceToMonday)
  
  const weekdaysShort = ['日', '一', '二', '三', '四', '五', '六']
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    
    days.push({
      dateStr: `${yyyy}-${mm}-${dd}`,
      day: dd,
      month: d.getMonth() + 1,
      year: yyyy,
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

const swiperCurrent = ref(0)
const currentMonthYear = computed(() => {
  const day = weekDays.value[swiperCurrent.value]
  if (!day) return ''
  return `${day.month}月 ${day.year}`
})

const pendingTasksCount = computed(() => {
  const day = weekDays.value[swiperCurrent.value]
  if (!day) return 0
  return dayTasks.value[day.dateStr]?.length || 0
})

onMounted(async () => {
  await subjectStore.loadSubjects()
  await taskStore.fetchTasks()
  
  const initialIndex = weekDays.value.findIndex(d => d.dateStr === todayStr())
  if (initialIndex !== -1) {
    swiperCurrent.value = initialIndex
  }
})

const onSwiperChange = (e: any) => {
  swiperCurrent.value = e.detail.current
}

const dayTasks = computed(() => {
  const map: Record<string, any[]> = {}
  weekDays.value.forEach(d => map[d.dateStr] = [])
  
  const today = todayStr()
  const tasksForToday: any[] = []
  timeSlots.value.forEach(slot => {
    if (slot.task) tasksForToday.push(slot.task)
  })
  
  if (map[today]) {
    map[today] = tasksForToday
  }
  
  return map
})

const showAddSheet = ref(false)

const handleAddTask = async (taskData: any) => {
  await taskStore.addTask({
    ...taskData,
    status: 'pending'
  })
}

const toggleTheme = () => {
  settingsStore.toggleDarkMode()
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark')
  }
}

const goSettings = () => {
  uni.navigateTo({ url: '/pages/settings/index' })
}

const isAiMode = ref(false)
const aiQuery = ref('')
const inputFocus = ref(false)

const enterAiMode = () => {
  isAiMode.value = true
  setTimeout(() => {
    inputFocus.value = true
  }, 100)
}

const cancelAiMode = () => {
  inputFocus.value = false
  isAiMode.value = false
  aiQuery.value = ''
}

const submitAiQuery = () => {
  if (!aiQuery.value.trim()) return
  
  inputFocus.value = false
  isAiMode.value = false
  
  setTimeout(() => {
    uni.navigateTo({
      url: `/pages/ai-search/index?seamless=1&q=${encodeURIComponent(aiQuery.value)}`,
      animationType: 'none'
    })
    setTimeout(() => { aiQuery.value = '' }, 500)
  }, 350)
}
</script>

<style scoped>
.home-page {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  padding-bottom: calc(env(safe-area-inset-bottom) + 190rpx); /* Reduced from 240rpx to close the gap above the capsule */
}

/* Top Nav */
.top-nav {
  padding: calc(var(--status-bar-height, 44px) + 40rpx) 40rpx 0; /* Removed bottom padding */
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.nav-left {
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.menu-btn {
  border: none;
  background: transparent;
  width: 72rpx;
  height: 72rpx;
}
.menu-btn .icon {
  font-size: 44rpx;
  color: var(--text-primary);
}
.greeting-box {
  display: flex;
  flex-direction: column;
}
.nav-greeting {
  font-size: 40rpx;
  font-weight: 800;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  letter-spacing: -1rpx;
}
.nav-month {
  font-size: 22rpx; /* Smaller font size for magazine-like typography */
  font-weight: 500;
  color: var(--text-muted);
  margin-top: 12rpx; /* Increased top margin for Gap 1 */
}
.nav-right {
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.icon-btn {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: var(--color-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx solid var(--border-subtle);
  transition: all 0.2s;
}
.icon-btn:active {
  transform: scale(0.9);
  background: var(--color-bg-elevated);
}
.icon-btn .icon {
  font-size: 32rpx;
}

/* Weekly Strip */
.week-strip {
  display: flex;
  justify-content: space-between;
  padding: 0 40rpx; /* Further reduced padding */
  margin-top: 60rpx; /* Gap 2: Force distance from subtitle */
  position: relative;
}
.strip-mask-left, .strip-mask-right {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 60rpx;
  z-index: 5;
  pointer-events: none;
}
.strip-mask-left {
  left: 0;
  background: linear-gradient(to right, var(--color-bg-primary), transparent);
}
.strip-mask-right {
  right: 0;
  background: linear-gradient(to left, var(--color-bg-primary), transparent);
}
.w-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s;
  opacity: 0.45; /* 40~50% opacity for inactive */
}
.w-week {
  font-size: 24rpx; /* Smaller font size */
  font-weight: 500; /* Thinner font weight */
  color: var(--text-muted);
}
.w-num-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.w-num {
  font-size: 28rpx; /* Smaller font size */
  font-weight: 500; /* Thinner font weight */
  color: var(--text-primary);
  transition: font-weight 0.2s, font-size 0.2s;
}
.w-indicator {
  width: 8rpx; /* Tiny dot */
  height: 8rpx;
  border-radius: 50%;
  background: #6366f1; /* High saturation accent color */
  margin-top: 6rpx;
  opacity: 0;
  transform: scale(0);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.w-day.active {
  transform: scale(1.1);
  opacity: 1;
}
.w-day.active .w-num {
  font-weight: 800;
  font-size: 32rpx; /* Slightly larger on active */
}
.w-day.active .w-indicator {
  opacity: 1;
  transform: scale(1);
}

/* Swiper */
.day-swiper {
  flex: 1;
  width: 100%;
  margin-top: 80rpx; /* Gap 3: Absolute buffer space below week calendar */
  margin-bottom: 10rpx; /* Tighter margins */
}
.swiper-item {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16rpx;
  box-sizing: border-box;
}

/* Day Card */
.day-card {
  width: 100%;
  height: 96%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform: scale(0.94);
  opacity: 0.65;
  position: relative;
  overflow: hidden; /* Important for scroll mask */
}
.day-card.is-active {
  transform: scale(1);
  opacity: 1;
}



/* Card Body (Scrollable) */
.card-body {
  flex: 1;
  width: 100%;
  height: 0; /* Crucial for flex child scroll-view */
  padding: 0;
  box-sizing: border-box;
}
::-webkit-scrollbar {
  display: none;
  width: 0 !important;
  height: 0 !important;
}
.scroll-mask {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60rpx;
  background: linear-gradient(to bottom, transparent, var(--color-bg-primary));
  pointer-events: none;
  z-index: 10;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  opacity: 0.5;
}
.empty-icon {
  font-size: 70rpx;
  margin-bottom: 16rpx;
}
.empty-text {
  font-size: 28rpx;
  color: var(--text-primary);
  font-weight: 700;
}
.empty-subtext {
  font-size: 22rpx;
  color: var(--text-muted);
  margin-top: 12rpx;
  opacity: 0.6;
}

/* Task Item */
.t-item {
  display: flex;
  align-items: center;
  padding: 30rpx 40rpx;
  border-bottom: 2rpx solid var(--border-subtle);
}
.t-item:last-child {
  border-bottom: none;
}
.t-color-bar {
  width: 8rpx;
  height: 50rpx;
  border-radius: 4rpx;
  margin-right: 20rpx;
  flex-shrink: 0;
}
.t-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.t-name {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.3;
}
.t-time {
  font-size: 22rpx;
  color: var(--text-muted);
  font-weight: 500;
}
.check-ring {
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  border: 4rpx solid var(--border-default);
  transition: all 0.2s;
  flex-shrink: 0;
  margin-left: 10rpx;
}
.check-ring:active {
  background: var(--border-subtle);
}

/* AI Overlay */
.ai-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--color-bg-primary);
  opacity: 0;
  pointer-events: none;
  z-index: 90;
  transition: opacity 0.35s cubic-bezier(0.3, 1.15, 0.6, 1);
}
.ai-overlay.is-active {
  opacity: 0.95;
  pointer-events: auto;
}

/* AI Capsule */
.ai-capsule-wrapper {
  position: absolute;
  bottom: calc(env(safe-area-inset-bottom) + 52rpx); /* 上移 12rpx 防误触 */
  left: 40rpx;
  right: 40rpx;
  display: flex;
  align-items: center;
  z-index: 100;
  transition: transform 0.4s cubic-bezier(0.3, 1.15, 0.6, 1);
}

.ai-capsule-wrapper.is-ai-mode {
  transform: translateY(-45vh);
}

.ai-capsule {
  flex: 1;
  height: 140rpx; /* Much Thicker */
  background: var(--color-bg-elevated);
  border-radius: 70rpx;
  display: flex;
  align-items: center;
  padding: 0 24rpx 0 44rpx;
  box-shadow: 0 16rpx 48rpx rgba(0,0,0,0.06); /* 增强柔和阴影，确立Z层级 */
  border: 2rpx solid var(--border-subtle);
  cursor: text;
  transition: transform 0.2s, box-shadow 0.4s;
}

.is-ai-mode .ai-capsule {
  box-shadow: 0 24rpx 60rpx rgba(0,0,0,0.15);
  border-color: rgba(99, 102, 241, 0.3);
}

.ai-capsule-input {
  flex: 1;
  height: 100%;
  font-size: 34rpx;
  color: var(--text-primary);
  margin: 0 20rpx;
  background: transparent;
  border: none;
  text-align: center;
}

.ai-capsule-cam {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background: transparent; /* 去除灰色圆形背景 */
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
