<template>
  <Transition name="not-ready-fade">
    <div v-if="modelValue" class="not-ready-backdrop" role="dialog" aria-modal="true" aria-labelledby="not-ready-title" @click.self="$emit('cancel')">
      <div class="not-ready-dialog">
        <div class="not-ready-icon">⏳</div>
        <h3 id="not-ready-title">文件还在解析</h3>
        <p>“{{ fileName }}”完成解析后才能使用 AI 检索。你可以在个人中心查看实时进度。</p>
        <div class="not-ready-actions">
          <button type="button" class="secondary" @click="$emit('cancel')">稍后再说</button>
          <button type="button" class="primary" @click="$emit('go-profile')">查看解析进度</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{ modelValue: boolean; fileName: string }>()
defineEmits<{ (event: 'cancel'): void; (event: 'go-profile'): void }>()
</script>

<style scoped>
.not-ready-backdrop { position: fixed; inset: 0; z-index: 1300; display: grid; place-items: center; background: rgba(28, 31, 27, .28); backdrop-filter: blur(4px); }
.not-ready-dialog { width: min(380px, calc(100vw - 36px)); padding: 26px; border-radius: 18px; background: var(--color-bg-primary, #F7F2EB); box-shadow: 0 18px 46px rgba(37, 42, 34, .2); text-align: center; }
.not-ready-icon { margin-bottom: 8px; font-size: 26px; }
.not-ready-dialog h3 { margin: 0; color: var(--text-primary); font-size: 18px; }
.not-ready-dialog p { margin: 10px 0 22px; color: var(--text-secondary); font-size: 13px; line-height: 1.7; }
.not-ready-actions { display: flex; justify-content: center; gap: 10px; }
.not-ready-actions button { border: 0; border-radius: 9999px; padding: 9px 18px; cursor: pointer; font-size: 13px; font-weight: 600; box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.05); transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
.not-ready-actions .secondary { background: var(--modal-inset-bg, #FAF7F2); border: 1px solid var(--border-default, rgba(0,0,0,0.1)); color: var(--text-secondary); }
.not-ready-actions .secondary:hover { background: #FFFFFF; transform: translateY(-1px); }
.not-ready-actions .primary { background: var(--color-primary-accent, #7d9372); color: #fff; box-shadow: 0 3px 10px rgba(125, 147, 114, 0.3); }
.not-ready-actions .primary:hover { transform: translateY(-1px); box-shadow: 0 5px 14px rgba(125, 147, 114, 0.4); }

/* Transitions */
.not-ready-fade-enter-active,
.not-ready-fade-leave-active {
  transition: opacity 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

.not-ready-fade-enter-active .not-ready-dialog,
.not-ready-fade-leave-active .not-ready-dialog {
  transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.24s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform, opacity;
}

.not-ready-fade-enter-from,
.not-ready-fade-leave-to {
  opacity: 0;
}

.not-ready-fade-enter-from .not-ready-dialog {
  opacity: 0;
  transform: scale(0.95) translateY(12px);
}

.not-ready-fade-leave-to .not-ready-dialog {
  opacity: 0;
  transform: scale(0.97) translateY(8px);
}
</style>
