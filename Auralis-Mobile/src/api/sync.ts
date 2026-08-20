import { dedupeEventKey } from './protocol'
import { realtimeApi } from './realtimeApi'
import { getRuntimeConfig, resolveWebsocketUrl } from '@/config/runtime'
import { useAuthStore } from '@/store/useAuthStore'
import { useSyncStore } from '@/store/useSyncStore'

interface RealtimeEvent {
  type?: string
  cursor?: string
  eventId?: string
}

let socketTask: UniApp.SocketTask | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempt = 0
let explicitlyDisconnected = false
const recentEvents = new Set<string>()

function scheduleReconnect() {
  if (explicitlyDisconnected || reconnectTimer || !useAuthStore().isAuthenticated) return
  const delay = Math.min(30_000, 1_000 * (2 ** reconnectAttempt))
  reconnectAttempt += 1
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void connectRealtimeSync()
  }, delay)
}

function rememberEvent(event: RealtimeEvent): boolean {
  const key = event.eventId || dedupeEventKey(event)
  if (recentEvents.has(key)) return false
  recentEvents.add(key)
  if (recentEvents.size > 200) recentEvents.delete(recentEvents.values().next().value!)
  return true
}

export async function connectRealtimeSync() {
  if (socketTask || !useAuthStore().isAuthenticated) return
  explicitlyDisconnected = false
  try {
    const auth = useAuthStore()
    const ticket = await realtimeApi.issueTicket(auth.deviceId)
    if (!ticket.ticket && !ticket.websocketUrl) throw new Error('Realtime ticket response is incomplete')
    const path = ticket.websocketUrl || `/ws/events?ticket=${encodeURIComponent(ticket.ticket!)}`
    const url = resolveWebsocketUrl(path, getRuntimeConfig())
    const task = uni.connectSocket({ url }) as unknown as UniApp.SocketTask
    socketTask = task
    task.onOpen(() => {
      reconnectAttempt = 0
      void useSyncStore().triggerSync()
    })
    task.onMessage((message) => {
      try {
        const event = JSON.parse(String(message.data)) as RealtimeEvent
        if (rememberEvent(event) && (event.type === 'SYNC_CHANGED' || event.type === 'REVIEW_UPDATED')) {
          void useSyncStore().triggerSync()
        }
      } catch (error) {
        console.warn('[Realtime] Ignored malformed event:', error)
      }
    })
    task.onClose(() => {
      socketTask = null
      scheduleReconnect()
    })
    task.onError(() => {
      socketTask = null
      scheduleReconnect()
    })
  } catch (error) {
    console.error('[Realtime] Connection failed:', error)
    scheduleReconnect()
  }
}

export function disconnectRealtimeSync() {
  explicitlyDisconnected = true
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  reconnectAttempt = 0
  const activeSocket = socketTask
  socketTask = null
  activeSocket?.close({})
}
