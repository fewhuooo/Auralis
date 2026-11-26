<template>
  <div class="login-viewport">
    <div class="login-page">
      <div class="side-shape" aria-hidden="true"></div>

      <div class="login-inner">
        <div class="brand-header">
          <BrandLogo size="32px" />
          <span class="brand-title">AURALIS</span>
        </div>

        <div v-if="mode !== 'reset'" class="ui-segmented mode-switch" role="tablist">
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
          <span class="form-heading">重置密码</span>
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

        <button type="button" class="submit-btn" :class="{ 'is-loading': submitting }" role="button" :disabled="pending" @click="submit">
          {{ actionLabel }}
        </button>

        <div v-if="mode === 'login'" class="auth-footer">
          <span class="link-btn" role="button" @click="show('reset')">忘记密码</span>
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
  = useAuthForm('/pages/mobile/home/index')

function redirectIfAuthenticated() {
  if (authStore.isAuthenticated) {
    reLaunch('/pages/mobile/home/index')
  }
}

onMounted(redirectIfAuthenticated)
onPageShow(redirectIfAuthenticated)
</script>

<style scoped>
.login-viewport {
  min-height: 100vh;
  background:
    radial-gradient(88% 42% at 88% 8%, rgba(139, 154, 110, 0.13) 0%, transparent 66%),
    radial-gradient(76% 40% at 10% 72%, rgba(200, 155, 109, 0.10) 0%, transparent 64%),
    linear-gradient(180deg, #F6F2EA 0%, #EFEBE2 100%);
  display: flex;
  justify-content: center;
}

.login-page {
  position: relative;
  width: 100%;
  max-width: 440px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 28px 24px calc(28px + env(safe-area-inset-bottom));
  background-color: transparent;
  overflow: hidden;
  box-sizing: border-box;
}

.side-shape {
  position: absolute;
  bottom: -70px;
  right: -70px;
  width: 240px;
  height: 240px;
  background: radial-gradient(circle, rgba(139, 154, 110, 0.34) 0%, transparent 72%);
  border-radius: 50%;
  pointer-events: none;
}

.login-inner {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 340px;
  margin: 0 auto;
  animation: uiFadeUp 0.36s var(--ease-out) both;
}

.brand-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 32px;
}

.brand-title {
  font-size: 28px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.045em;
  line-height: 1;
}

.mode-switch {
  margin-bottom: 22px;
}

.ui-seg-item.is-disabled {
  opacity: 0.48;
  pointer-events: none;
}

.reset-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 22px;
}

.form-heading {
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
  height: 44px;
  line-height: 44px;
  background: var(--accent-gradient);
  color: #FFFFFF;
  border-radius: 12px;
  font-size: 14.5px;
  font-weight: var(--font-weight-semibold);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(110, 128, 82, 0.26);
  transition: transform 0.16s var(--ease-out), box-shadow 0.18s ease;
}

.submit-btn:active {
  transform: scale(0.98);
}

.submit-btn[disabled] {
  opacity: 0.48;
}

.auth-footer {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}

.link-btn {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  padding: 4px 10px;
  cursor: pointer;
}

.login-viewport,
.login-page {
  min-height: 100dvh;
}

@media (min-width: 540px) {
  .login-page {
    background-color: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border-left: 1px solid var(--glass-border);
    border-right: 1px solid var(--glass-border);
    box-shadow: 0 0 0 1px rgba(45, 55, 40, 0.05), 0 0 40px rgba(45, 55, 40, 0.045);
  }
}
</style>
