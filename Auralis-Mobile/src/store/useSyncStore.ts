import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useSyncApi } from '@/api/useSyncApi'
import { showToast } from '@/platform/feedback'
import { isNetworkOnline } from '@/platform/network'
import { getStorageItem, removeStorageItem, setStorageItem } from '@/platform/storage'
import { localDb } from '@/services/localDb'
import { localDataScope } from '@/services/localDataScope'
import { clearScopeDocumentCache } from '@/services/localDocumentCache'
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
  const metricsRevision = ref(0)

  function bumpMetricsRevision() {
    metricsRevision.value += 1
  }

  const controller = createSyncController({
    getAuth: () => ({
      isAuthenticated: auth.isAuthenticated,
      userId: auth.user?.id,
      serverDeviceId: auth.serverDeviceId,
      loginGeneration: auth.getLoginGeneration(),
    }),
    checkOnline: async () => isNetworkOnline(),
    syncApi: useSyncApi,
    localDb,
    localDataScope,
    prefStorage: {
      get: (key: string) => getStorageItem(key),
      set: (key: string, value: string) => setStorageItem(key, value),
    },
    onDataChanged: async () => {
      await Promise.all([
        useSubjectStore().loadSubjects(),
        useBlockStore().loadLocalBlocks(),
        useTaskStore().loadLocalTasks(),
      ])
      bumpMetricsRevision()
    },
    onLocalScopeReset: (previousScope) => {
      if (previousScope) {
        void localDb.clearScopeStorage(previousScope)
      }
      const focusStore = useFocusStore()
      focusStore.dismissCompletedTaskPrompt()
      focusStore.reconcileNow(false)
      if (previousScope) {
        void clearScopeDocumentCache(previousScope)
      }
      if (auth.user?.id && auth.serverDeviceId) {
        try {
          removeStorageItem(`auralis:review:pending:${auth.user.id}:${auth.serverDeviceId}`)
          removeStorageItem(`auralis:review:lifecycle:pending:${auth.user.id}:${auth.serverDeviceId}`)
        } catch {
          // Ignore storage cleanup error during scope reset
        }
      }
    },
    onTaskMutationRejected: (taskIds) => {
      useTaskStore().suppressOverdueRecovery(taskIds)
      showToast('部分日程与云端已有安排冲突或无效，已同步最新状态')
    },
    onSyncCompleted: () => {
      void useTaskStore().recoverOverdueTasks()
      void import('./useFocusStore').then(({ useFocusStore }) => {
        void useFocusStore().flushPendingSessions()
      })
      bumpMetricsRevision()
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
    metricsRevision,
    bumpMetricsRevision,
    refreshPendingCount: () => controller.refreshPendingCount(),
    triggerSync: (manual = false) => controller.triggerSync(manual),
    syncNow: () => controller.syncNow(),
    setAutoSyncEnabled: (enabled: boolean) => controller.setAutoSyncEnabled(enabled),
    resetOfflineData: () => controller.resetOfflineData(),
  }
})
