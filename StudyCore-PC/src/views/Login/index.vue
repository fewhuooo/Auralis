<template>
  <div class="login-page">
    <div class="login-wrapper">
      <!-- Left: Decorative / Brand Area -->
      <div class="brand-side">
        <div class="brand-content">
          <div class="brand-logo-mark">SC</div>
          <h1 class="brand-vertical-text">STUDYCORE</h1>
          <div class="brand-manifesto">
            <p>重塑碎片信息</p>
            <p>构建深度知识链接</p>
            <p>让每一份思考都有迹可循</p>
          </div>
        </div>
        <!-- Decorative Shapes inside brand side -->
        <div class="side-shape"></div>
      </div>

      <!-- Right: Form Area -->
      <div class="form-side">
        <div class="login-box">
          <div class="form-header">
            <h2 class="form-title">{{ isLogin ? '欢迎回来' : '开启新旅程' }}</h2>
            <p class="form-subtitle">使用学核账号继续您的知识编排</p>
          </div>

          <div class="auth-toggle">
            <button 
              class="toggle-btn" 
              :class="{ active: isLogin }" 
              @click="isLogin = true"
            >登录</button>
            <button 
              class="toggle-btn" 
              :class="{ active: !isLogin }" 
              @click="isLogin = false"
            >注册</button>
          </div>

          <el-form :model="form" class="auth-form" @submit.prevent="handleAction">
            <el-form-item>
              <el-input 
                v-model="form.username" 
                placeholder="用户名 / 邮箱" 
                size="large"
                class="minimal-input"
              />
            </el-form-item>
            <el-form-item>
              <el-input 
                v-model="form.password" 
                type="password" 
                placeholder="密码" 
                size="large"
                show-password
                class="minimal-input"
                @keyup.enter="handleAction"
              />
            </el-form-item>

            <button class="submit-btn" :disabled="loading" type="button" @click="handleAction">
              <span v-if="loading" class="loading-spinner"></span>
              <span v-else>{{ isLogin ? '登 录' : '注 册' }}</span>
            </button>
          </el-form>

          <div class="footer-links">
            <a href="javascript:void(0)">忘记密码？</a>
            <span class="divider">/</span>
            <a href="javascript:void(0)">隐私与条款</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/store/useAuthStore'
import { ElMessage } from 'element-plus'

const router = useRouter()
const authStore = useAuthStore()

const isLogin = ref(true)
const loading = ref(false)
const form = ref({
  username: '',
  password: ''
})

const handleAction = async () => {
  if (!form.value.username || !form.value.password) {
    ElMessage.warning('请填写完整信息')
    return
  }

  loading.value = true
  try {
    if (isLogin.value) {
      await authStore.login(form.value)
      ElMessage.success('欢迎回来')
    } else {
      await authStore.register(form.value)
      ElMessage.success('注册成功')
      await authStore.login(form.value)
    }
    router.push('/')
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  width: 100vw;
  height: 100vh;
  background: var(--color-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.login-wrapper {
  display: flex;
  width: 900px;
  height: 600px;
  background: var(--color-bg-primary);
  border-radius: 32px;
  overflow: hidden;
  box-shadow: 0 40px 100px rgba(0, 0, 0, 0.08);
  border: 1px solid var(--border-subtle);
}

/* Brand Side */
.brand-side {
  width: 380px;
  background: var(--color-oatmeal-light);
  position: relative;
  display: flex;
  align-items: center;
  padding: 60px;
  border-right: 1px solid var(--border-subtle);
  overflow: hidden;
}

.brand-content {
  z-index: 2;
}

.brand-logo-mark {
  font-size: 20px;
  font-weight: 900;
  color: var(--text-primary);
  margin-bottom: 40px;
  letter-spacing: 2px;
}

.brand-vertical-text {
  font-size: 48px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
  letter-spacing: -2px;
  margin-bottom: 24px;
  opacity: 0.9;
}

.brand-manifesto {
  font-size: 14px;
  color: var(--text-muted);
  line-height: 1.8;
  font-weight: 500;
}

.side-shape {
  position: absolute;
  bottom: -50px;
  right: -50px;
  width: 200px;
  height: 200px;
  background: var(--color-oatmeal-dark);
  border-radius: 50%;
  filter: blur(40px);
  opacity: 0.5;
}

/* Form Side */
.form-side {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.login-box {
  width: 100%;
  max-width: 320px;
}

.form-header {
  margin-bottom: 32px;
}

.form-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.form-subtitle {
  font-size: 13px;
  color: var(--text-muted);
}

.auth-toggle {
  display: flex;
  background: var(--color-bg-tertiary);
  padding: 3px;
  border-radius: 12px;
  margin-bottom: 32px;
}

.toggle-btn {
  flex: 1;
  padding: 8px;
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 9px;
  transition: all 0.2s;
}

.toggle-btn.active {
  background: var(--color-bg-primary);
  color: var(--text-primary);
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.auth-form {
  margin-bottom: 24px;
}

:deep(.minimal-input .el-input__wrapper) {
  background: var(--color-bg-tertiary) !important;
  box-shadow: none !important;
  border: 1px solid transparent !important;
  border-radius: 12px;
  padding: 4px 16px;
  transition: all 0.2s;
}

:deep(.minimal-input .el-input__wrapper.is-focus) {
  background: var(--color-bg-primary) !important;
  border-color: var(--border-strong) !important;
}

.submit-btn {
  width: 100%;
  padding: 14px;
  background: var(--text-primary);
  color: var(--color-white);
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: 2px;
}

.submit-btn:hover:not(:disabled) {
  filter: brightness(1.2);
  transform: translateY(-1px);
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.footer-links {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}

.footer-links a {
  color: var(--text-muted);
  text-decoration: none;
}

.footer-links a:hover {
  color: var(--text-primary);
}

.divider {
  margin: 0 10px;
  opacity: 0.3;
}

.loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Responsive adjustment for small height screens */
@media (max-height: 700px) {
  .login-wrapper {
    height: 540px;
  }
  .brand-vertical-text {
    font-size: 40px;
  }
}
</style>
