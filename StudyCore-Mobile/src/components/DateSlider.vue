<template>
  <view class="date-slider">
    <scroll-view scroll-x class="scroll-container" :show-scrollbar="false">
      <view class="date-list">
        <view
          v-for="day in weekDays"
          :key="day.dateStr"
          class="date-item"
          :class="{ active: modelValue === day.dateStr, today: day.isToday }"
          @click="selectDate(day.dateStr)"
        >
          <text class="d-week">{{ day.weekday }}</text>
          <text class="d-num">{{ day.day }}</text>
          <view v-if="day.taskCount > 0" class="d-dot"></view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: string // YYYY-MM-DD
  taskCounts?: Record<string, number>
}>()

const emit = defineEmits(['update:modelValue', 'change'])

const selectDate = (dateStr: string) => {
  emit('update:modelValue', dateStr)
  emit('change', dateStr)
}

const weekDays = computed(() => {
  const days = []
  const today = new Date()
  
  const currentDay = today.getDay()
  const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1
  
  const monday = new Date(today)
  monday.setDate(today.getDate() - distanceToMonday)
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const dateStr = `${yyyy}-${mm}-${dd}`
    
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']
    
    days.push({
      dateStr,
      day: dd,
      weekday: weekdays[d.getDay()],
      isToday: d.toDateString() === today.toDateString(),
      taskCount: props.taskCounts?.[dateStr] || 0
    })
  }
  return days
})
</script>

<style scoped>
.date-slider {
  padding: 20rpx 0 40rpx;
  width: 100%;
}
.scroll-container {
  white-space: nowrap;
}
.date-list {
  display: flex;
  justify-content: space-between;
  padding: 0 32rpx;
}
.date-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20rpx 16rpx;
  border-radius: 40rpx;
  background: var(--color-bg-secondary);
  border: 2rpx solid transparent;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
  min-width: 80rpx;
}
.date-item.active {
  background: var(--text-primary);
  transform: scale(1.1) translateY(-8rpx);
  box-shadow: 0 16rpx 32rpx rgba(0,0,0,0.15);
  border-color: var(--text-primary);
}
.date-item.today {
  border-color: var(--text-accent);
}
.date-item.today.active {
  border-color: var(--text-primary);
}
.d-week {
  font-size: 24rpx;
  color: var(--text-muted);
  margin-bottom: 12rpx;
  font-weight: 600;
  transition: color 0.3s;
}
.active .d-week {
  color: var(--color-bg-secondary);
  opacity: 0.8;
}
.d-num {
  font-size: 36rpx;
  font-weight: 800;
  color: var(--text-primary);
  transition: color 0.3s;
}
.active .d-num {
  color: var(--color-bg-primary);
}
.d-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: var(--text-accent);
  position: absolute;
  bottom: -16rpx;
  transition: all 0.3s;
}
.active .d-dot {
  background: var(--text-primary);
  bottom: -24rpx;
  transform: scale(1.2);
}
</style>
