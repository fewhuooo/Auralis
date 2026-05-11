<template>
  <div class="settings-page">
    <div class="page-header">
      <h1 class="page-headline">系统设置</h1>
      <p class="page-subtitle">配置 AI 模型引擎与其他首选项</p>
    </div>

    <div class="settings-section">
      <h2 class="section-title">AI 引擎配置</h2>
      <div class="setting-card">
        <p style="color: var(--text-secondary); font-size: 13px;">AI 引擎相关配置（如 API Key 和 模型）已统一迁移至后端管理。</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
// Config is now managed in backend
const saveAiConfig = () => {
  saveSuccess.value = true
  setTimeout(() => saveSuccess.value = false, 2000)
}
</script>

<style scoped>
.settings-page {
  max-width: 860px;
  margin: 0 auto;
  padding: 28px 40px;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

.page-header {
  margin-bottom: 32px;
}

.page-headline {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.3px;
  margin-bottom: 4px;
}

.page-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
}

.settings-section {
  margin-bottom: 36px;
}

.section-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 16px;
}

.setting-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 20px 24px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 20px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.setting-row:last-of-type {
  border-bottom: none;
  padding-bottom: 0;
  margin-bottom: 24px;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 60%;
}

.setting-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.setting-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

.setting-control {
  width: 260px;
}

.control-input, .control-select {
  width: 100%;
  padding: 8px 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: all var(--transition-fast);
}

.control-input:focus, .control-select:focus {
  border-color: var(--border-accent);
}

.control-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.setting-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 20px;
  border-top: 1px solid var(--border-subtle);
}

.btn-primary {
  background: var(--accent-gradient);
  color: white;
  border: none;
  padding: 8px 24px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: var(--accent-glow);
}

.success-msg {
  color: #22c55e;
  font-size: 13px;
  font-weight: 600;
  animation: fadeIn 0.3s;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
