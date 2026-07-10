import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthApi } from '@/api/useAuthApi'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)
  const username = ref<string | null>(null)

  const login = async (data: any) => {
    const res: any = await useAuthApi.login(data)
    // Backend now returns { accessToken, refreshToken }
    token.value = res.accessToken
    refreshToken.value = res.refreshToken
    username.value = data.username
  }

  const register = async (data: any) => {
    await useAuthApi.register(data)
  }

  const logout = () => {
    token.value = null
    refreshToken.value = null
    username.value = null
  }

  const showAuthModal = ref(false)

  return {
    token,
    refreshToken,
    username,
    showAuthModal,
    login,
    register,
    logout
  }
}, {
  persist: true
})
