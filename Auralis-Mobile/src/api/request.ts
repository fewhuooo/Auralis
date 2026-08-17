/**
 * 移动端 HTTP 请求封装
 * 使用 uni.request 替代 axios，保持与 PC 端相同的 API 契约
 * 14.3: 支持 401 自动刷新 Token
 */
import { useAuthStore } from '@/store/useAuthStore'

// 注意：真机调试需手动替换电脑局域网 IP (如 192.168.x.x)，模拟器可用 10.0.2.2
const BASE_URL = typeof window !== 'undefined'
  ? 'http://127.0.0.1:8080'
  : 'http://10.0.2.2:8080'

interface RequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: any
  params?: Record<string, any>
  timeout?: number
  _retry?: boolean
}

/**
 * 将 params 对象拼接为 query string
 */
function buildQueryString(params: Record<string, any>): string {
  const parts: string[] = []
  for (const key in params) {
    const val = params[key]
    if (val !== undefined && val !== null && val !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`)
    }
  }
  return parts.length > 0 ? '?' + parts.join('&') : ''
}

function getLoginRouteForCurrentPage(): string {
  const pages = getCurrentPages()
  const currentRoute = pages.length > 0 ? pages[pages.length - 1].route || '' : ''
  return currentRoute.startsWith('pages/tablet/')
    ? '/pages/tablet/login/index'
    : '/pages/mobile/login/index'
}

/**
 * 通用请求函数，返回 Result.data（与 PC 端 axios 拦截器一致）
 * 14.3: 遇到 401 时自动尝试 refresh token，失败再 logout
 */
function request<T = any>(options: RequestOptions): Promise<T> {
  return new Promise((resolve, reject) => {
    const authStore = useAuthStore()
    let url = BASE_URL + options.url
    if (options.params) {
      url += buildQueryString(options.params)
    }

    const header: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (authStore.token) {
      header['Authorization'] = `Bearer ${authStore.token}`
    }

    uni.request({
      url,
      method: options.method || 'GET',
      data: options.data,
      header,
      timeout: options.timeout || 10000,
      success: async (res: any) => {
        // 401 auto-refresh
        if (res.statusCode === 401 && !options._retry) {
          const refreshed = await authStore.refreshAccessToken()
          if (refreshed) {
            // Retry with new token
            try {
              const result = await request<T>({ ...options, _retry: true })
              resolve(result)
            } catch (e) {
              reject(e)
            }
          } else {
            authStore.logout()
            uni.reLaunch({ url: getLoginRouteForCurrentPage() })
            reject(new Error('Unauthorized — token refresh failed'))
          }
          return
        }

        const body = res.data
        if (body && body.code === 200) {
          resolve(body.data as T)
        } else {
          reject(new Error(body?.message || `HTTP ${res.statusCode}`))
        }
      },
      fail: (err) => {
        reject(new Error(err.errMsg || 'Network Error'))
      },
    })
  })
}

export const mobileRequest = {
  get<T = any>(url: string, params?: Record<string, any>) {
    return request<T>({ url, method: 'GET', params })
  },
  post<T = any>(url: string, data?: any) {
    return request<T>({ url, method: 'POST', data })
  },
  put<T = any>(url: string, data?: any) {
    return request<T>({ url, method: 'PUT', data })
  },
  delete<T = any>(url: string) {
    return request<T>({ url, method: 'DELETE' })
  },
}

export default mobileRequest
