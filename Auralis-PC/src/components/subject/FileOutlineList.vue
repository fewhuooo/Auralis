<script setup lang="ts">
import { IconAlertTriangle, IconChevronRight, IconDots, IconFileText, IconMapPin, IconRefresh } from '@tabler/icons-vue'
import type { OverviewChapter, OverviewLocator, OverviewSummary } from '@/types/overview'

export interface FileOverviewItem {
  id: string
  name: string
  outline: OverviewChapter[] | null
  summary: OverviewSummary | null
  status?: 'READY' | 'FAILED' | 'PENDING'
  error?: string | null
  syncStatus?: 'LOCAL' | 'PENDING' | 'SYNCED' | 'CONFLICT' | 'ERROR' | 'STALE'
  isGenerating?: boolean
}

withDefaults(defineProps<{ files: FileOverviewItem[]; selectedFileId?: string | null }>(), { selectedFileId: null })
const emit = defineEmits<{
  'select-file': [fileId: string]
  'select-summary': [fileId: string]
  'select-outline-node': [payload: { fileId: string; locator: OverviewLocator | null }]
  regenerate: [payload: { fileId: string; mode: 'OUTLINE' | 'ALL' }]
  'resolve-sync-conflict': [payload: { fileId: string; choice: 'LOCAL' | 'REMOTE' }]
}>()
</script>

<template>
  <div class="file-outline-list">
    <article v-for="file in files" :key="file.id" class="file-outline" :class="{ 'is-selected': file.id === selectedFileId }">
      <header class="file-outline__header">
        <button type="button" class="file-outline__name" @click="emit('select-file', file.id)"><IconFileText :size="14" :stroke-width="1.6" /><span>{{ file.name }}</span></button>
        <span class="file-outline__actions">
          <button type="button" class="file-summary-button" :disabled="!file.summary" @click="emit('select-summary', file.id)">总结</button>
          <el-popover placement="bottom-end" trigger="click" width="130" popper-class="zen-popover zen-action-popover" :hide-after="0">
            <template #reference>
              <button type="button" class="file-more-button" aria-label="更多总览操作"><IconDots :size="14" :stroke-width="1.6" /></button>
            </template>
            <div style="display:flex;flex-direction:column;gap:4px;">
              <button class="zen-menu-item" @click="emit('regenerate', { fileId: file.id, mode: 'OUTLINE' })">重新生成大纲</button>
              <button class="zen-menu-item" @click="emit('regenerate', { fileId: file.id, mode: 'ALL' })">重新生成全部</button>
            </div>
          </el-popover>
        </span>
      </header>
      <p v-if="file.error && (file.outline?.length || file.summary)" class="file-outline__notice">
        <IconAlertTriangle :size="12" :stroke-width="1.6" />
        <span class="file-outline__notice-text">{{ file.error }}；当前内容仍可查看。</span>
        <button
          type="button"
          class="file-outline__retry"
          :disabled="file.isGenerating"
          @click.stop="emit('regenerate', { fileId: file.id, mode: file.summary ? 'OUTLINE' : 'ALL' })"
        >重新生成</button>
      </p>
      <p v-if="file.syncStatus === 'CONFLICT'" class="file-outline__notice">
        <IconAlertTriangle :size="12" :stroke-width="1.6" />
        <span class="file-outline__notice-text">云端版本已变化，本机总览仍保留。</span>
        <button type="button" class="file-outline__retry" @click.stop="emit('resolve-sync-conflict', { fileId: file.id, choice: 'LOCAL' })">保留本机</button>
        <button type="button" class="file-outline__retry" @click.stop="emit('resolve-sync-conflict', { fileId: file.id, choice: 'REMOTE' })">采用云端</button>
      </p>
      <div v-if="file.isGenerating && !file.outline" class="file-outline__pending"><IconRefresh :size="13" :stroke-width="1.6" class="is-spinning" />正在生成文件总览…</div>
      <div v-else-if="!file.outline?.length" class="file-outline__pending">
        <IconRefresh v-if="file.status !== 'FAILED'" :size="13" :stroke-width="1.6" class="is-spinning" />
        <span>{{ file.status === 'FAILED' ? (file.error || '生成失败') : '等待文件解析并生成大纲' }}</span>
        <button
          v-if="file.status === 'FAILED'"
          type="button"
          class="file-outline__retry"
          :disabled="file.isGenerating"
          @click.stop="emit('regenerate', { fileId: file.id, mode: file.summary ? 'OUTLINE' : 'ALL' })"
        >重新生成</button>
      </div>
      <ol v-else class="file-outline__chapters">
        <li v-for="chapter in file.outline" :key="chapter.title">
          <strong class="chapter-header">
            <span class="chapter-title">{{ chapter.title }}</span>
          </strong>
          <button v-for="section in chapter.sections" :key="section.title" type="button" @click="emit('select-outline-node', { fileId: file.id, locator: section.locator })">
            <span>{{ section.title }}</span>
            <IconMapPin v-if="section.locator" :size="11" :stroke-width="1.6" class="section-arrow" />
            <IconChevronRight v-else :size="11" :stroke-width="1.6" class="section-arrow" />
          </button>
        </li>
      </ol>
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
.file-outline__pending{display:flex;align-items:center;justify-content:space-between;gap:6px}
.file-outline__retry{display:inline-flex;align-items:center;justify-content:center;padding:2px 7px;border:1px solid rgba(176,83,83,.25);border-radius:5px;background:var(--color-bg-tertiary, #FAF7F2);color:#995050;font-size:10.5px;font-weight:600;cursor:pointer;margin-left:auto}
.file-outline__retry:hover{background:rgba(176,83,83,.15)}
.file-outline__retry:disabled{opacity:.45;cursor:not-allowed}
.file-outline__chapters{display:flex;flex-direction:column;gap:10px;margin:4px 0 2px;padding:4px 4px 6px;list-style:none}
.file-outline__chapters li{display:flex;flex-direction:column;gap:2px;position:relative}
.file-outline__chapters strong{display:flex;align-items:center;gap:6px;padding:3px 4px;color:var(--text-primary);font-size:11.5px;font-weight:650;letter-spacing:-0.01em;user-select:none}
.file-outline__chapters strong::before{content:"";display:inline-block;width:3px;height:11px;border-radius:999px;background:var(--color-primary-accent);opacity:0.75;flex-shrink:0;margin-right:-2px}
.chapter-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.file-outline__chapters button{position:relative;display:flex;align-items:center;justify-content:space-between;gap:7px;padding:4.5px 8px 4.5px 10px;margin:1px 0 1px 6px;border:0;border-radius:6px;background:transparent;color:var(--text-secondary);font-size:11px;line-height:1.45;text-align:left;cursor:pointer;transition:background 0.15s ease, color 0.15s ease, transform 0.15s ease}
.file-outline__chapters button::before{content:"";display:inline-block;width:4px;height:4px;border-radius:50%;background:var(--text-muted);opacity:0.4;flex-shrink:0;transition:transform 0.15s ease, background 0.15s ease, opacity 0.15s ease}
.file-outline__chapters button span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.file-outline__chapters button .section-arrow{color:var(--text-muted);opacity:0.25;flex-shrink:0;transition:opacity 0.15s ease, color 0.15s ease, transform 0.15s ease}
.file-outline__chapters button:hover{background:var(--bg-modifier-hover);color:var(--text-primary);transform:translateX(2px)}
.file-outline__chapters button:hover::before{background:var(--color-primary-accent);opacity:1;transform:scale(1.3)}
.file-outline__chapters button:hover .section-arrow{color:var(--color-primary-accent);opacity:0.85;transform:translateX(1px)}
.file-outline__chapters button:active{transform:scale(0.98) translateX(2px)}
.file-outline-list__empty{padding:24px 10px;color:var(--text-muted);font-size:12px;text-align:center}
.is-spinning{animation:outline-spin 1s linear infinite}@keyframes outline-spin{to{transform:rotate(360deg)}}
.zen-menu-item{display:flex;align-items:center;gap:6px;width:100%;padding:6px 10px;border:0;border-radius:999px;background:transparent;color:var(--text-primary);font-size:11px;font-weight:500;cursor:pointer;text-align:left;transition:background 0.15s ease, color 0.15s ease, transform 0.15s ease}
.zen-menu-item:hover{background:rgba(125,147,114,.12);color:var(--color-primary-accent);transform:translateX(1px)}
.zen-menu-item:disabled{opacity:.45;cursor:not-allowed}
</style>
