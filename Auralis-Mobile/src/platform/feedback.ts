import { createApp } from 'vue'
import {
  closeImagePreview,
  closeLoading,
  openConfirm,
  openImagePreview,
  openLoading,
  pushToast,
  type ConfirmDialogOptions,
  type ToastInput,
} from './feedbackState.ts'

export type { ConfirmDialogOptions, ConfirmTone, ToastInput, ToastTone } from './feedbackState.ts'

let hostMountPromise: Promise<void> | null = null

export function ensureFeedbackHost(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve()
  if (hostMountPromise) return hostMountPromise

  hostMountPromise = import('./PlatformFeedbackHost.vue').then(({ default: Host }) => {
    const hostId = 'auralis-platform-feedback'
    const existing = document.getElementById(hostId)
    if (existing) return
    const container = document.createElement('div')
    container.id = hostId
    document.body.appendChild(container)
    createApp(Host).mount(container)
  }).catch((error) => {
    hostMountPromise = null
    console.warn('[Platform Feedback] Failed to mount feedback host:', error)
  })

  return hostMountPromise
}

export function showToast(input: string | ToastInput): void {
  void ensureFeedbackHost()
  pushToast(input)
}

export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  void ensureFeedbackHost()
  return openConfirm(options)
}

export function showLoading(title = '加载中...'): void {
  void ensureFeedbackHost()
  openLoading(title)
}

export function hideLoading(): void {
  closeLoading()
}

export function previewImage(url: string): void {
  void ensureFeedbackHost()
  openImagePreview(url)
}

export function closePreviewImage(): void {
  closeImagePreview()
}
