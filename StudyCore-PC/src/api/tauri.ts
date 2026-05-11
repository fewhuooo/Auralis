import { invoke } from '@tauri-apps/api/core';
import { listen, type Event, type UnlistenFn } from '@tauri-apps/api/event';

/**
 * ==========================================
 * 8.2 预研 Tauri HTTP / Rust 接口调用
 * 配置前端通过 Tauri Invoke 与后端逻辑通信的基础逻辑
 * ==========================================
 */

/**
 * 通用 Rust 命令调用封装
 * @param command 注册在 Tauri 后端的 Rust 函数名 (例如: "fetch_knowledge_blocks")
 * @param args 传递给后端的参数对象
 */
export const invokeRustCmd = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
  try {
    console.log(`[Tauri] Invoking Rust command: ${command}`, args || '');
    // 实际运行时会调用 Rust 层的 #[tauri::command] 函数
    const response = await invoke<T>(command, args);
    return response;
  } catch (error) {
    console.error(`[Tauri] Command "${command}" failed:`, error);
    throw error;
  }
};


/**
 * ==========================================
 * 8.3 建立 WebSocket / Event 事件管道
 * 接收来自 Rust 守护进程推送的跨端(移动端/服务端)同步通知
 * ==========================================
 */

/**
 * 监听全局状态同步事件
 * @param callback 接收到更新推送时的回调函数
 * @returns 取消监听的函数
 */
export const subscribeToCloudSync = (callback: (payload: unknown) => void): () => void => {
  let ws: WebSocket | null = null;
  let reconnectTimeout: number | null = null;
  let retryCount = 0;
  const maxRetryCount = 5;
  let isClosed = false;

  const connect = () => {
    if (isClosed) return;
    
    ws = new WebSocket('ws://127.0.0.1:8080/ws/sync');
    
    ws.onopen = () => {
      console.log('[WebSocket] Connected to cloud sync');
      retryCount = 0;
    };
    
    ws.onmessage = (event) => {
      console.log('[WebSocket] Received cloud sync push:', event.data);
      try {
        callback(JSON.parse(event.data));
      } catch (e) {
        callback(event.data);
      }
    };
    
    ws.onclose = () => {
      console.log('[WebSocket] Connection closed');
      if (!isClosed && retryCount < maxRetryCount) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
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
    if (ws) ws.close();
  };
};
