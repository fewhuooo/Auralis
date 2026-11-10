<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getChatChartRatios } from '@/services/chatContentProjection'
import { renderMarkdown } from '@/utils/markdown'
import type { ChatBlockPart } from '@/types/chatContent'

const props = withDefaults(defineProps<{
  block: ChatBlockPart
  streaming?: boolean
  busy?: boolean
}>(), {
  streaming: false,
  busy: false,
})

// 内部条目逐个渐进渲染：最外层框架与头部率先就位，内部每一个组成部分按序一个一个涌现
const visibleItemCount = ref(0)
let itemIncrementTimer: ReturnType<typeof setInterval> | null = null

function stepProgressiveItems() {
  const target = props.block.items.length
  if (target === 0) {
    visibleItemCount.value = 0
    return
  }

  // 非流式渲染（如历史记录回显、已完成块）无需 75ms 逐个涌现，直接呈现全部内容
  if (!props.streaming && props.block.state !== 'GENERATING') {
    visibleItemCount.value = target
    if (itemIncrementTimer !== null) {
      clearInterval(itemIncrementTimer)
      itemIncrementTimer = null
    }
    return
  }

  // 首项到达时立即呈现，消除首项前的多余延迟
  if (visibleItemCount.value === 0) {
    visibleItemCount.value = 1
  }
  runIncrementLoop()
}

function runIncrementLoop() {
  if (visibleItemCount.value >= props.block.items.length) {
    if (itemIncrementTimer !== null) {
      clearInterval(itemIncrementTimer)
      itemIncrementTimer = null
    }
    return
  }

  if (itemIncrementTimer !== null) return
  itemIncrementTimer = setInterval(() => {
    if (visibleItemCount.value < props.block.items.length) {
      visibleItemCount.value++
    }
    if (visibleItemCount.value >= props.block.items.length) {
      if (itemIncrementTimer !== null) {
        clearInterval(itemIncrementTimer)
        itemIncrementTimer = null
      }
    }
  }, 75) // 每 75ms 顺次唤醒渲染下一个内部结构组成
}

watch(
  () => props.block.items.length,
  () => {
    stepProgressiveItems()
  },
  { immediate: true },
)

watch(
  () => props.block.state,
  (state) => {
    if (state === 'INVALID' && props.block.items.length === 0) {
      if (itemIncrementTimer !== null) {
        clearInterval(itemIncrementTimer)
        itemIncrementTimer = null
      }
      visibleItemCount.value = 0
    } else {
      // 即使 block.state 转为 READY，也不打断一个一个渲染的过程，保持顺次涌现
      stepProgressiveItems()
    }
  },
)

onBeforeUnmount(() => {
  if (itemIncrementTimer !== null) {
    clearInterval(itemIncrementTimer)
    itemIncrementTimer = null
  }
})

// 严格依赖 visibleItemCount 截取已激活的项目，保证内部组成一个一个进入 DOM
const displayedItems = computed(() => {
  return props.block.items.slice(0, visibleItemCount.value)
})

const title = computed(() => text(props.block.meta.title))
const description = computed(() => text(props.block.meta.description))
const chartType = computed(() => props.block.meta.chartType)
const chartRatios = computed(() => getChatChartRatios({ ...props.block, items: displayedItems.value }))
const chartMaximum = computed(() => displayedItems.value.reduce((maximum, item) => Math.max(maximum, valueOf(item)), 0))
const proportionSegments = computed(() => {
  let cursor = 0
  return displayedItems.value.map((_item, index) => {
    const start = cursor
    cursor += (chartRatios.value[index] ?? 0) * 100
    const color = index % 2 === 0
      ? 'var(--color-zen-sage, #8B9A6E)'
      : 'color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 40%, var(--border-default, #dcd8d0))'
    return `${color} ${start}% ${cursor}%`
  }).join(', ')
})
const proportionStyle = computed(() => ({
  background: `conic-gradient(from -90deg, ${proportionSegments.value})`,
}))

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function titleOf(item: Readonly<Record<string, unknown>>): string {
  return text(item.title)
}

function detailOf(item: Readonly<Record<string, unknown>>): string {
  return text(item.description)
}

function labelOf(item: Readonly<Record<string, unknown>>): string {
  return text(item.label)
}

function valueOf(item: Readonly<Record<string, unknown>>): number {
  return typeof item.value === 'number' && Number.isFinite(item.value) ? item.value : 0
}

function ratioOf(index: number): number {
  return chartMaximum.value > 0
    ? (valueOf(props.block.items[index] ?? {}) / chartMaximum.value) * 100
    : 0
}

function currentOf(item: Readonly<Record<string, unknown>>): boolean {
  return item.current === true
}

function tagOf(item: Readonly<Record<string, unknown>>): string {
  return text(item.tag)
}

interface CompareEntry {
  label: string
  text: string
}

function entriesOf(item: Readonly<Record<string, unknown>>): readonly CompareEntry[] {
  if (!Array.isArray(item.entries)) return []
  const result: CompareEntry[] = []
  for (const entry of item.entries) {
    if (entry && typeof entry === 'object' && typeof entry.label === 'string' && typeof entry.text === 'string') {
      result.push({ label: entry.label, text: entry.text })
    }
  }
  return result
}
</script>

<template>
  <!-- 最外层卡片框架：简约现代结构，去除点阵底纹与多余图标徽章 -->
  <section class="chat-content-block" :class="`chat-content-block--${block.component}`">
    <header v-if="title || description" class="chat-content-block__header">
      <div class="chat-content-block__heading-row">
        <div class="chat-content-block__heading">
          <h3 v-if="title" class="chat-content-block__title" v-html="renderMarkdown(title)" />
        </div>
      </div>
      <div v-if="description" class="chat-content-block__description" v-html="renderMarkdown(description)" />
    </header>

    <!-- 骨架占位态：内部条目尚未到达时呈现优雅骨架条 -->
    <div v-if="displayedItems.length === 0 && (block.state === 'GENERATING' || busy || streaming)" class="chat-content-block__skeleton">
      <div class="skeleton-pulse skeleton-pulse--card" />
      <div class="skeleton-pulse skeleton-pulse--card" />
    </div>

    <div v-else-if="displayedItems.length === 0 && block.state === 'INVALID' && !busy && !streaming" class="chat-content-block__empty-invalid">
      <span class="invalid-indicator">内容生成未完成或格式异常</span>
    </div>

    <!-- 内部结构 1：步骤拆解（逐个条目顺次展开） -->
    <ol v-else-if="block.component === 'steps'" class="chat-steps">
      <li v-for="(item, index) in displayedItems" :key="`${block.componentId}-step-${index}`">
        <span class="chat-steps__node" aria-hidden="true">{{ index + 1 }}</span>
        <div class="chat-steps__copy chat-steps__card">
          <div class="chat-steps__title-row">
            <strong class="chat-steps__title" v-html="renderMarkdown(titleOf(item))" />
          </div>
          <div v-if="detailOf(item)" class="chat-steps__detail" v-html="renderMarkdown(detailOf(item))" />
        </div>
      </li>
      <!-- 动态推进占位，消除批次到达间的停顿感 -->
      <li v-if="block.state === 'GENERATING'" class="chat-steps__generating-item" aria-hidden="true">
        <span class="chat-steps__node chat-steps__node--generating">
          <span class="node-pulse-dot" />
        </span>
        <div class="chat-steps__copy chat-steps__card chat-steps__card--generating">
          <div class="item-shimmer-line" />
        </div>
      </li>
    </ol>

    <!-- 内部结构 2：对照分析（各维度卡片逐个涌现） -->
    <div v-else-if="block.component === 'compare'" class="chat-compare">
      <article
        v-for="(item, index) in displayedItems"
        :key="`${block.componentId}-dim-${index}`"
        class="chat-compare__dimension"
      >
        <div class="chat-compare__dim-header">
          <h4 class="chat-compare__dim-title" v-html="renderMarkdown(titleOf(item))" />
        </div>
        <div class="chat-compare__entries">
          <div
            v-for="(entry, entryIdx) in entriesOf(item)"
            :key="`${block.componentId}-entry-${index}-${entryIdx}`"
            class="chat-compare__entry-row"
          >
            <span class="chat-compare__entry-badge">{{ entry.label }}</span>
            <div class="chat-compare__entry-text" v-html="renderMarkdown(entry.text)" />
          </div>
        </div>
      </article>
      <div v-if="block.state === 'GENERATING'" class="chat-compare__generating-dim" aria-hidden="true">
        <div class="item-shimmer-card" />
      </div>
    </div>

    <!-- 内部结构 3：学习脉络（路线节点逐个连接展开） -->
    <ol v-else-if="block.component === 'roadmap'" class="chat-roadmap">
      <li
        v-for="(item, index) in displayedItems"
        :key="`${block.componentId}-route-${index}`"
        :class="{ 'chat-roadmap__item--current': currentOf(item) }"
        :aria-current="currentOf(item) ? 'step' : undefined"
      >
        <span class="chat-roadmap__node" aria-hidden="true">{{ index + 1 }}</span>
        <div class="chat-roadmap__copy chat-roadmap__card">
          <div class="chat-roadmap__title-row">
            <strong class="chat-roadmap__title" v-html="renderMarkdown(titleOf(item))" />
            <span v-if="tagOf(item)" class="chat-roadmap__tag">{{ tagOf(item) }}</span>
            <span v-if="currentOf(item)" class="chat-roadmap__current">目前位置</span>
          </div>
          <div v-if="detailOf(item)" class="chat-roadmap__detail" v-html="renderMarkdown(detailOf(item))" />
        </div>
      </li>
      <!-- 动态推进占位，消除批次到达间的停顿感 -->
      <li v-if="block.state === 'GENERATING'" class="chat-roadmap__generating-item" aria-hidden="true">
        <span class="chat-roadmap__node chat-roadmap__node--generating">
          <span class="node-pulse-dot" />
        </span>
        <div class="chat-roadmap__copy chat-roadmap__card chat-roadmap__card--generating">
          <div class="item-shimmer-line" />
        </div>
      </li>
    </ol>

    <!-- 内部结构 4：图表/数据对比（比例或数据条逐个生长） -->
    <div v-else-if="block.component === 'chart'" class="chat-chart">
      <div v-if="chartType === 'proportion'" class="chat-chart__proportion-row">
        <div class="chat-chart__ring-wrap">
          <div
            class="chat-chart__ring"
            :style="proportionStyle"
            role="img"
            :aria-label="`${title || '比例图'}：${displayedItems.map((item) => `${labelOf(item)} ${valueOf(item)}${text(block.meta.unit)}`).join('，')}`"
          >
            <span class="chat-chart__ring-hole" />
          </div>
        </div>
        <ul class="chat-chart__legend">
          <li v-for="(item, index) in displayedItems" :key="`${block.componentId}-slice-${index}`" class="chat-chart__legend-item">
            <span class="chat-chart__swatch" :class="{ 'chat-chart__swatch--muted': index % 2 === 1 }" />
            <span class="chat-chart__legend-label">{{ labelOf(item) }}</span>
            <strong class="chat-chart__legend-value">{{ valueOf(item) }}<small class="chat-chart__unit">{{ text(block.meta.unit) }}</small></strong>
          </li>
        </ul>
      </div>
      <div v-else class="chat-chart__bars" role="list">
        <div v-for="(item, index) in displayedItems" :key="`${block.componentId}-bar-${index}`" class="chat-chart__bar-row" role="listitem">
          <span class="chat-chart__bar-label">{{ labelOf(item) }}</span>
          <div class="chat-chart__track-wrap">
            <span class="chat-chart__track"><span class="chat-chart__fill" :style="{ width: `${ratioOf(index)}%` }" /></span>
          </div>
          <strong class="chat-chart__bar-value">{{ valueOf(item) }}<small class="chat-chart__unit">{{ text(block.meta.unit) }}</small></strong>
        </div>
        <div v-if="block.state === 'GENERATING'" class="chat-chart__bar-row chat-chart__generating-bar" aria-hidden="true">
          <div class="item-shimmer-line" style="height: 18px; border-radius: 6px;" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.chat-content-block {
  max-width: 720px;
  margin: 16px 0 20px;
  padding: 18px 20px 16px;
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 22%, var(--border-default, #e5e0d8));
  border-radius: 14px;
  background-color: var(--color-bg-card, #ffffff);
  color: var(--text-primary);
  box-shadow: 0 2px 10px color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 5%, transparent), 0 1px 3px rgba(0, 0, 0, 0.02);
  transition: border-color 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.chat-content-block__state-pill {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-sage-primary, #6b7a52);
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 12%, transparent);
  padding: 1px 7px;
  border-radius: 999px;
  animation: state-pulse 1.6s ease-in-out infinite;
}

@keyframes state-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

.title-skeleton {
  width: 140px;
  height: 16px;
  margin-top: 4px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 15%, transparent);
  overflow: hidden;
  position: relative;
}

.title-shimmer-bar {
  display: block;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
  animation: skeleton-sweep 1.5s infinite;
}

/* 渐进式节点挂载动画 (Incremental Node Mounting) */
@keyframes node-mount {
  0% {
    opacity: 0;
    transform: scale(0.95) translateY(8px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.chat-steps li,
.chat-compare__dimension,
.chat-roadmap li,
.chat-chart__bar-row,
.chat-chart__legend-item {
  animation: node-mount 0.35s cubic-bezier(0.2, 0.9, 0.3, 1) both;
}

@media (prefers-reduced-motion: reduce) {
  .chat-steps li,
  .chat-compare__dimension,
  .chat-roadmap li,
  .chat-chart__bar-row,
  .chat-chart__legend-item {
    animation: none;
  }
}

.chat-content-block:hover {
  border-color: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 42%, var(--border-default, #e5e0d8));
  box-shadow: 0 6px 22px color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 12%, transparent), 0 2px 6px rgba(0, 0, 0, 0.03);
}

/* Skeleton & Partial State */
.chat-content-block__skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 6px 0;
}

.skeleton-pulse {
  border-radius: 10px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--color-bg-primary, #f5f1eb) 85%, var(--border-subtle, #e0deda)) 0%,
    color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 16%, var(--color-bg-card, #ffffff)) 50%,
    color-mix(in srgb, var(--color-bg-primary, #f5f1eb) 85%, var(--border-subtle, #e0deda)) 100%
  );
  background-size: 200% 100%;
  animation: skeleton-sweep 1.8s ease-in-out infinite;
}

.skeleton-pulse--card {
  height: 52px;
}

@keyframes skeleton-sweep {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* 动态推进生成占位节点与卡片 (消弭网络批次吐字间的卡顿空白) */
.chat-roadmap__generating-item,
.chat-steps__generating-item {
  position: relative;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 14px;
  min-height: 44px;
  padding: 0 0 10px;
}

.chat-roadmap__node--generating,
.chat-steps__node--generating {
  z-index: 1;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1.5px dashed color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 45%, transparent);
  background: transparent;
}

.node-pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-zen-sage, #8b9a6e);
  animation: node-pulse 1.4s ease-in-out infinite;
}

@keyframes node-pulse {
  0%, 100% {
    transform: scale(0.8);
    opacity: 0.4;
  }
  50% {
    transform: scale(1.3);
    opacity: 1;
  }
}

.chat-roadmap__card--generating,
.chat-steps__card--generating {
  min-width: 0;
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 11px;
  border: 1px dashed color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 30%, var(--border-subtle, #e0deda));
  background: transparent;
}

.item-shimmer-line {
  width: 100%;
  height: 14px;
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--color-bg-primary, #f5f1eb) 85%, var(--border-subtle, #e0deda)) 0%,
    color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 22%, var(--color-bg-card, #ffffff)) 50%,
    color-mix(in srgb, var(--color-bg-primary, #f5f1eb) 85%, var(--border-subtle, #e0deda)) 100%
  );
  background-size: 200% 100%;
  animation: skeleton-sweep 1.8s ease-in-out infinite;
}

.chat-compare__generating-dim {
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px dashed color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 30%, var(--border-subtle, #e0deda));
  background: transparent;
}

.item-shimmer-card {
  height: 38px;
  border-radius: 8px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--color-bg-primary, #f5f1eb) 85%, var(--border-subtle, #e0deda)) 0%,
    color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 20%, var(--color-bg-card, #ffffff)) 50%,
    color-mix(in srgb, var(--color-bg-primary, #f5f1eb) 85%, var(--border-subtle, #e0deda)) 100%
  );
  background-size: 200% 100%;
  animation: skeleton-sweep 1.8s ease-in-out infinite;
}

.chat-chart__generating-bar {
  padding: 4px 0;
}

.chat-content-block__empty-invalid {
  padding: 12px 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-warning, #d97706) 8%, var(--color-bg-card, #ffffff));
  border: 1px solid color-mix(in srgb, var(--color-warning, #d97706) 25%, transparent);
  color: var(--text-muted);
  font-size: 12px;
}

/* Header & Hierarchy */
.chat-content-block__header {
  margin-bottom: 14px;
}

.chat-content-block__heading-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.chat-content-block__heading {
  min-width: 0;
  flex: 1;
}

.chat-content-block__badge-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.chat-content-block__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.5;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.chat-content-block__title :deep(p) {
  margin: 0;
}

.chat-content-block__description {
  margin-top: 6px;
  padding-left: 0;
  color: var(--text-muted);
  font-size: 12.5px;
  line-height: 1.6;
}

.chat-content-block__description :deep(p) {
  margin: 0;
}

/* Steps */
.chat-steps {
  margin: 0;
  padding: 0;
  list-style: none;
}

.chat-steps li {
  position: relative;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 14px;
  min-height: 56px;
  padding: 0 0 14px;
}

.chat-steps li:not(:last-child)::before {
  position: absolute;
  top: 28px;
  bottom: 0;
  left: 13px;
  width: 2px;
  border-radius: 1px;
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 22%, var(--border-subtle, #e0deda));
  content: '';
}

.chat-steps__node {
  z-index: 1;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 12%, var(--color-bg-card, #ffffff));
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 28%, transparent);
  color: var(--color-sage-dark, #5c6b44);
  font-size: 12px;
  font-weight: 750;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.chat-steps__card {
  min-width: 0;
  padding: 12px 15px;
  border-radius: 11px;
  background: color-mix(in srgb, var(--color-bg-primary, #f5f1eb) 40%, var(--color-bg-card, #ffffff));
  border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.chat-steps__card:hover {
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 7%, var(--color-bg-card, #ffffff));
  border-color: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 34%, var(--border-subtle, #e0deda));
}

.chat-steps__title-row,
.chat-compare__dim-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.chat-steps__title {
  display: block;
  font-size: 13.5px;
  font-weight: 650;
  line-height: 1.5;
  color: var(--text-primary);
}

.chat-steps__title :deep(p) {
  margin: 0;
}

.chat-steps__detail {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.chat-steps__detail :deep(p) {
  margin: 0;
}

/* Compare */
.chat-compare {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-compare__dimension {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 14px 16px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-bg-primary, #f5f1eb) 40%, var(--color-bg-card, #ffffff));
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 18%, var(--border-subtle, #e0deda));
  box-shadow: 0 2px 8px -1px rgba(0, 0, 0, 0.03);
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.chat-compare__dimension:hover {
  border-color: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 38%, var(--border-subtle, #e0deda));
  transform: translateY(-1.5px);
  box-shadow: 0 4px 14px -2px color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 12%, rgba(0, 0, 0, 0.04));
}

.chat-compare__dim-title {
  margin: 0;
  font-size: 13.5px;
  font-weight: 700;
  line-height: 1.5;
  color: var(--color-sage-dark, #5c6b44);
}

.chat-compare__dim-title :deep(p) {
  margin: 0;
}

.chat-compare__entries {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-compare__entry-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 9px;
  background: var(--color-bg-card, #ffffff);
  border: 1px solid color-mix(in srgb, var(--border-subtle, #e0deda) 70%, transparent);
  transition: background 0.15s ease;
}

.chat-compare__entry-row:hover {
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 6%, var(--color-bg-card, #ffffff));
}

.chat-compare__entry-badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 15%, var(--color-bg-card, #ffffff));
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 25%, transparent);
  color: var(--color-sage-dark, #5c6b44);
  font-size: 11.5px;
  font-weight: 700;
  line-height: 1.4;
}

.chat-compare__entry-text {
  flex: 1;
  min-width: 0;
  color: var(--text-primary);
  font-size: 12.5px;
  line-height: 1.55;
}

.chat-compare__entry-text :deep(p) {
  margin: 0;
}

/* Roadmap */
.chat-roadmap {
  margin: 0;
  padding: 0;
  list-style: none;
}

.chat-roadmap li {
  position: relative;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 14px;
  min-height: 56px;
  padding: 0 0 14px;
}

.chat-roadmap li:not(:last-child)::before {
  position: absolute;
  top: 28px;
  bottom: 0;
  left: 13px;
  width: 2px;
  border-radius: 1px;
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 22%, var(--border-subtle, #e0deda));
  content: '';
}

.chat-roadmap__node {
  z-index: 1;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 12%, var(--color-bg-card, #ffffff));
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 28%, transparent);
  color: var(--color-sage-dark, #5c6b44);
  font-size: 12px;
  font-weight: 750;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.chat-roadmap__card {
  min-width: 0;
  padding: 12px 15px;
  border-radius: 11px;
  background: color-mix(in srgb, var(--color-bg-primary, #f5f1eb) 40%, var(--color-bg-card, #ffffff));
  border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.chat-roadmap li.chat-roadmap__item--current .chat-roadmap__node {
  border-color: var(--color-zen-sage, #8b9a6e);
  background: var(--color-zen-sage, #8b9a6e);
  color: #ffffff;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 22%, transparent);
}

.chat-roadmap li.chat-roadmap__item--current .chat-roadmap__card {
  border-color: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 48%, var(--border-default, #e5e0d8));
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 9%, var(--color-bg-card, #ffffff));
  box-shadow: 0 3px 12px color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 12%, transparent);
}

.chat-roadmap__title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.chat-roadmap__title {
  font-size: 13.5px;
  font-weight: 650;
  line-height: 1.5;
  color: var(--text-primary);
}

.chat-roadmap__title :deep(p) {
  margin: 0;
}

.chat-roadmap__tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-bg-primary, #f5f1eb);
  color: var(--text-muted);
  font-size: 10.5px;
  font-weight: 550;
  border: 1px solid var(--border-subtle);
}

.chat-roadmap__current {
  padding: 2px 8.5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 20%, var(--color-bg-card, #ffffff));
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 35%, transparent);
  color: var(--color-sage-dark, #5c6b44);
  font-size: 10.5px;
  font-weight: 750;
}

.chat-roadmap__detail {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.chat-roadmap__detail :deep(p) {
  margin: 0;
}

/* Chart */
.chat-chart__proportion-row {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  align-items: center;
  gap: 24px;
}

.chat-chart__ring-wrap {
  display: grid;
  place-items: center;
}

.chat-chart__ring {
  display: grid;
  place-items: center;
  width: 122px;
  aspect-ratio: 1;
  border-radius: 50%;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.04);
}

.chat-chart__ring-hole {
  width: 66%;
  aspect-ratio: 1;
  border: 1px solid var(--border-subtle);
  border-radius: 50%;
  background: var(--color-bg-card, #ffffff);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.04);
}

.chat-chart__legend {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.chat-chart__legend-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 12px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--color-bg-primary, #f5f1eb) 35%, var(--color-bg-card, #ffffff));
  border: 1px solid var(--border-subtle);
  font-size: 12px;
  transition: background 0.16s ease;
}

.chat-chart__legend-item:hover {
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 8%, var(--color-bg-card, #ffffff));
}

.chat-chart__legend-label {
  flex: 1;
  color: var(--text-primary);
  font-weight: 550;
}

.chat-chart__legend-value {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
}

.chat-chart__unit {
  margin-left: 2px;
  color: var(--text-muted);
  font-size: 10.5px;
  font-weight: 400;
}

.chat-chart__swatch {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-zen-sage, #8b9a6e);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 20%, transparent);
}

.chat-chart__swatch--muted {
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 40%, var(--border-default, #dcd8d0));
  box-shadow: none;
}

.chat-chart__bars {
  display: grid;
  gap: 10px;
}

.chat-chart__bar-row {
  display: grid;
  grid-template-columns: minmax(75px, 120px) minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 6px 10px;
  border-radius: 9px;
  transition: background 0.16s ease;
}

.chat-chart__bar-row:hover {
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 6%, transparent);
}

.chat-chart__bar-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 550;
  color: var(--text-primary);
}

.chat-chart__track-wrap {
  min-width: 0;
}

.chat-chart__track {
  display: block;
  height: 10px;
  overflow: hidden;
  border-radius: 99px;
  background: color-mix(in srgb, var(--color-bg-primary, #f5f1eb) 80%, var(--color-bg-card, #ffffff));
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);
}

.chat-chart__fill {
  display: block;
  height: 100%;
  min-width: 0;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--color-zen-sage, #8b9a6e), color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 82%, var(--color-sage-dark, #5c6b44)));
  box-shadow: 0 1px 4px color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 35%, transparent);
  transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.chat-chart__bar-value {
  min-width: max-content;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
}

@media (max-width: 620px) {
  .chat-content-block {
    padding: 16px 15px;
  }
  .chat-content-block__description {
    padding-left: 0;
  }
  .chat-compare__entry-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  .chat-chart__proportion-row {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .chat-chart__bar-row {
    grid-template-columns: minmax(56px, 90px) minmax(0, 1fr) auto;
    gap: 8px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-content-block,
  .chat-steps__card,
  .chat-compare__dimension,
  .chat-roadmap__card,
  .chat-chart__fill {
    transition: none;
  }
}
</style>
