<template>
  <div class="settings-page">
    <div class="page-header">
      <h1 class="page-headline">系统设置</h1>
      <p class="page-subtitle">配置 AI 模型引擎与其他首选项</p>
    </div>

    <div class="settings-section">
      <h2 class="section-title">AI 引擎配置</h2>
      <div class="setting-card">
        <div class="setting-row" style="flex-direction: column; align-items: stretch; gap: 16px; border-bottom: none; padding-bottom: 0; margin-bottom: 0;">
          <div class="setting-info" style="max-width: 100%;">
            <span class="setting-label">自定义模型代理 (可选)</span>
            <span class="setting-desc">您可以提供个人 API Key 及代理地址。配置后，系统内的所有 AI 分析和向量嵌入都将优先走您的自定义代理，彻底避免公共算力排队或限流。</span>
          </div>
          <div class="form-group" style="display: flex; flex-direction: column; gap: 12px; margin-top: 4px;">
            <div class="input-item" style="display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 13px; font-weight: 600; width: 100px; color: var(--text-secondary);">API Key:</span>
              <input type="password" v-model="customApiKey" placeholder="sk-..." class="form-input" style="flex: 1; background: var(--color-bg-primary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 8px 12px; color: var(--text-primary); font-size: 13px;" />
            </div>
            <div class="input-item" style="display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 13px; font-weight: 600; width: 100px; color: var(--text-secondary);">Base URL:</span>
              <input type="text" v-model="customBaseUrl" placeholder="https://api.openai.com/v1" class="form-input" style="flex: 1; background: var(--color-bg-primary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 8px 12px; color: var(--text-primary); font-size: 13px;" />
            </div>
            <div style="display: flex; justify-content: flex-end; margin-top: 8px;">
              <button class="btn-primary" @click="saveCustomAiSettings">保存 AI 配置</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h2 class="section-title">端到端加密 (E2EE)</h2>
      <div class="setting-card">
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">加密状态</span>
            <span class="setting-desc">所有同步数据在离开设备前均使用 AES-256-GCM 加密，服务器无法读取您的内容。</span>
          </div>
          <div class="setting-control" style="display:flex;align-items:center;gap:8px;">
            <span :class="['status-dot', e2eeEnabled ? 'active' : 'inactive']"></span>
            <span style="font-size:13px;font-weight:600;" :style="{ color: e2eeEnabled ? '#22c55e' : 'var(--text-muted)' }">
              {{ e2eeEnabled ? '已启用' : '未启用' }}
            </span>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">备份密钥</span>
            <span class="setting-desc">导出加密密钥备份文件，在新设备上恢复时需要此文件与备份密码。</span>
          </div>
          <div class="setting-control">
            <button class="btn-primary" :disabled="!e2eeEnabled || backupLoading" @click="handleBackup">
              {{ backupLoading ? '导出中...' : '备份密钥' }}
            </button>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">恢复密钥</span>
            <span class="setting-desc">从备份文件恢复加密密钥。恢复后需重新同步以解密远端数据。</span>
          </div>
          <div class="setting-control">
            <button class="btn-primary" :disabled="restoreLoading" @click="handleRestore">
              {{ restoreLoading ? '恢复中...' : '恢复密钥' }}
            </button>
          </div>
        </div>

        <p v-if="msg" :class="['msg', msgType]">{{ msg }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { e2ee } from '@/api/e2ee'

const e2eeEnabled = ref(false)
const backupLoading = ref(false)
const restoreLoading = ref(false)
const msg = ref('')
const msgType = ref<'success' | 'error'>('success')

const customApiKey = ref('')
const customBaseUrl = ref('')

const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
  msg.value = text
  msgType.value = type
  setTimeout(() => { msg.value = '' }, 4000)
}

onMounted(async () => {
  e2eeEnabled.value = await e2ee.isEnabled()
  customApiKey.value = localStorage.getItem('studycore_custom_api_key') || ''
  customBaseUrl.value = localStorage.getItem('studycore_custom_base_url') || ''
})

const saveCustomAiSettings = () => {
  localStorage.setItem('studycore_custom_api_key', customApiKey.value.trim())
  localStorage.setItem('studycore_custom_base_url', customBaseUrl.value.trim())
  showMsg('AI 引擎自定义代理配置已保存！')
}

const handleBackup = async () => {
  const passphrase = prompt('请输入备份密码（恢复时需要此密码）：')
  if (!passphrase || passphrase.length < 6) {
    showMsg('密码长度至少 6 位', 'error')
    return
  }
  const confirmPass = prompt('请再次输入密码确认：')
  if (passphrase !== confirmPass) {
    showMsg('两次密码不一致', 'error')
    return
  }

  backupLoading.value = true
  try {
    const bundle = await e2ee.exportKeyBundle(passphrase)
    const json = JSON.stringify(bundle, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `studycore-e2ee-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    showMsg('密钥备份文件已下载，请妥善保管。')
  } catch (e: any) {
    showMsg('备份失败: ' + (e.message || e), 'error')
  } finally {
    backupLoading.value = false
  }
}

const handleRestore = async () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return

    const passphrase = prompt('请输入备份时的密码：')
    if (!passphrase) return

    restoreLoading.value = true
    try {
      const text = await file.text()
      const bundle = JSON.parse(text)
      if (!bundle.encrypted_key || !bundle.salt) {
        throw new Error('无效的备份文件格式')
      }
      await e2ee.importKeyBundle(bundle, passphrase)
      e2eeEnabled.value = true
      showMsg('密钥恢复成功！请触发一次同步以解密远端数据。')
    } catch (e: any) {
      const detail = e.message || String(e)
      if (detail.includes('Decryption failed') || detail.includes('Wrong passphrase')) {
        showMsg('密码错误或备份文件已损坏', 'error')
      } else {
        showMsg('恢复失败: ' + detail, 'error')
      }
    } finally {
      restoreLoading.value = false
    }
  }
  input.click()
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
  display: flex;
  justify-content: flex-end;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.active {
  background: #22c55e;
  box-shadow: 0 0 6px #22c55e88;
}

.status-dot.inactive {
  background: var(--text-muted);
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

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: var(--accent-glow);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.msg {
  font-size: 13px;
  font-weight: 600;
  animation: fadeIn 0.3s;
  margin: 0;
}

.msg.success { color: #22c55e; }
.msg.error { color: #ef4444; }

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
