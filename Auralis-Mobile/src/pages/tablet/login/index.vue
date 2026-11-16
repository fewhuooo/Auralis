<template>
  <view class="login-page">
    <view class="login-wrapper">
      <view class="brand-side">
        <view class="brand-content">
          <BrandLogo size="88rpx" />
          <text class="brand-title">AURALIS</text>
          <view class="brand-manifesto">
            <text class="manifesto-line">重塑碎片信息</text>
            <text class="manifesto-line">构建深度知识链接</text>
            <text class="manifesto-line">让每一份思考都有迹可循</text>
          </view>
        </view>
        <view class="side-glow"></view>
      </view>

      <view class="form-side">
        <view class="login-box">
          <view class="form-header">
            <text class="form-title">
              {{ mode === 'reset' ? '重置密码' : mode === 'login' ? '欢迎回来' : '开启新旅程' }}
            </text>
            <text class="form-subtitle">
              {{ mode === 'reset' ? '使用注册邮箱接收验证码并设置新密码' : '使用 Auralis 账号继续您的平板学习空间' }}
            </text>
          </view>

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

          <view class="footer-links">
            <text v-if="mode === 'login'" class="footer-link" @click="show('reset')">忘记密码？</text>
            <text v-else class="footer-link" @click="show('login')">返回登录</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import BrandLogo from '@/components/BrandLogo.vue'
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
  padding: 36rpx;
  background-color: var(--color-bg-page);
  box-sizing: border-box;
}

.login-wrapper {
  display: flex;
  width: 100%;
  max-width: 1440rpx;
  min-height: 820rpx;
  background-color: var(--color-bg-card);
  border-radius: 48rpx;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-lg);
}

.brand-side {
  width: 42%;
  background-color: var(--color-bg-primary);
  position: relative;
  display: flex;
  align-items: center;
  padding: 72rpx;
  border-right: 1px solid var(--border-subtle);
  overflow: hidden;
  box-sizing: border-box;
}

.brand-content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 28rpx;
}

.brand-title {
  font-size: 64rpx;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -1rpx;
  line-height: 1.05;
}

.brand-manifesto {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.manifesto-line {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  line-height: 1.6;
}

.side-glow {
  position: absolute;
  bottom: -120rpx;
  right: -120rpx;
  width: 360rpx;
  height: 360rpx;
  border-radius: 50%;
  background-color: rgba(139, 154, 110, 0.18);
  pointer-events: none;
}

.form-side {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 64rpx 72rpx;
  background-color: var(--color-bg-card);
  box-sizing: border-box;
}

.login-box {
  width: 100%;
  max-width: 620rpx;
}

.form-header {
  margin-bottom: 36rpx;
}

.form-title {
  display: block;
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin-bottom: 10rpx;
}

.form-subtitle {
  display: block;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
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
  cursor: pointer;
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
  padding-right: 14rpx;
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
  padding: 0 22rpx;
  height: 54rpx;
  line-height: 54rpx;
  background: transparent;
  border: none;
  border-left: 1px solid var(--border-subtle);
  border-radius: 0;
  font-size: 26rpx;
  font-weight: var(--font-weight-semibold);
  color: var(--color-zen-sage);
  cursor: pointer;
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
  cursor: pointer;
}

.submit-btn::after {
  border: none;
}

.submit-btn[disabled] {
  opacity: 0.6;
}

.footer-links {
  margin-top: 24rpx;
  text-align: center;
}

.footer-link {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  cursor: pointer;
  padding: 8rpx 16rpx;
}

@media (max-width: 720px) {
  .brand-side {
    display: none;
  }

  .form-side {
    padding: 48rpx 36rpx;
  }
}
</style>
