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
      <!-- 12.5: 深色模式切换 -->
      <button class="header-icon-btn dark-toggle" :title="settingsStore.isDark ? '切换浅色模式' : '切换深色模式'" @click="settingsStore.toggleDark">
        <IconSun v-if="settingsStore.isDark" :size="16" :stroke-width="1.6" />
        <IconMoon v-else :size="16" :stroke-width="1.6" />
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
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()

const userInitial = computed(() => {
  return authStore.username ? authStore.username.charAt(0).toUpperCase() : 'U'
})

const pageTitleMap: Record<string, string> = {
  '/': '知识检索与入库',
  '/asset': '重型资产编排',
  '/timeline': '排期副驾',
  '/profile': '个人中心',
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
  max-width: 460px;
  padding: 8px 16px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-normal);
  color: var(--text-muted);
  font-family: inherit;
  font-size: 13px;
}

.search-trigger:hover {
  background: rgba(139, 154, 110, 0.12);
  border-color: var(--color-zen-sage);
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
  background: rgba(0, 0, 0, 0.04);
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
  background: rgba(139, 154, 110, 0.12);
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

.avatar-img {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  object-fit: cover;
  display: block;
  transition: transform var(--transition-fast);
}

.avatar-img:hover {
  transform: scale(1.05);
}
</style>
