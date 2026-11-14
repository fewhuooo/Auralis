<template>
  <Teleport :to="teleportTo" :disabled="!teleport">
    <Transition name="modal-fade" appear @after-enter="onAfterEnter" @after-leave="onAfterLeave">
      <div
        v-if="modelValue"
        class="modal-shell-overlay"
        :style="{ zIndex }"
        @click.self="handleOverlayClick"
        @keydown="handleKeyDown"
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
          :aria-labelledby="effectiveAriaLabelledBy"
          :aria-label="effectiveAriaLabel"
          tabindex="-1"
        >
          <!-- Header slot or default header -->
          <div v-if="$slots.header || title || showCloseButton" class="modal-shell-header" :class="headerClass">
            <slot name="header" :close="requestClose">
              <div class="modal-shell-header-main">
                <slot name="title">
                  <h3 v-if="title" :id="titleId" class="modal-shell-title">{{ title }}</h3>
                </slot>
              </div>
              <button
                v-if="showCloseButton"
                type="button"
                class="modal-shell-close"
                :disabled="preventClose"
                :aria-label="t({ 'zh-CN': '关闭', en: 'Close', ja: '閉じる' })"
                @click="requestClose"
              >
                <IconX :size="15" :stroke-width="2.2" />
              </button>
            </slot>
          </div>

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
import { t } from '@/i18n'
import { ref, computed, watch, onUnmounted, nextTick, useAttrs } from 'vue'
import { IconX } from '@tabler/icons-vue'
import './modal.css'
import {
  lockBodyScroll,
  unlockBodyScroll,
  registerModal,
  updateModalContainer,
  unregisterModal,
  trapTabKey,
  getFocusableElements
} from './modalManager'

export interface ModalShellProps {
  modelValue: boolean
  title?: string
  ariaLabel?: string
  ariaLabelledBy?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'auto'
  closeOnClickOverlay?: boolean
  closeOnPressEscape?: boolean
  showCloseButton?: boolean
  lockScroll?: boolean
  preventClose?: boolean
  beforeClose?: () => boolean | Promise<boolean>
  initialFocus?: string
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
  ariaLabel: '',
  ariaLabelledBy: '',
  size: 'md',
  closeOnClickOverlay: true,
  closeOnPressEscape: true,
  showCloseButton: true,
  lockScroll: true,
  preventClose: false,
  beforeClose: undefined,
  initialFocus: '',
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

const attrs = useAttrs()
const cardRef = ref<HTMLElement | null>(null)
const modalInstanceId = `modal-${Math.random().toString(36).substring(2, 9)}`
const titleId = `modal-title-${modalInstanceId}`

let isScrollLocked = false
let previousActiveElement: HTMLElement | null = null

const sizeClass = computed(() => `modal-size-${props.size}`)

const effectiveAriaLabel = computed(() => {
  if (props.ariaLabel) return props.ariaLabel
  if (typeof attrs['aria-label'] === 'string' && attrs['aria-label'].trim()) {
    return attrs['aria-label']
  }
  if (!props.ariaLabelledBy && props.title) return props.title
  return undefined
})

const effectiveAriaLabelledBy = computed(() => {
  if (props.ariaLabelledBy) return props.ariaLabelledBy
  if (props.ariaLabel || (typeof attrs['aria-label'] === 'string' && attrs['aria-label'].trim())) {
    return undefined
  }
  return props.title ? titleId : undefined
})

const requestClose = async () => {
  if (props.preventClose) return
  if (props.beforeClose) {
    try {
      const allowed = await props.beforeClose()
      if (!allowed) return
    } catch {
      return
    }
  }
  emit('update:modelValue', false)
  emit('close')
}

const handleOverlayClick = () => {
  if (props.preventClose || !props.closeOnClickOverlay) return
  requestClose()
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Tab' && cardRef.value) {
    trapTabKey(cardRef.value, e)
  }
}

const onAfterEnter = () => {
  emit('opened')
  updateModalContainer(modalInstanceId, cardRef.value)
  nextTick(() => {
    if (!cardRef.value) return
    // 0. If activeElement is already an inner element inside cardRef (not card itself), keep it
    if (
      document.activeElement &&
      cardRef.value.contains(document.activeElement) &&
      document.activeElement !== cardRef.value
    ) {
      return
    }
    // 1. If props.initialFocus is specified
    if (props.initialFocus) {
      const target = cardRef.value.querySelector<HTMLElement>(props.initialFocus)
      if (target && typeof target.focus === 'function') {
        target.focus()
        return
      }
    }
    // 2. Explicit [autofocus] element
    const autofocusEl = cardRef.value.querySelector<HTMLElement>('[autofocus]')
    if (autofocusEl && typeof autofocusEl.focus === 'function') {
      autofocusEl.focus()
      return
    }
    // 3. First editable input or textarea
    const input = cardRef.value.querySelector<HTMLElement>(
      'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])'
    )
    if (input && typeof input.focus === 'function') {
      input.focus()
      return
    }
    // 4. Fallback: focus first focusable element or the card container
    const focusables = getFocusableElements(cardRef.value)
    if (focusables.length > 0) {
      focusables[0].focus()
    } else {
      cardRef.value.focus()
    }
  })
}

const onAfterLeave = () => {
  emit('closed')
  // Return focus to trigger element
  if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
    try {
      previousActiveElement.focus()
    } catch {
      // ignore
    }
    previousActiveElement = null
  }
}

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      // Save previously focused element
      if (typeof document !== 'undefined') {
        previousActiveElement = document.activeElement as HTMLElement | null
      }
      if (props.lockScroll && !isScrollLocked) {
        lockBodyScroll()
        isScrollLocked = true
      }
      registerModal(
        modalInstanceId,
        () => {
          if (props.closeOnPressEscape && !props.preventClose) {
            requestClose()
          }
        },
        cardRef.value
      )
      nextTick(() => {
        updateModalContainer(modalInstanceId, cardRef.value)
      })
    } else {
      if (isScrollLocked) {
        unlockBodyScroll()
        isScrollLocked = false
      }
      unregisterModal(modalInstanceId)
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  if (isScrollLocked) {
    unlockBodyScroll()
    isScrollLocked = false
  }
  unregisterModal(modalInstanceId)
  if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
    try {
      previousActiveElement.focus()
    } catch {
      // ignore
    }
    previousActiveElement = null
  }
})
</script>
