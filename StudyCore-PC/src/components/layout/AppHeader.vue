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
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M11 11L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
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
      <!-- 12.5: 深色模式切换 -->
      <button class="header-icon-btn dark-toggle" :title="isDark ? '切换浅色模式' : '切换深色模式'" @click="toggleDark">
        <span>{{ isDark ? '☀️' : '🌙' }}</span>
      </button>
      <!-- 番茄钟状态同步入口 -->
      <button class="header-icon-btn" title="番茄钟 · 三端同步">
        <span>🍅</span>
      </button>
      <!-- 通知：新入库知识块 / 任务变更 -->
      <button class="header-icon-btn" title="通知">
        <span>🔔</span>
        <span class="notification-dot"></span>
      </button>
      <!-- 用户头像 -->
      <div class="avatar-wrapper">
        <div class="avatar">G</div>
        <span class="avatar-status"></span>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

// 12.5: Dark mode
const isDark = ref(document.documentElement.classList.contains('dark'))
const toggleDark = () => {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  // Emit global event so other components (Canvas, PDF) can react
  window.dispatchEvent(new CustomEvent('sc-theme-change', { detail: { dark: isDark.value } }))
}

const pageTitleMap: Record<string, string> = {
  '/': '知识检索与入库',
  '/asset': '重型资产编排',
  '/timeline': '排期副驾',
  '/profile': '个人中心',
}

const currentPageTitle = computed(() => pageTitleMap[route.path] || 'StudyCore')

const handleSearchClick = () => {
  window.dispatchEvent(new CustomEvent('open-search-palette'))
}
</script>

<style scoped>
.app-header {
  height: var(--header-height);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  gap: 24px;
  position: relative;
  z-index: 5;
}

/* Left */
.header-left {
  flex: 1;
  min-width: 0;
}

.page-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.2px;
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
  gap: 10px;
  width: 100%;
  max-width: 440px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-normal);
  color: var(--text-muted);
  font-family: inherit;
  font-size: 13px;
}

.search-trigger:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--border-accent);
  box-shadow: var(--accent-glow);
}

.search-icon {
  display: flex;
  align-items: center;
  color: var(--text-muted);
}

.search-placeholder {
  flex: 1;
  text-align: left;
}

.search-shortcut {
  display: flex;
  gap: 4px;
}

.search-shortcut kbd {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 11px;
  font-family: inherit;
  color: var(--text-muted);
  line-height: 1.6;
}

/* Right: 用户状态 */
.header-right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.header-icon-btn {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: transparent;
  border: 1px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  cursor: pointer;
  transition: all var(--transition-normal);
  position: relative;
}

.header-icon-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--border-subtle);
}

.notification-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ef4444;
  border: 2px solid var(--color-bg-secondary);
}

.avatar-wrapper {
  position: relative;
  margin-left: 8px;
  cursor: pointer;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: white;
  transition: transform var(--transition-fast);
}

.avatar:hover {
  transform: scale(1.05);
}

.avatar-status {
  position: absolute;
  bottom: -1px;
  right: -1px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #22c55e;
  border: 2px solid var(--color-bg-secondary);
}
</style>
