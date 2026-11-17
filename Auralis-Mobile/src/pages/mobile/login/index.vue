<template>
  <view class="login-viewport">
    <view class="login-page">
      <view class="side-shape"></view>

      <view class="login-inner">
        <view class="brand-header">
          <BrandLogo size="32px" />
          <text class="brand-title">AURALIS</text>
        </view>

        <view v-if="mode !== 'reset'" class="ui-segmented mode-switch">
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
          <text class="form-heading">重置密码</text>
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

        <view v-if="mode === 'login'" class="auth-footer">
          <text class="link-btn" @click="show('reset')">忘记密码？</text>
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
  = useAuthForm('/pages/mobile/home/index')
</script>

<style scoped>
.login-viewport {
  min-height: 100vh;
  background-color: var(--color-bg-secondary);
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
  background-color: var(--color-bg-primary);
  overflow: hidden;
  box-sizing: border-box;
}

.side-shape {
  position: absolute;
  bottom: -60px;
  right: -60px;
  width: 200px;
  height: 200px;
  background-color: var(--color-zen-sage);
  border-radius: 50%;
  filter: blur(45px);
  opacity: 0.28;
  pointer-events: none;
}

.login-inner {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 340px;
  margin: 0 auto;
}

.brand-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 28px;
}

.brand-title {
  font-size: 28px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -1.5px;
  line-height: 1;
}

.mode-switch {
  margin-bottom: 22px;
}

.ui-seg-item.is-disabled {
  opacity: 0.5;
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
}

.submit-btn[disabled] {
  opacity: 0.5;
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

/* #ifdef H5 */
.login-viewport,
.login-page {
  min-height: 100dvh;
}

@media (min-width: 540px) {
  .login-page {
    border-left: 1px solid var(--border-subtle);
    border-right: 1px solid var(--border-subtle);
    box-shadow: 0 0 40px rgba(0, 0, 0, 0.04);
  }
}
/* #endif */
</style>
