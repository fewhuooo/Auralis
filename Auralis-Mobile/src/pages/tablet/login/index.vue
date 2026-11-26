<template>
  <view class="login-page">
    <view class="login-wrapper">
      <view class="brand-side">
        <view class="brand-grid" aria-hidden="true"></view>
        <view class="brand-orbit brand-orbit--outer" aria-hidden="true"></view>
        <view class="brand-orbit brand-orbit--inner" aria-hidden="true"></view>
        <view class="brand-top">
          <BrandLogo size="36px" />
        </view>
        <view class="brand-content">
          <text class="brand-wordmark">AURALIS</text>
        </view>
        <view class="side-shape" aria-hidden="true"></view>
      </view>

      <view class="form-side">
        <view class="login-box">
          <view class="compact-brand">
            <BrandLogo size="30px" />
            <text class="compact-wordmark">AURALIS</text>
          </view>

          <view v-if="mode !== 'reset'" class="ui-segmented auth-toggle" role="tablist">
            <view
              class="ui-seg-item"
              :class="{ active: mode === 'login', 'is-disabled': pending }"
              role="tab"
              :aria-selected="mode === 'login'"
              @click="show('login')"
            >
              <text>登录</text>
            </view>
            <view
              class="ui-seg-item"
              :class="{ active: mode === 'register', 'is-disabled': pending }"
              role="tab"
              :aria-selected="mode === 'register'"
              @click="show('register')"
            >
              <text>注册</text>
            </view>
          </view>
          <view v-else class="reset-header">
            <view class="ui-icon-btn" role="button" aria-label="返回登录" @click="show('login')">
              <LineIcon name="back" size="16px" color="var(--text-primary)" />
            </view>
            <text class="form-title">重置密码</text>
          </view>

          <view class="form-stack">
            <input
              v-if="mode !== 'reset'"
              class="ui-input"
              v-model="form.username"
              :maxlength="mode === 'login' ? 254 : 64"
              :placeholder="mode === 'login' ? '用户名或邮箱' : '用户名'"
              :disabled="pending"
              @confirm="submit"
            />

            <template v-if="mode !== 'login'">
              <input
                class="ui-input"
                v-model="form.email"
                :maxlength="254"
                placeholder="邮箱"
                :disabled="pending"
                @confirm="submit"
              />
              <view class="code-field">
                <input
                  class="code-input"
                  v-model="form.emailCode"
                  type="number"
                  :maxlength="6"
                  placeholder="验证码"
                  :disabled="pending"
                  @confirm="submit"
                />
                <button
                  class="code-button"
                  :loading="sending"
                  :disabled="sendDisabled"
                  @click="sendCode"
                >
                  {{ sending ? '发送中' : sendLabel }}
                </button>
              </view>
            </template>

            <input
              class="ui-input"
              v-model="form.password"
              password
              :placeholder="mode === 'login' ? '密码' : mode === 'reset' ? '新密码' : '设置密码'"
              :disabled="pending"
              @confirm="submit"
            />

            <input
              v-if="mode !== 'login'"
              class="ui-input"
              v-model="form.confirmPassword"
              password
              placeholder="确认密码"
              :disabled="pending"
              @confirm="submit"
            />
          </view>

          <text v-if="feedback" class="auth-feedback" aria-live="polite">{{ feedback }}</text>

          <button class="submit-btn ui-btn ui-btn-primary" role="button" :loading="submitting" :disabled="pending" @click="submit">
            {{ actionLabel }}
          </button>

          <view v-if="mode === 'login'" class="footer-links">
            <text class="footer-link" role="button" @click="show('reset')">忘记密码</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import BrandLogo from '@/components/BrandLogo.vue'
import LineIcon from '@/components/LineIcon.vue'
import { useAuthForm } from '@/composables/useAuthForm'
import { onPageShow } from '@/platform/lifecycle'
import { reLaunch } from '@/platform/navigation'
import { useAuthStore } from '@/store/useAuthStore'

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
  padding: 20px;
  background:
    radial-gradient(88% 42% at 88% 8%, rgba(139, 154, 110, 0.13) 0%, transparent 66%),
    radial-gradient(76% 40% at 10% 72%, rgba(200, 155, 109, 0.10) 0%, transparent 64%),
    linear-gradient(180deg, #F6F2EA 0%, #EFEBE2 100%);
  box-sizing: border-box;
}

.login-wrapper {
  display: flex;
  width: 100%;
  max-width: 880px;
  min-height: 540px;
  background-color: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-radius: 28px;
  overflow: hidden;
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  animation: uiModalIn 0.36s var(--ease-out) both;
}

.brand-side {
  width: 360px;
  background: linear-gradient(155deg, #F7F2EB 0%, #EFE8DC 100%);
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 44px 44px 48px;
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
  font-size: 46px;
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
  align-items: center;
  justify-content: center;
  padding: 36px 40px;
  background-color: var(--color-bg-primary);
  box-sizing: border-box;
}

.login-box {
  width: 100%;
  max-width: 320px;
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
  margin-bottom: 24px;
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

/* #ifdef H5 */
.code-field:focus-within {
  border-color: var(--color-zen-sage);
  background-color: #FFFFFF;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.16);
}
/* #endif */

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

.footer-link:hover {
  color: var(--text-primary);
}

/* #ifdef H5 */
.login-page {
  min-height: 100dvh;
}
/* #endif */

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
