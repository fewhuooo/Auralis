import { ref, watch, onMounted } from 'vue'
import { getAiUsage, type AiUsageView } from '@/api/aiClient'
import { isCurrentUsageRequest, nextRequestGeneration } from './aiUsageGuardHelper'
import { useAuthStore } from '@/store/useAuthStore'

export function useAiUsage() {
  const authStore = useAuthStore()
  const aiUsage = ref<AiUsageView | null>(null)
  const loadingAiUsage = ref(false)
  const aiUsageError = ref<string>('')
  let currentUsageRequestGeneration = 0
  const currentAccountIdentity = () => `${authStore.user?.id || ''}:${authStore.token || ''}`

  const fetchAiUsage = async () => {
    if (!authStore.token) {
      aiUsage.value = null
      aiUsageError.value = ''
      loadingAiUsage.value = false
      return
    }
    const gen = nextRequestGeneration()
    const requestIdentity = currentAccountIdentity()
    currentUsageRequestGeneration = gen
    loadingAiUsage.value = true
    aiUsageError.value = ''
    try {
      const res = await getAiUsage()
      if (!isCurrentUsageRequest(gen, currentUsageRequestGeneration, requestIdentity, currentAccountIdentity())) return
      aiUsage.value = res
    } catch (err: any) {
      if (!isCurrentUsageRequest(gen, currentUsageRequestGeneration, requestIdentity, currentAccountIdentity())) return
      aiUsage.value = null
      aiUsageError.value = err.message || '获取额度失败'
    } finally {
      if (isCurrentUsageRequest(gen, currentUsageRequestGeneration, requestIdentity, currentAccountIdentity())) {
        loadingAiUsage.value = false
      }
    }
  }

  watch([() => authStore.token, () => authStore.user?.id], () => {
    currentUsageRequestGeneration = nextRequestGeneration()
    aiUsage.value = null
    aiUsageError.value = ''
    loadingAiUsage.value = false
    if (authStore.token) {
      fetchAiUsage()
    }
  }, { flush: 'sync' })

  onMounted(() => {
    if (authStore.token) {
      fetchAiUsage()
    }
  })

  return {
    aiUsage,
    loadingAiUsage,
    aiUsageError,
    fetchAiUsage
  }
}
