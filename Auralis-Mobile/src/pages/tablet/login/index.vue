<template>
  <div class="login-page">
    <div class="login-wrapper">
      <div class="brand-side">
        <div class="brand-grid" aria-hidden="true"></div>
        <div class="brand-orbit brand-orbit--outer" aria-hidden="true"></div>
        <div class="brand-orbit brand-orbit--inner" aria-hidden="true"></div>
        <div class="brand-top">
          <BrandLogo size="36px" />
        </div>
        <div class="brand-content">
          <span class="brand-wordmark">AURALIS</span>
        </div>
        <div class="side-shape" aria-hidden="true"></div>
      </div>

      <div class="form-side">
        <div class="login-box">
          <div class="compact-brand">
            <BrandLogo size="30px" />
            <span class="compact-wordmark">AURALIS</span>
          </div>

          <div v-if="mode !== 'reset'" class="ui-segmented auth-toggle" role="tablist">
            <div
              class="auth-seg-thumb"
              :class="{ 'is-register': mode === 'register' }"
              aria-hidden="true"
            ></div>
            <div
              class="ui-seg-item"
              :class="{ active: mode === 'login', 'is-disabled': pending }"
              role="tab"
              :aria-selected="mode === 'login'"
              @click="show('login')"
            >
              <span>登录</span>
            </div>
            <div
              class="ui-seg-item"
              :class="{ active: mode === 'register', 'is-disabled': pending }"
              role="tab"
              :aria-selected="mode === 'register'"
              @click="show('register')"
            >
              <span>注册</span>
            </div>
          </div>
          <div v-else class="reset-header">
            <div class="ui-icon-btn" role="button" aria-label="返回登录" @click="show('login')">
              <LineIcon name="back" size="16px" color="var(--text-primary)" />
            </div>
            <span class="form-title">重置密码</span>
          </div>

          <div class="form-stack">
            <input
              v-if="mode !== 'reset'"
              class="ui-input"
              v-model="form.username"
              :maxlength="mode === 'login' ? 254 : 64"
              :placeholder="mode === 'login' ? '用户名或邮箱' : '用户名'"
              :disabled="pending"
              @keydown="handleEnterKey($event, submit)"
            />

            <template v-if="mode !== 'login'">
              <input
                class="ui-input"
                v-model="form.email"
                :maxlength="254"
                placeholder="邮箱"
                :disabled="pending"
                @keydown="handleEnterKey($event, submit)"
              />
              <div class="code-field">
                <input
                  class="code-input"
                  v-model="form.emailCode"
                  type="text"
                  inputmode="numeric"
                  maxlength="6"
                  placeholder="验证码"
                  :disabled="pending"
                  @keydown="handleEnterKey($event, submit)"
                />
                <button
                  type="button"
                  class="code-button"
                  :class="{ 'is-loading': sending }"
                  :disabled="sendDisabled"
                  @click="sendCode"
                >
                  {{ sending ? '发送中' : sendLabel }}
                </button>
              </div>
            </template>

            <input
              class="ui-input"
              v-model="form.password"
              type="password"
              :placeholder="mode === 'login' ? '密码' : mode === 'reset' ? '新密码' : '设置密码'"
              :disabled="pending"
              @keydown="handleEnterKey($event, submit)"
            />

            <input
              v-if="mode !== 'login'"
              class="ui-input"
              v-model="form.confirmPassword"
              type="password"
              placeholder="确认密码"
              :disabled="pending"
              @keydown="handleEnterKey($event, submit)"
            />
          </div>

          <span v-if="feedback" class="auth-feedback" aria-live="polite">{{ feedback }}</span>

          <button type="button" class="submit-btn ui-btn ui-btn-primary" :class="{ 'is-loading': submitting }" role="button" :disabled="pending" @click="submit">
            {{ actionLabel }}
          </button>

          <div v-if="mode === 'login'" class="footer-links">
            <span class="footer-link" role="button" @click="show('reset')">忘记密码</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import BrandLogo from '@/components/BrandLogo.vue'
import LineIcon from '@/components/LineIcon.vue'
import { useAuthForm } from '@/composables/useAuthForm'
import { onPageShow } from '@/platform/lifecycle'
import { reLaunch } from '@/platform/navigation'
import { useAuthStore } from '@/store/useAuthStore'
import { handleEnterKey } from '@/utils/domHelpers'

const authStore = useAuthStore()
const { mode, form, feedback, pending, submitting, sending, actionLabel, sendLabel, sendDisabled, show, sendCode, submit }
  = useAuthForm('/pages/tablet/dashboard/index')

function redirectIfAuthenticated() {
  if (authStore.isAuthenticated) {
    reLaunch('/pages/tablet/dashboard/index')
  }
}

onMounted(redirectIfAuthenticated)
onPageShow(redirectIfAuthenticated)
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(14px, 2.4vh, 28px) clamp(16px, 2.5vw, 32px);
  background:
    radial-gradient(88% 42% at 88% 8%, rgba(139, 154, 110, 0.13) 0%, transparent 66%),
    radial-gradient(76% 40% at 10% 72%, rgba(200, 155, 109, 0.10) 0%, transparent 64%),
    linear-gradient(180deg, #F6F2EA 0%, #EFEBE2 100%);
  box-sizing: border-box;
}

.login-wrapper {
  display: flex;
  width: min(720px, 76vw, calc(100vw - 32px));
  min-height: min(420px, calc(100vh - 48px));
  max-height: calc(100vh - 28px);
  background-color: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-radius: 22px;
  overflow: hidden;
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  animation: uiModalIn 0.36s var(--ease-out) both;
}

.brand-side {
  width: clamp(220px, 38%, 300px);
  background: linear-gradient(155deg, #F7F2EB 0%, #EFE8DC 100%);
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: clamp(20px, 3.2vh, 34px) clamp(20px, 2.6vw, 34px);
  border-right: 1px solid var(--border-subtle);
  overflow: hidden;
  box-sizing: border-box;
  flex-shrink: 0;
}

.brand-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, rgba(28, 28, 26, 0.03) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(28, 28, 26, 0.03) 1px, transparent 1px);
  background-size: 48px 48px;
  pointer-events: none;
}

.brand-orbit {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(139, 154, 110, 0.16);
  pointer-events: none;
}

.brand-orbit--outer {
  width: 360px;
  height: 360px;
  top: -120px;
  right: -110px;
}

.brand-orbit--inner {
  width: 220px;
  height: 220px;
  top: -50px;
  right: -40px;
  border-color: rgba(139, 154, 110, 0.24);
}

.brand-top,
.brand-content {
  position: relative;
  z-index: 2;
}

.brand-wordmark {
  font-size: clamp(28px, 3vw, 36px);
  font-weight: 800;
  color: var(--text-primary);
  line-height: 0.95;
  letter-spacing: -0.045em;
}

.side-shape {
  position: absolute;
  bottom: -80px;
  right: -80px;
  width: 260px;
  height: 260px;
  background: radial-gradient(circle, rgba(139, 154, 110, 0.34) 0%, transparent 72%);
  border-radius: 50%;
  pointer-events: none;
}

.form-side {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: clamp(18px, 3vh, 28px) clamp(20px, 2.8vw, 32px);
  background-color: var(--color-bg-primary);
  overflow-y: auto;
  box-sizing: border-box;
}

.login-box {
  width: 100%;
  max-width: 280px;
  margin: auto 0;
}

.compact-brand {
  display: none;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
}

.compact-wordmark {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.04em;
  line-height: 1;
}

.auth-toggle {
  position: relative;
  margin-bottom: 24px;
}

.auth-seg-thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc((100% - 9px) / 2);
  border-radius: 9px;
  background: var(--accent-gradient);
  border: 1px solid rgba(255, 255, 255, 0.28);
  box-shadow: 0 2px 10px rgba(118, 135, 88, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.26);
  box-sizing: border-box;
  pointer-events: none;
  z-index: 0;
  transition: transform 0.24s var(--ease-spring);
}

.auth-seg-thumb.is-register {
  transform: translateX(calc(100% + 3px));
}

.auth-toggle .ui-seg-item {
  position: relative;
  z-index: 1;
}

.auth-toggle .ui-seg-item.active {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
  color: #FFFFFF;
}

.ui-seg-item.is-disabled {
  opacity: 0.48;
  pointer-events: none;
}

.reset-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.form-title {
  font-size: 20px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.code-field {
  height: 42px;
  background-color: var(--glass-sub-bg);
  backdrop-filter: var(--glass-blur-soft);
  -webkit-backdrop-filter: var(--glass-blur-soft);
  border: 1px solid var(--glass-border-subtle);
  box-shadow: var(--glass-shadow-subtle);
  border-radius: 12px;
  padding: 0 6px 0 14px;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  transition: border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;
}

.code-field:focus-within {
  border-color: var(--color-zen-sage);
  background-color: #FFFFFF;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.16);
}

.code-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  background: transparent;
}

.code-button {
  flex-shrink: 0;
  padding: 0 12px;
  height: 28px;
  line-height: 28px;
  margin: 0;
  background: transparent;
  border-left: 1px solid var(--border-subtle);
  border-radius: 0;
  font-size: 12.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.14s ease, transform 0.14s var(--ease-out);
}

.code-button:active:not([disabled]) {
  opacity: 0.72;
  transform: scale(0.95);
}

.code-button[disabled] {
  color: var(--text-muted);
}

.auth-feedback {
  display: block;
  margin-top: 12px;
  padding: 9px 12px;
  border-radius: 10px;
  background-color: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.submit-btn {
  margin: 20px 0 0;
  padding: 0;
  width: 100%;
  height: 38px;
  line-height: 38px;
  background: var(--accent-gradient);
  color: #FFFFFF;
  border-radius: 12px;
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(110, 128, 82, 0.26);
  cursor: pointer;
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s ease;
}

.submit-btn:hover:not([disabled]) {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(110, 128, 82, 0.34);
}

.submit-btn:active {
  transform: scale(0.98);
}

.submit-btn[disabled] {
  opacity: 0.48;
}

.footer-links {
  margin-top: 16px;
  text-align: center;
}

.footer-link {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 10px;
  transition: color 0.16s ease;
}

.footer-link:hover,
.footer-link:active {
  color: var(--text-primary);
}

.footer-link:active {
  opacity: 0.75;
}

.login-page {
  min-height: 100dvh;
}

.login-wrapper {
  min-height: min(420px, calc(100dvh - 48px));
  max-height: calc(100dvh - 28px);
}

@media (max-height: 640px) {
  .auth-toggle,
  .reset-header {
    margin-bottom: 16px;
  }

  .form-stack {
    gap: 10px;
  }

  .submit-btn {
    margin-top: 14px;
    height: 38px;
    line-height: 38px;
  }

  .footer-links {
    margin-top: 12px;
  }
}

@media (max-width: 760px) {
  .brand-side {
    display: none;
  }

  .compact-brand {
    display: flex;
  }

  .form-side {
    padding: 32px 24px;
  }
}
</style>
