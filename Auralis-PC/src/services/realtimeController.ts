import { getClientRuntimeConfig, resolveWebsocketUrl, type RuntimeConfig } from '../config/runtime.ts'
import { dedupeEventKey, isNewerCursor, normalizeCursor, type RealtimeEventLike } from '../api/protocol.ts'
import type { RealtimeEvent } from '../types/api.ts'

export type RealtimeStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export interface TicketResponseLike {
  ticket?: string
  expiresAt?: string
  websocketUrl?: string
}

export interface RealtimeControllerOptions {
  getServerDeviceId?: () => string
  requestTicket?: () => Promise<TicketResponseLike>
  getRuntimeConfig?: () => RuntimeConfig
  websocketFactory?: (url: string) => WebSocket
  onEvent?: (event: RealtimeEvent) => void
  onSyncSignal?: (reason: string) => void
  onStatusChange?: (status: RealtimeStatus) => void
  initialCursor?: string | null
  maxRetryDelayMs?: number
}

async function defaultRequestTicket(): Promise<TicketResponseLike> {
  const { requestRealtimeTicket } = await import('../api/realtime.ts')
  return requestRealtimeTicket()
}

async function requestStoreSync(): Promise<void> {
  try {
    const { useSyncStore } = await import('../store/useSyncStore.ts')
    const syncStore = useSyncStore()
    if (typeof syncStore.requestBackgroundSync === 'function') {
      syncStore.requestBackgroundSync('realtime')
    }
  } catch {
    // Pinia store or syncStore not initialized
  }
}

export class RealtimeController {
  private ws: WebSocket | null = null
  private isStopped = true
  private isConnecting = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private ticketExpiryTimer: ReturnType<typeof setTimeout> | null = null
  private retryCount = 0
  private currentCursor: string | null = null
  private readonly seenEvents = new Set<string>()
  private readonly maxSeenEvents = 1000
  private status: RealtimeStatus = 'disconnected'

  private readonly getServerDeviceId: () => string
  private readonly requestTicket: () => Promise<TicketResponseLike>
  private readonly getRuntimeConfig: () => RuntimeConfig
  private readonly websocketFactory: (url: string) => WebSocket
  private readonly onEvent?: (event: RealtimeEvent) => void
  private readonly onSyncSignal?: (reason: string) => void
  private readonly onStatusChange?: (status: RealtimeStatus) => void
  private readonly maxRetryDelayMs: number

  constructor(options: RealtimeControllerOptions = {}) {
    this.getServerDeviceId = options.getServerDeviceId ?? (() => '')
    this.requestTicket = options.requestTicket ?? defaultRequestTicket
    this.getRuntimeConfig = options.getRuntimeConfig ?? getClientRuntimeConfig
    this.websocketFactory =
      options.websocketFactory ??
      ((url: string) => {
        if (typeof WebSocket === 'undefined') {
          throw new Error('WebSocket is not available in the current environment')
        }
        return new WebSocket(url)
      })
    this.onEvent = options.onEvent
    this.onSyncSignal = options.onSyncSignal
    this.onStatusChange = options.onStatusChange
    this.currentCursor = normalizeCursor(options.initialCursor)
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 30000
  }

  public getStatus(): RealtimeStatus {
    return this.status
  }

  public getCursor(): string | null {
    return this.currentCursor
  }

  public setCursor(cursor: string | number | null | undefined): void {
    this.currentCursor = normalizeCursor(cursor)
  }

  private setStatus(newStatus: RealtimeStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus
      this.onStatusChange?.(newStatus)
    }
  }

  public start(): void {
    if (!this.isStopped && (this.isConnecting || (this.ws && this.ws.readyState === 1))) {
      return
    }
    this.isStopped = false
    this.retryCount = 0
    void this.connect()
  }

  public stop(): void {
    this.isStopped = true
    this.isConnecting = false
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ticketExpiryTimer !== null) {
      clearTimeout(this.ticketExpiryTimer)
      this.ticketExpiryTimer = null
    }
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onerror = null
      this.ws.onclose = null
      try {
        this.ws.close()
      } catch {
        // Ignore closing errors
      }
      this.ws = null
    }
    this.retryCount = 0
    this.seenEvents.clear()
    this.currentCursor = null
    this.setStatus('disconnected')
  }

  public reconnect(): void {
    this.stop()
    this.start()
  }

  private async connect(): Promise<void> {
    if (this.isStopped) return

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.isConnecting = true
    this.setStatus(this.retryCount > 0 ? 'reconnecting' : 'connecting')

    try {
      this.getServerDeviceId()
      const ticketResponse = await this.requestTicket()

      if (this.isStopped) return

      const ticket = ticketResponse?.ticket
      if (!ticket) {
        throw new Error('Realtime ticket response did not contain a ticket')
      }

      const relativeOrAbsolute =
        ticketResponse.websocketUrl || `/ws/events?ticket=${encodeURIComponent(ticket)}`

      const runtimeConfig = this.getRuntimeConfig()
      const targetUrl = resolveWebsocketUrl(relativeOrAbsolute, runtimeConfig)

      // Ensure no access token or refresh token is present in the URL
      if (/[?&](?:token|accessToken|refreshToken)=/i.test(targetUrl)) {
        throw new Error('Security violation: Access token must not be included in WebSocket URL')
      }

      const websocketUrl = new URL(targetUrl)
      if (!/^wss?:$/i.test(websocketUrl.protocol)) {
        throw new Error('Realtime websocket URL must use ws or wss')
      }
      if (!websocketUrl.pathname.endsWith('/ws/events') || websocketUrl.searchParams.get('ticket') !== ticket) {
        throw new Error('Realtime websocket URL must target /ws/events with the issued ticket')
      }

      const expiresAtMs = ticketResponse.expiresAt ? Date.parse(ticketResponse.expiresAt) : null
      if (expiresAtMs !== null && Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
        throw new Error('Realtime ticket has already expired')
      }

      const socket = this.websocketFactory(targetUrl)
      this.ws = socket

      socket.onopen = () => {
        if (this.isStopped || this.ws !== socket) {
          try {
            socket.close()
          } catch {
            // Ignore close error
          }
          return
        }
        this.retryCount = 0
        this.isConnecting = false
        this.setStatus('connected')
      }

      socket.onmessage = (event: MessageEvent) => {
        if (this.isStopped || this.ws !== socket) return
        this.handleMessage(event.data)
      }

      socket.onerror = () => {
        // WebSocket error will trigger onclose
      }

      socket.onclose = () => {
        if (this.ticketExpiryTimer !== null) {
          clearTimeout(this.ticketExpiryTimer)
          this.ticketExpiryTimer = null
        }
        if (this.ws === socket) {
          this.ws = null
        }
        this.isConnecting = false

        if (this.isStopped) {
          this.setStatus('disconnected')
          return
        }

        this.scheduleReconnect()
      }

      if (expiresAtMs !== null && Number.isFinite(expiresAtMs)) {
        this.ticketExpiryTimer = setTimeout(() => {
          if (this.isStopped || this.ws !== socket) return
          try {
            socket.close(4001, 'realtime ticket expired')
          } catch {
            // The close handler still schedules a fresh ticket when available.
          }
        }, Math.max(0, expiresAtMs - Date.now()))
      }
    } catch {
      this.isConnecting = false
      if (this.isStopped) {
        this.setStatus('disconnected')
        return
      }
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.isStopped) return
    this.setStatus('reconnecting')
    const delay = Math.min(Math.pow(2, this.retryCount) * 1000, this.maxRetryDelayMs)
    this.retryCount++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, delay)
  }

  private handleMessage(data: unknown): void {
    if (!data) return

    let parsed: unknown
    if (typeof data === 'string') {
      try {
        parsed = JSON.parse(data)
      } catch {
        return
      }
    } else if (typeof data === 'object') {
      parsed = data
    } else {
      return
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return
    }

    const raw = parsed as Record<string, unknown>
    if (!raw.type || !raw.resourceType || !raw.resourceId) {
      return
    }

    const eventLike: RealtimeEventLike = {
      type: String(raw.type),
      resourceType: String(raw.resourceType),
      resourceId: String(raw.resourceId),
      cursor: (raw.cursor as string | number) ?? '',
      occurredAt: raw.occurredAt ? String(raw.occurredAt) : undefined,
    }

    const dedupeKey = dedupeEventKey(eventLike)
    if (this.seenEvents.has(dedupeKey)) {
      return
    }

    this.seenEvents.add(dedupeKey)
    if (this.seenEvents.size > this.maxSeenEvents) {
      const oldestKey = this.seenEvents.values().next().value
      if (oldestKey !== undefined) {
        this.seenEvents.delete(oldestKey)
      }
    }

    const normalizedCursor = normalizeCursor(eventLike.cursor)
    if (normalizedCursor !== null && isNewerCursor(normalizedCursor, this.currentCursor)) {
      this.currentCursor = normalizedCursor
    }

    const realtimeEvent: RealtimeEvent = {
      type: eventLike.type,
      resourceType: eventLike.resourceType,
      resourceId: eventLike.resourceId,
      cursor: normalizedCursor ?? '',
      occurredAt: eventLike.occurredAt ?? new Date().toISOString(),
    }

    this.onEvent?.(realtimeEvent)
    this.onSyncSignal?.('realtime')

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent('auralis-realtime-event', { detail: realtimeEvent }))
      } catch {
        // Ignore event dispatch errors
      }
    }

    void requestStoreSync()
  }
}

export const realtimeController = new RealtimeController()
