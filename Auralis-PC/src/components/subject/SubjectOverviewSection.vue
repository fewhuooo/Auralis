<script setup lang="ts">
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw } from 'lucide-vue-next'
import type { SubjectOverviewRecord } from '@/types/overview'

const props = withDefaults(defineProps<{
  overview: SubjectOverviewRecord | null
  collapsed?: boolean
  sourceCount?: number
  isStale?: boolean
  isGenerating?: boolean
  error?: string | null
}>(), { collapsed: true, sourceCount: 0, isStale: false, isGenerating: false, error: null })

const emit = defineEmits<{
  'update:collapsed': [value: boolean]
  generate: []
  'generate-outline': []
  'open-summary': []
}>()

const hasContent = () => Boolean(props.overview?.outline?.length || props.overview?.summary)
</script>

<template>
  <section class="subject-overview" :class="{ 'is-stale': isStale, 'has-error': error }">
    <div class="subject-overview__header" role="button" tabindex="0" :aria-expanded="!collapsed" @click="emit('update:collapsed', !collapsed)" @keydown.enter.prevent="emit('update:collapsed', !collapsed)" @keydown.space.prevent="emit('update:collapsed', !collapsed)">
      <span class="subject-overview__heading">
        <ChevronRight v-if="collapsed" :size="15" />
        <ChevronDown v-else :size="15" />
        <strong>学科总览</strong>
        <small v-if="sourceCount">{{ sourceCount }} 份资料</small>
        <span v-if="isStale" class="overview-badge"><AlertTriangle :size="12" />资料已更新</span>
      </span>
      <span class="subject-overview__actions" @click.stop>
        <button v-if="overview?.summary" type="button" class="overview-action overview-action--quiet" @click="emit('open-summary')">总结</button>
        <button type="button" class="overview-action overview-action--quiet" :disabled="isGenerating" @click="emit('generate-outline')">{{ overview?.outline?.length ? '重新生成大纲' : '生成大纲' }}</button>
        <button type="button" class="overview-action" :disabled="isGenerating" @click="emit('generate')">
          <RefreshCw v-if="isGenerating" :size="13" class="is-spinning" />
          {{ hasContent() ? '重新生成' : '生成总览' }}
        </button>
      </span>
    </div>

    <div v-show="!collapsed" class="subject-overview__body">
      <p v-if="error" class="overview-notice overview-notice--error">{{ error }}<span v-if="hasContent()">；当前内容仍可查看。</span></p>
      <p v-if="isStale && hasContent()" class="overview-notice">资料发生变化，当前内容仍可查看，建议重新生成。</p>
      <div v-if="!hasContent()" class="subject-overview__empty">
        <div v-if="isGenerating" class="empty-loading"><RefreshCw :size="16" class="is-spinning" /></div>
        <div class="empty-text-group">
          <span class="empty-title">{{ isGenerating ? '正在梳理学科资料…' : '尚未生成学科总览' }}</span>
          <span class="empty-subtitle">仅在您主动生成时整合当前学科的所有资料。</span>
        </div>
        <button v-if="!isGenerating" class="empty-inline-action" type="button" @click="emit('generate')">一键生成</button>
      </div>
      <template v-else>
        <button v-if="overview?.summary" type="button" class="overview-summary-card" @click="emit('open-summary')">
          <strong>核心总结</strong><span>{{ overview.summary.overview }}</span>
        </button>
        <ol v-if="overview?.outline?.length" class="subject-outline-preview">
          <li v-for="chapter in overview.outline" :key="chapter.title">
            <span>{{ chapter.title }}</span><small>{{ chapter.sections.length }} 个知识点</small>
          </li>
        </ol>
      </template>
    </div>
  </section>
</template>

<style scoped>
.subject-overview{margin:0 10px 12px;border:1px solid var(--border-subtle);border-radius:12px;background:var(--bg-modifier-hover);overflow:hidden}.subject-overview.is-stale{border-color:rgba(166,125,55,.34)}.subject-overview.has-error{border-color:rgba(176,83,83,.32)}
.subject-overview__header{width:100%;min-height:46px;padding:8px 10px;border:0;background:transparent;color:var(--text-primary);display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;cursor:pointer}.subject-overview__heading,.subject-overview__actions,.overview-action,.overview-badge{display:flex;align-items:center}.subject-overview__heading{gap:7px;min-width:0}.subject-overview__heading strong{font-size:13px}.subject-overview__heading small{color:var(--text-muted);white-space:nowrap}.subject-overview__actions{gap:5px}.overview-action{gap:4px;border:0;border-radius:7px;padding:5px 8px;background:var(--color-primary-light);color:var(--color-primary-accent);font-size:11px;font-weight:700;cursor:pointer}.overview-action--quiet{background:transparent}.overview-action:disabled{opacity:.55;cursor:wait}.overview-badge{gap:3px;padding:2px 5px;border-radius:999px;background:rgba(166,125,55,.1);color:#8b672f;font-size:10px;white-space:nowrap}
.subject-overview__body{padding:10px;border-top:1px solid var(--border-subtle);display:grid;gap:8px}
.subject-overview__empty{min-height:96px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:12px;background:rgba(255,255,255,0.4);border:1px dashed var(--border-subtle);border-radius:9px;text-align:center}
.empty-loading{color:var(--color-primary-accent);opacity:0.8}
.empty-text-group{display:grid;gap:4px}
.empty-title{font-size:12px;font-weight:600;color:var(--text-primary)}
.empty-subtitle{font-size:10.5px;color:var(--text-muted);line-height:1.4}
.empty-inline-action{padding:5px 12px;border:0;border-radius:999px;background:var(--color-primary-light);color:var(--color-primary-accent);font-size:11px;font-weight:700;cursor:pointer;margin-top:2px}
.empty-inline-action:hover{filter:brightness(0.95)}
.overview-notice{margin:0;padding:7px 8px;border-radius:7px;background:rgba(166,125,55,.09);color:#7b5d2e;font-size:11px;line-height:1.45}.overview-notice--error{background:rgba(176,83,83,.08);color:#995050}.overview-summary-card{display:grid;gap:5px;width:100%;padding:9px;border:1px solid var(--border-subtle);border-radius:9px;background:var(--bg-secondary);color:var(--text-primary);text-align:left;cursor:pointer}.overview-summary-card span{color:var(--text-secondary);font-size:11px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.subject-outline-preview{display:grid;gap:5px;margin:0;padding:0;list-style:none}.subject-outline-preview li{display:flex;justify-content:space-between;gap:8px;padding:5px 7px;border-radius:6px;color:var(--text-secondary);font-size:12px}.subject-outline-preview li:hover{background:var(--bg-secondary)}.subject-outline-preview small{color:var(--text-muted);white-space:nowrap}.is-spinning{animation:overview-spin 1s linear infinite}@keyframes overview-spin{to{transform:rotate(360deg)}}
@media(max-width:720px){.subject-overview__header{align-items:flex-start}.subject-overview__heading{flex-wrap:wrap}.subject-overview__actions{flex-shrink:0}.overview-action{padding-inline:6px}}
</style>
