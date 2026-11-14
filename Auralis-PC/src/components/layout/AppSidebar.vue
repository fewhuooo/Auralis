<template>
  <aside class="sidebar">
    <!-- Brand Logo -->
    <div 
      class="sidebar-brand"
      @click="router.push('/')"
      @mouseenter="handleMouseEnter($event, { type: 'nav', item: 'brand' })"
      @mouseleave="handleMouseLeave"
      :title="t(messages.backHome)"
    >
      <div class="brand-icon">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect width="28" height="28" rx="8" fill="url(#brand-grad)" class="brand-rect" />
          <path d="M7.5 14L11.5 10L16.5 14L20.5 10" stroke="white" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" class="brand-wave-1"/>
          <path d="M7.5 18L11.5 14L16.5 18L20.5 14" stroke="white" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" opacity="0.6" class="brand-wave-2"/>
          <defs>
            <linearGradient id="brand-grad" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
              <stop stop-color="#8B9A6E" />
              <stop offset="1" stop-color="#728456" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>

    <!-- Primary Fixed Navigation (Top 5 features strictly fixed, never scroll) -->
    <nav class="sidebar-primary-nav" :aria-label="t(messages.primaryNav)">
      <!-- Dashboard -->
      <router-link 
        to="/" 
        class="nav-item" 
        :class="{ 'is-active': route.path === '/' }"
        @mouseenter="handleMouseEnter($event, { type: 'nav', item: 'home' })"
        @mouseleave="handleMouseLeave"
        :aria-label="t(navigationMessages.home)"
      >
        <span class="nav-active-indicator"></span>
        <span class="nav-icon"><IconLayoutDashboard :size="20" :stroke-width="1.7" /></span>
      </router-link>

      <!-- Subject Hall -->
      <router-link 
        to="/subjects" 
        class="nav-item" 
        :class="{ 'is-active': route.path === '/subjects' }"
        @mouseenter="handleMouseEnter($event, { type: 'nav', item: 'subjects' })"
        @mouseleave="handleMouseLeave"
        :aria-label="t(navigationMessages.subjects)"
      >
        <span class="nav-active-indicator"></span>
        <span class="nav-icon"><IconBooks :size="20" :stroke-width="1.7" /></span>
      </router-link>

      <!-- Timeline -->
      <router-link 
        to="/timeline" 
        class="nav-item" 
        :class="{ 'is-active': route.path === '/timeline' }"
        @mouseenter="handleMouseEnter($event, { type: 'nav', item: 'timeline' })"
        @mouseleave="handleMouseLeave"
        :aria-label="t(navigationMessages.timeline)"
      >
        <span class="nav-active-indicator"></span>
        <span class="nav-icon"><IconCalendarTime :size="20" :stroke-width="1.7" /></span>
      </router-link>

      <!-- Asset -->
      <router-link 
        to="/asset" 
        class="nav-item" 
        :class="{ 'is-active': route.path === '/asset' }"
        @mouseenter="handleMouseEnter($event, { type: 'nav', item: 'assets' })"
        @mouseleave="handleMouseLeave"
        :aria-label="t(navigationMessages.assets)"
      >
        <span class="nav-active-indicator"></span>
        <span class="nav-icon"><IconDatabase :size="20" :stroke-width="1.7" /></span>
      </router-link>

      <!-- Pomodoro -->
      <router-link 
        to="/pomodoro" 
        class="nav-item" 
        :class="{ 'is-active': route.path === '/pomodoro' }"
        @mouseenter="handleMouseEnter($event, { type: 'nav', item: 'focus' })"
        @mouseleave="handleMouseLeave"
        :aria-label="t(navigationMessages.focus)"
      >
        <span class="nav-active-indicator"></span>
        <span class="nav-icon"><IconStopwatch :size="20" :stroke-width="1.7" /></span>
      </router-link>
    </nav>

    <!-- Divider (Fixed) -->
    <div class="sidebar-divider"></div>

    <!-- Scrollable Subjects Section (Only subjects list can scroll) -->
    <div class="sidebar-subjects-scroll" :aria-label="t(messages.subjectList)">
      <div class="subjects-list">
        <div
          v-for="subj in subjectStore.subjects"
          :key="subj.id"
          class="subject-item"
          :class="{ 'is-active': route.path === `/subject/${subj.id}` }"
          @click="router.push(`/subject/${subj.id}`)"
          @mouseenter="handleMouseEnter($event, { type: 'subject', subject: subj })"
          @mouseleave="handleMouseLeave"
          :aria-label="subj.name"
        >
          <span class="nav-active-indicator"></span>
          <div class="subject-icon-bg">
            <component
              v-if="isSubjectIconKey(subj.icon) || !getLegacySubjectIcon(subj.icon)"
              :is="getSubjectIconComponent(subj.icon)"
              class="subject-icon-glyph"
            />
            <span v-else>{{ getLegacySubjectIcon(subj.icon) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer: 模式切换 + 个人中心 (头像右下角附带三端同步状态点) -->
    <div class="sidebar-footer">
      <!-- 模式切换按钮 (天体日月翻转) -->
      <button 
        class="sidebar-action-btn theme-toggle-btn" 
        :title="themeAction"
        @click="handleThemeToggle"
        @mouseenter="handleMouseEnter($event, { type: 'theme' })"
        @mouseleave="handleMouseLeave"
        :aria-label="themeAction"
      >
        <Transition name="theme-flip" mode="out-in">
          <IconSun v-if="settingsStore.isDark" key="sun" :size="17" :stroke-width="1.8" class="theme-icon sun-icon" />
          <IconMoon v-else key="moon" :size="17" :stroke-width="1.8" class="theme-icon moon-icon" />
        </Transition>
      </button>

      <!-- 个人中心入口 (用户头像 + 右下角状态点) -->
      <div 
        class="sidebar-avatar-entry" 
        @click="router.push('/profile')"
        @mouseenter="handleMouseEnter($event, { type: 'profile' })"
        @mouseleave="handleMouseLeave"
        :title="t(navigationMessages.settings)"
      >
        <img v-if="authStore.avatarUrl" :src="authStore.avatarUrl" class="sidebar-avatar-img" :alt="t(messages.avatar)" />
        <div v-else class="sidebar-avatar">{{ userInitial }}</div>

        <!-- 镶嵌在头像右下角的状态点徽标 (点击可重试同步) -->
        <div 
          class="avatar-sync-badge"
          :class="`status-${connectionProjection.level}`"
          :title="syncBadgeTitle"
          @click.stop="triggerSyncRetry"
        >
          <span class="avatar-sync-ripple" :class="`status-${connectionProjection.level}`"></span>
          <span class="avatar-sync-dot" :class="`status-${connectionProjection.level}`"></span>
        </div>
      </div>
    </div>

    <!-- Shared Floating Tooltip -->
    <div 
      v-if="hoverTooltip"
      class="sidebar-tooltip-floating"
      :style="{ top: hoverTop + 'px' }"
    >
      <div class="tooltip-title">{{ hoverTooltip.title }}</div>
      <div class="tooltip-desc" v-if="hoverTooltip.description">{{ hoverTooltip.description }}</div>
    </div>

    <!-- Shared Floating Subject Hover Card -->
    <div 
      v-if="hoverState?.type === 'subject'"
      class="subject-hover-card-floating"
      :style="{ top: hoverTop + 'px' }"
      @mouseenter="keepHoverCard"
      @mouseleave="handleMouseLeave"
      @click.stop
    >
      <span class="hover-subject-name">{{ hoverState.subject.name }}</span>
      <span class="hover-subject-desc">{{ hoverState.subject.description || t(messages.noDescription) }}</span>
      <span class="hover-subject-meta" v-if="hoverState.subject.id !== 'hall'">
        {{ t(messages.subjectCounts, {
          blocks: hoverState.subject.blockCount ?? 0,
          materials: hoverState.subject.fileCount ?? 0,
        }) }}
      </span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { IconLayoutDashboard, IconBooks, IconCalendarTime, IconDatabase, IconStopwatch, IconSun, IconMoon } from '@tabler/icons-vue'
import { t } from '@/i18n'
import { navigationMessages } from './navigationMessages'
import { useAuthStore } from '@/store/useAuthStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useSubjectStore, type Subject } from '@/store/useSubjectStore'
import { useSyncStore } from '@/store/useSyncStore'
import type { ConnectionProjection } from '@/services/connectionStatusProjection'
import {
  getLegacySubjectIcon,
  getSubjectIconComponent,
  isSubjectIconKey
} from '@/utils/subjectIcon'

const messages = {
  backHome: { 'zh-CN': '回到首页', en: 'Back to home', ja: 'ホームに戻る' },
  primaryNav: { 'zh-CN': '核心功能导航', en: 'Main navigation', ja: 'メインナビゲーション' },
  subjectList: { 'zh-CN': '学科列表', en: 'Subject list', ja: '科目一覧' },
  switchLight: { 'zh-CN': '切换浅色模式', en: 'Switch to light mode', ja: 'ライトモードに切り替える' },
  switchDark: { 'zh-CN': '切换深色模式', en: 'Switch to dark mode', ja: 'ダークモードに切り替える' },
  lightMode: { 'zh-CN': '浅色模式', en: 'Light mode', ja: 'ライトモード' },
  darkMode: { 'zh-CN': '深色模式', en: 'Dark mode', ja: 'ダークモード' },
  switchTheme: { 'zh-CN': '点击切换主题界面', en: 'Switch the appearance theme', ja: '外観テーマを切り替える' },
  profile: { 'zh-CN': '个人中心', en: 'Profile', ja: 'プロフィール' },
  avatar: { 'zh-CN': '用户头像', en: 'User avatar', ja: 'ユーザーのアバター' },
  retrySync: { 'zh-CN': '{status} (点击重试)', en: '{status} (click to retry)', ja: '{status}（クリックして再試行）' },
  noDescription: { 'zh-CN': '暂无描述', en: 'No description', ja: '説明はありません' },
  subjectCounts: {
    'zh-CN': '{blocks} 知识块 · {materials} 材料',
    en: 'Knowledge blocks: {blocks} · Materials: {materials}',
    ja: '知識ブロック {blocks} 件 · 資料 {materials} 件',
  },
}
const navDescriptions = {
  brand: { 'zh-CN': '智能学习与知识工作台', en: 'Workspace for learning and knowledge', ja: '学習と知識のワークスペース' },
  home: { 'zh-CN': '日程与知识总览', en: 'Schedule and knowledge overview', ja: '予定と知識の概要' },
  subjects: { 'zh-CN': '浏览与管理学科', en: 'Browse and manage subjects', ja: '科目の閲覧と管理' },
  timeline: { 'zh-CN': '日程规划与任务安排', en: 'Plan your schedule and tasks', ja: '予定とタスクの管理' },
  assets: { 'zh-CN': '文件、知识点与关联图谱', en: 'Files, knowledge blocks, and their relationships', ja: 'ファイル、知識ブロック、関連グラフ' },
  focus: { 'zh-CN': '番茄钟专注与休息', en: 'Pomodoro focus sessions and breaks', ja: 'ポモドーロによる集中と休憩' },
}

const route = useRoute()
const router = useRouter()
const { connectionProjection } = defineProps<{ connectionProjection: ConnectionProjection }>()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const subjectStore = useSubjectStore()
const syncStore = useSyncStore()

const userInitial = computed(() => {
  return authStore.username ? authStore.username.charAt(0).toUpperCase() : 'U'
})

const handleThemeToggle = (event?: MouseEvent) => {
  settingsStore.toggleDark(event)
}

type HoverTarget =
  | { type: 'nav'; item: keyof typeof navDescriptions }
  | { type: 'subject'; subject: Subject }
  | { type: 'profile' }
  | { type: 'theme' }

const hoverState = ref<HoverTarget | null>(null)
const hoverTop = ref(0)
let closeTimeout: ReturnType<typeof setTimeout> | null = null

const themeAction = computed(() => t(settingsStore.isDark ? messages.switchLight : messages.switchDark))
const syncBadgeTitle = computed(() => connectionProjection.retryable
  ? t(messages.retrySync, { status: connectionProjection.message })
  : connectionProjection.message)

const hoverTooltip = computed(() => {
  const target = hoverState.value
  if (target?.type === 'nav') {
    return {
      title: target.item === 'brand' ? 'Auralis' : t(navigationMessages[target.item]),
      description: t(navDescriptions[target.item]),
    }
  }
  if (target?.type === 'theme') {
    return {
      title: t(settingsStore.isDark ? messages.lightMode : messages.darkMode),
      description: t(messages.switchTheme),
    }
  }
  if (target?.type === 'profile') {
    return {
      title: authStore.username || t(messages.profile),
      description: connectionProjection.message,
    }
  }
  return null
})

const handleMouseEnter = (event: MouseEvent, target: HoverTarget) => {
  if (closeTimeout) {
    clearTimeout(closeTimeout)
    closeTimeout = null
  }
  const element = event.currentTarget as HTMLElement
  const sidebarEl = element.closest('.sidebar')
  if (!sidebarEl) return
  const sidebarRect = sidebarEl.getBoundingClientRect()
  const targetRect = element.getBoundingClientRect()
  hoverTop.value = targetRect.top - sidebarRect.top + (targetRect.height / 2)
  hoverState.value = target
}

const handleMouseLeave = () => {
  if (closeTimeout) clearTimeout(closeTimeout)
  closeTimeout = setTimeout(() => {
    hoverState.value = null
  }, 100)
}

const keepHoverCard = () => {
  if (closeTimeout) {
    clearTimeout(closeTimeout)
    closeTimeout = null
  }
}

const triggerSyncRetry = () => {
  syncStore.requestBackgroundSync('online')
}

onMounted(async () => {
  if (!authStore.isAuthenticated) return
  void authStore.loadAvatar()
  try {
    await subjectStore.loadSubjects()
  } catch (error) {
    console.warn('[AppSidebar] subjects load failed', error)
  }
})

onUnmounted(() => {
  if (closeTimeout) clearTimeout(closeTimeout)
})
</script>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  height: 100vh;
  background: var(--color-bg-primary, #F7F2EB);
  border-right: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 10;
  align-items: center;
  user-select: none;
  flex-shrink: 0;
  box-sizing: border-box;
}

/* Brand */
.sidebar-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 22px 0 18px;
  width: 100%;
  position: relative;
  cursor: pointer;
  outline: none;
  border-bottom: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
  margin-bottom: 14px;
}
.brand-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.3s ease;
  border-radius: 8px;
}
.sidebar-brand:hover .brand-icon {
  transform: scale(1.08) translateY(-1px);
  filter: drop-shadow(0 4px 10px rgba(139, 154, 110, 0.4));
}
.sidebar-brand:active .brand-icon {
  transform: scale(0.96);
}
.brand-rect {
  transition: all 0.3s ease;
}

/* Fixed Primary Navigation (Strictly Non-scrollable) */
.sidebar-primary-nav {
  flex-shrink: 0;
  padding: 2px 0 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Scrollable Subjects Section (Only subjects list can scroll) */
.sidebar-subjects-scroll {
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  -ms-overflow-style: none;
  scrollbar-width: none;
  padding: 4px 0 8px;
}
.sidebar-subjects-scroll::-webkit-scrollbar {
  display: none;
}

.nav-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 12px;
  color: var(--text-secondary, #344139);
  text-decoration: none;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  margin-bottom: 8px;
  cursor: pointer;
  outline: none;
}

.nav-active-indicator {
  position: absolute;
  left: -12px;
  top: 50%;
  transform: translateY(-50%);
  width: 3.5px;
  height: 0;
  background: var(--accent-gradient, linear-gradient(180deg, #9EAD80 0%, #8B9A6E 100%));
  border-radius: 0 4px 4px 0;
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  opacity: 0;
}

.nav-item:hover {
  background: rgba(139, 154, 110, 0.12);
  color: var(--text-primary);
  transform: translateY(-1px);
}
.nav-item:active {
  transform: scale(0.96);
}

.nav-item.is-active {
  background: rgba(139, 154, 110, 0.16);
  color: #556B3D;
}
.nav-item.is-active .nav-active-indicator {
  height: 20px;
  opacity: 1;
  box-shadow: 0 0 8px rgba(139, 154, 110, 0.6);
}

.nav-icon {
  font-size: 19px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.nav-item:hover .nav-icon {
  transform: scale(1.08);
}

.sidebar-divider {
  width: 24px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-default, #E6E6E4) 20%, var(--border-default, #E6E6E4) 80%, transparent);
  margin: 10px 0 12px;
  flex-shrink: 0;
}

/* Subjects List */
.subjects-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.subject-item {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  outline: none;
}
.subject-item:hover {
  background: rgba(139, 154, 110, 0.12);
  transform: translateY(-1px);
}
.subject-item:active {
  transform: scale(0.96);
}
.subject-item.is-active {
  background: rgba(139, 154, 110, 0.16);
}
.subject-item.is-active .nav-active-indicator {
  height: 20px;
  opacity: 1;
  box-shadow: 0 0 8px rgba(139, 154, 110, 0.6);
}

.subject-icon-bg {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
  background: transparent;
  border: 1.5px solid rgba(139, 154, 110, 0.35);
  color: #637748;
  transition: all 0.22s ease;
}
.subject-item:hover .subject-icon-bg {
  border-color: #8B9A6E;
  color: #4C5D35;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.2);
}
.subject-icon-glyph {
  width: 18px;
  height: 18px;
}

/* Footer Section: 模式切换 + 个人中心 */
.sidebar-footer {
  padding: 14px 0 18px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  border-top: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
  flex-shrink: 0;
}

/* 模式切换按钮 */
.sidebar-action-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: transparent;
  border: 1px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  outline: none;
  color: var(--text-secondary, #344139);
}

.sidebar-action-btn:hover {
  background: var(--color-bg-tertiary, #FAF7F2);
  border-color: rgba(139, 154, 110, 0.3);
  color: #8B9A6E;
  transform: translateY(-1px);
}

.sidebar-action-btn:active {
  transform: scale(0.92);
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
.theme-toggle-btn:hover .sun-icon {
  transform: rotate(25deg) scale(1.12);
  color: #EDB34D;
}
.theme-toggle-btn:hover .moon-icon {
  transform: rotate(-20deg) scale(1.12);
  color: #8B9A6E;
}

/* 个人中心头像容器 */
.sidebar-avatar-entry {
  position: relative;
  cursor: pointer;
  outline: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar-avatar {
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
.sidebar-avatar:hover {
  transform: scale(1.06);
  box-shadow: 0 0 0 2px #8B9A6E, 0 4px 14px rgba(139, 154, 110, 0.3);
}

.sidebar-avatar-img {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  object-fit: cover;
  display: block;
  box-shadow: 0 0 0 1.5px rgba(139, 154, 110, 0.25), 0 2px 6px rgba(0, 0, 0, 0.05);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.sidebar-avatar-img:hover {
  transform: scale(1.06);
  box-shadow: 0 0 0 2px #8B9A6E, 0 4px 14px rgba(139, 154, 110, 0.3);
}

/* 镶嵌在头像右下角的状态点徽标 */
.avatar-sync-badge {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-bg-primary, #F7F2EB);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2;
  box-shadow: 0 0 0 2px var(--color-bg-primary, #F7F2EB);
  transition: transform 0.2s ease;
}

.avatar-sync-badge:hover {
  transform: scale(1.25);
}

.avatar-sync-ripple {
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  opacity: 0.3;
  pointer-events: none;
}
.avatar-sync-ripple.status-ready {
  background: #8B9A6E;
  animation: ripple-spread 3s ease-out infinite;
}
.avatar-sync-ripple.status-syncing {
  background: #C89B6D;
  animation: ripple-spread 1.4s ease-out infinite;
}
.avatar-sync-ripple.status-error {
  background: #D47B7B;
  animation: ripple-spread 1.8s ease-out infinite;
}

@keyframes ripple-spread {
  0% { transform: scale(0.7); opacity: 0.6; }
  100% { transform: scale(1.7); opacity: 0; }
}

.avatar-sync-dot {
  width: 7.5px;
  height: 7.5px;
  border-radius: 50%;
  position: relative;
  z-index: 1;
}
.avatar-sync-dot.status-ready, .avatar-sync-dot.ready {
  background: #8B9A6E;
  box-shadow: 0 0 6px rgba(139, 154, 110, 0.8);
}
.avatar-sync-dot.status-syncing, .avatar-sync-dot.syncing {
  background: #C89B6D;
  box-shadow: 0 0 6px rgba(200, 155, 109, 0.8);
}
.avatar-sync-dot.status-error {
  background: #D47B7B;
  box-shadow: 0 0 6px rgba(212, 123, 123, 0.8);
}
.avatar-sync-dot.status-offline, .avatar-sync-dot.status-reconnecting {
  background: #C89B6D;
  box-shadow: 0 0 6px rgba(200, 155, 109, 0.8);
}
.sync-dot.status-syncing, .sync-dot.syncing {
  background: #C89B6D;
  box-shadow: 0 0 8px rgba(200, 155, 109, 0.7);
}
.sync-dot.status-error {
  background: #D47B7B;
  box-shadow: 0 0 8px rgba(212, 123, 123, 0.7);
}
.sync-dot.status-offline, .sync-dot.status-reconnecting {
  background: #C89B6D;
  box-shadow: 0 0 8px rgba(200, 155, 109, 0.7);
}

/* Frosted Glass Tooltips & Cards */
.sidebar-tooltip-floating {
  position: absolute;
  left: calc(var(--sidebar-width) + 10px);
  transform: translateY(-50%);
  background: rgba(247, 242, 235, 0.94);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(139, 154, 110, 0.22);
  border-radius: 12px;
  padding: 8px 14px;
  box-shadow: 0 8px 24px -2px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.03);
  white-space: nowrap;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 3px;
  text-align: left;
  pointer-events: none;
  animation: fade-slide-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes fade-slide-in {
  from { opacity: 0; transform: translateY(-50%) translateX(-6px); }
  to { opacity: 1; transform: translateY(-50%) translateX(0); }
}

.tooltip-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.1px;
}
.tooltip-desc {
  font-size: 11px;
  color: var(--text-muted, #7A7A75);
}

/* Floating Hover Subject Card */
.subject-hover-card-floating {
  position: absolute;
  left: calc(var(--sidebar-width) + 10px);
  transform: translateY(-50%);
  width: 230px;
  background: rgba(247, 242, 235, 0.95);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(139, 154, 110, 0.24);
  border-radius: 16px;
  padding: 14px 16px;
  box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.1), 0 4px 10px rgba(0, 0, 0, 0.04);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
  pointer-events: auto;
  animation: fade-slide-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.hover-subject-name {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.2px;
}
.hover-subject-desc {
  font-size: 11.5px;
  color: var(--text-secondary, #344139);
  line-height: 1.45;
  word-wrap: break-word;
}
.hover-subject-meta {
  font-size: 10.5px;
  color: var(--text-muted, #7A7A75);
  font-weight: 600;
  margin-top: 4px;
}

/* Dark Mode Overrides */
html.dark .sidebar {
  background: var(--color-bg-secondary, #292825);
  border-right-color: rgba(163, 177, 155, 0.15);
}
html.dark .nav-item {
  color: #b0aca5;
}
html.dark .nav-item:hover {
  background: rgba(163, 177, 155, 0.12);
  color: #FAF7F2;
}
html.dark .nav-item.is-active {
  background: rgba(163, 177, 155, 0.18);
  color: #b8ccaf;
}
html.dark .subject-item:hover {
  background: rgba(163, 177, 155, 0.12);
}
html.dark .subject-item.is-active {
  background: rgba(163, 177, 155, 0.18);
}
html.dark .subject-icon-bg {
  border-color: rgba(163, 177, 155, 0.3);
  color: #b8ccaf;
}
html.dark .sidebar-footer {
  border-top-color: rgba(163, 177, 155, 0.15);
}
html.dark .sidebar-tooltip-floating {
  background: rgba(33, 38, 33, 0.94);
  border-color: rgba(163, 177, 155, 0.25);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
html.dark .subject-hover-card-floating {
  background: rgba(33, 38, 33, 0.95);
  border-color: rgba(163, 177, 155, 0.28);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
}
html.dark .tooltip-title, html.dark .hover-subject-name {
  color: #FAF7F2;
}
html.dark .hover-subject-desc {
  color: #d9d0c7;
}
html.dark .avatar-sync-badge {
  background: var(--color-bg-secondary, #292825);
  box-shadow: 0 0 0 2px var(--color-bg-secondary, #292825);
}
html.dark .sidebar-action-btn:hover {
  background: rgba(163, 177, 155, 0.12);
  border-color: rgba(163, 177, 155, 0.3);
  color: #FAF7F2;
}
</style>
