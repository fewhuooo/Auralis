<template>
  <Teleport :to="teleportTo" :disabled="!teleport">
    <Transition name="modal-fade" @after-enter="onAfterEnter" @after-leave="onAfterLeave">
      <div
        v-if="modelValue"
        class="modal-shell-overlay"
        :style="{ zIndex }"
        @click.self="handleOverlayClick"
      >
        <div
          ref="cardRef"
          class="modal-shell-card"
          :class="[
            sizeClass,
            customClass
          ]"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          tabindex="-1"
        >
          <!-- Header slot or default header -->
          <slot name="header" :close="requestClose">
            <div v-if="title || showCloseButton" class="modal-shell-header" :class="headerClass">
              <h3 v-if="title" :id="titleId" class="modal-shell-title">{{ title }}</h3>
              <div v-else :id="titleId" style="display: none"></div>
              <button
                v-if="showCloseButton"
                type="button"
                class="modal-shell-close"
                aria-label="关闭"
                @click="requestClose"
              >
                ✕
              </button>
            </div>
          </slot>

          <!-- Main Body slot -->
          <div class="modal-shell-body" :class="bodyClass">
            <slot />
          </div>

          <!-- Footer slot -->
          <div v-if="$slots.footer" class="modal-shell-footer" :class="footerClass">
            <slot name="footer" :close="requestClose" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import './modal.css'

export interface ModalShellProps {
  modelValue: boolean
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'auto'
  closeOnClickOverlay?: boolean
  closeOnPressEscape?: boolean
  showCloseButton?: boolean
  lockScroll?: boolean
  teleport?: boolean
  teleportTo?: string
  zIndex?: number
  customClass?: string
  headerClass?: string
  bodyClass?: string
  footerClass?: string
}

const props = withDefaults(defineProps<ModalShellProps>(), {
  title: '',
  size: 'md',
  closeOnClickOverlay: true,
  closeOnPressEscape: true,
  showCloseButton: true,
  lockScroll: true,
  teleport: true,
  teleportTo: 'body',
  zIndex: 1000,
  customClass: '',
  headerClass: '',
  bodyClass: '',
  footerClass: '',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'close'): void
  (e: 'opened'): void
  (e: 'closed'): void
}>()

const cardRef = ref<HTMLElement | null>(null)
const titleId = ref(`modal-title-${Math.random().toString(36).substring(2, 9)}`)
let previousBodyOverflow = ''
let isScrollLocked = false

const sizeClass = computed(() => {
  return `modal-size-${props.size}`
})

const requestClose = () => {
  emit('update:modelValue', false)
  emit('close')
}

const handleOverlayClick = () => {
  if (props.closeOnClickOverlay) {
    requestClose()
  }
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (props.closeOnPressEscape && e.key === 'Escape') {
    e.stopPropagation()
    requestClose()
  }
}

const lockBodyScroll = () => {
  if (!props.lockScroll || typeof document === 'undefined' || isScrollLocked) return
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  isScrollLocked = true
}

const unlockBodyScroll = () => {
  if (!isScrollLocked || typeof document === 'undefined') return
  document.body.style.overflow = previousBodyOverflow
  isScrollLocked = false
}

const onAfterEnter = () => {
  emit('opened')
  nextTick(() => {
    cardRef.value?.focus()
  })
}

const onAfterLeave = () => {
  emit('closed')
}

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      lockBodyScroll()
      if (typeof window !== 'undefined') {
        window.addEventListener('keydown', handleKeyDown, true)
      }
    } else {
      unlockBodyScroll()
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', handleKeyDown, true)
      }
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  unlockBodyScroll()
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeyDown, true)
  }
})
</script>
