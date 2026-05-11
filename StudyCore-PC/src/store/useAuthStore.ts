import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthApi } from '@/api/useAuthApi'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null)
  const username = ref<string | null>(null)

  const login = async (data: any) => {
    const res: any = await useAuthApi.login(data)
    token.value = res // res is the token string
    username.value = data.username
  }

  const register = async (data: any) => {
    await useAuthApi.register(data)
  }

  const logout = () => {
    token.value = null
    username.value = null
  }

  const showAuthModal = ref(false)

  return {
    token,
    username,
    showAuthModal,
    login,
    register,
    logout
  }
}, {
  persist: true
})
