<script setup lang="ts">
import { computed } from 'vue'
import { getChatChartRatios } from '@/services/chatContentProjection'
import { renderMarkdown } from '@/utils/markdown'
import type { ChatBlockPart } from '@/types/chatContent'

const props = defineProps<{ block: ChatBlockPart }>()

const title = computed(() => text(props.block.meta.title))
const description = computed(() => text(props.block.meta.description))
const chartType = computed(() => props.block.meta.chartType)
const chartRatios = computed(() => getChatChartRatios(props.block))
const chartMaximum = computed(() => props.block.items.reduce((maximum, item) => Math.max(maximum, valueOf(item)), 0))
const proportionSegments = computed(() => {
  let cursor = 0
  return props.block.items.map((_item, index) => {
    const start = cursor
    cursor += (chartRatios.value[index] ?? 0) * 100
    return `${index % 2 === 0 ? 'var(--color-zen-sage)' : 'var(--color-zen-hairline)'} ${start}% ${cursor}%`
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
    ? valueOf(props.block.items[index] ?? {}) / chartMaximum.value * 100
    : 0
}

function currentOf(item: Readonly<Record<string, unknown>>): boolean {
  return item.current === true
}

function tagOf(item: Readonly<Record<string, unknown>>): string {
  return text(item.tag)
}
</script>

<template>
  <section class="chat-content-block" :class="`chat-content-block--${block.component}`">
    <header v-if="title || description" class="chat-content-block__header">
      <h3 v-if="title" v-html="renderMarkdown(title)" />
      <div v-if="description" class="chat-content-block__description" v-html="renderMarkdown(description)" />
    </header>

    <ol v-if="block.component === 'steps'" class="chat-steps">
      <li v-for="(item, index) in block.items" :key="`${block.componentId}-step-${index}`">
        <span class="chat-steps__node" aria-hidden="true">{{ index + 1 }}</span>
        <div class="chat-steps__copy">
          <strong v-html="renderMarkdown(titleOf(item))" />
          <div v-if="detailOf(item)" v-html="renderMarkdown(detailOf(item))" />
        </div>
      </li>
    </ol>

    <div v-else-if="block.component === 'compare'" class="chat-compare">
      <article v-for="(item, index) in block.items" :key="`${block.componentId}-compare-${index}`" class="chat-compare__item">
        <span class="chat-compare__side" aria-hidden="true">{{ index % 2 === 0 ? 'A' : 'B' }}</span>
        <div>
          <h4 v-html="renderMarkdown(titleOf(item))" />
          <div v-if="detailOf(item)" class="chat-compare__detail" v-html="renderMarkdown(detailOf(item))" />
        </div>
      </article>
    </div>

    <ol v-else-if="block.component === 'roadmap'" class="chat-roadmap">
      <li
        v-for="(item, index) in block.items"
        :key="`${block.componentId}-route-${index}`"
        :class="{ 'chat-roadmap__item--current': currentOf(item) }"
        :aria-current="currentOf(item) ? 'step' : undefined"
      >
        <span class="chat-roadmap__node" aria-hidden="true">{{ index + 1 }}</span>
        <div class="chat-roadmap__copy">
          <div class="chat-roadmap__title-row">
            <strong v-html="renderMarkdown(titleOf(item))" />
            <span v-if="tagOf(item)" class="chat-roadmap__tag">{{ tagOf(item) }}</span>
            <span v-if="currentOf(item)" class="chat-roadmap__current">目前位置</span>
          </div>
          <div v-if="detailOf(item)" class="chat-roadmap__detail" v-html="renderMarkdown(detailOf(item))" />
        </div>
      </li>
    </ol>

    <div v-else-if="block.component === 'chart'" class="chat-chart">
      <div v-if="chartType === 'proportion'" class="chat-chart__proportion-row">
        <div
          class="chat-chart__ring"
          :style="proportionStyle"
          role="img"
          :aria-label="`${title || '比例图'}：${block.items.map((item) => `${labelOf(item)} ${valueOf(item)}${text(block.meta.unit)}`).join('，')}`"
        ><span /></div>
        <ul class="chat-chart__legend">
          <li v-for="(item, index) in block.items" :key="`${block.componentId}-slice-${index}`">
            <span class="chat-chart__swatch" :class="{ 'chat-chart__swatch--muted': index % 2 === 1 }" />
            <span>{{ labelOf(item) }}</span>
            <strong>{{ valueOf(item) }}{{ text(block.meta.unit) }}</strong>
          </li>
        </ul>
      </div>
      <div v-else class="chat-chart__bars" role="list">
        <div v-for="(item, index) in block.items" :key="`${block.componentId}-bar-${index}`" class="chat-chart__bar-row" role="listitem">
          <span class="chat-chart__bar-label">{{ labelOf(item) }}</span>
          <span class="chat-chart__track"><span :style="{ width: `${ratioOf(index)}%` }" /></span>
          <strong>{{ valueOf(item) }}{{ text(block.meta.unit) }}</strong>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.chat-content-block{max-width:760px;margin:13px 0 18px;padding:18px 20px;border:1px solid var(--border-subtle);border-radius:13px;background:var(--color-bg-card);color:var(--text-primary)}.chat-content-block__header{margin-bottom:13px}.chat-content-block__header h3{margin:0;font-size:15px;font-weight:650;line-height:1.45}.chat-content-block__description{margin-top:5px;color:var(--text-muted);font-size:12px;line-height:1.6}.chat-content-block__description :deep(p){margin:0}.chat-steps,.chat-roadmap{margin:0;padding:0;list-style:none}.chat-steps li,.chat-roadmap li{position:relative;display:grid;grid-template-columns:29px minmax(0,1fr);gap:12px;min-height:54px;padding:0 0 14px}.chat-steps li:not(:last-child)::before,.chat-roadmap li:not(:last-child)::before{position:absolute;top:25px;bottom:-1px;left:13px;width:1px;background:var(--color-zen-hairline);content:''}.chat-steps__node,.chat-roadmap__node{z-index:1;display:grid;place-items:center;width:27px;height:27px;border:1px solid var(--color-zen-hairline);border-radius:50%;background:var(--color-bg-card);color:var(--text-muted);font-size:11px;font-weight:650}.chat-steps__copy,.chat-roadmap__copy{min-width:0;padding-top:2px}.chat-steps__copy strong,.chat-roadmap__copy strong{font-size:13px;font-weight:620;line-height:1.5}.chat-steps__copy>div,.chat-roadmap__detail{margin-top:3px;color:var(--text-muted);font-size:12px;line-height:1.6}.chat-steps__copy :deep(p),.chat-roadmap__copy :deep(p){margin:0}.chat-roadmap li.chat-roadmap__item--current .chat-roadmap__node{border-color:var(--color-zen-sage);background:var(--color-zen-sage);color:#fff}.chat-roadmap__item--current .chat-roadmap__copy{padding:8px 10px;margin:-6px 0 0 -10px;border-radius:9px;background:color-mix(in srgb,var(--color-zen-sage) 8%,var(--color-bg-card))}.chat-roadmap__title-row{display:flex;align-items:center;flex-wrap:wrap;gap:7px}.chat-roadmap__tag,.chat-roadmap__current{padding:2px 7px;border-radius:999px;background:var(--color-bg-primary);color:var(--text-muted);font-size:10px}.chat-roadmap__current{background:color-mix(in srgb,var(--color-zen-sage) 14%,var(--color-bg-card));color:var(--color-sage-dark);font-weight:650}.chat-compare{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.chat-compare__item{display:grid;grid-template-columns:22px minmax(0,1fr);align-items:start;gap:9px;min-width:0;padding:13px;border:1px solid var(--border-subtle);border-radius:10px;background:color-mix(in srgb,var(--color-bg-primary) 45%,var(--color-bg-card))}.chat-compare__side{display:grid;place-items:center;width:21px;height:21px;border-radius:7px;background:color-mix(in srgb,var(--color-zen-sage) 12%,var(--color-bg-card));color:var(--color-sage-dark);font-size:10px;font-weight:700}.chat-compare__item h4{margin:1px 0 5px;font-size:12px;font-weight:650;line-height:1.5}.chat-compare__detail{color:var(--text-muted);font-size:11px;line-height:1.6}.chat-compare__item :deep(p){margin:0}.chat-chart__proportion-row{display:grid;grid-template-columns:136px minmax(0,1fr);align-items:center;gap:21px}.chat-chart__ring{display:grid;place-items:center;width:126px;aspect-ratio:1;border-radius:50%}.chat-chart__ring>span{width:64%;aspect-ratio:1;border:1px solid var(--border-subtle);border-radius:50%;background:var(--color-bg-card)}.chat-chart__legend{display:grid;gap:9px;margin:0;padding:0;list-style:none}.chat-chart__legend li{display:grid;grid-template-columns:9px minmax(0,1fr) auto;align-items:center;gap:8px;font-size:12px}.chat-chart__legend strong{font-size:11px;font-weight:650}.chat-chart__swatch{width:8px;height:8px;border-radius:50%;background:var(--color-zen-sage)}.chat-chart__swatch--muted{background:var(--color-zen-hairline)}.chat-chart__bars{display:grid;gap:11px}.chat-chart__bar-row{display:grid;grid-template-columns:minmax(72px,120px) minmax(0,1fr) auto;align-items:center;gap:10px}.chat-chart__bar-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.chat-chart__bar-row strong{min-width:max-content;color:var(--text-secondary);font-size:11px;font-weight:600}.chat-chart__track{height:8px;overflow:hidden;border-radius:99px;background:var(--color-bg-primary)}.chat-chart__track>span{display:block;height:100%;min-width:0;border-radius:inherit;background:var(--color-zen-sage);transition:width .25s ease}@media(max-width:620px){.chat-content-block{padding:15px}.chat-compare{grid-template-columns:1fr}.chat-chart__proportion-row{grid-template-columns:96px minmax(0,1fr);gap:13px}.chat-chart__ring{width:90px}.chat-chart__legend li{gap:6px}.chat-chart__bar-row{grid-template-columns:minmax(54px,90px) minmax(0,1fr) auto;gap:7px}}@media(prefers-reduced-motion:reduce){.chat-chart__track>span{transition:none}}
</style>
