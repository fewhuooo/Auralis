<template>
  <view class="login-container">
    <view class="logo-area">
      <text class="title">Auralis</text>
      <text class="subtitle">跨平台智能生产力中枢 · 平板端</text>
    </view>

    <view class="form-area">
      <text class="form-heading">{{ actionLabel }}</text>
      <input
        v-if="mode !== 'reset'"
        class="input-box"
        v-model="form.username"
        :maxlength="mode === 'login' ? 254 : 64"
        :placeholder="mode === 'login' ? '用户名或邮箱' : '用户名'"
        :disabled="pending"
      />
      <template v-if="mode !== 'login'">
        <input class="input-box" v-model="form.email" :maxlength="254" placeholder="邮箱" :disabled="pending" />
        <view class="code-row">
          <input class="input-box code-input" v-model="form.emailCode" type="number" :maxlength="6" placeholder="邮箱验证码" :disabled="pending" />
          <button class="code-button" :loading="sending" :disabled="sendDisabled" @click="sendCode">{{ sendLabel }}</button>
        </view>
      </template>
      <input class="input-box" v-model="form.password" password :placeholder="mode === 'reset' ? '新密码' : '密码'" :disabled="pending" />
      <input v-if="mode !== 'login'" class="input-box" v-model="form.confirmPassword" password placeholder="确认密码" :disabled="pending" />
      <text v-if="feedback" class="auth-feedback" aria-live="polite">{{ feedback }}</text>

      <button class="submit-btn" :loading="submitting" :disabled="pending" @click="submit">{{ actionLabel }}</button>

      <view class="auth-actions">
        <button v-if="mode === 'login'" class="switch-mode" :disabled="pending" @click="show('register')">创建账号</button>
        <button v-if="mode === 'login'" class="switch-mode" :disabled="pending" @click="show('reset')">忘记密码？</button>
        <button v-else class="switch-mode" :disabled="pending" @click="show('login')">返回登录</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { useAuthForm } from '@/composables/useAuthForm'

const { mode, form, feedback, pending, submitting, sending, actionLabel, sendLabel, sendDisabled, show, sendCode, submit }
  = useAuthForm('/pages/tablet/dashboard/index')
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 40rpx;
  background-color: var(--color-zen-ivory, #F9F9F7);
}

.logo-area {
  text-align: center;
  margin-bottom: 48rpx;
}

.title {
  font-size: 56rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  display: block;
  margin-bottom: 16rpx;
  letter-spacing: -1rpx;
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}

.subtitle {
  font-size: 28rpx;
  color: var(--color-zen-stone, #A8A8A5);
  font-weight: 600;
}

.form-area {
  background: var(--color-zen-white, #FFFFFF);
  padding: 60rpx;
  border-radius: 40rpx;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.04);
  width: 100%;
  max-width: 560rpx;
  box-sizing: border-box;
}

.input-box {
  height: 96rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 24rpx;
  padding: 0 32rpx;
  margin-bottom: 32rpx;
  font-size: 30rpx;
  color: var(--color-zen-graphite, #1C1C1A);
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
  transition: all 0.2s;
  box-sizing: border-box;
}

.input-box:focus {
  border-color: var(--color-zen-graphite, #1C1C1A);
  background: var(--color-zen-white, #FFFFFF);
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.04);
}

.form-heading,
.auth-feedback {
  display: block;
  margin-bottom: 12px;
}

.form-heading {
  color: var(--text-primary);
  font-weight: 700;
}

.auth-feedback {
  color: var(--text-secondary);
  line-height: 1.5;
}

.code-row,
.auth-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.code-input {
  flex: 1;
  min-width: 0;
}

.code-button {
  margin: 0;
  flex-shrink: 0;
  white-space: nowrap;
  font-size: 14px;
}

.auth-actions {
  justify-content: center;
  flex-wrap: wrap;
}

.auth-actions .switch-mode {
  border: none;
  background: transparent;
}

.auth-actions .switch-mode::after {
  border: none;
}

.submit-btn {
  background: var(--color-zen-graphite, #1C1C1A);
  color: var(--color-zen-white, #FFFFFF);
  border-radius: 999rpx;
  height: 96rpx;
  line-height: 96rpx;
  margin-top: 32rpx;
  font-size: 32rpx;
  font-weight: 700;
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
  border: none;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: transform 0.2s;
}

.submit-btn:active {
  transform: scale(0.98);
}

.switch-mode {
  text-align: center;
  margin-top: 32rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--color-zen-stone, #A8A8A5);
  cursor: pointer;
  transition: color 0.2s;
}

.switch-mode:hover {
  color: var(--color-zen-graphite, #1C1C1A);
}
</style>
