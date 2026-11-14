export type ConnectionLevel = 'error' | 'offline' | 'reconnecting' | 'syncing' | 'ready'

export interface ConnectionStatusInput {
  online: boolean
  syncError: string | null
  syncErrorCode?: string | null
  serviceUnavailable: boolean
  realtime: 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
  syncing: boolean
  chatError: string | null
  chatErrorCode?: string | null
}

export interface ConnectionProjection {
  level: ConnectionLevel
  code: string | null
  message: string
  retryable: boolean
}

export const defaultConnectionStatusMessages: Readonly<Record<ConnectionLevel, string>> = {
  error: '服务暂时不可用',
  offline: '当前离线，本地修改会在恢复网络后同步',
  reconnecting: '实时连接恢复中',
  syncing: '同步中',
  ready: '已同步',
}

export function projectConnectionStatus(
  input: ConnectionStatusInput,
  messages = defaultConnectionStatusMessages,
): ConnectionProjection {
  if (input.syncError || input.serviceUnavailable || input.chatError) {
    return {
      level: 'error',
      code: input.syncErrorCode || input.chatErrorCode || input.syncError || 'SERVICE_UNAVAILABLE',
      message: input.syncError || input.chatError || messages.error,
      retryable: true,
    }
  }

  if (!input.online) {
    return {
      level: 'offline',
      code: 'OFFLINE',
      message: messages.offline,
      retryable: true,
    }
  }

  if (input.realtime === 'reconnecting' || input.realtime === 'connecting') {
    return {
      level: 'reconnecting',
      code: 'REALTIME_RECONNECTING',
      message: messages.reconnecting,
      retryable: true,
    }
  }

  if (input.syncing) {
    return {
      level: 'syncing',
      code: 'SYNCING',
      message: messages.syncing,
      retryable: true,
    }
  }

  return {
    level: 'ready',
    code: null,
    message: messages.ready,
    retryable: false,
  }
}
