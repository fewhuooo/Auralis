<template>
  <main class="startup-splash" :class="{ 'is-overlay': overlay }">
    <div class="startup-glow startup-glow--top" aria-hidden="true"></div>
    <div class="startup-glow startup-glow--bottom" aria-hidden="true"></div>

    <div v-if="isDesktopApp" class="startup-drag-bar" data-tauri-drag-region>
      <div class="startup-window-controls">
        <button
          type="button"
          class="startup-win-btn"
          :title="t(messages.minimize)"
          :aria-label="t(messages.minimize)"
          @click="handleMinimize"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <line x1="1" y1="5.5" x2="10" y2="5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
          </svg>
        </button>
        <button
          type="button"
          class="startup-win-btn startup-win-btn--close"
          :title="t(messages.close)"
          :aria-label="t(messages.close)"
          @click="handleClose"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <line x1="2" y1="2" x2="9" y2="9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
            <line x1="9" y1="2" x2="2" y2="9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>

    <section class="startup-stage">
      <div class="startup-emblem" :class="{ 'is-error': failed }" aria-hidden="true">
        <span class="emblem-halo"></span>
        <span class="emblem-ring"></span>
        <div class="emblem-badge">
          <svg width="42" height="42" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="8" fill="url(#startup-brand-grad)" />
            <path
              d="M7.5 14L11.5 10L16.5 14L20.5 10"
              stroke="white"
              stroke-width="2.1"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M7.5 18L11.5 14L16.5 18L20.5 14"
              stroke="white"
              stroke-width="2.1"
              stroke-linecap="round"
              stroke-linejoin="round"
              opacity="0.62"
            />
            <defs>
              <linearGradient id="startup-brand-grad" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                <stop stop-color="#8B9A6E" />
                <stop offset="1" stop-color="#728456" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      <template v-if="failed">
        <div class="startup-copy startup-copy--error" role="alert">
          <h1>{{ errorTitle }}</h1>
          <p>{{ errorMessage }}</p>
        </div>
        <button type="button" class="startup-retry-btn" @click="emit('retry')">
          {{ retryLabel }}
        </button>
      </template>

      <template v-else>
        <div class="startup-copy">
          <span class="startup-wordmark">Auralis</span>
          <Transition name="startup-status-fade" mode="out-in">
            <p :key="stage" class="startup-status" role="status">
              {{ stageText }}
            </p>
          </Transition>
        </div>

        <div class="startup-progress-track" aria-hidden="true">
          <div class="startup-progress-fill" :style="{ transform: `scaleX(${stageProgress})` }"></div>
        </div>
      </template>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/i18n'
import { closeWindow, isTauriEnvironment, minimizeWindow } from '@/api/tauri'
import type { StartupBootstrapStage } from '@/services/startupBootstrap'

const props = withDefaults(defineProps<{
  stage?: StartupBootstrapStage
  failed?: boolean
  errorTitle?: string
  errorMessage?: string
  retryLabel?: string
  overlay?: boolean
}>(), {
  stage: 'database',
  failed: false,
  errorTitle: '',
  errorMessage: '',
  retryLabel: '',
  overlay: false,
})

const emit = defineEmits<{ retry: [] }>()

const messages = {
  database: { 'zh-CN': '正在启动 Auralis…', en: 'Starting Auralis…', ja: 'Auralis を起動中…' },
  hydrating: { 'zh-CN': '正在加载本地学习数据…', en: 'Loading local study data…', ja: 'ローカル学習データを読み込み中…' },
  syncing: { 'zh-CN': '正在同步云端数据…', en: 'Syncing cloud data…', ja: 'クラウドデータを同期中…' },
  warming: { 'zh-CN': '正在准备学习工作台…', en: 'Preparing your workspace…', ja: 'ワークスペースを準備中…' },
  ready: { 'zh-CN': '学习工作台已就绪', en: 'Workspace ready', ja: 'ワークスペースの準備ができました' },
  minimize: { 'zh-CN': '最小化', en: 'Minimize', ja: '最小化' },
  close: { 'zh-CN': '关闭', en: 'Close', ja: '閉じる' },
}

const stageProgressMap: Record<StartupBootstrapStage, number> = {
  database: 0.24,
  hydrating: 0.48,
  syncing: 0.74,
  warming: 0.92,
  ready: 1,
}

const isDesktopApp = isTauriEnvironment()
const stageText = computed(() => t(messages[props.stage]))
const stageProgress = computed(() => stageProgressMap[props.stage])

function handleMinimize(): void {
  void minimizeWindow()
}

function handleClose(): void {
  void closeWindow()
}
</script>

<style scoped>
.startup-splash {
  position: relative;
  display: grid;
  min-height: 100dvh;
  width: 100%;
  place-items: center;
  overflow: hidden;
  padding: var(--spacing-6);
  background: var(--color-bg-primary);
  color: var(--text-primary);
  user-select: none;
}

.startup-splash.is-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
}

.startup-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(110px);
  pointer-events: none;
  opacity: 0.52;
}

.startup-glow--top {
  width: 520px;
  height: 520px;
  top: -180px;
  right: -110px;
  background: rgba(139, 154, 110, 0.2);
}

.startup-glow--bottom {
  width: 420px;
  height: 420px;
  bottom: -160px;
  left: -90px;
  background: rgba(139, 154, 110, 0.14);
}

.startup-drag-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 48px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  z-index: 2;
}

.startup-window-controls {
  display: flex;
  align-items: center;
  height: 36px;
}

.startup-win-btn {
  width: 46px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.startup-win-btn:hover {
  background: var(--border-subtle);
  color: var(--text-primary);
}

.startup-win-btn--close:hover {
  background: #e81123;
  color: #ffffff;
}

.startup-stage {
  position: relative;
  z-index: 1;
  width: min(100%, 26rem);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.startup-emblem {
  position: relative;
  width: 96px;
  height: 96px;
  display: grid;
  place-items: center;
  margin-bottom: var(--spacing-5);
}

.emblem-halo {
  position: absolute;
  inset: 0;
  border-radius: 28px;
  background: radial-gradient(circle, rgba(139, 154, 110, 0.24) 0%, rgba(139, 154, 110, 0) 72%);
  animation: startup-breathe 2.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.emblem-ring {
  position: absolute;
  inset: 14px;
  border-radius: 22px;
  border: 1px solid rgba(139, 154, 110, 0.28);
  animation: startup-ring-pulse 2.8s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}

.startup-emblem.is-error .emblem-halo,
.startup-emblem.is-error .emblem-ring {
  animation: none;
  opacity: 0.45;
}

.emblem-badge {
  position: relative;
  z-index: 1;
  width: 58px;
  height: 58px;
  border-radius: 17px;
  display: grid;
  place-items: center;
  background: var(--color-bg-elevated);
  border: 1px solid var(--border-subtle);
  box-shadow: 0 12px 32px -8px rgba(114, 132, 86, 0.28);
}

.startup-copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-2);
}

.startup-wordmark {
  font-size: var(--font-size-title);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.startup-status {
  margin: 0;
  min-height: 1.5em;
  font-size: var(--font-size-body-sm);
  color: var(--text-secondary);
}

.startup-copy--error h1 {
  margin: 0 0 var(--spacing-2);
  font-size: var(--font-size-title);
  color: var(--text-primary);
}

.startup-copy--error p {
  margin: 0;
  font-size: var(--font-size-body-sm);
  color: var(--text-secondary);
}

.startup-progress-track {
  margin-top: var(--spacing-5);
  width: 180px;
  height: 3px;
  border-radius: var(--radius-full);
  background: var(--border-default);
  overflow: hidden;
}

.startup-progress-fill {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  transform-origin: left center;
  background: var(--accent-gradient);
  transition: transform 0.42s cubic-bezier(0.16, 1, 0.3, 1);
}

.startup-retry-btn {
  margin-top: var(--spacing-5);
  padding: var(--spacing-2) var(--spacing-5);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}

.startup-retry-btn:hover {
  border-color: var(--border-accent);
  background: var(--color-bg-tertiary);
}

.startup-retry-btn:focus-visible {
  outline: 2px solid var(--color-zen-sage);
  outline-offset: 2px;
}

.startup-status-fade-enter-active,
.startup-status-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.startup-status-fade-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.startup-status-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@keyframes startup-breathe {
  0%,
  100% {
    transform: scale(0.92);
    opacity: 0.48;
  }
  50% {
    transform: scale(1.06);
    opacity: 0.9;
  }
}

@keyframes startup-ring-pulse {
  0% {
    transform: scale(0.94);
    opacity: 0.55;
  }
  70%,
  100% {
    transform: scale(1.24);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .emblem-halo,
  .emblem-ring {
    animation: none;
  }

  .startup-progress-fill,
  .startup-status-fade-enter-active,
  .startup-status-fade-leave-active {
    transition: none;
  }
}
</style>
