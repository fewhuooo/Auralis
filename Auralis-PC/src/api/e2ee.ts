import { invoke } from '@tauri-apps/api/core'

export const e2ee = {
  async initialize(): Promise<boolean> {
    try {
      const hasKey = await invoke<boolean>('crypto_has_master_key')
      if (!hasKey) {
        return await invoke<boolean>('crypto_generate_master_key')
      }
      return true
    } catch (e) {
      console.error('[E2EE] Initialization failed:', e)
      return false
    }
  },

  async isEnabled(): Promise<boolean> {
    try {
      return await invoke<boolean>('crypto_has_master_key')
    } catch {
      return false
    }
  }
}
