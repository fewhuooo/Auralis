import type { UploadProgressCallback } from '@/services/assetUpload'

export interface NativePickedFileMeta {
  bridgeFileId: string
  name: string
  size: number
  type: string
}

export interface NativePickResponse {
  requestId: number
  cancelled: boolean
  file?: NativePickedFileMeta
  error?: string
}

export interface NativeUploadProgress {
  jobId: number
  loaded: number
  total: number
}

export interface NativeUploadResponse {
  jobId: number
  ok: boolean
  error?: string
}

export interface NativeUploadHost {
  dispatchPick(requestId: number, accept: string): void
  dispatchUpload(jobId: number, bridgeFileId: string, url: string, headers: Record<string, string>): void
  dispatchRelease(bridgeFileId: string): void
}

export interface NativeUploadRegistration {
  dispose(): void
  onPickResult(response: NativePickResponse): void
  onUploadProgress(progress: NativeUploadProgress): void
  onUploadResult(response: NativeUploadResponse): void
}

interface HostEntry {
  hostId: symbol
  host: NativeUploadHost
}

interface PendingPick {
  requestId: number
  hostId: symbol
  resolve: (file: NativePickedFileMeta | null) => void
  reject: (error: Error) => void
}

interface PendingUpload {
  jobId: number
  hostId: symbol
  onProgress?: UploadProgressCallback
  resolve: () => void
  reject: (error: Error) => void
}

export interface NativeUploadBridgeInstance {
  registerHost(host: NativeUploadHost): NativeUploadRegistration
  hasHost(): boolean
  requestPick(accept: string): Promise<NativePickedFileMeta | null>
  requestPut(params: {
    bridgeFileId: string
    url: string
    headers: Record<string, string>
    onProgress?: UploadProgressCallback
  }): Promise<void>
  releaseFile(bridgeFileId: string): void
}

export function decodeBase64ToArrayBuffer(rawBase64: string): ArrayBuffer {
  const commaIdx = rawBase64.indexOf(',')
  const payload = (commaIdx >= 0 && rawBase64.slice(0, commaIdx).includes(';base64')
    ? rawBase64.slice(commaIdx + 1)
    : rawBase64).replace(/\s+/g, '')
  if (!payload) return new ArrayBuffer(0)

  if (typeof atob === 'function') {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  }

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = payload.replace(/=+$/, '')
  const outputLen = Math.floor((clean.length * 3) / 4)
  const bytes = new Uint8Array(outputLen)
  let out = 0
  for (let i = 0; i < clean.length; i += 4) {
    const c1 = alphabet.indexOf(clean[i])
    const c2 = alphabet.indexOf(clean[i + 1])
    const c3 = i + 2 < clean.length ? alphabet.indexOf(clean[i + 2]) : 0
    const c4 = i + 3 < clean.length ? alphabet.indexOf(clean[i + 3]) : 0
    if (c1 < 0 || c2 < 0 || c3 < 0 || c4 < 0) {
      throw new Error('Invalid base64 file payload')
    }
    const triple = (c1 << 18) | (c2 << 12) | (c3 << 6) | c4
    if (out < outputLen) bytes[out++] = (triple >> 16) & 0xff
    if (out < outputLen) bytes[out++] = (triple >> 8) & 0xff
    if (out < outputLen) bytes[out++] = triple & 0xff
  }
  return bytes.buffer
}

export function createNativeUploadBridge(): NativeUploadBridgeInstance {
  const hosts: HostEntry[] = []
  let nextId = 1
  let pendingPick: PendingPick | null = null
  const pendingUploads = new Map<number, PendingUpload>()

  function currentHost(): HostEntry | null {
    return hosts.length > 0 ? hosts[hosts.length - 1] : null
  }

  function registerHost(host: NativeUploadHost): NativeUploadRegistration {
    const hostId = Symbol('native-upload-host')
    hosts.push({ hostId, host })

    return {
      dispose() {
        const index = hosts.findIndex(item => item.hostId === hostId)
        if (index >= 0) hosts.splice(index, 1)

        if (pendingPick && pendingPick.hostId === hostId) {
          const activePick = pendingPick
          pendingPick = null
          activePick.resolve(null)
        }

        for (const [jobId, upload] of pendingUploads.entries()) {
          if (upload.hostId === hostId) {
            pendingUploads.delete(jobId)
            upload.reject(new Error('文件上传组件已卸载，请重试'))
          }
        }
      },
      onPickResult(response: NativePickResponse) {
        if (!pendingPick || pendingPick.requestId !== response.requestId) return
        const activePick = pendingPick
        pendingPick = null
        if (response.error) {
          activePick.reject(new Error(response.error))
          return
        }
        if (response.cancelled || !response.file) {
          activePick.resolve(null)
          return
        }
        activePick.resolve(response.file)
      },
      onUploadProgress(progress: NativeUploadProgress) {
        const upload = pendingUploads.get(progress.jobId)
        if (!upload || !upload.onProgress || progress.total <= 0) return
        const ratio = Math.min(1, Math.max(0, progress.loaded / progress.total))
        upload.onProgress(30 + Math.round(ratio * 45), '正在上传文件...')
      },
      onUploadResult(response: NativeUploadResponse) {
        const upload = pendingUploads.get(response.jobId)
        if (!upload) return
        pendingUploads.delete(response.jobId)
        if (response.ok) {
          upload.resolve()
          return
        }
        upload.reject(new Error(response.error || '文件上传失败'))
      },
    }
  }

  function hasHost(): boolean {
    return hosts.length > 0
  }

  function requestPick(accept: string): Promise<NativePickedFileMeta | null> {
    const entry = currentHost()
    if (!entry) {
      return Promise.reject(new Error('当前页面未就绪，暂无法选择本地文件'))
    }
    if (pendingPick) {
      const previous = pendingPick
      pendingPick = null
      previous.resolve(null)
    }
    const requestId = nextId++
    return new Promise((resolve, reject) => {
      pendingPick = {
        requestId,
        hostId: entry.hostId,
        resolve,
        reject,
      }
      try {
        entry.host.dispatchPick(requestId, accept)
      } catch (err) {
        if (pendingPick?.requestId === requestId) pendingPick = null
        reject(err instanceof Error ? err : new Error('拉起文件选择器失败'))
      }
    })
  }

  function requestPut(params: {
    bridgeFileId: string
    url: string
    headers: Record<string, string>
    onProgress?: UploadProgressCallback
  }): Promise<void> {
    const entry = currentHost()
    if (!entry) {
      return Promise.reject(new Error('当前页面未就绪，无法执行原生上传'))
    }
    const jobId = nextId++
    return new Promise((resolve, reject) => {
      pendingUploads.set(jobId, {
        jobId,
        hostId: entry.hostId,
        onProgress: params.onProgress,
        resolve,
        reject,
      })
      try {
        entry.host.dispatchUpload(jobId, params.bridgeFileId, params.url, params.headers)
      } catch (err) {
        pendingUploads.delete(jobId)
        reject(err instanceof Error ? err : new Error('发起文件上传失败'))
      }
    })
  }

  function releaseFile(bridgeFileId: string): void {
    if (!bridgeFileId) return
    for (const entry of hosts) {
      try {
        entry.host.dispatchRelease(bridgeFileId)
      } catch {
        // Ignore teardown release failures
      }
    }
  }

  return {
    registerHost,
    hasHost,
    requestPick,
    requestPut,
    releaseFile,
  }
}

const defaultBridge = createNativeUploadBridge()

export const registerNativeUploadHost = defaultBridge.registerHost
export const hasNativeUploadHost = defaultBridge.hasHost
export const requestNativeFilePick = defaultBridge.requestPick
export const requestNativeFilePut = defaultBridge.requestPut
export const releaseNativeBridgeFile = defaultBridge.releaseFile
