/**
 * Pinia Persist Plugin for Uni-app
 * 使用 uni.setStorageSync / uni.getStorageSync 替代 localStorage
 * 实现跨端（H5、小程序、App）统一的状态持久化
 */
import type { PiniaPluginContext } from 'pinia'
import { watch, toRaw } from 'vue'

export function createPiniaPersist() {
  return (context: PiniaPluginContext) => {
    const { store, options } = context

    // 检查 store options 是否启用了 persist
    const shouldPersist = (options as any)?.persist === true
    if (!shouldPersist) return

    const key = `pinia-${store.$id}`

    // 恢复：从 uni-storage 中读取已保存的状态
    try {
      const saved = uni.getStorageSync(key)
      if (saved) {
        store.$patch(JSON.parse(saved))
      }
    } catch (e) {
      console.warn(`[Pinia Persist] Failed to restore store "${store.$id}":`, e)
    }

    // 监听：状态变化时自动保存
    watch(
      () => store.$state,
      (state) => {
        try {
          uni.setStorageSync(key, JSON.stringify(toRaw(state)))
        } catch (e) {
          console.warn(`[Pinia Persist] Failed to save store "${store.$id}":`, e)
        }
      },
      { deep: true }
    )
  }
}
