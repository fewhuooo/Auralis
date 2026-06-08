import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  const darkMode = ref<boolean>(false)
  const language = ref<'zh-CN' | 'en-US'>('zh-CN')
  const fontSize = ref<'small' | 'medium' | 'large'>('medium')
  
  const pomodoroFocusMinutes = ref<number>(25)
  const pomodoroBreakMinutes = ref<number>(5)

  const toggleDarkMode = () => {
    darkMode.value = !darkMode.value
    // Note: Dark mode is toggled by injecting a class in HTML. In a real Uni-app it requires setting native theme or App.vue class.
    // For demo, we assume the user implements the 'dark' class on root node
  }

  return {
    darkMode,
    language,
    fontSize,
    pomodoroFocusMinutes,
    pomodoroBreakMinutes,
    toggleDarkMode
  }
})
