/**
 * 跨端同步服务 (Sync Service)
 * 14.5: 接收后端 Redis Pub/Sub 推送的 WebSocket 消息并更新 Store
 */
import { useBlockStore } from '@/store/useBlockStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useSyncStore } from '@/store/useSyncStore'

const WS_URL = 'ws://localhost:8080/ws/sync'

interface SyncEvent {
  type: string      // e.g. "block_created", "task_updated"
  entity: string    // "blocks" or "tasks"
  entityId: string
  data: string      // JSON payload
  timestamp: number
}

let socketTask: UniApp.SocketTask | null = null
let reconnectTimer: number | null = null
let pingTimer: number | null = null

/**
 * 建立 WebSocket 长连接
 */
export const connectRealtimeSync = () => {
  if (socketTask) return

  const authStore = useAuthStore()
  const token = authStore.token || ''
  const finalUrl = `${WS_URL}?token=${encodeURIComponent(token)}`

  console.log('[Sync] Connecting to WebSocket:', finalUrl)
  socketTask = uni.connectSocket({
    url: finalUrl,
    fail: (err) => {
      console.error('[Sync] WebSocket connection failed:', err)
      scheduleReconnect()
    }
  })

  socketTask.onOpen(() => {
    console.log('[Sync] WebSocket connected')
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    
    // Start heartbeat keep-alive
    pingTimer = setInterval(() => {
      if (socketTask) {
        uni.sendSocketMessage({
          data: JSON.stringify({ type: 'PING', token: authStore.token || '' }),
          fail: (err) => {
            console.error('[Sync] Failed to send heartbeat Ping:', err)
          }
        })
      }
    }, 30000) as unknown as number
    
    // Initial bidirectional sync to catch up on connection
    const syncStore = useSyncStore()
    syncStore.triggerSync()
  })

  socketTask.onMessage((res) => {
    try {
      let rawData = res.data as string
      let event: SyncEvent

      // Skip PONG packets
      if (rawData.includes('"type":"PONG"')) {
        return
      }

      // Handle GenericJackson2JsonRedisSerializer format: ["class", {data}]
      if (rawData.startsWith('[')) {
        const parsed = JSON.parse(rawData)
        if (Array.isArray(parsed) && parsed.length >= 2) {
          event = parsed[1] as SyncEvent
        } else {
          return
        }
      } else {
        event = JSON.parse(rawData) as SyncEvent
      }

      console.log('[Sync] Received event:', event.type, 'for', event.entity)

      // Trigger bidirectional sync自愈
      const syncStore = useSyncStore()
      syncStore.triggerSync()
    } catch (e) {
      console.warn('[Sync] Failed to parse sync event:', e)
    }
  })

  socketTask.onClose((res) => {
    console.log('[Sync] WebSocket closed', res)
    clearPingTimer()
    socketTask = null
    scheduleReconnect()
  })

  socketTask.onError((err) => {
    console.error('[Sync] WebSocket error:', err)
    clearPingTimer()
    socketTask = null
    scheduleReconnect()
  })
}

function clearPingTimer() {
  if (pingTimer) {
    clearInterval(pingTimer)
    pingTimer = null
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return
  console.log('[Sync] Reconnecting in 5s...')
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectRealtimeSync()
  }, 5000) as unknown as number
}

/**
 * 断开连接
 */
export const disconnectRealtimeSync = () => {
  clearPingTimer()
  if (socketTask) {
    socketTask.close({})
    socketTask = null
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}
