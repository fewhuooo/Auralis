import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useLayoutStore = defineStore('layout', () => {
  const showDrawer = ref(false)

  const openDrawer = () => {
    showDrawer.value = true
  }

  const closeDrawer = () => {
    showDrawer.value = false
  }

  return { showDrawer, openDrawer, closeDrawer }
})
