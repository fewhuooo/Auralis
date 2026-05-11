import { defineStore } from 'pinia'
import { ref } from 'vue'

const BASE_URL = 'http://127.0.0.1:8080/api'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(uni.getStorageSync('token') || null)
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
    token.value = res
    username.value = data.username
    uni.setStorageSync('token', res)
    uni.setStorageSync('username', data.username)
  }

  const register = async (data: any) => {
    await request('/auth/register', 'POST', data)
  }

  const logout = () => {
    token.value = null
    username.value = null
    uni.removeStorageSync('token')
    uni.removeStorageSync('username')
  }

  return {
    token,
    username,
    login,
    register,
    logout
  }
})
