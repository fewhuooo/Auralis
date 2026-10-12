<template>
  <aside class="sidebar">
    <!-- Brand Logo -->
    <div 
      class="sidebar-brand"
      @click="router.push('/')"
      @mouseenter="handleMouseEnter($event, 'nav', { title: 'Auralis', desc: '智能学习与知识工作台' })"
      @mouseleave="handleMouseLeave"
      title="回到首页"
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
    <nav class="sidebar-primary-nav" aria-label="核心功能导航">
      <!-- Dashboard -->
      <router-link 
        to="/" 
        class="nav-item" 
        :class="{ 'is-active': route.path === '/' }"
        @mouseenter="handleMouseEnter($event, 'nav', { title: '首页', desc: '日程与知识总览' })"
        @mouseleave="handleMouseLeave"
        aria-label="首页"
      >
        <span class="nav-active-indicator"></span>
        <span class="nav-icon"><IconLayoutDashboard :size="20" :stroke-width="1.7" /></span>
      </router-link>

      <!-- Subject Hall -->
      <router-link 
        to="/subjects" 
        class="nav-item" 
        :class="{ 'is-active': route.path === '/subjects' }"
        @mouseenter="handleMouseEnter($event, 'nav', { title: '学科空间', desc: '浏览与管理学科' })"
        @mouseleave="handleMouseLeave"
        aria-label="学科空间"
      >
        <span class="nav-active-indicator"></span>
        <span class="nav-icon"><IconBooks :size="20" :stroke-width="1.7" /></span>
      </router-link>

      <!-- Timeline -->
      <router-link 
        to="/timeline" 
        class="nav-item" 
        :class="{ 'is-active': route.path === '/timeline' }"
        @mouseenter="handleMouseEnter($event, 'nav', { title: '任务排期', desc: '日程规划与任务安排' })"
        @mouseleave="handleMouseLeave"
        aria-label="任务排期"
      >
        <span class="nav-active-indicator"></span>
        <span class="nav-icon"><IconCalendarTime :size="20" :stroke-width="1.7" /></span>
      </router-link>

      <!-- Asset -->
      <router-link 
        to="/asset" 
        class="nav-item" 
        :class="{ 'is-active': route.path === '/asset' }"
        @mouseenter="handleMouseEnter($event, 'nav', { title: '资料管理', desc: '文件、知识点与关联图谱' })"
        @mouseleave="handleMouseLeave"
        aria-label="资料管理"
      >
        <span class="nav-active-indicator"></span>
        <span class="nav-icon"><IconDatabase :size="20" :stroke-width="1.7" /></span>
      </router-link>

      <!-- Pomodoro -->
      <router-link 
        to="/pomodoro" 
        class="nav-item" 
        :class="{ 'is-active': route.path === '/pomodoro' }"
        @mouseenter="handleMouseEnter($event, 'nav', { title: '专注时钟', desc: '番茄钟专注与休息' })"
        @mouseleave="handleMouseLeave"
        aria-label="专注时钟"
      >
        <span class="nav-active-indicator"></span>
        <span class="nav-icon"><IconStopwatch :size="20" :stroke-width="1.7" /></span>
      </router-link>
    </nav>

    <!-- Divider (Fixed) -->
    <div class="sidebar-divider"></div>

    <!-- Scrollable Subjects Section (Only subjects list can scroll) -->
    <div class="sidebar-subjects-scroll" aria-label="学科列表">
      <div class="subjects-list">
        <div
          v-for="subj in subjectStore.subjects"
          :key="subj.id"
          class="subject-item"
          :class="{ 'is-active': route.path === `/subject/${subj.id}` }"
          @click="router.push(`/subject/${subj.id}`)"
          @mouseenter="handleMouseEnter($event, 'subject', subj)"
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

    <!-- Footer: 三端同步状态 (Fixed at bottom) -->
    <div class="sidebar-footer">
      <div 
        class="sync-status"
        :aria-label="`${connectionProjection.message}${connectionProjection.retryable ? '，可重试' : ''}`"
        :data-retryable="connectionProjection.retryable"
        @mouseenter="handleMouseEnter($event, 'sync', { title: connectionProjection.message, desc: connectionProjection.retryable ? '点击立即重试同步' : undefined })"
        @mouseleave="handleMouseLeave"
        @click="triggerSyncRetry"
      >
        <span class="sync-ripple" :class="`status-${connectionProjection.level}`"></span>
        <span class="sync-dot" :class="`status-${connectionProjection.level}`"></span>
      </div>
    </div>

    <!-- Shared Floating Tooltip -->
    <div 
      v-if="hoverState.type === 'nav' || hoverState.type === 'sync' || hoverState.type === 'profile'" 
      class="sidebar-tooltip-floating"
      :style="{ top: hoverState.top + 'px' }"
    >
      <div class="tooltip-title">{{ hoverState.data.title }}</div>
      <div class="tooltip-desc" v-if="hoverState.data.desc">{{ hoverState.data.desc }}</div>
    </div>

    <!-- Shared Floating Subject Hover Card -->
    <div 
      v-if="hoverState.type === 'subject'" 
      class="subject-hover-card-floating"
      :style="{ top: hoverState.top + 'px' }"
      @mouseenter="keepHoverCard"
      @mouseleave="handleMouseLeave"
      @click.stop
    >
      <span class="hover-subject-name">{{ hoverState.data.name }}</span>
      <span class="hover-subject-desc">{{ hoverState.data.description || '暂无描述' }}</span>
      <span class="hover-subject-meta" v-if="hoverState.data.id !== 'hall'">
        {{ hoverState.data.blockCount || 0 }} 知识块 · {{ hoverState.data.fileCount || 0 }} 材料
      </span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { IconLayoutDashboard, IconBooks, IconCalendarTime, IconDatabase, IconStopwatch } from '@tabler/icons-vue'
import { useAuthStore } from '@/store/useAuthStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useSyncStore } from '@/store/useSyncStore'
import type { ConnectionProjection } from '@/services/connectionStatusProjection'
import {
  getLegacySubjectIcon,
  getSubjectIconComponent,
  isSubjectIconKey
} from '@/utils/subjectIcon'

const route = useRoute()
const router = useRouter()
defineProps<{ connectionProjection: ConnectionProjection }>()
const authStore = useAuthStore()
const subjectStore = useSubjectStore()
const syncStore = useSyncStore()

// Hover States
const hoverState = ref<{
  type: 'nav' | 'subject' | 'profile' | 'sync' | null
  top: number
  data: any
}>({
  type: null,
  top: 0,
  data: null
})

let closeTimeout: any = null

const handleMouseEnter = (event: MouseEvent, type: 'nav' | 'subject' | 'profile' | 'sync', data: any) => {
  if (closeTimeout) {
    clearTimeout(closeTimeout)
    closeTimeout = null
  }
  const target = event.currentTarget as HTMLElement
  const sidebarEl = target.closest('.sidebar')
  if (sidebarEl) {
    const sidebarRect = sidebarEl.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    hoverState.value = {
      type,
      top: targetRect.top - sidebarRect.top + (targetRect.height / 2),
      data
    }
  }
}

const handleMouseLeave = () => {
  if (closeTimeout) clearTimeout(closeTimeout)
  closeTimeout = setTimeout(() => {
    hoverState.value.type = null
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

/* Footer Section */
.sidebar-footer {
  padding: 16px 0 20px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-top: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
  flex-shrink: 0;
}

/* Sync Status Dual Ripple */
.sync-status {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  cursor: pointer;
  transition: background-color 0.2s ease;
}
.sync-status:hover {
  background: rgba(139, 154, 110, 0.12);
}
.sync-ripple {
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  opacity: 0.25;
  transition: all 0.3s ease;
}
.sync-ripple.status-ready {
  background: #8B9A6E;
  animation: ripple-spread 3s ease-out infinite;
}
.sync-ripple.status-syncing {
  background: #C89B6D;
  animation: ripple-spread 1.4s ease-out infinite;
}
.sync-ripple.status-error {
  background: #D47B7B;
  animation: ripple-spread 1.8s ease-out infinite;
}
@keyframes ripple-spread {
  0% { transform: scale(0.7); opacity: 0.6; }
  100% { transform: scale(1.7); opacity: 0; }
}

.sync-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  position: relative;
  z-index: 1;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.sync-dot.status-ready, .sync-dot.ready {
  background: #8B9A6E;
  box-shadow: 0 0 8px rgba(139, 154, 110, 0.7);
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
</style>
