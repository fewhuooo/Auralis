const STORAGE_KEY_MASTER = 'auralis_e2ee_master_key'
const STORAGE_KEY_SALT = 'auralis_e2ee_salt'
const PBKDF2_ITERATIONS = 600_000
const NONCE_LEN = 12

function b64Encode(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  // Handle URL-safe base64 variants from other platforms
  return btoa(binary)
}

function b64Decode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4 !== 0) str += '='
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function getDeviceFingerprint(): Promise<string> {
  try {
    const info = uni.getSystemInfoSync()
    return `${info.brand}-${info.model}-${info.system}-${info.platform}`
  } catch {
    return 'auralis-fallback-device-id'
  }
}

async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveBits', 'deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

function getStoredMasterKey(): string | null {
  try {
    return uni.getStorageSync(STORAGE_KEY_MASTER) || null
  } catch {
    return null
  }
}

function storeMasterKey(encoded: string): void {
  uni.setStorageSync(STORAGE_KEY_MASTER, encoded)
}

function getStoredSalt(): string | null {
  try {
    return uni.getStorageSync(STORAGE_KEY_SALT) || null
  } catch {
    return null
  }
}

function storeSalt(b64: string): void {
  uni.setStorageSync(STORAGE_KEY_SALT, b64)
}

async function ensureMasterKey(): Promise<CryptoKey> {
  const storedKey = getStoredMasterKey()
  if (storedKey) {
    const raw = b64Decode(storedKey)
    return crypto.subtle.importKey(
      'raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    )
  }
  return generateAndStoreMasterKey()
}

async function generateAndStoreMasterKey(): Promise<CryptoKey> {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
  )
  const raw = await crypto.subtle.exportKey('raw', key)
  storeMasterKey(b64Encode(new Uint8Array(raw)))

  // Generate wrapping salt for backup support
  const salt = crypto.getRandomValues(new Uint8Array(32))
  storeSalt(b64Encode(salt))

  return key
}

export const e2ee = {
  async initialize(): Promise<boolean> {
    try {
      await ensureMasterKey()
      return true
    } catch (e) {
      console.error('[Mobile E2EE] Initialization failed:', e)
      return false
    }
  },

  async isEnabled(): Promise<boolean> {
    return getStoredMasterKey() !== null
  },

  async encrypt(data: object): Promise<string> {
    const key = await ensureMasterKey()
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LEN))
    const enc = new TextEncoder()
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, enc.encode(JSON.stringify(data)))
    )
    const payload = new Uint8Array(NONCE_LEN + ciphertext.length)
    payload.set(nonce)
    payload.set(ciphertext, NONCE_LEN)
    return b64Encode(payload)
  },

  async decrypt(encryptedData: string): Promise<object> {
    const key = await ensureMasterKey()
    const payload = b64Decode(encryptedData)
    if (payload.length < NONCE_LEN) throw new Error('Encrypted payload too short')
    const nonce = payload.slice(0, NONCE_LEN)
    const ciphertext = payload.slice(NONCE_LEN)
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce }, key, ciphertext
    )
    return JSON.parse(new TextDecoder().decode(plaintext))
  },

  async exportKeyBundle(passphrase: string): Promise<{ encrypted_key: string; salt: string; version: number }> {
    const storedKey = getStoredMasterKey()
    if (!storedKey) throw new Error('No master key found')

    const salt = crypto.getRandomValues(new Uint8Array(32))
    const wrappingKey = await deriveKeyFromPassphrase(passphrase, salt, PBKDF2_ITERATIONS)
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LEN))
    const masterBytes = b64Decode(storedKey)

    const wrapped = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, wrappingKey, masterBytes)
    )
    const wrappedPayload = new Uint8Array(NONCE_LEN + wrapped.length)
    wrappedPayload.set(nonce)
    wrappedPayload.set(wrapped, NONCE_LEN)

    return {
      encrypted_key: b64Encode(wrappedPayload),
      salt: b64Encode(salt),
      version: 1
    }
  },

  async importKeyBundle(
    encryptedKey: string,
    salt: string,
    passphrase: string
  ): Promise<boolean> {
    const saltBytes = b64Decode(salt)
    const wrappingKey = await deriveKeyFromPassphrase(passphrase, saltBytes, PBKDF2_ITERATIONS)

    const wrappedPayload = b64Decode(encryptedKey)
    if (wrappedPayload.length < NONCE_LEN) throw new Error('Encrypted key payload too short')

    const nonce = wrappedPayload.slice(0, NONCE_LEN)
    const wrapped = wrappedPayload.slice(NONCE_LEN)

    const masterBytes = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, wrappingKey, wrapped)
    )

    storeMasterKey(b64Encode(masterBytes))
    storeSalt(salt)
    return true
  }
}
