/**
 * ==========================================
 * 11.3 跨端同步服务 (Sync Service)
 * 负责移动端与 PC 端（Tauri 后端服务）之间的数据握手与同步
 * ==========================================
 */
import { useBlockStore } from '@/store/useBlockStore'
import { useTaskStore } from '@/store/useTaskStore'

// PC 端 Tauri 后端的基础地址（开发环境默认值）
const PC_API_BASE = 'http://localhost:8765'

interface SyncPayload {
  type: 'blocks' | 'tasks' | 'full'
  timestamp: number
  data: any
}

interface SyncResult {
  success: boolean
  message: string
  data?: any
}

/**
 * 检查 PC 端服务是否在线（心跳检测）
 */
export const checkPCConnection = async (): Promise<boolean> => {
  try {
    const res: any = await uni.request({
      url: `${PC_API_BASE}/api/ping`,
      method: 'GET',
      timeout: 3000,
    })
    return res.statusCode === 200
  } catch {
    return false
  }
}

/**
 * 从 PC 端拉取最新的知识块数据
 */
export const pullBlocks = async (): Promise<SyncResult> => {
  try {
    const res: any = await uni.request({
      url: `${PC_API_BASE}/api/blocks`,
      method: 'GET',
      timeout: 5000,
    })
    if (res.statusCode === 200 && res.data) {
      const blockStore = useBlockStore()
      blockStore.syncFromRemote(res.data)
      return { success: true, message: `同步了 ${res.data.length} 个知识块` }
    }
    return { success: false, message: '数据格式异常' }
  } catch (e: any) {
    return { success: false, message: `连接失败: ${e.errMsg || e.message}` }
  }
}

/**
 * 从 PC 端拉取最新的任务排期数据
 */
export const pullTasks = async (): Promise<SyncResult> => {
  try {
    const res: any = await uni.request({
      url: `${PC_API_BASE}/api/tasks`,
      method: 'GET',
      timeout: 5000,
    })
    if (res.statusCode === 200 && res.data) {
      const taskStore = useTaskStore()
      taskStore.syncFromRemote(res.data)
      return { success: true, message: '排期数据已同步' }
    }
    return { success: false, message: '数据格式异常' }
  } catch (e: any) {
    return { success: false, message: `连接失败: ${e.errMsg || e.message}` }
  }
}

/**
 * 将移动端的操作（如完成任务、新增知识块）推送至 PC 端
 */
export const pushUpdate = async (payload: SyncPayload): Promise<SyncResult> => {
  try {
    const res: any = await uni.request({
      url: `${PC_API_BASE}/api/sync`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: payload,
      timeout: 5000,
    })
    if (res.statusCode === 200) {
      return { success: true, message: '已同步至 PC 端' }
    }
    return { success: false, message: `PC 端返回错误: ${res.statusCode}` }
  } catch (e: any) {
    return { success: false, message: `推送失败: ${e.errMsg || e.message}` }
  }
}

/**
 * 全量同步（拉取 blocks + tasks）
 */
export const fullSync = async (): Promise<SyncResult> => {
  const isOnline = await checkPCConnection()
  if (!isOnline) {
    return { success: false, message: 'PC 端离线，无法同步' }
  }

  const [blockResult, taskResult] = await Promise.all([pullBlocks(), pullTasks()])

  if (blockResult.success && taskResult.success) {
    return { success: true, message: '全量同步完成' }
  }
  return {
    success: false,
    message: `同步部分失败 — Blocks: ${blockResult.message}, Tasks: ${taskResult.message}`,
  }
}

/**
 * 建立 WebSocket 长连接（实时接收 PC 端推送）
 */
let socketTask: UniApp.SocketTask | null = null

export const connectRealtimeSync = (onMessage?: (data: SyncPayload) => void) => {
  if (socketTask) return // 避免重复连接

  socketTask = uni.connectSocket({
    url: `ws://localhost:8765/ws/sync`,
    complete: () => {},
  })

  socketTask.onOpen(() => {
    console.log('[Sync] WebSocket 已连接至 PC 端')
  })

  socketTask.onMessage((res) => {
    try {
      const payload: SyncPayload = JSON.parse(res.data as string)
      console.log('[Sync] 收到 PC 端推送:', payload.type)

      // 自动应用同步数据
      if (payload.type === 'blocks') {
        const blockStore = useBlockStore()
        blockStore.syncFromRemote(payload.data)
      } else if (payload.type === 'tasks') {
        const taskStore = useTaskStore()
        taskStore.syncFromRemote(payload.data)
      }

      onMessage?.(payload)
    } catch (e) {
      console.warn('[Sync] 解析推送数据失败:', e)
    }
  })

  socketTask.onClose(() => {
    console.log('[Sync] WebSocket 连接已关闭')
    socketTask = null
    // 断线重连（5秒后）
    setTimeout(() => connectRealtimeSync(onMessage), 5000)
  })

  socketTask.onError((err) => {
    console.warn('[Sync] WebSocket 错误:', err)
  })
}

/**
 * 断开 WebSocket 连接
 */
export const disconnectRealtimeSync = () => {
  if (socketTask) {
    socketTask.close({})
    socketTask = null
  }
}
