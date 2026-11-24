import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useSyncApi } from '@/api/useSyncApi'
import { localDb } from '@/services/localDb'
import { localDataScope } from '@/services/localDataScope'
// #ifdef H5
import { clearScopeDocumentCache } from '@/services/localDocumentCache'
// #endif
import { createSyncController } from '@/services/syncController'
import { uuidv7 } from '@/utils/uuid'
import { useAuthStore } from './useAuthStore'
import { useBlockStore } from './useBlockStore'
import { useFocusStore } from './useFocusStore'
import { useSubjectStore } from './useSubjectStore'
import { useTaskStore } from './useTaskStore'

export const getClientId = () => uuidv7()

export const useSyncStore = defineStore('sync', () => {
  const auth = useAuthStore()

  const isSyncing = ref(false)
  const isResettingOffline = ref(false)
  const lastError = ref<string | null>(null)
  const lastSyncedAt = ref<string>('')
  const conflicts = ref<string[]>([])
  const pendingMutationCount = ref(0)
  const autoSyncEnabled = ref(true)

  const controller = createSyncController({
    getAuth: () => ({
      isAuthenticated: auth.isAuthenticated,
      userId: auth.user?.id,
      serverDeviceId: auth.serverDeviceId,
      loginGeneration: auth.getLoginGeneration(),
    }),
    checkOnline: () => new Promise((resolve) => {
      uni.getNetworkType({
        success: ({ networkType }) => resolve(networkType !== 'none'),
        fail: () => resolve(true),
      })
    }),
    syncApi: useSyncApi,
    localDb,
    localDataScope,
    prefStorage: {
      get: (key: string) => uni.getStorageSync(key),
      set: (key: string, value: string) => uni.setStorageSync(key, value),
    },
    onDataChanged: async () => {
      await Promise.all([
        useSubjectStore().loadSubjects(),
        useBlockStore().loadLocalBlocks(),
        useTaskStore().loadLocalTasks(),
      ])
    },
    onLocalScopeReset: (previousScope) => {
      if (previousScope) {
        void localDb.clearScopeStorage(previousScope)
      }
      const focusStore = useFocusStore()
      focusStore.dismissCompletedTaskPrompt()
      focusStore.reconcileNow(false)
      // #ifdef H5
      if (previousScope) {
        void clearScopeDocumentCache(previousScope)
      }
      // #endif
      if (auth.user?.id && auth.serverDeviceId) {
        try {
          uni.removeStorageSync(`auralis:review:pending:${auth.user.id}:${auth.serverDeviceId}`)
          uni.removeStorageSync(`auralis:review:lifecycle:pending:${auth.user.id}:${auth.serverDeviceId}`)
        } catch {
          // Ignore storage cleanup error during scope reset
        }
      }
    },
    onTaskMutationRejected: (taskIds) => {
      useTaskStore().suppressOverdueRecovery(taskIds)
    },
    onSyncCompleted: () => {
      void useTaskStore().recoverOverdueTasks()
    },
    onStateChange: (next) => {
      isSyncing.value = next.isSyncing
      isResettingOffline.value = next.isResettingOffline
      lastError.value = next.lastError
      lastSyncedAt.value = next.lastSyncedAt
      conflicts.value = next.conflicts
      pendingMutationCount.value = next.pendingMutationCount
      autoSyncEnabled.value = next.autoSyncEnabled
    },
  })

  autoSyncEnabled.value = controller.getState().autoSyncEnabled

  watch(
    () => [auth.isAuthenticated, auth.user?.id, auth.serverDeviceId],
    () => {
      controller.resetSessionState()
    },
    { flush: 'sync' },
  )

  return {
    isSyncing,
    isResettingOffline,
    lastError,
    lastSyncedAt,
    conflicts,
    pendingMutationCount,
    autoSyncEnabled,
    refreshPendingCount: () => controller.refreshPendingCount(),
    triggerSync: (manual = false) => controller.triggerSync(manual),
    syncNow: () => controller.syncNow(),
    setAutoSyncEnabled: (enabled: boolean) => controller.setAutoSyncEnabled(enabled),
    resetOfflineData: () => controller.resetOfflineData(),
  }
})
