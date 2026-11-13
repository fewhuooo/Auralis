<script setup lang="ts">
import { ref } from 'vue'
import { IconAlertTriangle, IconDots, IconFileText, IconRefresh } from '@tabler/icons-vue'
import type { OverviewResponse } from '@/types/overview'
import { renderMarkdown } from '@/utils/markdown'

export interface FileOverviewItem {
  id: string
  name: string
  outlineMarkdown: string | null
  summaryMarkdown: string | null
  status?: 'READY' | 'FAILED' | 'PENDING'
  error?: string | null
  syncStatus?: 'LOCAL' | 'PENDING' | 'SYNCED' | 'CONFLICT' | 'ERROR' | 'STALE'
  generationConflicts?: Array<{ clientWriteId: string; result: OverviewResponse }>
  generationConflictResolving?: boolean
  isGenerating?: boolean
}

const popoverVisibles = ref<Record<string, boolean>>({})

withDefaults(defineProps<{ files: FileOverviewItem[]; selectedFileId?: string | null }>(), { selectedFileId: null })
const emit = defineEmits<{
  'select-file': [fileId: string]
  'select-summary': [fileId: string]
  regenerate: [payload: { fileId: string; mode: 'OUTLINE' | 'ALL' }]
  'stop-regeneration': [fileId: string]
  'resolve-sync-conflict': [payload: { fileId: string; choice: 'LOCAL' | 'REMOTE' }]
  'resolve-generation-conflict': [payload: { fileId: string; clientWriteId: string; choice: 'KEEP_LOCAL' | 'USE_AI' }]
}>()
</script>

<template>
  <div class="file-outline-list">
    <article v-for="file in files" :key="file.id" class="file-outline" :class="{ 'is-selected': file.id === selectedFileId }">
      <header class="file-outline__header">
        <button type="button" class="file-outline__name" @click="emit('select-file', file.id)"><IconFileText :size="14" :stroke-width="1.6" /><span>{{ file.name }}</span></button>
        <span class="file-outline__actions">
          <button
            v-if="file.isGenerating"
            type="button"
            class="retry-capsule__btn"
            aria-label="停止文件总览生成"
            @click.stop="emit('stop-regeneration', file.id)"
          >停止</button>
          <button type="button" class="file-summary-button" :disabled="!file.summaryMarkdown" @click="emit('select-summary', file.id)">总结</button>
          <el-popover v-model:visible="popoverVisibles[file.id]" placement="bottom-end" trigger="click" width="130" popper-class="zen-popover zen-action-popover" :hide-after="0">
            <template #reference>
              <button
                type="button"
                class="file-more-button"
                aria-label="更多总览操作"
                :disabled="file.isGenerating"
              >
                <IconRefresh v-if="file.isGenerating" :size="13" :stroke-width="1.6" class="is-spinning" />
                <IconDots v-else :size="14" :stroke-width="1.6" />
              </button>
            </template>
            <div style="display:flex;flex-direction:column;gap:4px;">
              <button class="zen-menu-item" :disabled="file.isGenerating" @click="popoverVisibles[file.id] = false; emit('regenerate', { fileId: file.id, mode: 'OUTLINE' })">重新生成大纲</button>
              <button class="zen-menu-item" :disabled="file.isGenerating" @click="popoverVisibles[file.id] = false; emit('regenerate', { fileId: file.id, mode: 'ALL' })">重新生成全部</button>
            </div>
          </el-popover>
        </span>
      </header>
      <p v-if="file.error && (file.outlineMarkdown || file.summaryMarkdown)" class="file-outline__notice">
        <IconAlertTriangle :size="12" :stroke-width="1.6" />
        <span class="file-outline__notice-text">{{ file.error }}；当前内容仍可查看。</span>
        <button
          type="button"
          class="file-outline__retry"
          :disabled="file.isGenerating"
          @click.stop="emit('regenerate', { fileId: file.id, mode: file.summaryMarkdown ? 'OUTLINE' : 'ALL' })"
        >重新生成</button>
      </p>
      <p v-if="file.syncStatus === 'CONFLICT'" class="file-outline__notice">
        <IconAlertTriangle :size="12" :stroke-width="1.6" />
        <span class="file-outline__notice-text">云端版本已变化，本机总览仍保留。</span>
        <button type="button" class="file-outline__retry" @click.stop="emit('resolve-sync-conflict', { fileId: file.id, choice: 'LOCAL' })">保留本机</button>
        <button type="button" class="file-outline__retry" @click.stop="emit('resolve-sync-conflict', { fileId: file.id, choice: 'REMOTE' })">采用云端</button>
      </p>
      <section v-for="conflict in file.generationConflicts ?? []" :key="conflict.clientWriteId" class="file-outline__notice file-outline__generation-conflict">
        <IconAlertTriangle :size="12" :stroke-width="1.6" />
        <div class="file-outline__generation-content">
          <strong>生成期间本机内容有更新</strong>
          <details>
            <summary>查看生成结果</summary>
            <div v-if="conflict.result.outlineMarkdown" class="file-outline__conflict-preview" v-html="renderMarkdown(conflict.result.outlineMarkdown)" />
            <p v-if="conflict.result.summaryMarkdown" class="file-outline__conflict-summary">{{ conflict.result.summaryMarkdown.slice(0, 200) }}…</p>
          </details>
        </div>
        <button type="button" class="file-outline__retry" :disabled="file.generationConflictResolving" @click.stop="emit('resolve-generation-conflict', { fileId: file.id, clientWriteId: conflict.clientWriteId, choice: 'KEEP_LOCAL' })">保留我的修改</button>
        <button type="button" class="file-outline__retry" :disabled="file.generationConflictResolving" @click.stop="emit('resolve-generation-conflict', { fileId: file.id, clientWriteId: conflict.clientWriteId, choice: 'USE_AI' })">使用AI结果</button>
      </section>
      <div v-if="file.isGenerating && !file.outlineMarkdown" class="file-outline__pending"><IconRefresh :size="13" :stroke-width="1.6" class="is-spinning" />正在生成文件总览…</div>
      <div v-else-if="!file.outlineMarkdown" class="file-outline__pending">
        <IconRefresh v-if="file.status !== 'FAILED'" :size="13" :stroke-width="1.6" class="is-spinning" />
        <span>{{ file.status === 'FAILED' ? (file.error || '生成失败') : '等待文件解析并生成大纲' }}</span>
        <button
          v-if="file.status === 'FAILED'"
          type="button"
          class="file-outline__retry"
          :disabled="file.isGenerating"
          @click.stop="emit('regenerate', { fileId: file.id, mode: file.summaryMarkdown ? 'OUTLINE' : 'ALL' })"
        >重新生成</button>
      </div>
      <template v-else>
        <div v-if="file.isGenerating" class="file-outline__pending file-outline__pending--regenerating">
          <IconRefresh :size="12" :stroke-width="1.6" class="is-spinning" />
          <span>正在重新生成文件大纲…</span>
        </div>
        <div
          class="file-outline__markdown"
          :class="{ 'is-generating': file.isGenerating }"
          v-html="renderMarkdown(file.outlineMarkdown)"
        />
      </template>
    </article>
    <div v-if="!files.length" class="file-outline-list__empty">暂无学习文件</div>
  </div>
</template>

<style scoped>
.file-outline-list{display:grid;gap:10px;padding:0 10px 14px}
.file-outline{position:relative;border:1px solid var(--border-subtle);border-radius:11px;background:var(--bg-card);overflow:hidden;transition:transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.25s ease}
.file-outline:hover{border-color:rgba(125,147,114,.3);box-shadow:0 4px 14px -3px rgba(0,0,0,0.05)}
.file-outline.is-selected{border-color:rgba(125,147,114,.55);box-shadow:0 0 0 1px rgba(125,147,114,.35), 0 8px 24px -4px rgba(125,147,114,.18), 0 2px 6px -1px rgba(125,147,114,.1);transform:translateY(-2px)}
.file-outline__header{display:flex;align-items:center;gap:6px;padding:8px;background:var(--color-bg-tertiary, #FAF7F2);transition:background 0.25s ease}
.file-outline__name{display:flex;align-items:center;gap:6px;min-width:0;flex:1;border:0;background:transparent;color:var(--text-primary);font-size:12px;font-weight:650;text-align:left;cursor:pointer;transition:color 0.2s ease}
.file-outline.is-selected .file-outline__name{color:var(--color-primary-accent)}
.file-outline__name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.file-outline__actions{display:flex;align-items:center;gap:3px}
.file-more-button{display:flex;align-items:center;justify-content:center;border:0;border-radius:6px;background:transparent;color:var(--text-muted);cursor:pointer;width:24px;height:24px;transition:background 0.15s ease, color 0.15s ease}
.file-more-button:hover{background:var(--bg-modifier-hover);color:var(--text-primary)}
.file-summary-button{display:inline-flex;align-items:center;justify-content:center;padding:2px 8px;border-radius:999px;border:1px solid rgba(125,147,114,.28);background:var(--color-bg-tertiary, #FAF7F2);color:var(--color-primary-accent);font-size:10px;font-weight:600;line-height:1.4;cursor:pointer;white-space:nowrap;transition:background 0.15s ease, border-color 0.15s ease, transform 0.15s ease, color 0.15s ease}
.file-summary-button:hover:not(:disabled){background:rgba(125,147,114,.2);border-color:rgba(125,147,114,.45);transform:scale(1.03)}
.file-summary-button:active:not(:disabled){transform:scale(0.97)}
.file-summary-button:disabled{opacity:.38;cursor:not-allowed;border-color:transparent;background:var(--bg-modifier-hover);color:var(--text-muted)}
.file-outline__notice,.file-outline__pending{margin:0;padding:7px 9px;color:var(--text-muted);font-size:10.5px;line-height:1.45}
.file-outline__notice{display:flex;align-items:center;gap:5px;color:#995050;background:rgba(176,83,83,.06)}
.file-outline__notice-text{flex:1}
.file-outline__generation-conflict{align-items:flex-start;flex-wrap:wrap}
.file-outline__generation-content{flex:1;min-width:100px}
.file-outline__generation-content strong{display:block}
.file-outline__generation-content details{margin-top:4px}
.file-outline__generation-content summary{cursor:pointer}
.file-outline__conflict-preview{font-size:11px;color:var(--text-secondary);max-height:120px;overflow:hidden}
.file-outline__conflict-summary{font-size:11px;color:var(--text-muted);margin:4px 0 0}
.file-outline__pending{display:flex;align-items:center;justify-content:space-between;gap:6px}
.file-outline__retry{display:inline-flex;align-items:center;justify-content:center;padding:2px 7px;border:1px solid rgba(176,83,83,.25);border-radius:5px;background:var(--color-bg-tertiary, #FAF7F2);color:#995050;font-size:10.5px;font-weight:600;cursor:pointer;margin-left:auto}
.file-outline__retry:hover{background:rgba(176,83,83,.15)}
.file-outline__retry:disabled{opacity:.45;cursor:not-allowed}
.file-outline__markdown{padding:10px 12px 14px;font-size:12px;line-height:1.6;color:var(--text-secondary);word-break:break-word}
.file-outline__markdown.is-generating{opacity:.6;pointer-events:none;transition:opacity .2s ease}

/* --- 大纲文档标题 (H1) --- */
.file-outline__markdown :deep(h1){margin:2px 0 10px 0;padding:0 0 6px 0;font-size:13.5px;font-weight:700;line-height:1.45;color:var(--text-primary);border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;gap:6px;letter-spacing:-0.01em}
.file-outline__markdown :deep(h1::before){content:"";display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--color-primary-accent, #8B9A6E);flex-shrink:0}

/* --- 大纲议题/章节 (H2) --- */
.file-outline__markdown :deep(h2){margin:13px 0 6px 0;font-size:12px;font-weight:650;line-height:1.4;color:var(--text-primary);display:flex;align-items:center;gap:6px}
.file-outline__markdown :deep(h1 + h2),
.file-outline__markdown :deep(> h2:first-child){margin-top:4px}
.file-outline__markdown :deep(h2::before){content:"";display:inline-block;width:3px;height:11px;border-radius:999px;background:var(--color-primary-accent, #8B9A6E);flex-shrink:0}

/* --- 大纲小节 (H3 / H4) --- */
.file-outline__markdown :deep(h3){margin:9px 0 4px 0;font-size:11.5px;font-weight:600;line-height:1.4;color:var(--text-primary);display:flex;align-items:center;gap:5px}
.file-outline__markdown :deep(h3::before){content:"";display:inline-block;width:4px;height:4px;border-radius:1px;background:var(--color-primary-accent, #8B9A6E);opacity:0.8;flex-shrink:0}
.file-outline__markdown :deep(h4),
.file-outline__markdown :deep(h5),
.file-outline__markdown :deep(h6){margin:6px 0 3px 0;font-size:11px;font-weight:600;color:var(--text-primary)}

/* --- 列表与要点 (UL / OL / LI) --- */
.file-outline__markdown :deep(ul),
.file-outline__markdown :deep(ol){list-style:none;padding:0;margin:0 0 6px 0;display:flex;flex-direction:column;gap:5px}
.file-outline__markdown :deep(li){position:relative;padding-left:14px;font-size:11.5px;line-height:1.55;color:var(--text-secondary)}
.file-outline__markdown :deep(ul > li::before){content:"";position:absolute;left:3px;top:6.5px;width:4.5px;height:4.5px;border-radius:50%;background:var(--color-primary-accent, #8B9A6E);opacity:0.65;transition:opacity 0.15s ease, transform 0.15s ease}
.file-outline__markdown :deep(li:hover::before){opacity:1;transform:scale(1.15)}
.file-outline__markdown :deep(li > ul),
.file-outline__markdown :deep(li > ol){margin:4px 0 2px 0;padding-left:8px;gap:4px}
.file-outline__markdown :deep(li > ul > li::before){left:3px;top:6.5px;width:4px;height:4px;background:transparent;border:1.2px solid var(--color-primary-accent, #8B9A6E);opacity:0.75}
.file-outline__markdown :deep(ol){counter-reset:outline-counter}
.file-outline__markdown :deep(ol > li){counter-increment:outline-counter;padding-left:16px}
.file-outline__markdown :deep(ol > li::before){content:counter(outline-counter) ".";position:absolute;left:0;top:0;width:auto;height:auto;border-radius:0;background:transparent;font-size:10.5px;font-weight:600;color:var(--color-primary-accent, #8B9A6E);line-height:1.55}

/* --- 段落与内联元素 --- */
.file-outline__markdown :deep(p){margin:0 0 6px 0;font-size:11.5px;line-height:1.55;color:var(--text-secondary)}
.file-outline__markdown :deep(p:last-child){margin-bottom:0}
.file-outline__markdown :deep(strong){font-weight:650;color:var(--text-primary)}
.file-outline__markdown :deep(code){font-family:var(--font-family-mono, monospace);font-size:10.5px;padding:1px 4px;border-radius:4px;background:rgba(0,0,0,0.04);color:var(--color-primary-accent, #8B9A6E)}
.file-outline__markdown :deep(blockquote){margin:6px 0;padding:4px 8px;border-left:2px solid var(--color-primary-accent, #8B9A6E);background:rgba(139,154,110,0.06);border-radius:0 4px 4px 0;font-size:11px;color:var(--text-muted)}
.file-outline__markdown :deep(hr){margin:8px 0;border:none;border-top:1px solid var(--border-subtle)}

/* --- 冲突预览适配 --- */
.file-outline__conflict-preview :deep(h1){font-size:11.5px;font-weight:700;margin:2px 0 4px}
.file-outline__conflict-preview :deep(h2){font-size:11px;font-weight:650;margin:4px 0 2px}
.file-outline__conflict-preview :deep(ul){margin:0;padding-left:12px}
.file-outline__conflict-preview :deep(li){font-size:10.5px;line-height:1.4}

/* --- 暗色模式适配 --- */
html.dark .file-outline__markdown :deep(code){background:rgba(255,255,255,0.08)}
html.dark .file-outline__markdown :deep(blockquote){background:rgba(139,154,110,0.1)}

.file-outline__pending--regenerating{background:rgba(125,147,114,.08);color:var(--color-primary-accent);border-bottom:1px dashed rgba(125,147,114,.25)}
.file-outline-list__empty{padding:24px 10px;color:var(--text-muted);font-size:12px;text-align:center}
.is-spinning{animation:outline-spin 1s linear infinite}@keyframes outline-spin{to{transform:rotate(360deg)}}
.retry-capsule__btn{display:inline-flex;align-items:center;justify-content:center;gap:3px;padding:2px 7px;border-radius:999px;border:1px solid rgba(125,147,114,.35);background:var(--color-bg-tertiary, #FAF7F2);color:var(--color-primary-accent);font-size:10px;font-weight:600;line-height:1.4;cursor:pointer;white-space:nowrap;transition:all 0.15s ease}
.retry-capsule__btn:hover:not(:disabled){background:rgba(125,147,114,.2);border-color:rgba(125,147,114,.5);transform:scale(1.02)}
.retry-capsule__btn:disabled{opacity:.45;cursor:not-allowed}
.zen-menu-item{display:flex;align-items:center;gap:6px;width:100%;padding:6px 10px;border:0;border-radius:999px;background:transparent;color:var(--text-primary);font-size:11px;font-weight:500;cursor:pointer;text-align:left;transition:background 0.15s ease, color 0.15s ease, transform 0.15s ease}
.zen-menu-item:hover{background:rgba(125,147,114,.12);color:var(--color-primary-accent);transform:translateX(1px)}
.zen-menu-item:disabled{opacity:.45;cursor:not-allowed}
</style>
