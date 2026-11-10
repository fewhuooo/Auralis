<script setup lang="ts">
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
const emit = defineEmits<{ close: []; regenerate: [instruction?: string]; stop: [] }>()
</script>

<template>
  <section class="overview-summary-view">
    <header class="overview-summary-view__header">
      <button type="button" class="summary-back" @click="emit('close')"><IconArrowLeft :size="15" :stroke-width="1.6" />返回文件</button>
      <div class="summary-title"><small>{{ kind === 'subject' ? '学科总结' : '文件总结' }}</small><strong>{{ title }}</strong></div>
      <div class="summary-actions">
        <button v-if="isGenerating" type="button" aria-label="停止当前总览生成" @click="emit('stop')">停止</button>
        <button v-if="!error" type="button" :disabled="isGenerating" @click="emit('regenerate')"><IconRefresh v-if="isGenerating" :size="13" :stroke-width="1.6" class="is-spinning" />重新生成</button>
      </div>
    </header>
    <div class="overview-summary-view__body">
      <p v-if="isGenerating && summary" class="summary-notice summary-notice--generating"><IconRefresh :size="13" :stroke-width="1.6" class="is-spinning" />正在重新生成总结，当前内容仍可查看…</p>
      <p v-else-if="isStale && !isGenerating" class="summary-notice"><IconAlertTriangle :size="13" :stroke-width="1.6" />资料已更新，当前总结可能过期。</p>
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
      <div v-else class="summary-content" :class="{ 'is-generating': isGenerating }">
        <article><h3>内容概述</h3><p>{{ summary.overview }}</p></article>
        <article><h3>核心要点</h3><ol><li v-for="point in summary.keyPoints" :key="point">{{ point }}</li></ol></article>
        <article><h3>推荐学习路径</h3><div class="learning-path"><span v-for="(step, index) in summary.learningPath" :key="step"><b>{{ index + 1 }}</b>{{ step }}</span></div></article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.overview-summary-view{position:relative;width:100%;height:100%;display:flex;flex-direction:column;background:var(--color-bg-primary, #F7F2EB);color:var(--text-primary)}.overview-summary-view__header{min-height:58px;padding:9px 14px;border-bottom:1px solid var(--border-default);display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;background:var(--color-bg-primary, #F7F2EB)}.summary-back,.summary-actions button{display:flex;align-items:center;gap:5px;border:1px solid var(--border-default);border-radius:7px;padding:6px 8px;background:var(--color-bg-tertiary, #FAF7F2);color:var(--text-secondary);font-size:11px;cursor:pointer}.summary-title{display:flex;flex-direction:column;min-width:0}.summary-title small{color:var(--text-muted);font-size:10px}.summary-title strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.summary-actions{display:flex;gap:5px}.summary-actions button:last-child{border-color:transparent;background:var(--color-primary-light);color:var(--color-primary-accent);font-weight:700}.summary-actions button:disabled{opacity:.55;cursor:wait}.overview-summary-view__body{flex:1;overflow:auto;padding:18px}.summary-content{display:grid;gap:14px;max-width:820px;margin:auto}.summary-content article{padding:18px 20px;border:1px solid var(--border-subtle);border-radius:12px;background:var(--color-bg-tertiary, #FAF7F2)}.summary-content h3{margin:0 0 10px;font-size:14px}.summary-content p,.summary-content li{color:var(--text-secondary);font-size:13px;line-height:1.75}.summary-content ol{margin:0;padding-left:20px}.learning-path{display:grid;gap:7px}.learning-path span{display:flex;align-items:center;gap:9px;padding:8px;border-radius:8px;background:var(--color-bg-tertiary, #FAF7F2);border:1px solid var(--border-subtle);font-size:12px}.learning-path b{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--color-primary-light);color:var(--color-primary-accent)}.summary-notice{max-width:820px;margin:0 auto 10px;padding:8px 10px;border-radius:8px;background:rgba(166,125,55,.09);color:#7b5d2e;font-size:11px}.summary-notice--generating{display:flex;align-items:center;gap:8px;background:rgba(125,147,114,.09);color:var(--color-primary-accent);border:1px dashed rgba(125,147,114,.3)}.summary-content.is-generating{opacity:.6;transition:opacity .2s ease;pointer-events:none}.summary-notice--error{display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(176,83,83,.08);color:#995050}.summary-notice__text{flex:1}.summary-notice__retry{border:1px solid rgba(176,83,83,.3);border-radius:6px;padding:3px 8px;background:var(--color-bg-tertiary, #FAF7F2);color:#995050;font-size:11px;font-weight:600;cursor:pointer}.summary-notice__retry:hover{background:rgba(176,83,83,.14)}.summary-notice__retry:disabled{opacity:.55;cursor:wait}.summary-empty{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--text-muted)}.is-spinning{animation:summary-spin 1s linear infinite}@keyframes summary-spin{to{transform:rotate(360deg)}}
@media(max-width:760px){.overview-summary-view__header{grid-template-columns:auto minmax(0,1fr)}.summary-actions{grid-column:1/-1;justify-content:flex-end}.overview-summary-view__body{padding:12px}.summary-content article{padding:14px}}
</style>
