import { invoke } from '@tauri-apps/api/core';
import { useBlockStore } from '@/store/useBlockStore';
import { useTaskStore } from '@/store/useTaskStore';
import { ElNotification } from 'element-plus';
import 'element-plus/theme-chalk/el-notification.css';

/**
 * 通用 Rust 命令调用封装
 */
export const invokeRustCmd = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
  try {
    console.log(`[Tauri] Invoking Rust command: ${command}`, args || '');
    const response = await invoke<T>(command, args);
    return response;
  } catch (error) {
    console.error(`[Tauri] Command "${command}" failed:`, error);
    throw error;
  }
};

/**
 * 建立 WebSocket 长连接（实时接收后端推送）
 */
export const subscribeToCloudSync = (): () => void => {
  let ws: WebSocket | null = null;
  let reconnectTimeout: number | null = null;
  let retryCount = 0;
  const maxRetryCount = 10;
  let isClosed = false;

  const connect = () => {
    // 防御性判断：如果已经处于连接中或已连接状态，直接跳过
    if (isClosed || (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN))) {
      return;
    }
    
    console.log('[WebSocket] Attempting to connect...');
    ws = new WebSocket('ws://127.0.0.1:8080/ws/sync');
    
    ws.onopen = () => {
      console.log('[WebSocket] Connected to cloud sync');
      retryCount = 0;
      // 首次连接成功，拉取最新数据
      const blockStore = useBlockStore();
      const taskStore = useTaskStore();
      blockStore.fetchBlocks();
      taskStore.fetchTasks();
    };
    
    ws.onmessage = (event) => {
      try {
        let rawData = event.data;
        let syncEvent: any;

        // 处理 GenericJackson2JsonRedisSerializer 格式: ["class", {data}]
        if (rawData.startsWith('[')) {
          const parsed = JSON.parse(rawData);
          if (Array.isArray(parsed) && parsed.length >= 2) {
            syncEvent = parsed[1];
          } else {
            return;
          }
        } else {
          syncEvent = JSON.parse(rawData);
        }

        console.log('[WebSocket] Received sync event:', syncEvent.type, 'for', syncEvent.entity);
        
        // 反应式刷新：根据实体类型触发 Store 重新拉取
        if (syncEvent.entity === 'blocks') {
          const blockStore = useBlockStore();
          blockStore.fetchBlocks();
          
          if (syncEvent.type === 'block_created') {
            try {
              const blockData = JSON.parse(syncEvent.data);
              // Avoid showing notification for the AI chat stream we just created locally
              if (blockData.source !== 'RAG 推理引擎') {
                ElNotification({
                  title: '✨ 知识入库成功',
                  message: `${blockData.subject || '新内容'}: ${blockData.title || '已自动整理并归档'}`,
                  type: 'success',
                  position: 'top-right',
                  duration: 4000
                });
              }
            } catch (e) {
              ElNotification({
                title: '✨ 知识入库成功',
                message: '有新的知识块已处理完毕并加入知识库',
                type: 'success',
                position: 'top-right',
                duration: 4000
              });
            }
          }
        } else if (syncEvent.entity === 'tasks') {
          const taskStore = useTaskStore();
          taskStore.fetchTasks();
        }
      } catch (e) {
        console.warn('[WebSocket] Failed to parse sync message:', e);
      }
    };
    
    ws.onclose = () => {
      console.log('[WebSocket] Connection closed');
      ws = null;
      if (!isClosed && retryCount < maxRetryCount) {
        const delay = Math.min(Math.pow(2, retryCount) * 1000, 30000); // Exponential backoff max 30s
        console.log(`[WebSocket] Reconnecting in ${delay}ms...`);
        reconnectTimeout = window.setTimeout(connect, delay);
        retryCount++;
      }
    };
    
    ws.onerror = (err) => {
      console.error('[WebSocket] Error:', err);
    };
  };

  connect();

  return () => {
    isClosed = true;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (ws) {
      ws.onclose = null; // 移除监听器防止触发重连逻辑
      ws.close();
    }
  };
};
