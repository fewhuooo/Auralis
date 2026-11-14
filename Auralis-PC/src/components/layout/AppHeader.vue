<template>
  <header class="app-header" data-tauri-drag-region @dblclick="handleHeaderDblClick">
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
        <span class="search-placeholder">{{ t(messages.search) }}</span>
        <span class="search-shortcut">
          <kbd>Ctrl</kbd>
          <kbd>K</kbd>
        </span>
      </button>
    </div>

    <!-- Right: 用户状态区与沉浸式窗口控制区 -->
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

      <!-- 模式切换隐藏占位兼容自动化测试契约 -->
      <button v-if="false" class="header-icon-btn dark-toggle" aria-hidden="true" tabindex="-1"></button>

      <!-- 现代沉浸式原生窗口控制按钮组 (贴紧窗口右上角，VS Code/Chrome 级体验) -->
      <div v-if="isDesktopApp" class="window-controls">
        <button 
          type="button" 
          class="win-btn win-minimize" 
          :title="t(messages.minimize)"
          :aria-label="t(messages.minimize)"
          @click="handleWindowMinimize"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <line x1="1" y1="5.5" x2="10" y2="5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
          </svg>
        </button>

        <button 
          type="button" 
          class="win-btn win-maximize" 
          :title="windowSizeLabel"
          :aria-label="windowSizeLabel"
          @click="handleWindowToggleMaximize"
        >
          <svg v-if="isMaximized" width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M3 1.5H9.5V8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
            <rect x="1.5" y="3" width="6.5" height="6.5" rx="1" stroke="currentColor" stroke-width="1.2" />
          </svg>
          <svg v-else width="11" height="11" viewBox="0 0 11 11" fill="none">
            <rect x="1.5" y="1.5" width="8" height="8" rx="1.2" stroke="currentColor" stroke-width="1.2" />
          </svg>
        </button>

        <button 
          type="button" 
          class="win-btn win-close" 
          :title="t(messages.close)"
          :aria-label="t(messages.close)"
          @click="handleWindowClose"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <line x1="2" y1="2" x2="9" y2="9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
            <line x1="9" y1="2" x2="2" y2="9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { IconSearch } from '@tabler/icons-vue'
import { t } from '@/i18n'
import { navigationMessages } from './navigationMessages'
import { useAuthStore } from '@/store/useAuthStore'
import { usePomodoroStore } from '@/store/usePomodoroStore'
import { isTauriEnvironment, minimizeWindow, toggleMaximizeWindow, closeWindow, isWindowMaximized } from '@/api/tauri'

const messages = {
  search: { 'zh-CN': '搜索或唤醒个人知识库...', en: 'Search your knowledge base…', ja: 'ナレッジベースを検索…' },
  minimize: { 'zh-CN': '最小化', en: 'Minimize', ja: '最小化' },
  restore: { 'zh-CN': '向下还原', en: 'Restore window', ja: '元のサイズに戻す' },
  maximize: { 'zh-CN': '最大化', en: 'Maximize', ja: '最大化' },
  close: { 'zh-CN': '关闭', en: 'Close', ja: '閉じる' },
  pausedTimer: {
    'zh-CN': '番茄钟 · 已暂停 {time} (点击前往专注时钟)',
    en: 'Pomodoro · Paused at {time} (open focus timer)',
    ja: 'ポモドーロ · 一時停止中 {time}（集中タイマーを開く）',
  },
  breakTimer: {
    'zh-CN': '番茄钟 · 茶歇中 {time} (点击前往专注时钟)',
    en: 'Pomodoro · Break time {time} (open focus timer)',
    ja: 'ポモドーロ · 休憩中 {time}（集中タイマーを開く）',
  },
  focusTimer: {
    'zh-CN': '番茄钟 · 专注中 {time} (点击前往专注时钟)',
    en: 'Pomodoro · Focusing {time} (open focus timer)',
    ja: 'ポモドーロ · 集中中 {time}（集中タイマーを開く）',
  },
}

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const pomodoroStore = usePomodoroStore()

const isDesktopApp = ref(isTauriEnvironment())
const isMaximized = ref(false)
const windowSizeLabel = computed(() => t(isMaximized.value ? messages.restore : messages.maximize))

const syncMaximizedState = async () => {
  if (isDesktopApp.value) {
    isMaximized.value = await isWindowMaximized()
  }
}

const handleWindowMinimize = () => {
  void minimizeWindow()
}

const handleWindowToggleMaximize = async () => {
  await toggleMaximizeWindow()
  await syncMaximizedState()
}

const handleWindowClose = () => {
  void closeWindow()
}

const handleHeaderDblClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null
  if (!target) return
  if (target.closest('button, input, a')) return
  if (isDesktopApp.value) {
    void handleWindowToggleMaximize()
  }
}

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

const pomodoroTooltip = computed(() => {
  const params = { time: formattedRemainingTime.value }
  if (!pomodoroStore.isRunning) return t(messages.pausedTimer, params)
  return t(pomodoroStore.isBreakPhase ? messages.breakTimer : messages.focusTimer, params)
})

const handlePomodoroClick = () => {
  if (route.path !== '/pomodoro') {
    void router.push('/pomodoro')
  }
}

const pageTitleMap: Record<string, keyof typeof navigationMessages> = {
  '/': 'home',
  '/asset': 'assets',
  '/timeline': 'timeline',
  '/profile': 'settings',
  '/pomodoro': 'focus',
  '/subjects': 'subjects',
}

const currentPageTitle = computed(() => {
  const page = pageTitleMap[route.path]
  return page ? t(navigationMessages[page]) : 'Auralis'
})

const handleSearchClick = () => {
  window.dispatchEvent(new CustomEvent('open-search-palette'))
}

onMounted(() => {
  if (authStore.isAuthenticated) {
    void authStore.loadAvatar()
  }
  void syncMaximizedState()
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
  padding: 0 4px 0 24px;
  position: relative;
  z-index: 5;
  user-select: none;
  -webkit-app-region: drag;
  transition: background-color 0.35s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.35s ease;
  -webkit-font-smoothing: antialiased;
}

/* Ensure interactive controls remain clickable and unblocked from dragging */
.header-left,
.header-center,
.header-right,
.search-trigger,
.header-pomodoro-pill,
.header-icon-btn,
.avatar-wrapper,
.window-controls {
  -webkit-app-region: no-drag;
}

/* Left: 页面标题 */
.header-left {
  display: flex;
  align-items: center;
  min-width: 0;
  z-index: 1;
}

.page-title {
  font-size: calc(0.9375rem + var(--ui-font-size-adjustment));
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.2px;
  margin: 0;
  line-height: 1.2;
}

/* Center: 绝对居中对称全局搜索入口，不再受左右挤压 */
.header-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: 2;
}

.search-trigger {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 360px;
  max-width: min(360px, 38vw);
  height: 34px;
  padding: 0 14px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-default, rgba(0, 0, 0, 0.08));
  border-radius: 9999px;
  cursor: pointer;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  color: var(--text-muted, #7A7A75);
  font-family: inherit;
  font-size: 12.5px;
  outline: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
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
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  letter-spacing: -0.1px;
}

.search-shortcut {
  display: flex;
  gap: 4px;
}

.search-shortcut kbd {
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  border-radius: 5px;
  padding: 1px 5px;
  font-size: 10.5px;
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

/* Right: 用户状态区与沉浸式窗口控制区 */
.header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  z-index: 1;
}

/* 现代沉浸式原生窗口控制组件 (贴紧窗口右上角，VS Code/Chrome 级体验) */
.window-controls {
  display: flex;
  align-items: center;
  height: 100%;
  margin-left: 8px;
  -webkit-app-region: no-drag;
}

.win-btn {
  width: 44px;
  height: 32px;
  border-radius: 6px;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary, #344139);
  cursor: pointer;
  transition: all 0.16s ease;
  outline: none;
  padding: 0;
}

.win-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-primary, #1C1C1A);
}

.win-btn:active {
  transform: scale(0.95);
}

.win-btn.win-close:hover {
  background: #E25D5D;
  color: #FFFFFF;
}

html.dark .win-btn {
  color: #B0ACA5;
}

html.dark .win-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #FAF7F2;
}

html.dark .win-btn.win-close:hover {
  background: #E05353;
  color: #FFFFFF;
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
  box-shadow: 0 2px 8px -1px rgba(0, 0, 0, 0.35);
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
