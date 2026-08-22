<template>
  <div class="pomodoro-page">
    <div class="main-content">
      
      <!-- Left Column: Timer Core (60%) -->
      <div class="left-column">
        <TimerCore />
      </div>

      <!-- Right Column: Stats & Details (40%) -->
      <div class="right-column">
        
        <!-- Card 1: Current Focus -->
        <div class="panel-card top-card">
          <div class="card-header">
            <span class="card-title">当前专注</span>
          </div>
          <div class="task-selector-wrap">
            <el-select
              v-model="currentTaskId"
              placeholder="点击选择任务"
              no-data-text="暂无任务"
              size="large"
              class="task-selector"
              popper-class="task-popper"
              :teleported="false"
            >
              <el-option
                v-for="task in pendingTasks"
                :key="task.id"
                :label="task.name"
                :value="task.id"
              />
            </el-select>
          </div>
        </div>

        <!-- Card 2: Today's Data -->
        <div class="panel-card middle-card">
          <div class="card-header">
            <span class="card-title">今日数据看板</span>
          </div>
          <div class="stats-container">
            <div class="stat-col">
              <span class="stat-val">{{ completedToday }}</span>
              <div class="stat-label-row">
                <Check :size="14" color="var(--text-muted)" />
                <span class="stat-label">今日番茄</span>
              </div>
            </div>
            
            <div class="stat-divider"></div>

            <div class="stat-col">
              <div class="val-wrapper">
                <span class="stat-val">{{ completedToday * FOCUS_MINS }}</span>
                <span class="stat-unit">m</span>
              </div>
              <span class="stat-label">专注时长</span>
            </div>
          </div>
        </div>
        
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Check } from 'lucide-vue-next'
import TimerCore from '@/components/pomodoro/TimerCore.vue'
import { useTaskStore } from '@/store/useTaskStore'
import { usePomodoroStore } from '@/store/usePomodoroStore'

const taskStore = useTaskStore()
const pomodoroStore = usePomodoroStore()

const currentTaskId = ref<string | null>(null)

const pendingTasks = computed(() => {
  return taskStore.allTasks.filter((t: any) => t.status === 'pending' || t.status === 'in_progress')
})

const FOCUS_MINS = 25

const completedToday = computed(() => {
  return pomodoroStore.completedToday
})

onMounted(() => {
  if (taskStore.fetchTasks) {
    taskStore.fetchTasks()
  }
})
</script>

<style scoped>
.pomodoro-page {
  display: flex;
  width: 100%;
  height: 100vh;
  background: var(--color-bg-primary);
  position: relative;
  overflow: hidden;
}

.main-content {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  height: 100%;
  display: flex;
  flex-direction: row;
  padding: 60px 40px;
  gap: 80px; 
  box-sizing: border-box;
}

.left-column {
  flex: 5.5;
  display: flex;
  flex-direction: column;
  position: relative;
  height: 100%;
}

.right-column {
  flex: 4.5;
  display: flex;
  flex-direction: column;
  gap: 30px;
  height: 100%;
  justify-content: center;
}

/* Card UI */
.panel-card {
  background: var(--color-bg-secondary);
  border-radius: 20px;
  border: 1px solid var(--border-default);
  padding: 30px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
}

.card-header {
  margin-bottom: 20px;
}

.card-title {
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
  font-family: var(--font-family-base);
}

/* Task Selector */
.task-selector-wrap {
  width: 100%;
}
.task-selector {
  width: 100%;
}
:deep(.el-select__wrapper) {
  background: var(--color-bg-primary);
  border-radius: 999px;
  box-shadow: 0 0 0 1px var(--border-default) inset;
  padding: 12px 24px;
  height: 56px;
  min-height: 56px;
}
:deep(.el-select__placeholder), :deep(.el-select__selected-item) {
  font-weight: 600;
  font-size: 16px;
}
:deep(.task-popper) {
  border-radius: 24px !important;
  padding: 8px !important;
  border: 1px solid var(--border-default) !important;
  box-shadow: 0 8px 24px rgba(0,0,0,0.06) !important;
}
:deep(.task-popper .el-select-dropdown__item) {
  border-radius: 999px;
  height: 48px;
  line-height: 48px;
  padding: 0 20px;
  margin-bottom: 8px;
  font-weight: 600;
  transition: all 0.2s;
}
:deep(.task-popper .el-select-dropdown__item:last-child) {
  margin-bottom: 0;
}
:deep(.task-popper .el-select-dropdown__empty) {
  padding: 20px;
  color: var(--text-muted);
  font-weight: 500;
  font-size: 14px;
}

/* Stats Container */
.stats-container {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
}

.stat-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-divider {
  width: 1px;
  height: 60px;
  background-color: var(--border-subtle);
}

.val-wrapper {
  display: flex;
  align-items: baseline;
}

.stat-val {
  font-size: var(--font-size-display-sm);
  font-weight: 800;
  color: var(--text-primary);
  font-family: var(--font-family-base);
  line-height: 1;
}

.stat-unit {
  font-size: 18px;
  color: var(--text-muted);
  margin-left: 6px;
  font-weight: 600;
}

.stat-label-row {
  display: flex;
  align-items: center;
  margin-top: 10px;
  gap: 6px;
}

.stat-label {
  font-size: 14px;
  color: var(--text-muted);
  font-weight: 600;
}
.stat-col > .stat-label {
  margin-top: 10px;
}
</style>
