<template>
  <view class="login-page">
    <view class="login-wrapper">
      <view class="brand-side">
        <view class="brand-ring ring-outer"></view>
        <view class="brand-ring ring-inner"></view>
        <view class="brand-glow"></view>
        <view class="brand-content">
          <BrandLogo size="46px" />
          <text class="brand-title">Auralis</text>
        </view>
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

          <button class="ui-btn ui-btn-primary submit-btn" :loading="submitting" :disabled="pending" @click="submit">
            {{ actionLabel }}
          </button>

          <view v-if="mode === 'login'" class="footer-links">
            <text class="footer-link" @click="show('reset')">忘记密码</text>
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
  padding: 24px;
  background-color: var(--color-bg-page);
  box-sizing: border-box;
}

.login-wrapper {
  display: flex;
  width: 100%;
  max-width: 860px;
  min-height: 500px;
  background-color: var(--color-bg-card);
  border-radius: 28px;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-lg);
}

.brand-side {
  width: 44%;
  background-color: var(--color-bg-primary);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--border-subtle);
  overflow: hidden;
  box-sizing: border-box;
}

.brand-ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(139, 154, 110, 0.22);
  pointer-events: none;
}

.ring-outer {
  width: 340px;
  height: 340px;
}

.ring-inner {
  width: 220px;
  height: 220px;
  border-color: rgba(139, 154, 110, 0.34);
}

.brand-glow {
  position: absolute;
  width: 260px;
  height: 260px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(139, 154, 110, 0.16) 0%, transparent 72%);
  pointer-events: none;
}

.brand-content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.brand-title {
  font-size: 30px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.03em;
  line-height: 1;
}

.form-side {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 44px;
  background-color: var(--color-bg-card);
  box-sizing: border-box;
}

.login-box {
  width: 100%;
  max-width: 340px;
}

.auth-toggle {
  margin-bottom: 20px;
}

.ui-seg-item.is-disabled {
  opacity: 0.5;
  pointer-events: none;
}

.reset-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
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
  height: 44px;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
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
  height: 30px;
  line-height: 30px;
  background: transparent;
  border-left: 1px solid var(--border-subtle);
  border-radius: 0;
  font-size: 12.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-sage-dark);
  cursor: pointer;
}

.code-button[disabled] {
  color: var(--text-muted);
}

.auth-feedback {
  display: block;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background-color: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.submit-btn {
  margin-top: 20px;
  width: 100%;
  height: 44px;
  font-size: 14.5px;
}

.footer-links {
  margin-top: 14px;
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
