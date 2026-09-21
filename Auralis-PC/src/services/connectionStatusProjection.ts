export type ConnectionLevel = 'error' | 'offline' | 'reconnecting' | 'syncing' | 'ready'

export interface ConnectionStatusInput {
  online: boolean
  syncError: string | null
  serviceUnavailable: boolean
  realtime: 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
  syncing: boolean
  chatError: string | null
}

export interface ConnectionProjection {
  level: ConnectionLevel
  code: string | null
  message: string
  retryable: boolean
}

export function projectConnectionStatus(input: ConnectionStatusInput): ConnectionProjection {
  if (input.syncError || input.serviceUnavailable || input.chatError) {
    return {
      level: 'error',
      code: input.syncError || 'SERVICE_UNAVAILABLE',
      message: input.syncError || input.chatError || '服务暂时不可用',
      retryable: true,
    }
  }

  if (!input.online) {
    return {
      level: 'offline',
      code: 'OFFLINE',
      message: '当前离线，本地修改会在恢复网络后同步',
      retryable: true,
    }
  }

  if (input.realtime === 'reconnecting' || input.realtime === 'connecting') {
    return {
      level: 'reconnecting',
      code: 'REALTIME_RECONNECTING',
      message: '实时连接恢复中',
      retryable: true,
    }
  }

  if (input.syncing) {
    return {
      level: 'syncing',
      code: 'SYNCING',
      message: '同步中',
      retryable: true,
    }
  }

  return {
    level: 'ready',
    code: null,
    message: '已同步',
    retryable: false,
  }
}
