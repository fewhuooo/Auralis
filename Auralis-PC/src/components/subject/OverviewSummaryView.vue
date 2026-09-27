<script setup lang="ts">
import { ref } from 'vue'
import { IconAlertTriangle, IconArrowLeft, IconRefresh } from '@tabler/icons-vue'
import type { OverviewSummary } from '@/types/overview'

const props = withDefaults(defineProps<{
  title: string
  summary: OverviewSummary | null
  kind?: 'file' | 'subject'
  isGenerating?: boolean
  isStale?: boolean
  error?: string | null
}>(), { kind: 'file', isGenerating: false, isStale: false, error: null })
const emit = defineEmits<{ close: []; regenerate: [instruction?: string] }>()
const showInstruction = ref(false)
const instruction = ref('')
const regenerateWithInstruction = () => {
  emit('regenerate', instruction.value.trim() || undefined)
  showInstruction.value = false
}
</script>

<template>
  <section class="overview-summary-view">
    <header class="overview-summary-view__header">
      <button type="button" class="summary-back" @click="emit('close')"><IconArrowLeft :size="15" :stroke-width="1.6" />返回文件</button>
      <div class="summary-title"><small>{{ kind === 'subject' ? '学科总结' : '文件总结' }}</small><strong>{{ title }}</strong></div>
      <div class="summary-actions">
        <button v-if="!error" type="button" :disabled="isGenerating" @click="emit('regenerate')"><IconRefresh v-if="isGenerating" :size="13" :stroke-width="1.6" class="is-spinning" />重新生成</button>
        <button type="button" :disabled="isGenerating" @click="showInstruction = true">调整要求</button>
      </div>
    </header>
    <div class="overview-summary-view__body">
      <p v-if="isGenerating && summary" class="summary-notice">正在生成新版本，当前总结继续保留。</p>
      <p v-if="isStale && !isGenerating" class="summary-notice"><IconAlertTriangle :size="13" :stroke-width="1.6" />资料已更新，当前总结可能过期。</p>
      <p v-if="error" class="summary-notice summary-notice--error">
        <IconAlertTriangle :size="13" :stroke-width="1.6" />
        <span class="summary-notice__text">{{ error }}<span v-if="summary">；当前内容仍可查看。</span></span>
        <button
          type="button"
          class="summary-notice__retry"
          :disabled="isGenerating"
          @click="emit('regenerate')"
        >重新生成</button>
      </p>
      <div v-if="!summary" class="summary-empty">
        <IconRefresh v-if="isGenerating" :size="22" :stroke-width="1.6" class="is-spinning" />
        <strong>{{ isGenerating ? '正在生成总结…' : (error ? '总结生成失败' : '暂无总结') }}</strong>
      </div>
      <div v-else class="summary-content">
        <article><h3>内容概述</h3><p>{{ summary.overview }}</p></article>
        <article><h3>核心要点</h3><ol><li v-for="point in summary.keyPoints" :key="point">{{ point }}</li></ol></article>
        <article><h3>推荐学习路径</h3><div class="learning-path"><span v-for="(step, index) in summary.learningPath" :key="step"><b>{{ index + 1 }}</b>{{ step }}</span></div></article>
      </div>
    </div>
    <div v-if="showInstruction" class="summary-dialog-backdrop" @click.self="showInstruction = false">
      <form class="summary-dialog" @submit.prevent="regenerateWithInstruction">
        <header><strong>调整总结要求</strong><button type="button" aria-label="关闭" @click="showInstruction = false">×</button></header>
        <p>例如：更精简、突出考试重点，或优先整理公式。</p>
        <textarea v-model="instruction" maxlength="2000" rows="5" placeholder="填写可选要求"></textarea>
        <small>{{ instruction.length }} / 2000</small>
        <footer><button type="button" @click="showInstruction = false">取消</button><button type="submit">生成新总结</button></footer>
      </form>
    </div>
  </section>
</template>

<style scoped>
.overview-summary-view{position:relative;width:100%;height:100%;display:flex;flex-direction:column;background:var(--color-bg-primary, #F7F2EB);color:var(--text-primary)}.overview-summary-view__header{min-height:58px;padding:9px 14px;border-bottom:1px solid var(--border-default);display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;background:var(--color-bg-primary, #F7F2EB)}.summary-back,.summary-actions button{display:flex;align-items:center;gap:5px;border:1px solid var(--border-default);border-radius:7px;padding:6px 8px;background:var(--color-bg-tertiary, #FAF7F2);color:var(--text-secondary);font-size:11px;cursor:pointer}.summary-title{display:flex;flex-direction:column;min-width:0}.summary-title small{color:var(--text-muted);font-size:10px}.summary-title strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.summary-actions{display:flex;gap:5px}.summary-actions button:last-child{border-color:transparent;background:var(--color-primary-light);color:var(--color-primary-accent);font-weight:700}.summary-actions button:disabled{opacity:.55;cursor:wait}.overview-summary-view__body{flex:1;overflow:auto;padding:18px}.summary-content{display:grid;gap:14px;max-width:820px;margin:auto}.summary-content article{padding:18px 20px;border:1px solid var(--border-subtle);border-radius:12px;background:var(--color-bg-tertiary, #FAF7F2)}.summary-content h3{margin:0 0 10px;font-size:14px}.summary-content p,.summary-content li{color:var(--text-secondary);font-size:13px;line-height:1.75}.summary-content ol{margin:0;padding-left:20px}.learning-path{display:grid;gap:7px}.learning-path span{display:flex;align-items:center;gap:9px;padding:8px;border-radius:8px;background:var(--color-bg-tertiary, #FAF7F2);border:1px solid var(--border-subtle);font-size:12px}.learning-path b{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--color-primary-light);color:var(--color-primary-accent)}.summary-notice{max-width:820px;margin:0 auto 10px;padding:8px 10px;border-radius:8px;background:rgba(166,125,55,.09);color:#7b5d2e;font-size:11px}.summary-notice--error{display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(176,83,83,.08);color:#995050}.summary-notice__text{flex:1}.summary-notice__retry{border:1px solid rgba(176,83,83,.3);border-radius:6px;padding:3px 8px;background:var(--color-bg-tertiary, #FAF7F2);color:#995050;font-size:11px;font-weight:600;cursor:pointer}.summary-notice__retry:hover{background:rgba(176,83,83,.14)}.summary-notice__retry:disabled{opacity:.55;cursor:wait}.summary-empty{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--text-muted)}.is-spinning{animation:summary-spin 1s linear infinite}@keyframes summary-spin{to{transform:rotate(360deg)}}
.summary-dialog-backdrop{position:absolute;inset:0;z-index:20;display:grid;place-items:center;padding:18px;background:rgba(24,28,25,.34);backdrop-filter:blur(3px)}.summary-dialog{width:min(460px,100%);padding:16px;border:1px solid var(--border-default);border-radius:14px;background:var(--color-bg-tertiary, #FAF7F2);box-shadow:0 18px 50px rgba(24,32,28,.18)}.summary-dialog header,.summary-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.summary-dialog header button{border:0;background:transparent;color:var(--text-muted);font-size:20px;cursor:pointer}.summary-dialog p{margin:9px 0;color:var(--text-secondary);font-size:12px}.summary-dialog textarea{box-sizing:border-box;width:100%;resize:vertical;padding:10px;border:1px solid var(--border-default);border-radius:9px;background:var(--color-bg-tertiary, #FAF7F2);color:var(--text-primary);font:inherit;line-height:1.5;outline:none}.summary-dialog textarea:focus{border-color:var(--color-primary-accent);box-shadow:0 0 0 3px rgba(125,147,114,.1)}.summary-dialog small{display:block;margin:4px 0 12px;color:var(--text-muted);text-align:right}.summary-dialog footer{justify-content:flex-end}.summary-dialog footer button{padding:7px 11px;border:1px solid var(--border-default);border-radius:7px;background:var(--color-bg-tertiary, #FAF7F2);color:var(--text-secondary);cursor:pointer}.summary-dialog footer button[type=submit]{border-color:transparent;background:var(--color-primary-light);color:var(--color-primary-accent);font-weight:700}
@media(max-width:760px){.overview-summary-view__header{grid-template-columns:auto minmax(0,1fr)}.summary-actions{grid-column:1/-1;justify-content:flex-end}.overview-summary-view__body{padding:12px}.summary-content article{padding:14px}}
</style>
