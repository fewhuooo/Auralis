import { invoke } from '@tauri-apps/api/core'

/**
 * 通用 Rust 命令调用封装
 */
export const invokeRustCmd = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
  return invoke<T>(command, args)
}
