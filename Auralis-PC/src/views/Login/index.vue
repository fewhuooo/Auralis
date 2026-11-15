<template>
  <div class="login-page" :class="{ 'login-page--desktop': isDesktopApp }">
    <div v-if="isDesktopApp" class="login-titlebar">
      <div class="login-titlebar-drag" data-tauri-drag-region aria-hidden="true"></div>
      <div class="login-window-controls">
        <button type="button" :title="t(messages.minimize)" :aria-label="t(messages.minimize)" @click="minimizeWindow">
          <IconMinus :size="15" aria-hidden="true" />
        </button>
        <button type="button" :title="windowSizeLabel" :aria-label="windowSizeLabel" @click="handleWindowToggleMaximize">
          <IconSquares v-if="isMaximized" :size="13" aria-hidden="true" />
          <IconSquare v-else :size="13" aria-hidden="true" />
        </button>
        <button class="login-window-close" type="button" :title="t(messages.close)" :aria-label="t(messages.close)" @click="closeWindow">
          <IconX :size="15" aria-hidden="true" />
        </button>
      </div>
    </div>
    <div class="login-wrapper">
      <!-- Left: Decorative / Brand Area -->
      <div class="brand-side">
        <div class="brand-content">
          <div class="brand-logo-mark">SC</div>
          <h1 class="brand-vertical-text">AURALIS</h1>
          <div class="brand-manifesto">
            <p>{{ t(messages.organize) }}</p>
            <p>{{ t(messages.connect) }}</p>
            <p>{{ t(messages.trace) }}</p>
          </div>
        </div>
        <!-- Decorative Shapes inside brand side -->
        <div class="side-shape"></div>
      </div>

      <!-- Right: Form Area -->
      <div class="form-side">
        <div class="login-box" :class="{ 'login-box--verification': !isLogin }">
          <div class="form-header">
            <h2 class="form-title">{{ t(mode === 'reset' ? messages.reset : isLogin ? messages.welcome : messages.newJourney) }}</h2>
            <p class="form-subtitle">{{ t(mode === 'reset' ? messages.resetInstructions : messages.subtitle) }}</p>
          </div>

          <div v-if="mode !== 'reset'" class="auth-toggle">
            <button
              class="toggle-btn"
              :class="{ active: isLogin }"
              type="button"
              :disabled="busy"
              @click="toggleMode('login')"
            >{{ t(messages.login) }}</button>
            <button
              class="toggle-btn"
              :class="{ active: mode === 'register' }"
              type="button"
              :disabled="busy"
              @click="toggleMode('register')"
            >{{ t(messages.register) }}</button>
          </div>

          <el-form :model="form" class="auth-form" novalidate @submit.prevent="handleAction">
            <el-form-item v-if="mode !== 'reset'" :error="fieldErrors.username?.[0]">
              <el-input
                v-model="form.username"
                :aria-label="t(isLogin ? messages.identifier : messages.username)"
                :placeholder="t(isLogin ? messages.identifier : messages.username)"
                size="large"
                class="minimal-input"
                :disabled="busy"
                autocomplete="username"
                @input="clearFieldError('username')"
              />
            </el-form-item>

            <template v-if="!isLogin">
              <el-form-item :error="fieldErrors.email?.[0]">
                <el-input
                  v-model="form.email"
                  type="email"
                  :aria-label="t(messages.email)"
                  :placeholder="t(messages.email)"
                  size="large"
                  class="minimal-input"
                  :disabled="busy"
                  autocomplete="email"
                  @input="clearFieldError('email')"
                />
              </el-form-item>
              <el-form-item :error="fieldErrors.emailCode?.[0]">
                <el-input
                  v-model="form.emailCode"
                  :aria-label="t(messages.emailCode)"
                  :placeholder="t(messages.emailCode)"
                  size="large"
                  class="minimal-input"
                  :disabled="busy"
                  autocomplete="one-time-code"
                  inputmode="numeric"
                  maxlength="6"
                  @input="clearFieldError('emailCode')"
                >
                  <template #suffix>
                    <button
                      class="verification-button"
                      type="button"
                      :disabled="busy || resendRemaining > 0"
                      :aria-busy="sendingCode"
                      @click="sendCode"
                    >{{ sendingCode ? t(messages.sendingCode) : resendRemaining > 0 ? t(messages.resendCountdown, { seconds: resendRemaining }) : t(messages.sendCode) }}</button>
                  </template>
                </el-input>
              </el-form-item>
            </template>

            <el-form-item :error="fieldErrors[mode === 'reset' ? 'newPassword' : 'password']?.[0]">
              <el-input
                v-model="form.password"
                type="password"
                :aria-label="t(mode === 'reset' ? messages.newPassword : messages.password)"
                :placeholder="t(isLogin ? messages.password : messages.passwordRequirements)"
                size="large"
                show-password
                class="minimal-input"
                :disabled="busy"
                :autocomplete="isLogin ? 'current-password' : 'new-password'"
                @input="clearFieldError(mode === 'reset' ? 'newPassword' : 'password'); clearFieldError('confirmPassword')"
              />
            </el-form-item>

            <el-form-item v-if="!isLogin" :error="fieldErrors.confirmPassword?.[0]">
              <el-input
                v-model="form.confirmPassword"
                type="password"
                :aria-label="t(messages.confirmPassword)"
                :placeholder="t(messages.confirmPassword)"
                size="large"
                show-password
                class="minimal-input"
                :disabled="busy"
                autocomplete="new-password"
                @input="clearFieldError('confirmPassword')"
              />
            </el-form-item>

            <div v-if="actionError" class="general-error-banner" role="alert">
              {{ actionError }}
            </div>

            <button class="submit-btn" :disabled="busy" type="submit">
              <span v-if="loading" class="loading-spinner" aria-hidden="true"></span>
              {{ t(mode === 'reset' ? messages.reset : isLogin ? messages.login : messages.register) }}
            </button>
          </el-form>

          <div v-if="mode !== 'register'" class="footer-links">
            <button v-if="isLogin" type="button" :disabled="busy" @click="toggleMode('reset')">{{ t(messages.forgot) }}</button>
            <button v-if="mode === 'reset'" type="button" :disabled="busy" @click="toggleMode('login')">{{ t(messages.backToLogin) }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { IconMinus, IconSquare, IconSquares, IconX } from '@tabler/icons-vue'
import { closeWindow, isTauriEnvironment, isWindowMaximized, minimizeWindow, toggleMaximizeWindow } from '@/api/tauri'
import { t } from '@/i18n'
import { useAuthStore } from '@/store/useAuthStore'
import { resolveLoginReturnPath } from '@/auth/authGuard'
import { useAuthApi } from '@/api/useAuthApi'
import { ApiProblemError } from '@/api/httpError'
import { normalizeFieldErrors, summarizeFieldErrors } from '@/api/problemFieldErrors'

const messages = {
  organize: { 'zh-CN': '重塑碎片信息', en: 'Organize scattered information', ja: '散らばった情報を整理する' },
  connect: { 'zh-CN': '构建深度知识链接', en: 'Build meaningful connections', ja: '知識を深く結びつける' },
  trace: { 'zh-CN': '让每一份思考都有迹可循', en: 'Keep track of every thought', ja: '一つひとつの思考をたどれるようにする' },
  welcome: { 'zh-CN': '欢迎回来', en: 'Welcome back', ja: 'おかえりなさい' },
  newJourney: { 'zh-CN': '开启新旅程', en: 'Create your account', ja: 'アカウントを作成' },
  subtitle: { 'zh-CN': '使用 Auralis 账号继续您的知识编排', en: 'Use your Auralis account to organize your knowledge', ja: 'Auralis アカウントで知識を整理しましょう' },
  login: { 'zh-CN': '登录', en: 'Sign in', ja: 'ログイン' },
  register: { 'zh-CN': '注册', en: 'Sign up', ja: '新規登録' },
  identifier: { 'zh-CN': '用户名或邮箱', en: 'Username or email', ja: 'ユーザー名またはメールアドレス' },
  username: { 'zh-CN': '用户名', en: 'Username', ja: 'ユーザー名' },
  email: { 'zh-CN': '邮箱', en: 'Email address', ja: 'メールアドレス' },
  emailCode: { 'zh-CN': '邮箱验证码', en: 'Verification code', ja: 'メール認証コード' },
  sendCode: { 'zh-CN': '发送验证码', en: 'Send code', ja: 'コードを送信' },
  sendingCode: { 'zh-CN': '发送中…', en: 'Sending…', ja: '送信中…' },
  resendCountdown: { 'zh-CN': '{seconds} 秒', en: '{seconds} s', ja: '{seconds}秒' },
  codeSent: { 'zh-CN': '如果此邮箱可以注册，您将收到验证码。', en: 'If this email can be used to sign up, you’ll receive a verification code.', ja: '登録可能なメールアドレスには認証コードが届きます。' },
  resetCodeRequested: { 'zh-CN': '如果此邮箱已注册，您将收到验证码。', en: 'If this email is registered, you’ll receive a verification code.', ja: '登録済みのメールアドレスには認証コードが届きます。' },
  password: { 'zh-CN': '密码', en: 'Password', ja: 'パスワード' },
  newPassword: { 'zh-CN': '新密码', en: 'New password', ja: '新しいパスワード' },
  confirmPassword: { 'zh-CN': '确认密码', en: 'Confirm password', ja: 'パスワードを確認' },
  passwordRequirements: {
    'zh-CN': '密码至少 12 位',
    en: 'Use at least 12 characters',
    ja: 'パスワードは12文字以上',
  },
  passwordTooLong: {
    'zh-CN': '密码太长，请缩短后重试。',
    en: 'Your password is too long. Shorten it and try again.',
    ja: 'パスワードが長すぎます。短くしてもう一度お試しください。',
  },
  invalidUsername: { 'zh-CN': '输入不含 @ 的用户名，最多 64 个字符。', en: 'Enter up to 64 characters without @.', ja: '@ を含まない64文字以内のユーザー名を入力してください。' },
  invalidIdentifier: { 'zh-CN': '请输入用户名或有效邮箱。', en: 'Enter your username or a valid email address.', ja: 'ユーザー名または有効なメールアドレスを入力してください。' },
  invalidEmail: { 'zh-CN': '请输入有效邮箱。', en: 'Enter a valid email address.', ja: '有効なメールアドレスを入力してください。' },
  invalidCode: { 'zh-CN': '请输入邮件中的 6 位数字验证码。', en: 'Enter the six-digit code from your email.', ja: 'メールに記載された6桁の認証コードを入力してください。' },
  passwordRequired: { 'zh-CN': '请输入密码。', en: 'Enter your password.', ja: 'パスワードを入力してください。' },
  passwordMismatch: { 'zh-CN': '两次输入的密码不一致。', en: 'The passwords don’t match.', ja: '入力したパスワードが一致しません。' },
  forgot: { 'zh-CN': '忘记密码？', en: 'Forgot password?', ja: 'パスワードをお忘れですか？' },
  reset: { 'zh-CN': '重置密码', en: 'Reset password', ja: 'パスワードを再設定' },
  resetInstructions: { 'zh-CN': '使用注册邮箱接收验证码并设置新密码。', en: 'Request a code at your registered email address and set a new password.', ja: '登録済みのメールアドレスで認証コードを受け取り、新しいパスワードを設定してください。' },
  resetComplete: { 'zh-CN': '密码已重置，请使用新密码登录。', en: 'Password reset. Sign in with your new password.', ja: 'パスワードを再設定しました。新しいパスワードでログインしてください。' },
  minimize: { 'zh-CN': '最小化', en: 'Minimize', ja: '最小化' },
  restore: { 'zh-CN': '还原窗口', en: 'Restore window', ja: '元のサイズに戻す' },
  maximize: { 'zh-CN': '最大化', en: 'Maximize', ja: '最大化' },
  close: { 'zh-CN': '关闭', en: 'Close', ja: '閉じる' },
  backToLogin: { 'zh-CN': '返回登录', en: 'Back to sign in', ja: 'ログインに戻る' },
  registered: { 'zh-CN': '注册成功', en: 'Account created', ja: 'アカウントを作成しました' },
  failed: { 'zh-CN': '操作失败，请重试。', en: 'Something went wrong. Try again.', ja: '操作に失敗しました。もう一度お試しください。' },
}

type Mode = 'login' | 'register' | 'reset'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const isDesktopApp = isTauriEnvironment()
const isMaximized = ref(false)
const windowSizeLabel = computed(() => t(isMaximized.value ? messages.restore : messages.maximize))
const mode = ref<Mode>('login')
const isLogin = computed(() => mode.value === 'login')
const loading = ref(false)
const sendingCode = ref(false)
const busy = computed(() => loading.value || sendingCode.value)
const actionError = ref('')
const fieldErrors = ref<Record<string, string[]>>({})
const form = ref({
  username: '',
  email: '',
  emailCode: '',
  password: '',
  confirmPassword: '',
})

const resendAt = ref({ register: 0, reset: 0 })
const clock = ref(Date.now())
const resendRemaining = computed(() => mode.value === 'login'
  ? 0
  : Math.max(0, Math.ceil((resendAt.value[mode.value] - clock.value) / 1000)))
let resendTimer: ReturnType<typeof setInterval> | undefined

const returnPath = () => resolveLoginReturnPath(
  route.query.redirect,
  (path) => router.resolve(path).matched.some((record) => record.meta.requiresAuth === true),
)

let resizeTimer: ReturnType<typeof setTimeout> | undefined

const syncMaximizedState = async () => {
  isMaximized.value = await isWindowMaximized()
}

const handleWindowToggleMaximize = async () => {
  await toggleMaximizeWindow()
  await syncMaximizedState()
}

const handleWindowResize = () => {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => void syncMaximizedState(), 120)
}

onMounted(() => {
  if (isDesktopApp) {
    void syncMaximizedState()
    window.addEventListener('resize', handleWindowResize)
  }
  if (authStore.isAuthenticated) router.replace(returnPath())
  resendTimer = setInterval(() => { clock.value = Date.now() }, 1000)
})
onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
  clearTimeout(resizeTimer)
  clearInterval(resendTimer)
})

const toggleMode = (next: Mode) => {
  if (mode.value === next) return
  mode.value = next
  form.value.password = ''
  form.value.confirmPassword = ''
  form.value.emailCode = ''
  actionError.value = ''
  fieldErrors.value = {}
}

const clearFieldError = (field: string) => {
  delete fieldErrors.value[field]
  actionError.value = ''
}

const showRequestError = (error: unknown) => {
  if (error instanceof ApiProblemError) {
    const problem = error.problem
    fieldErrors.value = normalizeFieldErrors(problem.fieldErrors)
    actionError.value = summarizeFieldErrors(problem.fieldErrors) || problem.detail || problem.title
    return
  }
  actionError.value = t(messages.failed)
}

const sendCode = async () => {
  const emailMode = mode.value
  if (emailMode === 'login' || busy.value || resendRemaining.value > 0) return
  fieldErrors.value = {}
  actionError.value = ''
  const email = form.value.email.trim()
  if (!isEmail(email)) {
    fieldErrors.value.email = [t(messages.invalidEmail)]
    return
  }

  sendingCode.value = true
  try {
    if (emailMode === 'register') {
      await useAuthApi.sendRegistrationEmailCode({ email })
    } else {
      await useAuthApi.sendPasswordResetEmailCode({ email })
    }
    clock.value = Date.now()
    resendAt.value[emailMode] = clock.value + 60_000
    ElMessage.success(t(emailMode === 'register' ? messages.codeSent : messages.resetCodeRequested))
  } catch (error: unknown) {
    showRequestError(error)
  } finally {
    sendingCode.value = false
  }
}

const handleAction = async () => {
  if (busy.value) return
  fieldErrors.value = {}
  actionError.value = ''

  const username = form.value.username.trim()
  const password = form.value.password
  const email = form.value.email.trim()
  const emailCode = form.value.emailCode.trim()
  const errors = fieldErrors.value

  if (isLogin.value) {
    if (!(isEmail(username) || isUsername(username))) errors.username = [t(messages.invalidIdentifier)]
    if (!password.trim()) errors.password = [t(messages.passwordRequired)]
  } else {
    if (mode.value === 'register' && !isUsername(username)) errors.username = [t(messages.invalidUsername)]
    if (!isEmail(email)) errors.email = [t(messages.invalidEmail)]
    if (!/^[0-9]{6}$/.test(emailCode)) errors.emailCode = [t(messages.invalidCode)]
    const passwordField = mode.value === 'reset' ? 'newPassword' : 'password'
    if (!password.trim() || password.length < 12) {
      errors[passwordField] = [t(messages.passwordRequirements)]
    }
    if (new TextEncoder().encode(password).length > 72) {
      errors[passwordField] = [t(messages.passwordTooLong)]
    }
    if (password !== form.value.confirmPassword) errors.confirmPassword = [t(messages.passwordMismatch)]
  }
  if (Object.keys(errors).length > 0) return

  loading.value = true
  try {
    if (mode.value === 'reset') {
      await useAuthApi.resetPassword({ email, emailCode, newPassword: password })
      form.value.username = email
      toggleMode('login')
      ElMessage.success(t(messages.resetComplete))
      return
    }
    if (isLogin.value) {
      await authStore.login({ username, password })
      ElMessage.success(t(messages.welcome))
    } else {
      await authStore.register({ username, email, emailCode, password })
      ElMessage.success(t(messages.registered))
    }
    await router.push(returnPath())
  } catch (error: unknown) {
    showRequestError(error)
  } finally {
    loading.value = false
  }
}

function isEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(value)
}

function isUsername(value: string): boolean {
  return value.length > 0 && value.length <= 64 && !value.includes('@')
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

.login-page--desktop {
  position: relative;
  box-sizing: border-box;
  padding-top: 30px;
}

.login-page--desktop .login-wrapper {
  max-height: calc(100% - 8px);
}

.login-titlebar {
  position: absolute;
  inset: 0 0 auto;
  display: flex;
  height: 30px;
  user-select: none;
}

.login-titlebar-drag {
  flex: 1;
}

.login-window-controls {
  display: flex;
  opacity: 0;
  transition: opacity 0.16s ease;
}

.login-titlebar:hover .login-window-controls,
.login-titlebar:focus-within .login-window-controls {
  opacity: 1;
}

.login-window-controls button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 100%;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.login-window-controls button:hover {
  background: var(--color-bg-tertiary);
  color: var(--text-primary);
}

.login-window-controls button:focus-visible {
  outline: 1px solid var(--text-primary);
  outline-offset: -2px;
}

.login-window-controls .login-window-close:hover {
  background: var(--color-danger);
}


.login-wrapper {
  display: flex;
  width: min(900px, calc(100% - 32px));
  height: min(600px, calc(100dvh - 32px));
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
  min-width: 0;
  overflow-y: auto;
  padding: 32px 40px;
}

.login-box {
  width: 100%;
  max-width: 320px;
  margin: auto;
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

.auth-form :deep(.el-form-item__error) {
  position: static;
  width: 100%;
  padding-top: 4px;
  line-height: 1.3;
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
  gap: 8px;
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

.footer-links button {
  color: var(--text-muted);
  border: 0;
  padding: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
  transition: color 0.2s ease;
}

.footer-links button:hover:not(:disabled) {
  color: var(--text-primary);
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

.verification-button {
  min-inline-size: 7.5em;
  padding: 5px 0 5px 10px;
  border: 0;
  border-inline-start: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.25;
  white-space: nowrap;
  cursor: pointer;
}

.verification-button:hover:not(:disabled) {
  color: var(--text-primary);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.verification-button:focus-visible {
  outline: 2px solid var(--color-zen-sage);
  outline-offset: 2px;
}

.verification-button:disabled {
  color: var(--text-muted);
  cursor: not-allowed;
}

.login-box--verification .form-header,
.login-box--verification .auth-toggle {
  margin-bottom: 16px;
}

.login-box--verification .auth-form {
  margin-bottom: 16px;
}

@media (max-width: 650px) {
  .brand-side {
    display: none;
  }

  .form-side {
    padding: 24px;
  }
}

/* Responsive adjustment for small height screens */
@media (max-height: 700px) {
  .login-wrapper {
    height: min(540px, calc(100dvh - 32px));
  }
  .brand-vertical-text {
    font-size: 40px;
  }
}
</style>
