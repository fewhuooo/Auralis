<template>
  <view class="login-page">
    <view class="brand-header">
      <BrandLogo size="88rpx" />
      <text class="brand-title">Auralis</text>
      <text class="brand-subtitle">随身复习、记录与专注</text>
    </view>

    <view class="auth-card">
      <view v-if="mode !== 'reset'" class="auth-toggle">
        <view
          class="toggle-btn"
          :class="{ active: mode === 'login', disabled: pending }"
          @click="show('login')"
        >
          <text>登录</text>
        </view>
        <view
          class="toggle-btn"
          :class="{ active: mode === 'register', disabled: pending }"
          @click="show('register')"
        >
          <text>注册</text>
        </view>
      </view>
      <view v-else class="reset-header">
        <text class="form-heading">重置密码</text>
        <text class="form-desc">通过注册邮箱验证码设置新密码</text>
      </view>

      <view class="form-stack">
        <input
          v-if="mode !== 'reset'"
          class="zen-input"
          v-model="form.username"
          :maxlength="mode === 'login' ? 254 : 64"
          :placeholder="mode === 'login' ? '用户名或邮箱' : '用户名'"
          :disabled="pending"
        />

        <template v-if="mode !== 'login'">
          <input
            class="zen-input"
            v-model="form.email"
            :maxlength="254"
            placeholder="邮箱地址"
            :disabled="pending"
          />
          <view class="code-field">
            <input
              class="code-input"
              v-model="form.emailCode"
              type="number"
              :maxlength="6"
              placeholder="6 位邮箱验证码"
              :disabled="pending"
            />
            <button
              class="code-button"
              :loading="sending"
              :disabled="sendDisabled"
              @click="sendCode"
            >
              {{ sending ? '发送中…' : sendLabel }}
            </button>
          </view>
        </template>

        <input
          class="zen-input"
          v-model="form.password"
          password
          :placeholder="mode === 'reset' ? '新密码（至少 8 位含大小写和符号）' : mode === 'register' ? '密码（至少 8 位含大小写和符号）' : '密码'"
          :disabled="pending"
        />

        <input
          v-if="mode !== 'login'"
          class="zen-input"
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

      <view class="auth-footer">
        <text v-if="mode === 'login'" class="link-btn" @click="show('reset')">忘记密码？</text>
        <text v-else class="link-btn" @click="show('login')">返回登录</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import BrandLogo from '@/components/BrandLogo.vue'
import { useAuthForm } from '@/composables/useAuthForm'

const { mode, form, feedback, pending, submitting, sending, actionLabel, sendLabel, sendDisabled, show, sendCode, submit }
  = useAuthForm('/pages/mobile/home/index')
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 48rpx 36rpx calc(48rpx + env(safe-area-inset-bottom));
  background-color: var(--color-bg-primary);
  box-sizing: border-box;
}

.brand-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 48rpx;
}

.brand-title {
  font-size: 48rpx;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.5rpx;
}

.brand-subtitle {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.auth-card {
  background-color: var(--color-bg-card);
  border-radius: var(--radius-xl);
  padding: 40rpx 36rpx;
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-md);
}

.auth-toggle {
  display: flex;
  background-color: var(--color-bg-primary);
  padding: 8rpx;
  border-radius: 24rpx;
  margin-bottom: 32rpx;
  border: 1px solid var(--border-subtle);
}

.toggle-btn {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  border-radius: 18rpx;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-muted);
  transition: all 0.18s ease;
}

.toggle-btn.active {
  background-color: var(--color-bg-card);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}

.toggle-btn.disabled {
  opacity: 0.6;
}

.reset-header {
  margin-bottom: 28rpx;
}

.form-heading {
  display: block;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin-bottom: 6rpx;
}

.form-desc {
  display: block;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.zen-input,
.code-field {
  height: 92rpx;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 24rpx;
  padding: 0 28rpx;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  box-sizing: border-box;
}

.code-field {
  display: flex;
  align-items: center;
  padding-right: 12rpx;
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
  margin: 0;
  padding: 0 20rpx;
  height: 56rpx;
  line-height: 56rpx;
  background: transparent;
  border: none;
  border-left: 1px solid var(--border-subtle);
  border-radius: 0;
  font-size: 26rpx;
  font-weight: var(--font-weight-semibold);
  color: var(--color-zen-sage);
}

.code-button::after {
  border: none;
}

.code-button[disabled] {
  color: var(--text-muted);
  background: transparent;
}

.auth-feedback {
  display: block;
  margin-top: 20rpx;
  padding: 16rpx 20rpx;
  border-radius: 18rpx;
  background-color: var(--color-sage-bg);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.submit-btn {
  margin-top: 32rpx;
  width: 100%;
  height: 92rpx;
  line-height: 92rpx;
  background: var(--accent-gradient);
  color: var(--text-inverse);
  border-radius: 24rpx;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  border: none;
  box-shadow: 0 8rpx 24rpx rgba(139, 154, 110, 0.28);
}

.submit-btn::after {
  border: none;
}

.submit-btn[disabled] {
  opacity: 0.6;
}

.auth-footer {
  margin-top: 28rpx;
  display: flex;
  justify-content: center;
}

.link-btn {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  padding: 8rpx 16rpx;
}
</style>
