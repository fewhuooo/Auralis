import { dedupeEventKey } from './protocol'
import { realtimeApi } from './realtimeApi'
import { getRuntimeConfig, resolveWebsocketUrl } from '@/config/runtime'
import { useAuthStore } from '@/store/useAuthStore'
import { useSyncStore } from '@/store/useSyncStore'

interface RealtimeEvent {
  type?: string
  resourceType?: string
  resourceId?: string
  cursor?: string
  eventId?: string
}

export type OverviewRealtimeListener = (event: { resourceType?: string; resourceId?: string }) => void

const overviewListeners = new Set<OverviewRealtimeListener>()

export function subscribeOverviewUpdated(listener: OverviewRealtimeListener): () => void {
  overviewListeners.add(listener)
  return () => {
    overviewListeners.delete(listener)
  }
}

let socketTask: UniApp.SocketTask | null = null
let activeSocketIdentity = ''
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempt = 0
let explicitlyDisconnected = false
let connectSeq = 0
let activeConnectFlight: { seq: number; identity: string; promise: Promise<void> } | null = null
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
  const auth = useAuthStore()
  const targetIdentity = auth.user?.id && auth.serverDeviceId ? `${auth.user.id}:${auth.serverDeviceId}` : ''
  if (!auth.isAuthenticated || !targetIdentity) return

  if (
    (socketTask && activeSocketIdentity !== targetIdentity)
    || (activeConnectFlight && activeConnectFlight.identity !== targetIdentity)
  ) {
    disconnectRealtimeSync()
  }

  if (socketTask && activeSocketIdentity === targetIdentity) return
  if (activeConnectFlight && activeConnectFlight.seq === connectSeq && activeConnectFlight.identity === targetIdentity) {
    return activeConnectFlight.promise
  }

  explicitlyDisconnected = false
  const seq = ++connectSeq
  const generation = auth.getLoginGeneration()
  const userId = auth.user?.id
  const serverDeviceId = auth.serverDeviceId
  const isCurrentAttempt = () => (
    seq === connectSeq
    && !explicitlyDisconnected
    && auth.isAuthenticated
    && generation === auth.getLoginGeneration()
    && userId === auth.user?.id
    && serverDeviceId === auth.serverDeviceId
  )

  const flight = (async () => {
    try {
      const ticket = await realtimeApi.issueTicket()
      if (!isCurrentAttempt() || socketTask) return
      if (!ticket.ticket && !ticket.websocketUrl) throw new Error('Realtime ticket response is incomplete')
      const path = ticket.websocketUrl || `/ws/events?ticket=${encodeURIComponent(ticket.ticket!)}`
      const url = resolveWebsocketUrl(path, getRuntimeConfig())
      const task = uni.connectSocket({ url, complete: () => {} }) as unknown as UniApp.SocketTask
      socketTask = task
      activeSocketIdentity = targetIdentity
      task.onOpen(() => {
        if (socketTask !== task || !isCurrentAttempt()) {
          task.close({})
          return
        }
        reconnectAttempt = 0
        void useSyncStore().triggerSync()
      })
      task.onMessage((message) => {
        if (socketTask !== task || !isCurrentAttempt()) return
        try {
          const event = JSON.parse(String(message.data)) as RealtimeEvent
          if (!rememberEvent(event)) return
          if (event.type === 'OVERVIEW_UPDATED') {
            for (const listener of overviewListeners) {
              listener({ resourceType: event.resourceType, resourceId: event.resourceId })
            }
            return
          }
          if (
            event.type === 'SYNC_CHANGED'
            || event.type === 'REVIEW_UPDATED'
            || event.type === 'TASK_UPDATED'
            || event.type === 'KNOWLEDGE_UPDATED'
          ) {
            void useSyncStore().triggerSync()
          }
        } catch (error) {
          console.warn('[Realtime] Ignored malformed event:', error)
        }
      })
      task.onClose(() => {
        if (socketTask !== task) return
        socketTask = null
        activeSocketIdentity = ''
        if (isCurrentAttempt()) scheduleReconnect()
      })
      task.onError(() => {
        if (socketTask !== task) return
        socketTask = null
        activeSocketIdentity = ''
        if (isCurrentAttempt()) scheduleReconnect()
      })
    } catch (error) {
      console.error('[Realtime] Connection failed:', error)
      if (isCurrentAttempt()) scheduleReconnect()
    } finally {
      if (activeConnectFlight?.seq === seq) {
        activeConnectFlight = null
      }
    }
  })()

  activeConnectFlight = { seq, identity: targetIdentity, promise: flight }
  return flight
}

export function disconnectRealtimeSync() {
  connectSeq += 1
  activeConnectFlight = null
  explicitlyDisconnected = true
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  reconnectAttempt = 0
  activeSocketIdentity = ''
  recentEvents.clear()
  const activeSocket = socketTask
  socketTask = null
  activeSocket?.close({})
}
