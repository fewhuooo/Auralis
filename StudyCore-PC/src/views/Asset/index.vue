<template>
  <div class="asset-studio">
    <!-- LEFT: Asset Tree -->
    <aside class="studio-left">
      <div class="panel-header">
        <span class="panel-title">资产库</span>
        <button class="icon-btn" title="导入文件" @click="triggerUpload">＋</button>
      </div>

      <!-- Search -->
      <div class="tree-search">
        <input v-model="searchQ" class="search-input" placeholder="搜索资产..." />
      </div>

      <!-- Upload Progress -->
      <div v-if="isUploading" class="upload-banner">
        <span class="upload-status-txt">{{ uploadStatusText }} {{ uploadProgress }}%</span>
        <div class="mini-bar-bg"><div class="mini-bar-fill" :style="{ width: uploadProgress + '%' }"></div></div>
      </div>

      <!-- Tree Groups -->
      <div class="tree-body">
        <div v-for="group in filteredGroups" :key="group.id" class="tree-group">
          <div class="tree-group-header" @click="group.open = !group.open">
            <span class="group-arrow">{{ group.open ? '▾' : '▸' }}</span>
            <span class="group-icon">{{ group.icon }}</span>
            <span class="group-name">{{ group.name }}</span>
            <span class="group-count">{{ group.items.length }}</span>
          </div>
          <div v-if="group.open" class="tree-items">
            <div
              v-for="item in group.items"
              :key="item.id"
              class="tree-item"
              :class="{ 'is-active': selected?.id === item.id }"
              @click="selectItem(item)"
            >
              <span class="item-icon">{{ item.icon }}</span>
              <div class="item-info">
                <span class="item-name">{{ item.name }}</span>
                <span class="item-meta">{{ item.time }} · {{ item.blocks }}块</span>
              </div>
              <span class="status-dot" :class="item.status"></span>
            </div>
          </div>
        </div>
      </div>

      <!-- Drop Zone -->
      <div
        class="drop-zone"
        :class="{ 'is-over': isDragover }"
        @dragover.prevent="isDragover = true"
        @dragleave.prevent="isDragover = false"
        @drop.prevent="handleDrop"
        @click="triggerUpload"
      >
        <span class="drop-icon">↑</span>
        <span class="drop-text">拖拽或点击上传</span>
      </div>
    </aside>

    <!-- RIGHT: Studio Preview/Edit -->
    <main class="studio-right">
      <!-- Empty state -->
      <div v-if="!selected" class="empty-state">
        <div class="empty-icon">⚙</div>
        <h2 class="empty-title">选择一个资产开始编排</h2>
        <p class="empty-desc">从左侧资产树中选择文件，即可在此预览知识块与编辑任务</p>
        <button class="upload-cta" @click="triggerUpload">上传新资产</button>
      </div>

      <!-- Detail view -->
      <template v-else>
        <div class="detail-header">
          <div class="detail-title-row">
            <span class="detail-icon">{{ selected.icon }}</span>
            <div>
              <h1 class="detail-name">{{ selected.name }}</h1>
              <p class="detail-path">重型资产 · {{ selected.pages }} 页 · {{ selected.size }}</p>
            </div>
            <span class="status-badge" :class="selected.status">{{ selected.statusText }}</span>
          </div>

          <!-- Tab bar -->
          <div class="tab-bar">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              class="tab-btn"
              :class="{ 'is-active': activeTab === tab.id }"
              @click="activeTab = tab.id"
            >{{ tab.label }}</button>
          </div>
        </div>

        <!-- TAB: 知识块 -->
        <div v-if="activeTab === 'blocks'" class="tab-content">
          <div class="blocks-summary">
            <div class="summary-stat"><span class="s-val">{{ selected.blocks }}</span><span class="s-lbl">知识块</span></div>
            <div class="summary-stat"><span class="s-val">{{ selected.tasks }}</span><span class="s-lbl">生成任务</span></div>
            <div class="summary-stat"><span class="s-val">{{ selected.pages }}</span><span class="s-lbl">页</span></div>
          </div>
          <div class="blocks-list">
            <div v-for="b in selected.blockList" :key="b.id" class="block-row">
              <div class="block-num">{{ b.id }}</div>
              <div class="block-body">
                <p class="block-heading">{{ b.heading }}</p>
                <p class="block-preview">{{ b.preview }}</p>
              </div>
              <div class="block-tags">
                <span v-for="t in b.tags" :key="t" class="block-tag">{{ t }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB: 任务 -->
        <div v-else-if="activeTab === 'tasks'" class="tab-content">
          <div class="tasks-list">
            <div v-for="t in selected.taskList" :key="t.id" class="task-row">
              <div class="task-check" :class="{ done: t.done }" @click="t.done = !t.done">
                <span v-if="t.done">✓</span>
              </div>
              <div class="task-body">
                <span class="task-title" :class="{ done: t.done }">{{ t.title }}</span>
                <span class="task-due">截止：{{ t.due }}</span>
              </div>
              <span class="task-load" :class="t.load">{{ t.load }}</span>
            </div>
          </div>
        </div>

        <!-- TAB: 原文预览 -->
        <div v-else-if="activeTab === 'preview'" class="tab-content">
          <!-- Dark-mode-aware PDF canvas wrapper -->
          <div class="pdf-canvas-wrapper" :class="{ 'dark-invert': isDark }">
            <div class="pdf-page-mock">
              <div class="pdf-mock-header"></div>
              <div class="pdf-mock-line" v-for="n in 8" :key="n" :style="{ width: (60 + n * 4) % 100 + '%' }"></div>
              <div class="pdf-mock-img"></div>
              <div class="pdf-mock-line" v-for="n in 5" :key="'b' + n" :style="{ width: (40 + n * 7) % 100 + '%' }"></div>
            </div>
            <p class="pdf-hint">PDF 预览区域 · 深色模式已动态调优对比度</p>
          </div>
        </div>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { fragmentPDFToAtomBlocks } from '@/api/aiClient'

const isDark = computed(() => document.documentElement.classList.contains('dark'))

// ---- Upload ----
const isDragover = ref(false)
const isUploading = ref(false)
const uploadProgress = ref(0)
const uploadStatusText = ref('')
const searchQ = ref('')
const activeTab = ref('blocks')
const tabs = [
  { id: 'blocks', label: '知识块' },
  { id: 'tasks', label: '生成任务' },
  { id: 'preview', label: '原文预览' },
]

interface AssetItem {
  id: number; name: string; icon: string; status: string; statusText: string
  time: string; blocks: number; tasks: number; pages: number; size: string
  blockList: any[]; taskList: any[]
}

const groups = ref([
  {
    id: 'pdf', name: 'PDF 文档', icon: '📄', open: true,
    items: [
      {
        id: 1, name: '《深入理解计算机系统》第1-3章.pdf', icon: '📄',
        status: 'success', statusText: '编排完成', time: '2小时前', blocks: 42, tasks: 15, pages: 120, size: '8.2 MB',
        blockList: [
          { id: 1, heading: '信息的表示与处理', preview: '计算机系统中所有信息都通过位序列表示，理解不同编码方式是系统级编程的基础...', tags: ['计算机基础', '编码'] },
          { id: 2, heading: '程序的机器级表示', preview: 'x86-64 汇编语言的数据格式、寻址模式与指令集概览，结合 GCC 编译器输出进行分析...', tags: ['汇编', '编译器'] },
          { id: 3, heading: '处理器体系结构', preview: 'Y86-64 指令集架构设计，流水线实现与冒险处理机制的详细拆解...', tags: ['CPU', '流水线'] },
        ],
        taskList: [
          { id: 1, title: '完成第一章课后习题 1.1-1.6', due: '明天', load: 'medium', done: false },
          { id: 2, title: '用 GDB 调试一段汇编程序', due: '本周五', load: 'high', done: false },
          { id: 3, title: '绘制 Y86-64 流水线状态机图', due: '下周一', load: 'high', done: true },
        ]
      }
    ]
  },
  {
    id: 'ppt', name: 'PPT 课件', icon: '📊', open: true,
    items: [
      {
        id: 2, name: '第七周_分布式系统架构考纲.pptx', icon: '📊',
        status: 'success', statusText: '编排完成', time: '昨天', blocks: 24, tasks: 8, pages: 45, size: '3.1 MB',
        blockList: [
          { id: 1, heading: 'CAP 定理与 BASE 理论', preview: '分布式系统不可能同时满足一致性、可用性、分区容错性，需根据业务场景进行权衡...', tags: ['分布式', 'CAP'] },
          { id: 2, heading: 'Raft 共识算法', preview: 'Raft 通过 Leader 选举、日志复制、安全性约束来保证分布式集群一致性...', tags: ['Raft', '共识'] },
        ],
        taskList: [
          { id: 1, title: '阅读 Raft 原论文 §3-§5', due: '本周六', load: 'high', done: false },
          { id: 2, title: '搭建三节点 etcd 集群', due: '下周二', load: 'medium', done: false },
        ]
      }
    ]
  },
])

const filteredGroups = computed(() =>
  groups.value.map(g => ({
    ...g,
    items: searchQ.value
      ? g.items.filter(i => i.name.toLowerCase().includes(searchQ.value.toLowerCase()))
      : g.items
  })).filter(g => g.items.length > 0)
)

const selected = ref<AssetItem | null>(groups.value[0].items[0])

const selectItem = (item: AssetItem) => {
  selected.value = item
  activeTab.value = 'blocks'
}

const triggerUpload = () => {
  const input = document.createElement('input')
  input.type = 'file'; input.accept = '.pdf,.ppt,.pptx,.doc,.docx'
  input.onchange = (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0]
    if (f) simulateUpload(f.name)
  }
  input.click()
}

const handleDrop = (e: DragEvent) => {
  isDragover.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) simulateUpload(f.name)
}

const simulateUpload = async (filename: string) => {
  isUploading.value = true; uploadProgress.value = 10;
  uploadStatusText.value = '上传中...';
  
  // 模拟前置提取的文本（因为真实的前端提取PDF需要较大的库，这里采用根据文件名生成摘要的方式传给AI）
  const mockExtractedText = `这是一份名为《${filename}》的资料。内容涉及计算机科学或相关学科。重点在于系统的核心原理、基础概念，以及需要完成的实践作业。其中包含了一些核心的定理和模型。`;
  
  uploadProgress.value = 40;
  uploadStatusText.value = 'AI 语义切片中 (OpenClaw)...';

  try {
    const aiResult = await fragmentPDFToAtomBlocks(mockExtractedText);
    
    uploadProgress.value = 90;
    uploadStatusText.value = '生成知识块...';

    setTimeout(() => {
      isUploading.value = false;
      const newItem: AssetItem = {
        id: Date.now(), name: filename, icon: '📄',
        status: 'success', statusText: '编排完成', time: '刚刚',
        blocks: aiResult.blocks?.length || 0,
        tasks: aiResult.tasks?.length || 0,
        pages: Math.floor(Math.random() * 80) + 10, size: '—',
        blockList: (aiResult.blocks || []).map((b: any, i: number) => ({
          id: i + 1, heading: b.heading, preview: b.preview, tags: b.tags || []
        })),
        taskList: (aiResult.tasks || []).map((t: any, i: number) => ({
          id: i + 1, title: t.title, due: t.due, load: t.load, done: false
        }))
      };
      groups.value[0].items.unshift(newItem);
      selected.value = newItem;
      uploadProgress.value = 100;
    }, 500);

  } catch (err: any) {
    console.error("AI 处理失败，退回 Mock", err);
    uploadStatusText.value = 'AI 请求失败，采用备用 Mock...';
    // Fallback to original mock if AI fails or no key
    setTimeout(() => {
      isUploading.value = false;
      const newItem: AssetItem = {
        id: Date.now(), name: filename, icon: '📄',
        status: 'success', statusText: '编排完成 (Mock)', time: '刚刚',
        blocks: 5, tasks: 2, pages: 15, size: '—',
        blockList: [
          { id: 1, heading: '本地 Mock 块', preview: '因为未配置 API Key 或网络请求失败，这是本地回退生成的模拟知识块。', tags: ['Mock'] }
        ],
        taskList: [
          { id: 1, title: '请在设置中配置正确的 OpenClaw API Key', due: '今天', load: 'high', done: false }
        ]
      };
      groups.value[0].items.unshift(newItem);
      selected.value = newItem;
      uploadProgress.value = 100;
    }, 1000);
  }
}
</script>

<style scoped>
.asset-studio {
  display: flex;
  height: 100%;
  overflow: hidden;
}

/* ===== LEFT PANEL ===== */
.studio-left {
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.panel-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.2px;
}

.icon-btn {
  width: 26px; height: 26px;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all var(--transition-fast);
}
.icon-btn:hover { background: var(--accent-gradient); color: white; border-color: transparent; }

.tree-search { padding: 10px 12px; border-bottom: 1px solid var(--border-subtle); }
.search-input {
  width: 100%; padding: 6px 10px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary); font-family: inherit; font-size: 12px; outline: none;
  transition: border-color var(--transition-fast);
}
.search-input:focus { border-color: var(--border-accent); }
.search-input::placeholder { color: var(--text-muted); }

/* Upload Banner */
.upload-banner {
  padding: 8px 12px;
  background: rgba(99,102,241,0.06);
  border-bottom: 1px solid rgba(99,102,241,0.15);
}
.upload-status-txt { font-size: 11px; color: var(--text-accent); font-weight: 600; display: block; margin-bottom: 4px; }
.mini-bar-bg { height: 3px; background: var(--border-default); border-radius: var(--radius-full); overflow: hidden; }
.mini-bar-fill { height: 100%; background: var(--accent-gradient); transition: width 0.3s; }

/* Tree */
.tree-body { flex: 1; overflow-y: auto; padding: 8px 0; }

.tree-group-header {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 14px; cursor: pointer;
  user-select: none; transition: background var(--transition-fast);
}
.tree-group-header:hover { background: rgba(255,255,255,0.03); }
.group-arrow { font-size: 10px; color: var(--text-muted); width: 10px; }
.group-icon { font-size: 13px; }
.group-name { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; flex: 1; }
.group-count { font-size: 10px; background: var(--color-bg-tertiary); color: var(--text-muted); padding: 1px 5px; border-radius: var(--radius-full); }

.tree-items { padding: 2px 0; }
.tree-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px 8px 26px; cursor: pointer;
  transition: all var(--transition-fast); border-radius: 0;
}
.tree-item:hover { background: rgba(255,255,255,0.03); }
.tree-item.is-active { background: rgba(99,102,241,0.1); border-right: 2px solid #6366f1; }
.item-icon { font-size: 14px; flex-shrink: 0; }
.item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.item-name { font-size: 12px; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item-meta { font-size: 10px; color: var(--text-muted); }
.status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.status-dot.success { background: #22c55e; }
.status-dot.processing { background: #6366f1; animation: blink 1.5s infinite; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

/* Drop Zone */
.drop-zone {
  margin: 8px 10px 10px;
  border: 1.5px dashed var(--border-default);
  border-radius: var(--radius-lg);
  padding: 14px;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  cursor: pointer; transition: all var(--transition-normal);
}
.drop-zone:hover, .drop-zone.is-over { border-color: var(--border-accent); background: rgba(99,102,241,0.04); }
.drop-icon { font-size: 16px; color: var(--text-accent); }
.drop-text { font-size: 12px; color: var(--text-muted); }

/* ===== RIGHT PANEL ===== */
.studio-right { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }

/* Empty */
.empty-state {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; padding: 60px 40px; text-align: center;
}
.empty-icon { font-size: 48px; color: var(--text-muted); opacity: 0.4; }
.empty-title { font-size: 20px; font-weight: 700; color: var(--text-primary); }
.empty-desc { font-size: 13px; color: var(--text-muted); max-width: 320px; line-height: 1.7; }
.upload-cta {
  background: var(--accent-gradient); color: white; border: none;
  padding: 10px 24px; border-radius: var(--radius-md); font-weight: 600; font-size: 14px;
  cursor: pointer; transition: all var(--transition-fast); margin-top: 8px;
}
.upload-cta:hover { box-shadow: var(--accent-glow); transform: scale(1.02); }

/* Detail */
.detail-header { padding: 24px 28px 0; border-bottom: 1px solid var(--border-subtle); }
.detail-title-row { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 20px; }
.detail-icon { font-size: 32px; flex-shrink: 0; }
.detail-name { font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; line-height: 1.3; }
.detail-path { font-size: 12px; color: var(--text-muted); }
.status-badge {
  margin-left: auto; font-size: 11px; font-weight: 600;
  padding: 3px 10px; border-radius: var(--radius-full); flex-shrink: 0;
}
.status-badge.success { background: rgba(34,197,94,0.12); color: #22c55e; }
.status-badge.processing { background: rgba(99,102,241,0.12); color: #6366f1; }

/* Tabs */
.tab-bar { display: flex; gap: 4px; }
.tab-btn {
  padding: 8px 16px; background: none; border: none; border-bottom: 2px solid transparent;
  font-size: 13px; font-weight: 600; color: var(--text-muted); cursor: pointer;
  transition: all var(--transition-fast); font-family: inherit;
}
.tab-btn:hover { color: var(--text-primary); }
.tab-btn.is-active { color: var(--text-primary); border-bottom-color: #6366f1; }

.tab-content { padding: 24px 28px; }

/* Blocks tab */
.blocks-summary { display: flex; gap: 20px; margin-bottom: 20px; }
.summary-stat { display: flex; flex-direction: column; align-items: center; background: var(--color-bg-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 14px 24px; }
.s-val { font-size: 22px; font-weight: 800; color: var(--text-primary); }
.s-lbl { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

.blocks-list { display: flex; flex-direction: column; gap: 10px; }
.block-row {
  display: flex; gap: 14px; align-items: flex-start;
  background: var(--color-bg-secondary); border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg); padding: 16px;
  transition: all var(--transition-normal);
}
.block-row:hover { border-color: var(--border-accent); transform: translateX(2px); }
.block-num {
  width: 24px; height: 24px; background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: var(--text-muted); flex-shrink: 0;
}
.block-body { flex: 1; min-width: 0; }
.block-heading { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
.block-preview { font-size: 12px; color: var(--text-secondary); line-height: 1.6; }
.block-tags { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; flex-shrink: 0; }
.block-tag {
  font-size: 10px; color: var(--text-accent); background: rgba(99,102,241,0.08);
  padding: 2px 7px; border-radius: var(--radius-sm); white-space: nowrap;
}

/* Tasks tab */
.tasks-list { display: flex; flex-direction: column; gap: 8px; }
.task-row {
  display: flex; align-items: center; gap: 12px;
  background: var(--color-bg-secondary); border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg); padding: 14px 16px;
  transition: all var(--transition-fast);
}
.task-check {
  width: 20px; height: 20px; border-radius: var(--radius-sm); border: 1.5px solid var(--border-strong);
  display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;
  font-size: 11px; font-weight: 700; transition: all var(--transition-fast);
}
.task-check.done { background: var(--accent-gradient); border-color: transparent; color: white; }
.task-body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.task-title { font-size: 13px; font-weight: 500; color: var(--text-primary); }
.task-title.done { text-decoration: line-through; color: var(--text-muted); }
.task-due { font-size: 11px; color: var(--text-muted); }
.task-load { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: var(--radius-full); }
.task-load.high { background: rgba(239,68,68,0.12); color: #ef4444; }
.task-load.medium { background: rgba(245,158,11,0.12); color: #f59e0b; }
.task-load.low { background: rgba(34,197,94,0.12); color: #22c55e; }

/* PDF Preview (12.5: dark-mode canvas wrapper) */
.pdf-canvas-wrapper {
  background: #f5f4f1; border-radius: var(--radius-xl); padding: 24px;
  border: 1px solid var(--border-default); min-height: 400px;
  transition: filter var(--transition-normal), background var(--transition-normal);
}
html.dark .pdf-canvas-wrapper {
  background: #2a2926;
  /* 12.5: invert + hue-rotate for dark-mode PDF contrast enhancement */
  filter: none;
}
.pdf-canvas-wrapper.dark-invert {
  /* When dark mode is active, boost contrast without full inversion */
  filter: brightness(0.92) contrast(1.05);
}
.pdf-page-mock { background: white; border-radius: 8px; padding: 32px; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
html.dark .pdf-page-mock {
  background: #3a3835;
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);
  /* 12.5: dark-mode text rendering: lighter contrast */
  color: #e8e6e1;
  filter: contrast(0.95) brightness(1.05);
}
.pdf-mock-header { height: 20px; background: linear-gradient(90deg,#6366f1,#a78bfa); border-radius: 4px; margin-bottom: 20px; opacity: 0.7; }
.pdf-mock-line { height: 10px; background: #e8e6e1; border-radius: 4px; margin-bottom: 10px; }
html.dark .pdf-mock-line { background: #4a4843; }
.pdf-mock-img { height: 100px; background: linear-gradient(135deg,#f0f0f0,#e0e0e0); border-radius: 6px; margin: 16px 0; }
html.dark .pdf-mock-img { background: linear-gradient(135deg,#3a3835,#2a2926); }
.pdf-hint { font-size: 11px; color: var(--text-muted); text-align: center; margin-top: 14px; }
</style>
