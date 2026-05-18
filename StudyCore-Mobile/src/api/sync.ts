/**
 * 跨端同步服务 (Sync Service)
 * 14.5: 接收后端 Redis Pub/Sub 推送的 WebSocket 消息并更新 Store
 */
import { useBlockStore } from '@/store/useBlockStore'
import { useTaskStore } from '@/store/useTaskStore'

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

/**
 * 建立 WebSocket 长连接
 */
export const connectRealtimeSync = () => {
  if (socketTask) return

  console.log('[Sync] Connecting to WebSocket:', WS_URL)
  socketTask = uni.connectSocket({
    url: WS_URL,
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
    
    // Initial fetch to make sure we are up to date
    const blockStore = useBlockStore()
    const taskStore = useTaskStore()
    blockStore.fetchBlocks()
    taskStore.fetchTasks()
  })

  socketTask.onMessage((res) => {
    try {
      let rawData = res.data as string
      let event: SyncEvent

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

      // Reaction: Simple re-fetch is most reliable for now
      if (event.entity === 'blocks') {
        const blockStore = useBlockStore()
        blockStore.fetchBlocks()
      } else if (event.entity === 'tasks') {
        const taskStore = useTaskStore()
        taskStore.fetchTasks()
      }
    } catch (e) {
      console.warn('[Sync] Failed to parse sync event:', e)
    }
  })

  socketTask.onClose(() => {
    console.log('[Sync] WebSocket closed')
    socketTask = null
    scheduleReconnect()
  })

  socketTask.onError((err) => {
    console.error('[Sync] WebSocket error:', err)
    socketTask = null
    scheduleReconnect()
  })
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
  if (socketTask) {
    socketTask.close({})
    socketTask = null
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}
