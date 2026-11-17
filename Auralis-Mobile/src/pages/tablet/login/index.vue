<template>
  <view class="login-page">
    <view class="login-wrapper">
      <view class="brand-side">
        <view class="brand-content">
          <BrandLogo size="32px" />
          <text class="brand-vertical-text">AURALIS</text>
        </view>
        <view class="side-shape"></view>
      </view>

      <view class="form-side">
        <view class="login-box">
          <view v-if="mode !== 'reset'" class="ui-segmented auth-toggle">
            <view
              class="ui-seg-item"
              :class="{ active: mode === 'login', 'is-disabled': pending }"
              @click="show('login')"
            >
              <text>登录</text>
            </view>
            <view
              class="ui-seg-item"
              :class="{ active: mode === 'register', 'is-disabled': pending }"
              @click="show('register')"
            >
              <text>注册</text>
            </view>
          </view>
          <view v-else class="reset-header">
            <view class="ui-icon-btn" @click="show('login')">
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
            />

            <template v-if="mode !== 'login'">
              <input
                class="ui-input"
                v-model="form.email"
                :maxlength="254"
                placeholder="邮箱"
                :disabled="pending"
              />
              <view class="code-field">
                <input
                  class="code-input"
                  v-model="form.emailCode"
                  type="number"
                  :maxlength="6"
                  placeholder="验证码"
                  :disabled="pending"
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
              :placeholder="mode === 'login' ? '密码' : '8+位含大小写及符号'"
              :disabled="pending"
            />

            <input
              v-if="mode !== 'login'"
              class="ui-input"
              v-model="form.confirmPassword"
              password
              placeholder="确认密码"
              :disabled="pending"
            />
          </view>

          <text v-if="feedback" class="auth-feedback" aria-live="polite">{{ feedback }}</text>

          <button class="submit-btn" :loading="submitting" :disabled="pending" @click="submit">
            {{ actionLabel }}
          </button>

          <view v-if="mode === 'login'" class="footer-links">
            <text class="footer-link" @click="show('reset')">忘记密码？</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import BrandLogo from '@/components/BrandLogo.vue'
import LineIcon from '@/components/LineIcon.vue'
import { useAuthForm } from '@/composables/useAuthForm'

const { mode, form, feedback, pending, submitting, sending, actionLabel, sendLabel, sendDisabled, show, sendCode, submit }
  = useAuthForm('/pages/tablet/dashboard/index')
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background-color: var(--color-bg-secondary);
  box-sizing: border-box;
}

.login-wrapper {
  display: flex;
  width: 100%;
  max-width: 880px;
  min-height: 540px;
  background-color: var(--color-bg-primary);
  border-radius: 32px;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.04);
}

.brand-side {
  width: 350px;
  background-color: var(--color-bg-primary);
  position: relative;
  display: flex;
  align-items: center;
  padding: 52px;
  border-right: 1px solid var(--border-subtle);
  overflow: hidden;
  box-sizing: border-box;
  flex-shrink: 0;
}

.brand-content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 28px;
}

.brand-vertical-text {
  font-size: 44px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
  letter-spacing: -2px;
  opacity: 0.9;
}

.side-shape {
  position: absolute;
  bottom: -50px;
  right: -50px;
  width: 200px;
  height: 200px;
  background-color: var(--color-zen-sage);
  border-radius: 50%;
  filter: blur(40px);
  opacity: 0.35;
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

.auth-toggle {
  margin-bottom: 24px;
}

.ui-seg-item.is-disabled {
  opacity: 0.5;
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
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.code-field {
  height: 42px;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 0 6px 0 14px;
  display: flex;
  align-items: center;
  box-sizing: border-box;
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
  background: transparent;
  border-left: 1px solid var(--border-subtle);
  border-radius: 0;
  font-size: 12.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  cursor: pointer;
}

.code-button[disabled] {
  color: var(--text-muted);
}

.auth-feedback {
  display: block;
  margin-top: 12px;
  padding: 9px 12px;
  border-radius: 8px;
  background-color: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.submit-btn {
  margin-top: 20px;
  width: 100%;
  height: 44px;
  background-color: var(--color-zen-sage);
  color: #FFFFFF;
  border-radius: 12px;
  font-size: 14px;
  font-weight: var(--font-weight-semibold);
  letter-spacing: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(110, 128, 82, 0.25);
  transition: transform 0.18s var(--ease-out), filter 0.18s ease, box-shadow 0.18s ease;
}

.submit-btn:active {
  transform: scale(0.98);
}

.submit-btn[disabled] {
  opacity: 0.5;
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

  .form-side {
    padding: 32px 24px;
  }
}
</style>
