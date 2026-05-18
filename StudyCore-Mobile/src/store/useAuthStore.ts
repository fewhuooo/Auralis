import { defineStore } from 'pinia'
import { ref } from 'vue'

const BASE_URL = 'http://127.0.0.1:8080/api'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(uni.getStorageSync('token') || null)
  const refreshToken = ref<string | null>(uni.getStorageSync('refreshToken') || null)
  const username = ref<string | null>(uni.getStorageSync('username') || null)

  const request = (url: string, method: 'GET' | 'POST' = 'GET', data?: any) => {
    return new Promise((resolve, reject) => {
      uni.request({
        url: BASE_URL + url,
        method,
        data,
        success: (res: any) => {
          if (res.data && res.data.code === 200) {
            resolve(res.data.data)
          } else {
            reject(new Error(res.data.message || 'Error'))
          }
        },
        fail: (err) => {
          reject(err)
        }
      })
    })
  }

  const login = async (data: any) => {
    const res: any = await request('/auth/login', 'POST', data)
    // Backend returns { accessToken, refreshToken }
    token.value = res.accessToken
    refreshToken.value = res.refreshToken
    username.value = data.username
    uni.setStorageSync('token', res.accessToken)
    uni.setStorageSync('refreshToken', res.refreshToken)
    uni.setStorageSync('username', data.username)
  }

  const register = async (data: any) => {
    await request('/auth/register', 'POST', data)
  }

  /**
   * 14.3 Refresh token — attempt to get a new access token using the stored refresh token
   */
  const refreshAccessToken = async (): Promise<boolean> => {
    if (!refreshToken.value) return false
    try {
      const res: any = await request('/auth/refresh', 'POST', {
        refreshToken: refreshToken.value
      })
      token.value = res.accessToken
      refreshToken.value = res.refreshToken
      uni.setStorageSync('token', res.accessToken)
      uni.setStorageSync('refreshToken', res.refreshToken)
      return true
    } catch (e) {
      return false
    }
  }

  const logout = () => {
    token.value = null
    refreshToken.value = null
    username.value = null
    uni.removeStorageSync('token')
    uni.removeStorageSync('refreshToken')
    uni.removeStorageSync('username')
  }

  return {
    token,
    refreshToken,
    username,
    login,
    register,
    refreshAccessToken,
    logout
  }
})
