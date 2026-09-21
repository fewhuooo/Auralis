<script setup lang="ts">
import { AlertTriangle, FileText, MapPin, MoreHorizontal, RefreshCw } from 'lucide-vue-next'
import type { OverviewChapter, OverviewLocator, OverviewSummary } from '@/types/overview'

export interface FileOverviewItem {
  id: string
  name: string
  outline: OverviewChapter[] | null
  summary: OverviewSummary | null
  status?: 'READY' | 'FAILED' | 'PENDING'
  error?: string | null
  isGenerating?: boolean
}

withDefaults(defineProps<{ files: FileOverviewItem[]; selectedFileId?: string | null }>(), { selectedFileId: null })
const emit = defineEmits<{
  'select-file': [fileId: string]
  'select-summary': [fileId: string]
  'select-outline-node': [payload: { fileId: string; locator: OverviewLocator | null }]
  regenerate: [payload: { fileId: string; mode: 'OUTLINE' | 'ALL' }]
}>()
</script>

<template>
  <div class="file-outline-list">
    <article v-for="file in files" :key="file.id" class="file-outline" :class="{ 'is-selected': file.id === selectedFileId }">
      <header class="file-outline__header">
        <button type="button" class="file-outline__name" @click="emit('select-file', file.id)"><FileText :size="14" /><span>{{ file.name }}</span></button>
        <span class="file-outline__actions">
          <button type="button" class="file-summary-button" :disabled="!file.summary" @click="emit('select-summary', file.id)">总结</button>
          <el-popover placement="bottom-end" trigger="click" width="130" popper-class="zen-popover" :hide-after="0">
            <template #reference>
              <button type="button" class="file-more-button" aria-label="更多总览操作"><MoreHorizontal :size="14" /></button>
            </template>
            <div style="display:flex;flex-direction:column;gap:4px;">
              <button class="zen-menu-item" @click="emit('regenerate', { fileId: file.id, mode: 'OUTLINE' })">重新生成大纲</button>
              <button class="zen-menu-item" @click="emit('regenerate', { fileId: file.id, mode: 'ALL' })">重新生成全部</button>
            </div>
          </el-popover>
        </span>
      </header>
      <p v-if="file.error && (file.outline?.length || file.summary)" class="file-outline__notice">
        <AlertTriangle :size="12" />
        <span class="file-outline__notice-text">{{ file.error }}；当前内容仍可查看。</span>
        <button
          type="button"
          class="file-outline__retry"
          :disabled="file.isGenerating"
          @click.stop="emit('regenerate', { fileId: file.id, mode: file.summary ? 'OUTLINE' : 'ALL' })"
        >重新生成</button>
      </p>
      <div v-if="file.isGenerating && !file.outline" class="file-outline__pending"><RefreshCw :size="13" class="is-spinning" />正在生成文件总览…</div>
      <div v-else-if="!file.outline?.length" class="file-outline__pending">
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
          <strong>{{ chapter.title }}</strong>
          <button v-for="section in chapter.sections" :key="section.title" type="button" @click="emit('select-outline-node', { fileId: file.id, locator: section.locator })">
            <span>{{ section.title }}</span><MapPin v-if="section.locator" :size="11" />
          </button>
        </li>
      </ol>
    </article>
    <div v-if="!files.length" class="file-outline-list__empty">暂无学习文件</div>
  </div>
</template>

<style scoped>
.file-outline-list{display:grid;gap:10px;padding:0 10px 14px}.file-outline{border:1px solid var(--border-subtle);border-radius:11px;background:var(--bg-card);overflow:hidden}.file-outline.is-selected{border-color:rgba(125,147,114,.45);box-shadow:0 0 0 2px rgba(125,147,114,.07)}.file-outline__header{display:flex;align-items:center;gap:6px;padding:8px;background:var(--bg-secondary)}.file-outline__name{display:flex;align-items:center;gap:6px;min-width:0;flex:1;border:0;background:transparent;color:var(--text-primary);font-size:12px;font-weight:650;text-align:left;cursor:pointer}.file-outline__name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.file-outline__actions{display:flex;align-items:center;gap:3px}.file-summary-button,.file-more-button{display:flex;align-items:center;justify-content:center;gap:3px;border:0;border-radius:6px;background:transparent;color:var(--color-primary-accent);font-size:10px;font-weight:700;cursor:pointer}.file-summary-button{padding:4px 6px;background:var(--color-primary-light)}.file-summary-button:disabled{opacity:.4;cursor:not-allowed}.file-more-button{width:24px;height:24px;color:var(--text-muted)}.file-outline__notice,.file-outline__pending{margin:0;padding:7px 9px;color:var(--text-muted);font-size:10.5px;line-height:1.45}.file-outline__notice{display:flex;align-items:center;gap:5px;color:#995050;background:rgba(176,83,83,.06)}.file-outline__notice-text{flex:1}.file-outline__pending{display:flex;align-items:center;justify-content:space-between;gap:6px}.file-outline__retry{display:inline-flex;align-items:center;justify-content:center;padding:2px 7px;border:1px solid rgba(176,83,83,.25);border-radius:5px;background:rgba(176,83,83,.08);color:#995050;font-size:10.5px;font-weight:600;cursor:pointer;margin-left:auto}.file-outline__retry:hover{background:rgba(176,83,83,.15)}.file-outline__retry:disabled{opacity:.45;cursor:not-allowed}.file-outline__chapters{display:grid;gap:9px;margin:0;padding:9px;list-style:none}.file-outline__chapters li{display:grid;gap:3px}.file-outline__chapters strong{padding-left:4px;color:var(--text-primary);font-size:11.5px}.file-outline__chapters button{position:relative;display:flex;align-items:center;justify-content:space-between;gap:5px;padding:5px 7px 5px 22px;border:0;border-radius:6px;background:transparent;color:var(--text-secondary);font-size:11px;text-align:left;cursor:pointer}.file-outline__chapters button::before{content:"";position:absolute;left:9px;top:0;bottom:0;width:1px;background:var(--border-subtle)}.file-outline__chapters button::after{content:"";position:absolute;left:9px;top:50%;width:8px;height:1px;background:var(--border-subtle)}.file-outline__chapters button:hover{background:var(--color-primary-light);color:var(--color-primary-accent)}.file-outline-list__empty{padding:24px 10px;color:var(--text-muted);font-size:12px;text-align:center}.is-spinning{animation:outline-spin 1s linear infinite}@keyframes outline-spin{to{transform:rotate(360deg)}}
.zen-menu-item{display:flex;align-items:center;gap:6px;width:100%;padding:6px 10px;border:0;border-radius:6px;background:transparent;color:var(--text-primary);font-size:11px;font-weight:500;cursor:pointer;text-align:left}.zen-menu-item:hover{background:var(--bg-modifier-hover)}
</style>
