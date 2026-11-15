<template>
  <view class="login-container">
    <view class="logo-area">
      <text class="title">Auralis</text>
      <text class="subtitle">跨平台智能生产力中枢</text>
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
  = useAuthForm('/pages/mobile/home/index')
</script>

<style scoped lang="scss">
.login-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 40px 20px;
  background-color: var(--bg-color, #f3f4f6);
}

.logo-area {
  text-align: center;
  margin-bottom: 60px;
  
  .title {
    font-size: 32px;
    font-weight: bold;
    color: var(--text-primary);
    display: block;
    margin-bottom: 10px;
  }
  
  .subtitle {
    font-size: 14px;
    color: #6b7280;
  }
}

.form-area {
  background: white;
  padding: 30px 20px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
}

.input-box {
  height: 48px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 20px;
  font-size: 16px;
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
  background: var(--text-primary);
  color: var(--color-bg-primary);
  border-radius: 8px;
  height: 48px;
  line-height: 48px;
  margin-top: 20px;
  font-size: 16px;
  border: none;
}

.switch-mode {
  text-align: center;
  margin-top: 20px;
  font-size: 14px;
  color: var(--text-accent);
}

/* Dark mode basic support */
html.dark {
  .form-area { background: #1f2937; }
  .input-box { border-bottom-color: #374151; color: white; }
}
</style>
