<template>
  <header class="app-header">
    <!-- Left: Page context title -->
    <div class="header-left">
      <h2 class="page-title">{{ currentPageTitle }}</h2>
    </div>

    <!-- Center: 全局搜索唤醒入口 — 唤醒 Personal Context 知识库 -->
    <div class="header-center">
      <button class="search-trigger" @click="handleSearchClick">
        <span class="search-icon">
          <IconSearch :size="16" :stroke-width="1.6" />
        </span>
        <span class="search-placeholder">唤醒个人知识库 (Personal Context)...</span>
        <span class="search-shortcut">
          <kbd>Ctrl</kbd>
          <kbd>K</kbd>
        </span>
      </button>
    </div>

    <!-- Right: 用户状态区 -->
    <div class="header-right">
      <!-- 顶栏同步番茄钟时间展示（跑道形宽边框缩减动效，完全对齐主界面风格） -->
      <Transition name="pomo-pill-fade">
        <button
          v-if="isPomodoroActive"
          type="button"
          class="header-pomodoro-pill"
          :class="{
            'is-break': pomodoroStore.isBreakPhase,
            'is-paused': !pomodoroStore.isRunning
          }"
          :title="pomodoroTooltip"
          @click="handlePomodoroClick"
        >
          <!-- 跑道形 SVG 粗体边框进度条 -->
          <svg class="pomo-pill-svg" viewBox="0 0 88 36" aria-hidden="true">
            <!-- 底轨：和主界面一样的半透明粗边框轨道 -->
            <path
              class="pomo-track-path"
              d="M 44 1.9 L 70 1.9 A 16.1 16.1 0 0 1 70 34.1 L 18 34.1 A 16.1 16.1 0 0 1 18 1.9 Z"
              fill="none"
              stroke-width="3.8"
            />
            <!-- 进度边框：随时间一点一点缩减的粗边框 -->
            <path
              class="pomo-progress-path"
              d="M 44 1.9 L 70 1.9 A 16.1 16.1 0 0 1 70 34.1 L 18 34.1 A 16.1 16.1 0 0 1 18 1.9 Z"
              fill="none"
              :stroke="ringColor"
              stroke-width="3.8"
              stroke-linecap="round"
              :stroke-dasharray="PATH_PERIMETER"
              :stroke-dashoffset="strokeDashoffset"
            />
          </svg>

          <!-- 内部内容区：仅保留粗体时间文字 -->
          <div class="pomo-pill-content">
            <span class="pomo-time-display">{{ formattedRemainingTime }}</span>
          </div>
        </button>
      </Transition>

      <!-- 12.5: 深色模式切换 (天体径向涟漪 + 旋转动效) -->
      <button 
        class="header-icon-btn dark-toggle" 
        :title="settingsStore.isDark ? '切换浅色模式' : '切换深色模式'" 
        @click="handleThemeToggle"
        aria-label="切换浅色或深色模式"
      >
        <Transition name="theme-flip" mode="out-in">
          <IconSun v-if="settingsStore.isDark" key="sun" :size="17" :stroke-width="1.8" class="theme-icon sun-icon" />
          <IconMoon v-else key="moon" :size="17" :stroke-width="1.8" class="theme-icon moon-icon" />
        </Transition>
      </button>
      <!-- 用户头像 -->
      <div class="avatar-wrapper" @click="router.push('/profile')" title="查看个人中心">
        <img v-if="authStore.avatarUrl" :src="authStore.avatarUrl" class="avatar-img" alt="用户头像" />
        <div v-else class="avatar">{{ userInitial }}</div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { IconSearch, IconSun, IconMoon } from '@tabler/icons-vue'
import { useAuthStore } from '@/store/useAuthStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { usePomodoroStore } from '@/store/usePomodoroStore'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const pomodoroStore = usePomodoroStore()

const handleThemeToggle = (event?: MouseEvent) => {
  settingsStore.toggleDark(event)
}

const userInitial = computed(() => {
  return authStore.username ? authStore.username.charAt(0).toUpperCase() : 'U'
})

const isPomodoroActive = computed(() => {
  return pomodoroStore.isRunning || pomodoroStore.runtime.elapsedBeforeRunMs > 0
})

const totalSeconds = computed(() => pomodoroStore.phaseDurationSeconds || 25 * 60)
const remainingSeconds = computed(() => pomodoroStore.remainingSeconds)

const progress = computed(() => {
  if (!totalSeconds.value || totalSeconds.value <= 0) return 0
  return Math.min(1, Math.max(0, remainingSeconds.value / totalSeconds.value))
})

const PATH_PERIMETER = 205.2

const strokeDashoffset = computed(() => {
  return PATH_PERIMETER * (1 - progress.value)
})

const ringColor = computed(() => {
  return pomodoroStore.isBreakPhase ? '#C89B6D' : '#8B9A6E'
})

const formattedRemainingTime = computed(() => {
  const totalSec = Math.max(0, remainingSeconds.value)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

const pomoPhaseText = computed(() => {
  if (!pomodoroStore.isRunning) return '已暂停'
  return pomodoroStore.isBreakPhase ? '茶歇中' : '专注中'
})

const pomodoroTooltip = computed(() => {
  return `番茄钟 · ${pomoPhaseText.value} ${formattedRemainingTime.value} (点击前往专注时钟)`
})

const handlePomodoroClick = () => {
  if (route.path !== '/pomodoro') {
    void router.push('/pomodoro')
  }
}

const pageTitleMap: Record<string, string> = {
  '/': '首页',
  '/asset': '资料管理',
  '/timeline': '任务排期',
  '/profile': '个人设置',
  '/pomodoro': '专注时钟',
  '/subjects': '学科空间',
}

const currentPageTitle = computed(() => pageTitleMap[route.path] || 'Auralis')

const handleSearchClick = () => {
  window.dispatchEvent(new CustomEvent('open-search-palette'))
}

onMounted(() => {
  if (authStore.isAuthenticated && !authStore.avatarUrl) {
    void authStore.loadAvatar()
  }
})
</script>

<style scoped>
.app-header {
  height: var(--header-height);
  background: var(--color-bg-primary, #F7F2EB);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  gap: 24px;
  position: relative;
  z-index: 5;
  user-select: none;
}

/* Left */
.header-left {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.page-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
  margin: 0;
  line-height: 1.2;
}

/* Center: 全局搜索唤醒入口 */
.header-center {
  flex: 1.5;
  display: flex;
  justify-content: center;
}

.search-trigger {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 460px;
  padding: 8px 16px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-default, rgba(0, 0, 0, 0.08));
  border-radius: 9999px;
  cursor: pointer;
  transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1);
  color: var(--text-muted, #7A7A75);
  font-family: inherit;
  font-size: 13px;
  outline: none;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.03);
}

.search-trigger:hover {
  background: var(--color-bg-tertiary, #FAF7F2);
  border-color: rgba(139, 154, 110, 0.5);
  box-shadow: 0 4px 16px rgba(139, 154, 110, 0.18), 0 0 0 2px rgba(139, 154, 110, 0.1);
  transform: translateY(-1px);
  color: var(--text-secondary, #344139);
}

.search-trigger:active {
  transform: translateY(0.5px) scale(0.99);
}

.search-icon {
  display: flex;
  align-items: center;
  color: var(--text-muted, #7A7A75);
  transition: color 0.2s ease, transform 0.2s ease;
}
.search-trigger:hover .search-icon {
  color: #8B9A6E;
  transform: scale(1.1);
}

.search-placeholder {
  flex: 1;
  text-align: left;
  letter-spacing: -0.1px;
}

.search-shortcut {
  display: flex;
  gap: 5px;
}

.search-shortcut kbd {
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-family-mono, monospace);
  color: var(--text-muted, #7A7A75);
  line-height: 1.4;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: all 0.2s ease;
}
.search-trigger:hover .search-shortcut kbd {
  border-color: rgba(139, 154, 110, 0.3);
  color: #637748;
}

/* Right: 用户状态 */
.header-right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.header-icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  outline: none;
  color: var(--text-secondary, #344139);
}

.header-icon-btn.dark-toggle:hover {
  background: var(--color-bg-tertiary, #FAF7F2);
  border-color: #8B9A6E;
  color: #8B9A6E;
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(139, 154, 110, 0.22);
}
.header-icon-btn.dark-toggle:active {
  transform: scale(0.92);
}

/* Celestial Flip Transition */
.theme-flip-enter-active,
.theme-flip-leave-active {
  transition: all 0.48s cubic-bezier(0.34, 1.25, 0.64, 1);
}
.theme-flip-enter-from {
  opacity: 0;
  transform: rotate(-90deg) scale(0.5);
}
.theme-flip-leave-to {
  opacity: 0;
  transform: rotate(90deg) scale(0.5);
}

.theme-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.25s ease, color 0.25s ease;
}
.sun-icon {
  color: #E2A03F;
}
.moon-icon {
  color: #637748;
}
.header-icon-btn.dark-toggle:hover .sun-icon {
  transform: rotate(25deg) scale(1.12);
  color: #EDB34D;
}
.header-icon-btn.dark-toggle:hover .moon-icon {
  transform: rotate(-20deg) scale(1.12);
  color: #8B9A6E;
}

.avatar-wrapper {
  position: relative;
  margin-left: 6px;
  cursor: pointer;
  outline: none;
}

.avatar {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13.5px;
  font-weight: 700;
  color: white;
  box-shadow: 0 0 0 1.5px rgba(139, 154, 110, 0.25), 0 2px 6px rgba(0, 0, 0, 0.05);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.avatar:hover {
  transform: scale(1.06);
  box-shadow: 0 0 0 2px #8B9A6E, 0 4px 14px rgba(139, 154, 110, 0.3);
}

.avatar-img {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  object-fit: cover;
  display: block;
  box-shadow: 0 0 0 1.5px rgba(139, 154, 110, 0.25), 0 2px 6px rgba(0, 0, 0, 0.05);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.avatar-img:hover {
  transform: scale(1.06);
  box-shadow: 0 0 0 2px #8B9A6E, 0 4px 14px rgba(139, 154, 110, 0.3);
}

/* 番茄钟顶栏时间胶囊 — 跑道形粗体边框进度条，底部加阴影悬浮在页面上 */
.header-pomodoro-pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 88px;
  height: 36px;
  padding: 0;
  border-radius: 9999px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: none;
  cursor: pointer;
  user-select: none;
  margin-right: 8px;
  box-shadow: 
    0 4px 14px -2px rgba(28, 28, 26, 0.14),
    0 2px 6px -1px rgba(28, 28, 26, 0.08);
  transition: all var(--transition-normal, 0.2s cubic-bezier(0.4, 0, 0.2, 1));
}

.header-pomodoro-pill:hover {
  transform: translateY(-1.5px);
  box-shadow: 
    0 7px 18px -2px rgba(28, 28, 26, 0.18),
    0 3px 8px -1px rgba(28, 28, 26, 0.10);
}

.header-pomodoro-pill:active {
  transform: translateY(0);
  box-shadow: 
    0 2px 6px -1px rgba(28, 28, 26, 0.08);
}

/* 覆盖整个胶囊的 SVG 进度边框 */
.pomo-pill-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}

/* 底轨 — 和主界面完全一致的粗边框半透明底轨 */
.pomo-track-path {
  stroke: rgba(139, 154, 110, 0.18);
  transition: stroke 0.3s ease;
}

.header-pomodoro-pill.is-break .pomo-track-path {
  stroke: rgba(200, 155, 109, 0.20);
}

/* 进度边框 — 和主界面一致的 1s 线性平滑推进缩减 */
.pomo-progress-path {
  transition: stroke-dashoffset 1s linear, stroke 0.3s ease;
}

/* 胶囊内部排版 — 纯粹居中粗体时间文字 */
.pomo-pill-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.pomo-time-display {
  font-size: 14px;
  font-weight: 800;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  font-family: var(--font-family-base, inherit);
  line-height: 1;
  user-select: none;
}

/* 暂停状态微样式 */
.header-pomodoro-pill.is-paused {
  opacity: 0.82;
}

.header-pomodoro-pill.is-paused .pomo-progress-path {
  stroke-dasharray: 4, 3;
}

/* 深色模式适配 — 严格对齐主界面 PomodoroRing 和 ring-pill */
html.dark .app-header {
  background: var(--color-bg-secondary, #292825);
  border-bottom-color: rgba(163, 177, 155, 0.15);
}
html.dark .search-trigger {
  background: #1f1e1c;
  border-color: rgba(163, 177, 155, 0.2);
  color: #b0aca5;
}
html.dark .search-trigger:hover {
  background: #1f1e1c;
  border-color: #9AB08F;
  box-shadow: 0 4px 16px rgba(154, 176, 143, 0.2);
}
html.dark .search-shortcut kbd {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(163, 177, 155, 0.2);
  color: #b0aca5;
}
html.dark .header-icon-btn.dark-toggle {
  background: #1f1e1c;
  border-color: rgba(163, 177, 155, 0.2);
  color: #FAF7F2;
}
html.dark .header-icon-btn.dark-toggle:hover {
  border-color: #9AB08F;
  color: #9AB08F;
}
html.dark .header-pomodoro-pill {
  background: #212621;
  box-shadow: 
    0 4px 16px -2px rgba(0, 0, 0, 0.45),
    0 2px 6px -1px rgba(0, 0, 0, 0.30);
}
html.dark .header-pomodoro-pill:hover {
  box-shadow: 
    0 6px 20px -2px rgba(0, 0, 0, 0.55),
    0 3px 8px -1px rgba(0, 0, 0, 0.35);
}
html.dark .pomo-track-path {
  stroke: rgba(163, 177, 155, 0.18);
}
html.dark .header-pomodoro-pill.is-break .pomo-track-path {
  stroke: rgba(212, 168, 126, 0.20);
}
html.dark .pomo-time-display {
  color: #FAF7F2;
}

/* 进退场微动画 */
.pomo-pill-fade-enter-active,
.pomo-pill-fade-leave-active {
  transition: all 0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.pomo-pill-fade-enter-from,
.pomo-pill-fade-leave-to {
  opacity: 0;
  transform: scale(0.92) translateX(6px);
}
</style>
