<template>
  <div class="login-page">
    <div class="login-wrapper">
      <!-- Left: Decorative / Brand Area -->
      <div class="brand-side">
        <div class="brand-content">
          <div class="brand-logo-mark">SC</div>
          <h1 class="brand-vertical-text">AURALIS</h1>
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
            <p class="form-subtitle">使用Auralis账号继续您的知识编排</p>
          </div>

          <div class="auth-toggle">
            <button 
              class="toggle-btn" 
              :class="{ active: isLogin }" 
              type="button"
              :disabled="loading"
              @click="toggleMode(true)"
            >登录</button>
            <button 
              class="toggle-btn" 
              :class="{ active: !isLogin }" 
              type="button"
              :disabled="loading"
              @click="toggleMode(false)"
            >注册</button>
          </div>

          <el-form :model="form" class="auth-form" @submit.prevent="handleAction">
            <el-form-item :error="fieldErrors.username?.[0]">
              <el-input
                v-model="form.username" 
                placeholder="用户名 / 邮箱" 
                size="large"
                class="minimal-input"
                :disabled="loading"
                autocomplete="username"
                @input="clearFieldError('username')"
              />
            </el-form-item>

            <el-form-item v-if="!isLogin" :error="fieldErrors.displayName?.[0]">
              <el-input
                v-model="form.displayName"
                placeholder="显示名称 (选填)"
                size="large"
                class="minimal-input"
                :disabled="loading"
                autocomplete="name"
                @input="clearFieldError('displayName')"
              />
            </el-form-item>

            <el-form-item :error="fieldErrors.password?.[0]">
              <el-input
                v-model="form.password" 
                type="password" 
                :placeholder="isLogin ? '密码' : '密码至少 12 位，UTF-8 最多 72 字节'"
                size="large"
                show-password
                class="minimal-input"
                :disabled="loading"
                autocomplete="current-password"
                @input="clearFieldError('password')"
                @keyup.enter="handleAction"
              />
            </el-form-item>

            <div v-if="generalError" class="general-error-banner">
              {{ generalError }}
            </div>

            <button class="submit-btn" :disabled="loading" type="button" @click="handleAction">
              <span v-if="loading" class="loading-spinner"></span>
              <span v-else>{{ isLogin ? '登 录' : '注 册' }}</span>
            </button>
          </el-form>

          <div class="footer-links">
            <a href="javascript:void(0)" @click="ElMessage.info('密码重置功能即将上线')">忘记密码？</a>
            <span class="divider">/</span>
            <a href="javascript:void(0)" @click="ElMessage.info('隐私协议即将发布')">隐私与条款</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/store/useAuthStore'
import { ApiProblemError } from '@/api/httpError'
import { normalizeFieldErrors, summarizeFieldErrors } from '@/api/problemFieldErrors'
import { ElMessage } from 'element-plus'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const isLogin = ref(true)
const loading = ref(false)
const generalError = ref('')
const fieldErrors = ref<Record<string, string[]>>({})

const form = ref({
  username: '',
  displayName: '',
  password: ''
})

onMounted(() => {
  if (authStore.isAuthenticated) {
    const redirect = (route.query.redirect as string) || '/'
    router.replace(redirect)
  }
})

const toggleMode = (loginMode: boolean) => {
  isLogin.value = loginMode
  generalError.value = ''
  fieldErrors.value = {}
}

const clearFieldError = (field: string) => {
  if (fieldErrors.value[field]) {
    const next = { ...fieldErrors.value }
    delete next[field]
    fieldErrors.value = next
  }
  if (generalError.value) {
    generalError.value = ''
  }
}

const handleAction = async () => {
  generalError.value = ''
  fieldErrors.value = {}

  const username = form.value.username.trim()
  const password = form.value.password

  if (!username || !password) {
    ElMessage.warning('请填写完整信息')
    return
  }

  loading.value = true
  try {
    if (isLogin.value) {
      await authStore.login({
        username,
        password,
      })
      ElMessage.success('欢迎回来')
    } else {
      await authStore.register({
        username,
        password,
        displayName: form.value.displayName.trim() || username,
      })
      ElMessage.success('注册成功')
    }
    const redirect = (route.query.redirect as string) || '/'
    router.push(redirect)
  } catch (error: unknown) {
    if (error instanceof ApiProblemError) {
      const problem = error.problem
      fieldErrors.value = normalizeFieldErrors(problem.fieldErrors)
      const msg = summarizeFieldErrors(problem.fieldErrors) || problem.detail || problem.title || '操作失败'
      generalError.value = msg
      ElMessage.error(msg)
    } else if (error && typeof error === 'object' && 'problem' in error) {
      const problem = (error as { problem: { detail?: string; title?: string; fieldErrors?: unknown } }).problem
      fieldErrors.value = normalizeFieldErrors(problem.fieldErrors)
      const msg = summarizeFieldErrors(problem.fieldErrors) || problem.detail || problem.title || '操作失败'
      generalError.value = msg
      ElMessage.error(msg)
    } else if (error instanceof Error) {
      generalError.value = error.message
      ElMessage.error(error.message)
    } else {
      generalError.value = '操作失败'
      ElMessage.error('操作失败')
    }
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
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.04);
  border: 0.5px solid var(--border-subtle);
}

/* Brand Side */
.brand-side {
  width: 380px;
  background: var(--color-oatmeal-light);
  position: relative;
  display: flex;
  align-items: center;
  padding: 60px;
  border-right: 0.5px solid var(--border-subtle);
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
  background: var(--color-zen-sage);
  border-radius: 50%;
  filter: blur(40px);
  opacity: 0.35;
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
  border: 0.5px solid var(--border-subtle);
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
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.toggle-btn.active {
  background: var(--color-bg-primary);
  color: var(--text-primary);
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.toggle-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.auth-form {
  margin-bottom: 24px;
}

:deep(.minimal-input .el-input__wrapper) {
  background: var(--color-bg-tertiary) !important;
  box-shadow: none !important;
  border: 0.5px solid transparent !important;
  border-radius: 12px;
  padding: 4px 16px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

:deep(.minimal-input .el-input__wrapper.is-focus) {
  background: var(--color-bg-primary) !important;
  border-color: var(--color-zen-sage, #8B9A6E) !important;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18) !important;
}

.general-error-banner {
  background: rgba(239, 68, 68, 0.08);
  border: 0.5px solid rgba(239, 68, 68, 0.25);
  color: #ef4444;
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 16px;
  text-align: center;
}

.submit-btn {
  width: 100%;
  padding: 14px;
  background: var(--color-zen-sage);
  color: var(--color-white);
  border: 0.5px solid transparent;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: 2px;
  box-shadow: 0 4px 14px rgba(110, 128, 82, 0.25);
}

.submit-btn:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(110, 128, 82, 0.35);
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
  transition: color 0.2s ease;
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
