import axios from 'axios'
import { useAuthStore } from '@/store/useAuthStore'

// Normal API requests — 10s timeout
const request = axios.create({
  timeout: 10000
})

// AI-specific requests — 60s timeout for LLM inference
export const aiRequest = axios.create({
  timeout: 60000
})

// Flag to prevent multiple concurrent refresh attempts
let isRefreshing = false
let failedQueue: Array<{ resolve: Function; reject: Function }> = []

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (token) {
      prom.resolve(token)
    } else {
      prom.reject(error)
    }
  })
  failedQueue = []
}

// Shared request interceptor — inject Bearer token
const attachToken = (config: any) => {
  const authStore = useAuthStore()
  if (authStore.token) {
    config.headers.Authorization = `Bearer ${authStore.token}`
  }
  // Attach user custom API key and Base URL if configured
  const customApiKey = localStorage.getItem('studycore_custom_api_key')
  const customBaseUrl = localStorage.getItem('studycore_custom_base_url')
  if (customApiKey) {
    config.headers['X-User-Api-Key'] = customApiKey
  }
  if (customBaseUrl) {
    config.headers['X-User-Base-Url'] = customBaseUrl
  }
  return config
}

request.interceptors.request.use(attachToken)
aiRequest.interceptors.request.use(attachToken)

// Shared response interceptor — auto-refresh on 401
const createResponseInterceptor = (instance: any) => {
  instance.interceptors.response.use(
    (response: any) => {
      const res = response.data
      if (res.code === 200) {
        return res.data
      } else {
        return Promise.reject(new Error(res.message || 'Error'))
      }
    },
    async (error: any) => {
      const originalRequest = error.config

      if (error.response && error.response.status === 401 && !originalRequest._retry) {
        const authStore = useAuthStore()

        if (isRefreshing) {
          // Queue this request and wait for the refresh to complete
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject })
          }).then(token => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            return instance(originalRequest)
          })
        }

        originalRequest._retry = true
        isRefreshing = true

        try {
          if (!authStore.refreshToken) {
            throw new Error('No refresh token')
          }

          // Attempt to refresh the token
          const res = await axios.post('/api/auth/refresh', {
            refreshToken: authStore.refreshToken
          })

          if (res.data && res.data.code === 200) {
            const { accessToken, refreshToken } = res.data.data
            authStore.token = accessToken
            authStore.refreshToken = refreshToken

            processQueue(null, accessToken)

            // Retry the original request with the new token
            originalRequest.headers.Authorization = `Bearer ${accessToken}`
            return instance(originalRequest)
          } else {
            throw new Error('Refresh failed')
          }
        } catch (refreshError) {
          processQueue(refreshError, null)
          authStore.logout()
          window.location.href = '/login'
          return Promise.reject(refreshError)
        } finally {
          isRefreshing = false
        }
      }

      return Promise.reject(error)
    }
  )
}

createResponseInterceptor(request)
createResponseInterceptor(aiRequest)

export default request
