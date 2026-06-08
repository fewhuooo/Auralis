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
          <text class="nav-month">{{ currentMonthYear }} ✦ 开启专注的一天</text>
        </view>
      </view>
      <view class="nav-right">
        <view class="icon-btn" @click="showAddSheet = true">
          <LineIcon name="plus" size="44rpx" />
        </view>
        <view class="icon-btn" @click="toggleTheme">
          <LineIcon name="theme" size="44rpx" />
        </view>
        <view class="icon-btn" @click="goSettings">
          <LineIcon name="settings" size="44rpx" />
        </view>
      </view>
    </view>

    <!-- Weekly Strip -->
    <view class="week-strip">
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
      </view>
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
          
          <view class="card-stats">
            <view class="stat-box">
              <text class="s-val">0<text class="s-unit">h</text></text>
              <text class="s-label">专注时长</text>
            </view>
            <view class="stat-divider"></view>
            <view class="stat-box">
              <text class="s-val">{{ dayTasks[day.dateStr]?.length || 0 }}</text>
              <text class="s-label">任务数量</text>
            </view>
          </view>
          
          <view class="card-divider"></view>
          
          <scroll-view scroll-y class="card-body">
            <view v-if="!dayTasks[day.dateStr]?.length" class="empty-state">
              <text class="empty-icon">🌱</text>
              <text class="empty-text">今日待办已清空，尽情享受闲暇时光</text>
              <text class="empty-subtext">点击右下角按钮添加新排期</text>
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
  font-size: 24rpx;
  font-weight: 600;
  color: var(--text-muted);
  margin-top: 4rpx;
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
  padding: 10rpx 40rpx 0; /* Reduced top/bottom padding */
}
.w-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.w-week {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--text-muted);
}
.w-num-box {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx solid transparent;
  transition: all 0.3s;
}
.w-num {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--text-primary);
}
.w-day.active {
  transform: scale(1.1);
}
.w-day.active .w-week {
  color: var(--text-primary);
}
.w-day.active .w-num-box {
  background: var(--text-primary);
  box-shadow: 0 8rpx 16rpx rgba(0,0,0,0.15);
}
.w-day.active .w-num {
  color: var(--color-bg-primary);
}

/* Swiper */
.day-swiper {
  flex: 1;
  width: 100%;
  margin-top: 10rpx;
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
  height: 96%; /* Increased from 92% to use more vertical space */
  box-sizing: border-box;
  background: var(--color-bg-secondary);
  border-radius: 40rpx;
  display: flex;
  flex-direction: column;
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform: scale(0.94); /* Adjusted base scale */
  opacity: 0.65;
  border: 2rpx solid transparent;
  box-shadow: 0 16rpx 40rpx rgba(0,0,0,0.03);
  overflow: hidden;
}
.day-card.is-active {
  transform: scale(1);
  opacity: 1;
  background: var(--color-bg-elevated);
  box-shadow: 0 8rpx 24rpx rgba(0,0,0,0.03);
  border-color: var(--border-subtle);
}
html.dark .day-card.is-active {
  background: var(--color-bg-elevated);
  border-color: var(--border-subtle);
  box-shadow: 0 8rpx 24rpx rgba(0,0,0,0.1);
}

/* Card Stats */
.card-stats {
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  padding: 40rpx 20rpx 30rpx;
  flex-shrink: 0;
}
.stat-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
}
.s-val {
  font-size: 48rpx;
  font-weight: 800;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  line-height: 1;
}
.s-unit {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--text-muted);
  margin-left: 6rpx;
}
.s-label {
  font-size: 22rpx;
  font-weight: 600;
  color: var(--text-muted);
}
.stat-divider {
  width: 2rpx;
  height: 50rpx;
  background: var(--border-subtle);
}

.card-divider {
  height: 2rpx;
  background: var(--border-subtle);
  margin: 0 40rpx;
  flex-shrink: 0;
}

/* Card Body (Scrollable) */
.card-body {
  flex: 1;
  width: 100%;
  height: 0; /* Crucial for flex child scroll-view */
  padding: 0;
  box-sizing: border-box;
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
  font-size: 26rpx;
  color: var(--text-muted);
  font-weight: 500;
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
  bottom: calc(env(safe-area-inset-bottom) + 40rpx); /* 下方防误触留白 */
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
  box-shadow: 0 8rpx 30rpx rgba(0,0,0,0.05);
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
  width: 100rpx;
  height: 100rpx;
  border-radius: 50%;
  background: var(--color-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
