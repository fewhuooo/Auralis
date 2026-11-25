import { computed, onUnmounted, reactive, ref } from 'vue'
import { useAuthApi } from '@/api/useAuthApi'
import { ApiProblemError } from '@/api/protocol'
import { useAuthStore } from '@/store/useAuthStore'

type AuthMode = 'login' | 'register' | 'reset'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const verificationCode = /^[0-9]{6}$/
const actions = { login: '登录', register: '注册', reset: '重置密码' } as const

export function useAuthForm(homeRoute: string) {
  const auth = useAuthStore()
  const mode = ref<AuthMode>('login')
  const submitting = ref(false)
  const sending = ref(false)
  const feedback = ref('')
  const sentTo = reactive({ register: '', reset: '' })
  const coolingDown = reactive({ register: '', reset: '' })
  const cooldownTimers: Partial<Record<Exclude<AuthMode, 'login'>, ReturnType<typeof setTimeout>>> = {}
  const form = reactive({ username: '', email: '', emailCode: '', password: '', confirmPassword: '' })
  const actionLabel = computed(() => actions[mode.value])
  const pending = computed(() => submitting.value || sending.value)
  const sendDisabled = computed(() => pending.value || (mode.value !== 'login' && coolingDown[mode.value] === form.email.trim().toLowerCase() && coolingDown[mode.value] !== ''))
  const sendLabel = computed(() => mode.value !== 'login' && sentTo[mode.value] !== '' && sentTo[mode.value] === form.email.trim().toLowerCase()
    ? '重新发送' : '发送验证码')

  onUnmounted(() => {
    clearTimeout(cooldownTimers.register)
    clearTimeout(cooldownTimers.reset)
  })

  function show(modeToShow: AuthMode) {
    if (pending.value) return
    if (modeToShow === 'reset' && emailPattern.test(form.username.trim())) form.email = form.username.trim()
    mode.value = modeToShow
    feedback.value = ''
    form.emailCode = ''
    form.password = ''
    form.confirmPassword = ''
  }

  async function sendCode() {
    if (sendDisabled.value || mode.value === 'login') return
    const purpose = mode.value
    const email = form.email.trim()
    if (!isValidEmail(email)) {
      feedback.value = '请输入有效邮箱'
      return
    }

    feedback.value = ''
    sending.value = true
    try {
      if (purpose === 'register') {
        await useAuthApi.sendRegistrationEmailCode({ email })
        feedback.value = '验证码请求已提交，请查收邮件。'
      } else {
        await useAuthApi.sendPasswordResetEmailCode({ email })
        feedback.value = '如果该邮箱可用于找回密码，你会收到验证码。'
      }
      sentTo[purpose] = email.toLowerCase()
      coolingDown[purpose] = sentTo[purpose]
      clearTimeout(cooldownTimers[purpose])
      cooldownTimers[purpose] = setTimeout(() => { coolingDown[purpose] = '' }, 60_000)
    } catch (error) {
      feedback.value = messageFrom(error, '验证码发送失败，请稍后重试。')
    } finally {
      sending.value = false
    }
  }

  async function submit() {
    if (pending.value) return
    feedback.value = ''
    const username = form.username.trim()
    const email = form.email.trim()
    const emailCode = form.emailCode.trim()
    const password = form.password

    if (mode.value === 'login' && (!username || !password)) {
      feedback.value = '请输入用户名或邮箱和密码。'
      return
    }
    if (mode.value === 'register' && (!username || username.length > 64 || username.includes('@'))) {
      feedback.value = '用户名需为 1–64 个字符，不能包含 @。'
      return
    }
    if (mode.value !== 'login') {
      if (!isValidEmail(email)) {
        feedback.value = '请输入有效邮箱。'
        return
      }
      if (!verificationCode.test(emailCode)) {
        feedback.value = '请输入邮件中的 6 位验证码。'
        return
      }
      if (utf8Length(password) > 72) {
        feedback.value = '密码太长，请缩短后重试。'
        return
      }
      if (password.length < 8
        || !/\p{Lu}/u.test(password)
        || !/\p{Ll}/u.test(password)
        || !/[\p{P}\p{S}]/u.test(password)) {
        feedback.value = '密码至少 8 位，且包含大写字母、小写字母和符号。'
        return
      }
      if (password !== form.confirmPassword) {
        feedback.value = '两次输入的密码不一致。'
        return
      }
    }

    submitting.value = true
    try {
      if (mode.value === 'reset') {
        await useAuthApi.resetPassword({ email, emailCode, newPassword: password })
        form.username = email
        form.emailCode = ''
        form.password = ''
        form.confirmPassword = ''
        sentTo.reset = ''
        mode.value = 'login'
        feedback.value = '密码已重置，请使用新密码登录。'
        return
      }
      if (mode.value === 'login') await auth.login({ username, password })
      else await auth.register({ username, email, emailCode, password })
      uni.reLaunch({ url: homeRoute })
    } catch (error) {
      const fallback = mode.value === 'login' ? '登录失败，请检查输入或网络连接。' : '提交失败，请检查输入后重试。'
      feedback.value = messageFrom(error, fallback)
    } finally {
      submitting.value = false
    }
  }

  return { mode, form, feedback, pending, submitting, sending, actionLabel, sendLabel, sendDisabled, show, sendCode, submit }
}

function isValidEmail(value: string): boolean {
  return value.length <= 254 && emailPattern.test(value)
}

function utf8Length(value: string): number {
  return Array.from(value).reduce((bytes, char) => {
    const point = char.codePointAt(0) ?? 0
    if (point <= 0x7f) return bytes + 1
    if (point <= 0x7ff) return bytes + 2
    return bytes + (point > 0xffff ? 4 : 3)
  }, 0)
}

function messageFrom(error: unknown, fallback: string): string {
  if (!(error instanceof ApiProblemError)) return fallback
  if (error.status === 401) return '用户名、邮箱或密码不正确。'
  if (error.status === 429) return '操作过于频繁，请稍后重试。'
  if (error.status === 503) return '服务暂时不可用，请稍后重试。'
  return error.fieldErrors[0]?.message || error.message || fallback
}
