<template>
  <aside class="sidebar">
    <!-- Brand -->
    <div class="sidebar-brand"
      @mouseenter="handleMouseEnter($event, 'nav', { title: 'Auralis (Auralis)', desc: '跨平台智能生产力中枢' })"
      @mouseleave="handleMouseLeave"
    >
      <div class="brand-icon">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect width="28" height="28" rx="8" fill="url(#brand-grad)" />
          <path d="M8 14L12 10L16 14L20 10" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M8 18L12 14L16 18L20 14" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
          <defs>
            <linearGradient id="brand-grad" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
              <stop stop-color="var(--color-zen-sage)" />
              <stop offset="1" stop-color="var(--color-zen-ivory)" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>

    <!-- Primary Navigation -->
    <nav class="sidebar-nav">
      <!-- Dashboard -->
      <router-link to="/" class="nav-item" :class="{ 'is-active': route.path === '/' }"
        @mouseenter="handleMouseEnter($event, 'nav', { title: '首页看盘', desc: '日程 · 知识块速览' })"
        @mouseleave="handleMouseLeave"
      >
        <el-icon class="nav-icon"><LayoutDashboard /></el-icon>
      </router-link>

      <!-- Subject Hall -->
      <router-link to="/subjects" class="nav-item" :class="{ 'is-active': route.path === '/subjects' }"
        @mouseenter="handleMouseEnter($event, 'nav', { title: '学科大厅', desc: '管理与浏览所有学科' })"
        @mouseleave="handleMouseLeave"
      >
        <el-icon class="nav-icon"><Compass /></el-icon>
      </router-link>

      <!-- Timeline -->
      <router-link to="/timeline" class="nav-item" :class="{ 'is-active': route.path === '/timeline' }"
        @mouseenter="handleMouseEnter($event, 'nav', { title: '排期副驾', desc: '任务排期 · 拖拽看板' })"
        @mouseleave="handleMouseLeave"
      >
        <el-icon class="nav-icon"><CalendarClock /></el-icon>
      </router-link>

      <!-- Asset -->
      <router-link to="/asset" class="nav-item" :class="{ 'is-active': route.path === '/asset' }"
        @mouseenter="handleMouseEnter($event, 'nav', { title: '资产编排', desc: '材料管理 · 本地文件登记' })"
        @mouseleave="handleMouseLeave"
      >
        <el-icon class="nav-icon"><Database /></el-icon>
      </router-link>

      <!-- Divider -->
      <div class="sidebar-divider"></div>

      <!-- Dynamic subjects -->
      <div class="subjects-list">
        <div
          v-for="subj in subjectStore.subjects"
          :key="subj.id"
          class="subject-item"
          :class="{ 'is-active': route.path === `/subject/${subj.id}` }"
          @click="router.push(`/subject/${subj.id}`)"
          @mouseenter="handleMouseEnter($event, 'subject', subj)"
          @mouseleave="handleMouseLeave"
        >
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
    </nav>

    <!-- Footer: 三端同步状态 -->
    <div class="sidebar-footer">
      <div class="sync-status"
        @mouseenter="handleMouseEnter($event, 'sync', { title: syncStatusText })"
        @mouseleave="handleMouseLeave"
      >
        <span class="sync-dot" :class="syncDotClass"></span>
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
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LayoutDashboard, Compass, CalendarClock, Database } from 'lucide-vue-next'
import { useSyncStore } from '@/store/useSyncStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import {
  getLegacySubjectIcon,
  getSubjectIconComponent,
  isSubjectIconKey
} from '@/utils/subjectIcon'

const route = useRoute()
const router = useRouter()
const syncStore = useSyncStore()
const subjectStore = useSubjectStore()

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

const syncStatusText = computed(() => {
  return syncStore.isSyncing ? '同步中...' : '三端同步就绪'
})
const syncDotClass = computed(() => {
  return syncStore.isSyncing ? 'syncing' : 'ready'
})

onMounted(async () => {
  await subjectStore.loadSubjects()
})



</script>


<style scoped>
.sidebar {
  width: var(--sidebar-width);
  height: 100vh;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-right: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 10;
  align-items: center;
}

/* Brand */
.sidebar-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 0 16px;
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: 8px;
  width: 100%;
  position: relative;
}

/* Navigation */
.sidebar-nav {
  flex: 1;
  padding: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  text-decoration: none;
  transition: all var(--transition-normal);
  position: relative;
  margin-bottom: 8px;
  cursor: pointer;
}

.nav-item:hover {
  background: rgba(163, 177, 155, 0.15);
  color: var(--text-primary);
}

.nav-item.is-active {
  background: var(--border-subtle);
  color: var(--text-primary);
}

.nav-item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  background: var(--accent-gradient);
  border-radius: var(--radius-full);
}

.nav-item.is-disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.nav-icon {
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar-divider {
  width: 24px;
  height: 1px;
  background: var(--border-subtle);
  margin: 8px 0;
  flex-shrink: 0;
}

/* Tooltip floating card styling */
.sidebar-tooltip-floating {
  position: absolute;
  left: calc(var(--sidebar-width) + 8px);
  transform: translateY(-50%);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  box-shadow: var(--shadow-md);
  white-space: nowrap;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  pointer-events: none;
  animation: fade-in-tooltip var(--transition-fast) ease-out;
}

@keyframes fade-in-tooltip {
  from { opacity: 0; transform: translateY(-50%) translateX(-4px); }
  to { opacity: 1; transform: translateY(-50%) translateX(0); }
}

.tooltip-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
}

.tooltip-desc {
  font-size: 10px;
  color: var(--text-muted);
}

/* Subjects List */
.subjects-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-top: 8px;
}

.subject-item {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  transition: all var(--transition-normal);
}

.subject-item:hover {
  background: rgba(163, 177, 155, 0.15);
}

.subject-item.is-active {
  background: var(--border-subtle);
}

.subject-item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 18px;
  background: var(--accent-gradient);
  border-radius: var(--radius-full);
}

.subject-icon-bg {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
  background: #7D9372;
  color: #fff;
}

.subject-icon-glyph {
  width: 18px;
  height: 18px;
}

/* Floating Hover Subject Card */
.subject-hover-card-floating {
  position: absolute;
  left: calc(var(--sidebar-width) + 8px);
  transform: translateY(-50%);
  width: 220px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  padding: 12px;
  box-shadow: var(--shadow-lg);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
  pointer-events: auto;
  animation: fade-in-tooltip var(--transition-fast) ease-out;
}

.hover-subject-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.hover-subject-desc {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.4;
  word-wrap: break-word;
}

.hover-subject-meta {
  font-size: 10px;
  color: var(--text-muted);
  font-weight: 500;
}

.hover-subject-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  border-top: 1px solid var(--border-subtle);
  padding-top: 8px;
}

.hover-action-btn {
  flex: 1;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  font-size: 11px;
  padding: 4px 0;
  border-radius: 4px;
  cursor: pointer;
  text-align: center;
  transition: all var(--transition-fast);
}

.hover-action-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.hover-action-btn.delete:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.25);
}


/* Footer Section */
.sidebar-footer {
  padding: 16px 0;
  border-top: 1px solid var(--border-subtle);
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.profile-entry {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  cursor: pointer;
  position: relative;
  transition: all var(--transition-fast);
}

.profile-entry:hover {
  background: rgba(163, 177, 155, 0.15);
}

.profile-entry.is-active {
  background: var(--border-subtle);
}

.footer-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.hover-profile-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
}

.hover-profile-status {
  font-size: 10px;
  color: var(--text-muted);
}

/* Sync Status dot */
.sync-status {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 24px;
  height: 24px;
  cursor: help;
}

.sync-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  animation: pulse-dot 2s ease-in-out infinite;
}

.sync-dot.ready {
  background: #22c55e;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.6);
}

.sync-dot.syncing {
  background: #f59e0b;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.6);
}

.hover-sync-text {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
}
</style>
