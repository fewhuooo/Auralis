import { invoke } from '@tauri-apps/api/core'

export interface KeyBundle {
  encrypted_key: string
  salt: string
  version: number
}

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
  },

  async encrypt(data: object): Promise<string> {
    return invoke<string>('crypto_encrypt', { data: JSON.stringify(data) })
  },

  async decrypt(encryptedData: string): Promise<object> {
    const json = await invoke<string>('crypto_decrypt', { encryptedData })
    return JSON.parse(json)
  },

  async exportKeyBundle(passphrase: string): Promise<KeyBundle> {
    return invoke<KeyBundle>('crypto_export_key_bundle', { passphrase })
  },

  async importKeyBundle(bundle: KeyBundle, passphrase: string): Promise<boolean> {
    return invoke<boolean>('crypto_import_key_bundle', {
      encryptedKey: bundle.encrypted_key,
      salt: bundle.salt,
      passphrase
    })
  }
}
