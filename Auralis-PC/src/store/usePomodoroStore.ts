import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/store/useAuthStore'

interface PomodoroSnapshot {
  date: string
  completed: number
}

function storageKey(): string {
  const auth = useAuthStore()
  return `auralis:v2:${auth.user?.id || 'anonymous'}:${auth.serverDeviceId || 'browser'}:pomodoro`
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export const usePomodoroStore = defineStore('pomodoro', () => {
  const completedToday = ref(0)

  function hydrate(): void {
    if (typeof window === 'undefined') return
    try {
      const raw = window.sessionStorage.getItem(storageKey())
      const snapshot = raw ? JSON.parse(raw) as PomodoroSnapshot : null
      completedToday.value = snapshot?.date === today() ? snapshot.completed : 0
    } catch {
      completedToday.value = 0
    }
  }

  function persist(): void {
    if (typeof window === 'undefined') return
    const snapshot: PomodoroSnapshot = { date: today(), completed: completedToday.value }
    window.sessionStorage.setItem(storageKey(), JSON.stringify(snapshot))
  }

  function increment(): void {
    completedToday.value += 1
    persist()
  }

  hydrate()

  return {
    completedToday: computed(() => completedToday.value),
    increment,
  }
})
