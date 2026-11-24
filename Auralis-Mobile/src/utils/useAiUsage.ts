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
  let lastOwnerIdentity = ''
  const currentAccountIdentity = () => {
    if (!authStore.isAuthenticated || !authStore.token || !authStore.user?.id) return ''
    return `${authStore.user.id}:${authStore.serverDeviceId || 'dev'}`
  }

  const fetchAiUsage = async () => {
    const requestIdentity = currentAccountIdentity()
    if (!requestIdentity) {
      aiUsage.value = null
      aiUsageError.value = ''
      loadingAiUsage.value = false
      return
    }
    const gen = nextRequestGeneration()
    currentUsageRequestGeneration = gen
    loadingAiUsage.value = true
    aiUsageError.value = ''
    try {
      const res = await getAiUsage()
      if (!isCurrentUsageRequest(gen, currentUsageRequestGeneration, requestIdentity, currentAccountIdentity())) return
      aiUsage.value = res
    } catch (err: unknown) {
      if (!isCurrentUsageRequest(gen, currentUsageRequestGeneration, requestIdentity, currentAccountIdentity())) return
      aiUsageError.value = err instanceof Error && err.message ? err.message : '获取额度失败'
    } finally {
      if (isCurrentUsageRequest(gen, currentUsageRequestGeneration, requestIdentity, currentAccountIdentity())) {
        loadingAiUsage.value = false
      }
    }
  }

  watch(
    [() => authStore.isAuthenticated, () => authStore.user?.id, () => authStore.serverDeviceId, () => Boolean(authStore.token)],
    () => {
      const nextIdentity = currentAccountIdentity()
      if (!nextIdentity) {
        currentUsageRequestGeneration = nextRequestGeneration()
        lastOwnerIdentity = ''
        aiUsage.value = null
        aiUsageError.value = ''
        loadingAiUsage.value = false
        return
      }
      if (nextIdentity !== lastOwnerIdentity) {
        currentUsageRequestGeneration = nextRequestGeneration()
        lastOwnerIdentity = nextIdentity
        aiUsage.value = null
        aiUsageError.value = ''
        loadingAiUsage.value = false
        void fetchAiUsage()
      }
    },
    { flush: 'sync', immediate: true },
  )

  onMounted(() => {
    const identity = currentAccountIdentity()
    if (identity && identity !== lastOwnerIdentity) {
      lastOwnerIdentity = identity
      void fetchAiUsage()
    }
  })

  return {
    aiUsage,
    loadingAiUsage,
    aiUsageError,
    fetchAiUsage
  }
}
