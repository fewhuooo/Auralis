<template>
  <aside class="sidebar">
    <!-- Brand -->
    <div class="sidebar-brand">
      <div class="brand-icon">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect width="28" height="28" rx="8" fill="url(#brand-grad)" />
          <path d="M8 14L12 10L16 14L20 10" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M8 18L12 14L16 18L20 14" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
          <defs>
            <linearGradient id="brand-grad" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
              <stop stop-color="var(--color-oatmeal-dark)" />
              <stop offset="1" stop-color="var(--color-gray-soft)" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div class="brand-text">
        <span class="brand-name">StudyCore</span>
        <span class="brand-tag">学核 · PC</span>
      </div>
    </div>

    <!-- Primary Navigation: PC 端三大核心功能模块 -->
    <nav class="sidebar-nav">
      <div class="nav-section-label">核心功能</div>

      <!-- 1. 功能全聚合基座：知识检索/补全入库 -->
      <router-link to="/" class="nav-item" :class="{ 'is-active': route.path === '/' }">
        <span class="nav-icon">✦</span>
        <div class="nav-text">
          <span class="nav-label">知识检索与入库</span>
          <span class="nav-desc">RAG 问答 · 自动补全</span>
        </div>
      </router-link>

      <!-- 2. 重型资产智能编排（文件粉碎机） -->
      <router-link to="/asset" class="nav-item" :class="{ 'is-active': route.path === '/asset' }">
        <span class="nav-icon">⚙</span>
        <div class="nav-text">
          <span class="nav-label">资产编排</span>
          <span class="nav-desc">PPT/PDF 粉碎 · 知识块生成</span>
        </div>
      </router-link>

      <!-- 3. 辅助式排期副驾 -->
      <router-link to="/timeline" class="nav-item" :class="{ 'is-active': route.path === '/timeline' }">
        <span class="nav-icon">◫</span>
        <div class="nav-text">
          <span class="nav-label">排期副驾</span>
          <span class="nav-desc">任务拖拽 · 脑力负荷预警</span>
        </div>
      </router-link>

      <!-- 平板端功能入口预留 -->
      <div class="nav-section-label" style="margin-top: 24px;">跨端能力</div>

      <!-- PDF 伴读（平板端功能在 PC 端的复用） -->
      <router-link to="/pdf-reader" class="nav-item is-disabled" @click.prevent>
        <span class="nav-icon">📖</span>
        <div class="nav-text">
          <span class="nav-label">PDF 智能伴读</span>
          <span class="nav-desc">多模态视觉解析</span>
        </div>
        <span class="nav-tag">平板端</span>
      </router-link>

      <!-- 知识块可视化管理 -->
      <router-link to="/blocks" class="nav-item is-disabled" @click.prevent>
        <span class="nav-icon">⬡</span>
        <div class="nav-text">
          <span class="nav-label">知识块管理</span>
          <span class="nav-desc">查看 · 编辑 · 关联</span>
        </div>
        <span class="nav-tag">Soon</span>
      </router-link>
    </nav>

    <!-- Footer: 三端同步状态 + 个人中心 -->
    <div class="sidebar-footer">
      <router-link to="/profile" class="profile-entry" :class="{ 'is-active': route.path === '/profile' }">
        <div class="footer-avatar">G</div>
        <div class="footer-meta">
          <span class="footer-name">StudyCore 同学</span>
          <span class="footer-status">个人中心 · 设置</span>
        </div>
        <span class="footer-arrow">›</span>
      </router-link>
      <div class="sync-status">
        <span class="sync-dot"></span>
        <span class="sync-text">三端同步就绪</span>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
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
}

/* Brand */
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: 8px;
}

.brand-text {
  display: flex;
  flex-direction: column;
}

.brand-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
}

.brand-tag {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}

/* Navigation */
.sidebar-nav {
  flex: 1;
  padding: 0 12px;
  overflow-y: auto;
}

.nav-section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding: 8px 12px 6px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  text-decoration: none;
  transition: all var(--transition-normal);
  position: relative;
  margin-bottom: 2px;
  cursor: pointer;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.04);
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
  height: 24px;
  background: var(--accent-gradient);
  border-radius: var(--radius-full);
}

.nav-item.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.nav-icon {
  font-size: 16px;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.nav-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.nav-label {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}

.nav-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.3;
  margin-top: 1px;
}

.nav-tag {
  font-size: 10px;
  color: var(--text-muted);
  border: 1px solid var(--border-subtle);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

/* Footer */
.sidebar-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border-subtle);
}

.sync-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sync-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
  animation: pulse-dot 2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.sync-text {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}

/* Profile Entry */
.profile-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-lg);
  text-decoration: none;
  cursor: pointer;
  transition: background var(--transition-fast);
  margin-bottom: 10px;
}
.profile-entry:hover { background: rgba(255,255,255,0.04); }
.profile-entry.is-active { background: var(--border-subtle); }
.footer-avatar {
  width: 30px; height: 30px; border-radius: var(--radius-md);
  background: var(--accent-gradient);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: white; flex-shrink: 0;
}
.footer-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.footer-name { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.footer-status { font-size: 10px; color: var(--text-muted); }
.footer-arrow { font-size: 16px; color: var(--text-muted); }
</style>
