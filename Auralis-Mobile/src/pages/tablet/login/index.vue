<template>
  <view class="login-container">
    <view class="logo-area">
      <text class="title">Auralis</text>
      <text class="subtitle">跨平台智能生产力中枢 · 平板端</text>
    </view>

    <view class="form-area">
      <input class="input-box" v-model="form.username" placeholder="请输入用户名" />
      <input class="input-box" v-model="form.password" type="password" placeholder="请输入密码" />
      
      <button class="submit-btn" :loading="loading" @click="handleAction">
        {{ isLogin ? '登录' : '注册' }}
      </button>

      <view class="switch-mode" @click="isLogin = !isLogin">
        <text>{{ isLogin ? '没有账号？去注册' : '已有账号？去登录' }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/store/useAuthStore'

const authStore = useAuthStore()
const isLogin = ref(true)
const loading = ref(false)
const form = ref({
  username: '',
  password: ''
})

const handleAction = async () => {
  if (!form.value.username || !form.value.password) {
    uni.showToast({ title: '请输入用户名和密码', icon: 'none' })
    return
  }
  if (form.value.username.length > 64 || (!isLogin.value && form.value.password.length < 12)) {
    uni.showToast({ title: isLogin.value ? '用户名不能超过 64 个字符' : '注册密码至少需要 12 个字符', icon: 'none' })
    return
  }

  loading.value = true
  try {
    if (isLogin.value) {
      await authStore.login(form.value)
      uni.showToast({ title: '登录成功' })
      uni.reLaunch({ url: '/pages/tablet/dashboard/index' })
    } else {
      await authStore.register(form.value)
      uni.showToast({ title: '注册成功' })
      uni.reLaunch({ url: '/pages/tablet/dashboard/index' })
    }
  } catch (error: any) {
    uni.showToast({ title: error.message || '操作失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}
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
