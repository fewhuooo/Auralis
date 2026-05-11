<template>
  <view class="login-container">
    <view class="logo-area">
      <text class="title">StudyCore</text>
      <text class="subtitle">跨平台智能生产力中枢</text>
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

  loading.value = true
  try {
    if (isLogin.value) {
      await authStore.login(form.value)
      uni.showToast({ title: '登录成功' })
      uni.switchTab({ url: '/pages/index/index' })
    } else {
      await authStore.register(form.value)
      uni.showToast({ title: '注册成功，请登录' })
      isLogin.value = true
    }
  } catch (error: any) {
    uni.showToast({ title: error.message || '操作失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}
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
    background: linear-gradient(135deg, #6366f1, #a855f7);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
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

.submit-btn {
  background: linear-gradient(135deg, #6366f1, #a855f7);
  color: white;
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
  color: #6366f1;
}

/* Dark mode basic support */
html.dark {
  .form-area { background: #1f2937; }
  .input-box { border-bottom-color: #374151; color: white; }
}
</style>
