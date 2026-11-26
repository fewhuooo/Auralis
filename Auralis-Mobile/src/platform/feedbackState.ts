import { reactive } from 'vue'

export type ToastTone = 'default' | 'success' | 'error'
export type ConfirmTone = 'primary' | 'danger'

export interface ToastInput {
  title?: string
  message?: string
  icon?: string
  tone?: ToastTone
  duration?: number
}

export interface ConfirmDialogOptions {
  title: string
  content: string
  confirmText?: string
  cancelText?: string
  showCancel?: boolean
  confirmTone?: ConfirmTone
}

export const toastState = reactive<{
  visible: boolean
  message: string
  tone: ToastTone
}>({
  visible: false,
  message: '',
  tone: 'default',
})

export const confirmState = reactive<{
  visible: boolean
  title: string
  content: string
  confirmText: string
  cancelText: string
  showCancel: boolean
  confirmTone: ConfirmTone
}>({
  visible: false,
  title: '',
  content: '',
  confirmText: '确定',
  cancelText: '取消',
  showCancel: true,
  confirmTone: 'primary',
})

export const loadingState = reactive<{
  visible: boolean
  title: string
}>({
  visible: false,
  title: '',
})

export const previewImageState = reactive<{
  visible: boolean
  url: string
}>({
  visible: false,
  url: '',
})

let toastTimer: ReturnType<typeof setTimeout> | null = null
let pendingConfirmResolver: ((confirmed: boolean) => void) | null = null

function normalizeToastTone(input: ToastInput): ToastTone {
  if (input.tone) return input.tone
  if (input.icon === 'success') return 'success'
  if (input.icon === 'error' || input.icon === 'fail') return 'error'
  return 'default'
}

export function dismissToast(): void {
  if (toastTimer) {
    clearTimeout(toastTimer)
    toastTimer = null
  }
  toastState.visible = false
  toastState.message = ''
  toastState.tone = 'default'
}

export function pushToast(input: string | ToastInput): void {
  const normalized: ToastInput = typeof input === 'string' ? { message: input } : input
  const message = (normalized.message || normalized.title || '').trim()
  if (!message) return

  if (toastTimer) {
    clearTimeout(toastTimer)
    toastTimer = null
  }
  toastState.message = message
  toastState.tone = normalizeToastTone(normalized)
  toastState.visible = true

  const duration = normalized.duration ?? 2000
  if (duration > 0) {
    toastTimer = setTimeout(() => {
      toastTimer = null
      toastState.visible = false
    }, duration)
  }
}

export function resolveConfirm(confirmed: boolean): void {
  const resolver = pendingConfirmResolver
  pendingConfirmResolver = null
  confirmState.visible = false
  resolver?.(confirmed)
}

export function openConfirm(options: ConfirmDialogOptions): Promise<boolean> {
  if (pendingConfirmResolver) {
    resolveConfirm(false)
  }
  confirmState.title = options.title
  confirmState.content = options.content
  confirmState.confirmText = options.confirmText || '确定'
  confirmState.cancelText = options.cancelText || '取消'
  confirmState.showCancel = options.showCancel !== false
  confirmState.confirmTone = options.confirmTone || 'primary'
  confirmState.visible = true

  return new Promise<boolean>((resolve) => {
    pendingConfirmResolver = resolve
  })
}

export function openLoading(title = '加载中...'): void {
  loadingState.title = title
  loadingState.visible = true
}

export function closeLoading(): void {
  loadingState.visible = false
  loadingState.title = ''
}

export function openImagePreview(url: string): void {
  if (!url) return
  previewImageState.url = url
  previewImageState.visible = true
}

export function closeImagePreview(): void {
  previewImageState.visible = false
  previewImageState.url = ''
}
