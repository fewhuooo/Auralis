<template>
  <div class="workspace-container">

    <!-- ===== TIER-1: Icon Strip (72px fixed) ===== -->
    <nav class="tier1-strip">
      <div class="tier1-top">
        <button class="tier1-btn" title="返回学科大厅" @click="router.push('/subjects')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span class="tier1-btn-text">大厅</span>
        </button>
        <button
          class="tier1-btn"
          :class="{ 'is-active': tier2Mode === 'files' }"
          title="学习材料"
          @click="toggleTier2('files')"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span class="tier1-btn-text">材料</span>
        </button>
        <button
          class="tier1-btn"
          :class="{ 'is-active': tier2Mode === 'outline' }"
          title="目录大纲"
          @click="toggleTier2('outline')"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          <span class="tier1-btn-text">大纲</span>
        </button>
        <button
          class="tier1-btn"
          :class="{ 'is-active': centerView === 'blocks' }"
          title="知识库"
          @click="centerView = 'blocks'; tier2Open = false"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          <span class="tier1-btn-text">知识库</span>
        </button>
      </div>
      <div class="tier1-bottom">
        <div class="subject-mini-icon" :style="{ backgroundColor: activeSubject?.color }" :title="activeSubject?.name">
          {{ getSubjectIcon(activeSubject?.icon) }}
        </div>
      </div>
    </nav>

    <!-- ===== TIER-2: Expandable Drawer ===== -->
    <aside class="tier2-drawer" :class="{ 'is-open': tier2Open }" :style="{ width: tier2Open ? tier2Width + '%' : '0px' }">
      <!-- Files Mode -->
      <div v-if="tier2Mode === 'files'" class="drawer-content">
        <div class="drawer-header">
          <h3 class="drawer-title">学习材料</h3>
          <button class="drawer-action" @click="showRegisterModal = true" title="登记文件">+</button>
        </div>
        <div class="drawer-list" v-if="activeSourceFiles.length > 0">
          <div
            v-for="file in activeSourceFiles"
            :key="file.id"
            class="drawer-item"
            :class="{ 'is-active': selectedFileId === file.id }"
            @click="selectFile(file.id)"
          >
            <span class="drawer-item-icon">{{ getFileIcon(file.file_type) }}</span>
            <div class="drawer-item-body">
              <span class="drawer-item-name">{{ file.name }}</span>
              <span class="drawer-item-meta">{{ (file.file_size / (1024 * 1024)).toFixed(1) }} MB</span>
            </div>
          </div>
        </div>
        <div class="drawer-empty" v-else>
          <span>暂无学习材料</span>
        </div>
      </div>

      <!-- Outline Mode -->
      <div v-else-if="tier2Mode === 'outline'" class="drawer-content">
        <div class="drawer-header outline-header">
          <h3 class="drawer-title">学科大纲</h3>
          <div class="outline-header-actions">
            <button class="outline-ai-button" @click="handleOutlineAi">AI 梳理</button>
            <button class="outline-add-button" title="编排大纲" aria-label="编排大纲" @click="isOutlineComposer = !isOutlineComposer">+</button>
          </div>
        </div>
        <div v-if="isOutlineComposer" class="outline-composer">
          <p class="outline-composer-tip">拖拽章节或所属小节调整顺序</p>
          <div v-for="(chapter, chapterIndex) in subjectOutline" :key="chapter.id" class="composer-chapter" draggable="true" @dragstart="startChapterDrag(chapterIndex)" @dragover.prevent @drop="handleChapterDrop(chapterIndex)">
            <div class="composer-row"><span class="drag-handle" title="拖拽章节">⠿</span><strong>{{ chapter.title }}</strong></div>
            <div class="composer-sections">
              <div v-for="(section, sectionIndex) in chapter.sections" :key="section.id" class="composer-section" draggable="true" @dragstart.stop="startSectionDrag(chapterIndex, sectionIndex)" @dragover.prevent @drop.stop="handleSectionDrop(chapterIndex, sectionIndex)">
                <span class="drag-handle">⠿</span><span>{{ section.title }}</span>
              </div>
              <input v-model="chapterDrafts[chapter.id]" class="outline-inline-input" placeholder="输入小节后按 Enter" @keyup.enter="addSection(chapter.id)" />
            </div>
          </div>
          <input v-model="chapterDraft" class="outline-inline-input chapter-input" placeholder="输入新章节后按 Enter" @keyup.enter="addChapter" />
        </div>
        <div v-else class="outline-overview-list">
          <div v-for="chapter in subjectOutline" :key="chapter.id" class="outline-overview-chapter">
            <strong>{{ chapter.title }}</strong>
            <button v-for="section in chapter.sections" :key="section.id" class="outline-file-link" @click="openOutlineFile(section.fileId)">{{ section.title }}<span v-if="fileById(section.fileId)"> · {{ fileById(section.fileId)?.name }}</span></button>
          </div>
        </div>
      </div>
    </aside>

    <!-- Splitter 1 -->
    <div class="resizer" v-show="tier2Open" @mousedown="startResizeLeft"></div>

    <!-- ===== CENTER: Main Workspace ===== -->
    <main class="workspace-center">
      <!-- Micro Status Bar -->
      <header class="center-status-bar">
        <div class="status-left">
          <span v-if="centerView === 'summary' && selectedFile" class="status-file">📝 {{ selectedFile.name }} · 文件总结</span>
          <span v-else-if="centerView === 'blocks'" class="status-file">🧩 知识库 · {{ filteredBlocks.length }} 个知识块</span>
          <span v-else class="status-file">{{ activeSubject?.name }}</span>
        </div>
        <div class="status-right">
          <span class="status-page" v-if="centerView === 'summary'">总结视图</span>
        </div>
      </header>

      <!-- Center Content -->
      <div class="center-body">
        <!-- Collapse Left Button -->
        <button class="edge-collapse edge-left" @click="toggleTier2Panel" :title="tier2Open ? '收起左栏' : '展开左栏'">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline :points="tier2Open ? '15 18 9 12 15 6' : '9 18 15 12 9 6'"/></svg>
        </button>

        <div v-if="centerView === 'summary' && selectedFile" class="file-summary-workspace">
          <div class="file-summary-head"><span class="file-summary-icon">{{ getFileIcon(selectedFile.file_type) }}</span><div><p>文件学习总结</p><h2>{{ selectedFile.name }}</h2></div></div>
          <div class="summary-markdown" v-if="selectedFileBlocks.length" v-html="renderMarkdown(fileSummaryMarkdown)"></div>
          <div class="summary-empty" v-else><span>✦</span><h3>还没有可展示的总结</h3><p>该材料关联的知识块会集中展示在这里；也可以在右侧让 AI 为当前文件整理总结。</p><button class="summary-ask-ai" @click="sendPreset('请总结当前文件的核心内容，并按章节列出重点。')">让 AI 整理总结</button></div>
        </div>

        <!-- Knowledge Blocks Grid -->
        <div v-else-if="centerView === 'blocks'" class="blocks-workspace">
          <div class="blocks-top-bar">
            <div class="blocks-search">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input v-model="blockSearchQuery" placeholder="搜索知识块..." />
            </div>
            <button class="blocks-add-btn" @click="openCreateDialog">+ 手动录入</button>
          </div>
          
          <div class="blocks-grid" v-if="filteredBlocks.length > 0">
            <div
              v-for="block in filteredBlocks"
              :key="block.id"
              class="block-card"
              @click="handleBlockClick(block)"
            >
              <span class="block-tag" :style="{ background: block.color }">{{ block.subject }}</span>
              <h4 class="block-title">{{ block.title }}</h4>
              <p class="block-preview">{{ block.preview }}</p>
              <div class="block-footer">
                <span class="block-time">{{ timeAgo(block.time) }}</span>
                <span class="block-source">{{ block.source }}</span>
              </div>
            </div>
          </div>

          <!-- Empty Knowledge Blocks Onboarding -->
          <div class="onboarding-workspace" v-else>
            <div class="onboarding-header" style="margin-bottom: 24px;">
              <div class="onboarding-emoji" style="font-size: 40px; margin-bottom: 8px;">🧩</div>
              <h3 style="font-size: 16px; font-weight: 700; color: var(--text-primary);">知识库暂无内容</h3>
              <p style="font-size: 12px; color: var(--text-secondary);">建议导入材料进行提炼，或者直接手动创建您的第一个知识卡片</p>
            </div>
            <div class="onboarding-grid" style="max-width: 640px; margin: 0 auto;">
              <div class="onboarding-card" @click="openCreateDialog">
                <div class="onboarding-card-icon">➕</div>
                <div class="onboarding-card-body">
                  <h4>手动新建知识块</h4>
                  <p>手动录入笔记、重要定义或概念卡片，支持 Markdown 渲染。</p>
                  <button class="onboarding-card-btn">手动录入</button>
                </div>
              </div>
              <div class="onboarding-card" @click="tier2Mode = 'files'; tier2Open = true">
                <div class="onboarding-card-icon">📄</div>
                <div class="onboarding-card-body">
                  <h4>关联学习材料</h4>
                  <p>去左侧材料列表中选择或登记文件，然后使用 AI 自动分析目录大纲。</p>
                  <button class="onboarding-card-btn">查看材料</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Default: Subject Onboarding Overview -->
        <div v-else class="onboarding-workspace">
          <div class="onboarding-header">
            <div class="onboarding-emoji">{{ activeSubject?.icon || '📚' }}</div>
            <h2 class="onboarding-title">欢迎来到 {{ activeSubject?.name }} 智能学习工作区</h2>
            <p class="onboarding-subtitle">{{ activeSubject?.description || '在这里，您可以轻松管理您的材料，使用 AI 进行章节大纲提取与核心概念提炼，打造您的专属记忆库。' }}</p>
          </div>

          <div class="onboarding-grid">
            <div class="onboarding-card" @click="showRegisterModal = true">
              <div class="onboarding-card-icon">📄</div>
              <div class="onboarding-card-body">
                <h4>第 1 步：导入学习材料</h4>
                <p>登记您的 PDF 或 MD 学习材料，AI 将智能解析章节目录大纲。</p>
                <button class="onboarding-card-btn">登记材料</button>
              </div>
            </div>

            <div class="onboarding-card" @click="openCreateDialog">
              <div class="onboarding-card-icon">🧩</div>
              <div class="onboarding-card-body">
                <h4>第 2 步：提炼核心概念</h4>
                <p>阅读材料时一键 AI 提炼要点，或手动录入记录为结构化卡片。</p>
                <button class="onboarding-card-btn">手动录入</button>
              </div>
            </div>

            <div class="onboarding-card" @click="focusAndOpenAi">
              <div class="onboarding-card-icon">✨</div>
              <div class="onboarding-card-body">
                <h4>第 3 步：智能 AI 伴读</h4>
                <p>就难点与 AI 助手实时对话问答，自动关联您当前查看的内容。</p>
                <button class="onboarding-card-btn">开启对话</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Collapse Right Button -->
        <button class="edge-collapse edge-right" @click="rightCollapsed = !rightCollapsed" :title="rightCollapsed ? '展开 AI 助手' : '收起 AI 助手'">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline :points="rightCollapsed ? '9 18 15 12 9 6' : '15 18 9 12 15 6'"/></svg>
        </button>
      </div>
    </main>

    <!-- Splitter 2 -->
    <div class="resizer" v-show="!rightCollapsed" @mousedown="startResizeRight"></div>

    <!-- ===== RIGHT: AI Assistant ===== -->
    <aside class="workspace-right" v-show="!rightCollapsed" :style="{ width: rightWidth + '%' }">
      <div class="ai-header">
        <button class="ai-model-switch" @click="showModelMenu = !showModelMenu">{{ currentAiMode }}⌄</button>
        <div v-if="showModelMenu" class="ai-model-menu"><button v-for="mode in aiModes" :key="mode" @click="currentAiMode = mode; showModelMenu = false">{{ mode }}</button></div>
        <button class="ai-clear" @click="clearChat" title="清空对话" aria-label="清空对话"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
      </div>

      <!-- Chat Flow -->
      <div class="ai-messages" ref="chatScrollRef">
        <div class="ai-welcome" v-if="chatMessages.length === 0">
          <div class="ai-star-ring">✦</div>
          <p class="welcome-title">你好，我是你的 AI 学习伴读</p>
          <p class="welcome-desc">围绕当前材料，帮你梳理重点、解释概念并一起学习。</p>
          
          <div class="preset-questions">
            <button
              v-for="q in presetQuestions"
              :key="q"
              class="preset-btn"
              @click="sendPreset(q)"
            >
              {{ q }}
            </button>
          </div>
        </div>
        
        <div
          v-for="(msg, i) in chatMessages"
          :key="i"
          class="chat-msg-row"
          :class="msg.role"
        >
          <!-- Assistant Avatar -->
            <div class="msg-avatar ai-avatar" v-if="msg.role === 'assistant'">✦</div>

          <div class="chat-bubble-wrapper">
            <div class="chat-bubble">
              <div class="chat-content" v-if="msg.role === 'user'">{{ msg.content }}</div>
              <div class="chat-content ai-reply" v-else v-html="renderMarkdown(msg.content)"></div>
            </div>
          </div>

          <!-- User Avatar -->
            <div class="msg-avatar user-avatar" v-if="msg.role === 'user'">我</div>
        </div>

        <div class="chat-msg-row assistant" v-if="isAiStreaming">
          <div class="msg-avatar ai-avatar">✦</div>
          <div class="chat-bubble-wrapper">
            <div class="chat-bubble">
              <div class="chat-content ai-reply">
                <span v-html="renderMarkdown(streamingContent)"></span>
                <span class="typing-cursor"></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Input Box -->
      <div class="ai-input-area">
        <div class="ai-input-wrapper ai-capsule-input">
          <span class="ai-input-plus">+</span>
          <textarea
            ref="chatInputRef"
            v-model="chatInput"
            class="ai-input"
            placeholder="问点什么..."
            rows="1"
            @keydown.enter.exact.prevent="sendChat"
            @input="autoResizeInput"
          ></textarea>
          <button
            class="ai-send-btn"
            :class="{ 'is-ready': chatInput.trim() }"
            :disabled="!chatInput.trim() || isAiStreaming"
            @click="sendChat"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    </aside>


    <!-- AI Refine Loading -->
    <div v-if="isRefiningAi" class="refine-overlay">
      <div class="refine-card">
        <div class="refine-spinner"></div>
        <span class="refine-text">{{ aiRefiningText }}</span>
      </div>
    </div>

    <!-- Register File Modal -->
    <div class="modal-overlay" v-if="showRegisterModal" @click="showRegisterModal = false"></div>
    <div class="block-modal register-modal" v-if="showRegisterModal">
      <div class="modal-header">
        <h3>登记本地参考材料</h3>
        <button class="modal-close" @click="showRegisterModal = false">×</button>
      </div>
      <div class="modal-body" style="display:flex; flex-direction:column; gap:14px;">
        <div class="form-group"><label class="form-label">材料名称 *</label><input v-model="registerForm.name" class="form-input" placeholder="例如: 计算机网络.pdf" /></div>
        <div class="form-group"><label class="form-label">本地绝对路径 *</label><input v-model="registerForm.filePath" class="form-input" placeholder="例如: D:/Books/Network.pdf" /></div>
        <div class="form-group"><label class="form-label">类型 *</label><select v-model="registerForm.fileType" class="form-input"><option value="PDF">PDF</option><option value="Markdown">Markdown</option><option value="PPT">PPT</option><option value="Word">Word</option><option value="Other">其他</option></select></div>
        <div class="form-group"><label class="form-label">文件大小 (MB)</label><input type="number" v-model="registerForm.fileSize" class="form-input" placeholder="15.4" /></div>
      </div>
      <div class="modal-footer">
        <button class="footer-btn secondary-btn" @click="showRegisterModal = false">取消</button>
        <button class="footer-btn primary-btn" :disabled="!registerForm.name.trim() || !registerForm.filePath.trim()" @click="handleRegisterFile">确认登记</button>
      </div>
    </div>

    <!-- Create Task Modal -->
    <div class="modal-overlay" v-if="showTaskModal" @click="showTaskModal = false"></div>
    <div class="block-modal" v-if="showTaskModal">
      <div class="modal-header"><h3>创建学习任务</h3><button class="modal-close" @click="showTaskModal = false">×</button></div>
      <div class="modal-body" style="display:flex; flex-direction:column; gap:14px;">
        <div class="form-group"><label class="form-label">任务名称 *</label><input v-model="taskForm.name" class="form-input" /></div>
        <div class="form-group"><label class="form-label">预计时长</label><select v-model.number="taskForm.duration" class="form-input"><option :value="30">0.5 小时 (30分钟)</option><option :value="60">1.0 小时 (60分钟)</option><option :value="90">1.5 小时 (90分钟)</option><option :value="120">2.0 小时 (120分钟)</option><option :value="150">2.5 小时 (150分钟)</option><option :value="180">3.0 小时 (180分钟)</option><option :value="240">4.0 小时 (240分钟)</option></select></div>
      </div>
      <div class="modal-footer">
        <button class="footer-btn secondary-btn" @click="showTaskModal = false">取消</button>
        <button class="footer-btn primary-btn" :disabled="!taskForm.name.trim()" @click="handleAddTask">加入排期</button>
      </div>
    </div>

    <!-- Block Detail / Edit Modal -->
    <div class="modal-overlay" v-if="blockDialogVisible" @click="closeBlockDialog"></div>
    <div class="block-modal" v-if="blockDialogVisible">
      <div class="modal-header">
        <div class="modal-tags" v-if="!isEditMode">
          <span class="modal-tag" :style="{ background: selectedBlock?.color || 'var(--border-subtle)' }">{{ selectedBlock?.subject }}</span>
          <span class="modal-source-tag">来源: {{ selectedBlock?.source }}</span>
        </div>
        <span v-else style="font-weight:700; color:var(--text-primary);">{{ isCreateMode ? '录入新知识块' : '编辑知识内容' }}</span>
        <button class="modal-close" @click="closeBlockDialog">×</button>
      </div>
      <div class="modal-body" v-if="isEditMode" style="display:flex; flex-direction:column; gap:14px;">
        <div class="form-group"><label class="form-label">分类 *</label><input v-model="editForm.subject" class="form-input" /></div>
        <div class="form-group"><label class="form-label">标题 *</label><input v-model="editForm.title" class="form-input" /></div>
        <div class="form-group"><label class="form-label">色彩</label><div class="color-options"><span v-for="c in themeColors" :key="c.value" class="color-dot" :class="{ 'is-selected': editForm.color === c.value }" :style="{ background: c.value }" @click="editForm.color = c.value"></span></div></div>
        <div class="form-group"><label class="form-label">内容 *</label><textarea v-model="editForm.preview" class="form-textarea" rows="8" placeholder="支持 Markdown"></textarea></div>
      </div>
      <div class="modal-body" v-else>
        <h2 class="modal-title">{{ selectedBlock?.title }}</h2>
        <div class="modal-time">⏰ {{ selectedBlock?.time }}</div>
        <div class="modal-divider"></div>
        <div class="modal-content" v-html="renderMarkdown(selectedBlock?.content || selectedBlock?.preview || '')"></div>
      </div>
      <div class="modal-footer">
        <template v-if="isEditMode">
          <button class="footer-btn secondary-btn" @click="cancelEdit">取消</button>
          <button class="footer-btn primary-btn" @click="handleSaveBlock">{{ isCreateMode ? '创建' : '保存' }}</button>
        </template>
        <template v-else>
          <button class="footer-btn danger-btn" @click="handleDeleteBlock(selectedBlock?.id)">删除</button>
          <div class="footer-right">
            <button class="footer-btn secondary-btn" @click="handleCopyBlockContent(selectedBlock?.preview)">复制</button>
            <button class="footer-btn secondary-btn" @click="startEdit">编辑</button>
            <button class="footer-btn primary-btn" @click="closeBlockDialog">确定</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ElNotification } from 'element-plus'
import 'element-plus/theme-chalk/el-notification.css'

import { useBlockStore } from '@/store/useBlockStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useTaskStore } from '@/store/useTaskStore'
import { streamFetch } from '@/utils/streamFetch'
import { getSubjectIcon } from '@/utils/subjectIcon'

marked.setOptions({ breaks: true, gfm: true })
const renderMarkdown = (c: string) => c ? DOMPurify.sanitize(marked.parse(c) as string) : ''

const route = useRoute()
const router = useRouter()
const blockStore = useBlockStore()
const { recentBlocks } = storeToRefs(blockStore)
const subjectStore = useSubjectStore()
const { activeSubject, activeSourceFiles } = storeToRefs(subjectStore)
const taskStore = useTaskStore()

const subjectId = computed(() => route.params.id as string)
const timeAgo = (iso: string) => {
  if (!iso) return ''
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m}分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}小时前`
  return `${Math.floor(h / 24)}天前`
}

// ===== Tier-1 / Tier-2 State =====
const tier2Open = ref(true)
const tier2Mode = ref<'files' | 'outline'>('files')
const centerView = ref<'blocks' | 'summary' | 'overview'>('overview')
const rightCollapsed = ref(false)

const toggleTier2 = (mode: 'files' | 'outline') => {
  if (tier2Open.value && tier2Mode.value === mode && centerView.value !== 'blocks') {
    tier2Open.value = false
  } else {
    tier2Mode.value = mode
    tier2Open.value = true
    if (centerView.value === 'blocks') {
      centerView.value = selectedFileId.value ? 'summary' : 'overview'
    }
  }
}

const toggleTier2Panel = () => { tier2Open.value = !tier2Open.value }

// ===== Left Resizer =====
const tier2Width = ref(25)
const rightWidth = ref(25)

const startResizeLeft = (e: MouseEvent) => {
  e.preventDefault()
  const startX = e.clientX
  const startW = tier2Width.value
  const containerEl = document.querySelector('.workspace-container')
  const containerWidth = containerEl ? containerEl.getBoundingClientRect().width : window.innerWidth
  const onMove = (ev: MouseEvent) => {
    const deltaX = ev.clientX - startX
    const deltaPercent = (deltaX / containerWidth) * 100
    tier2Width.value = Math.max(15, Math.min(45, startW + deltaPercent))
  }
  const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.body.style.cursor = ''; document.body.style.userSelect = '' }
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

const startResizeRight = (e: MouseEvent) => {
  e.preventDefault()
  const startX = e.clientX
  const startW = rightWidth.value
  const containerEl = document.querySelector('.workspace-container')
  const containerWidth = containerEl ? containerEl.getBoundingClientRect().width : window.innerWidth
  const onMove = (ev: MouseEvent) => {
    const deltaX = ev.clientX - startX
    const deltaPercent = (deltaX / containerWidth) * 100
    rightWidth.value = Math.max(15, Math.min(45, startW - deltaPercent))
  }
  const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.body.style.cursor = ''; document.body.style.userSelect = '' }
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// ===== File summary =====
const selectedFileId = ref<string | null>(null)
const selectedFile = computed(() => activeSourceFiles.value.find(f => f.id === selectedFileId.value) || null)
const selectedFileBlocks = computed(() => recentBlocks.value.filter(block => block.sourceFileId === selectedFileId.value))
const fileSummaryMarkdown = computed(() => selectedFileBlocks.value.map(block => `## ${block.title}\n\n${block.preview}`).join('\n\n'))

const selectFile = (id: string) => {
  selectedFileId.value = id
  centerView.value = 'summary'
}

const getFileIcon = (t: string) => {
  const s = (t || '').toLowerCase()
  if (s.includes('pdf')) return '📄'
  if (s.includes('md')) return '📝'
  if (s.includes('ppt')) return '📊'
  if (s.includes('doc')) return '📘'
  return '📄'
}

// ===== Subject outline (visual prototype; not persisted) =====
interface OutlineSection { id: string; title: string; fileId?: string }
interface OutlineChapter { id: string; title: string; sections: OutlineSection[] }
const isOutlineComposer = ref(false)
const chapterDraft = ref('')
const chapterDrafts = ref<Record<string, string>>({})
const chapterDragIndex = ref<number | null>(null)
const sectionDrag = ref<{ chapterIndex: number; sectionIndex: number } | null>(null)
const subjectOutline = ref<OutlineChapter[]>([
  { id: 'chapter-foundation', title: '第一章 · 基础概念', sections: [{ id: 'section-overview', title: '核心概念总览' }] },
  { id: 'chapter-practice', title: '第二章 · 重点与练习', sections: [{ id: 'section-application', title: '典型应用与易错点' }] }
])
const fileById = (id?: string) => activeSourceFiles.value.find(file => file.id === id)
const openOutlineFile = (id?: string) => { if (id) selectFile(id) }
const syncOutlineFileLinks = () => {
  const files = activeSourceFiles.value
  if (!files.length) return
  subjectOutline.value.forEach((chapter, chapterIndex) => {
    chapter.sections.forEach((section, sectionIndex) => {
      section.fileId = files[(chapterIndex + sectionIndex) % files.length].id
    })
  })
}
const addChapter = () => {
  const title = chapterDraft.value.trim()
  if (!title) return
  subjectOutline.value.push({ id: `chapter-${Date.now()}`, title, sections: [] })
  chapterDraft.value = ''
}
const addSection = (chapterId: string) => {
  const title = chapterDrafts.value[chapterId]?.trim()
  if (!title) return
  const chapter = subjectOutline.value.find(item => item.id === chapterId)
  if (chapter) chapter.sections.push({ id: `section-${Date.now()}`, title })
  chapterDrafts.value[chapterId] = ''
}
const startChapterDrag = (index: number) => { chapterDragIndex.value = index }
const handleChapterDrop = (target: number) => {
  const source = chapterDragIndex.value
  if (source === null || source === target) return
  const [chapter] = subjectOutline.value.splice(source, 1)
  subjectOutline.value.splice(target, 0, chapter)
  chapterDragIndex.value = null
}
const startSectionDrag = (chapterIndex: number, sectionIndex: number) => { sectionDrag.value = { chapterIndex, sectionIndex } }
const handleSectionDrop = (chapterIndex: number, target: number) => {
  const source = sectionDrag.value
  if (!source || source.chapterIndex !== chapterIndex || source.sectionIndex === target) return
  const sections = subjectOutline.value[chapterIndex].sections
  const [section] = sections.splice(source.sectionIndex, 1)
  sections.splice(target, 0, section)
  sectionDrag.value = null
}
const handleOutlineAi = () => {
  tier2Open.value = true
  rightCollapsed.value = false
  sendPreset('请为当前学科梳理章节结构与学习重点。')
}

// ===== Knowledge Blocks =====
const blockSearchQuery = ref('')
const subjectBlocks = computed(() => recentBlocks.value.filter(b => b.subjectId === subjectId.value))
const filteredBlocks = computed(() => {
  const q = blockSearchQuery.value.trim().toLowerCase()
  if (!q) return subjectBlocks.value
  return subjectBlocks.value.filter(b => (b.title?.toLowerCase().includes(q)) || (b.preview?.toLowerCase().includes(q)))
})

// ===== Register Files =====
const showRegisterModal = ref(false)
const registerForm = ref({ name: '', filePath: '', fileType: 'PDF', fileSize: 0 })

const handleRegisterFile = async () => {
  if (!registerForm.value.name.trim() || !registerForm.value.filePath.trim() || !subjectId.value) return
  try {
    const newId = await subjectStore.addSourceFile(subjectId.value, registerForm.value.name.trim(), registerForm.value.filePath.trim(), registerForm.value.fileType, Math.round(registerForm.value.fileSize * 1024 * 1024))
    if (!selectedFileId.value) selectedFileId.value = newId
    showRegisterModal.value = false
    registerForm.value = { name: '', filePath: '', fileType: 'PDF', fileSize: 0 }
    ElNotification({ title: '登记成功', type: 'success', position: 'top-right' })
  } catch (e) { console.error(e) }
}

// ===== Task Creation =====
const showTaskModal = ref(false)
const taskForm = ref({ name: '', duration: 60, load: 'medium' as 'low' | 'medium' | 'high' })

const handleAddTask = async () => {
  if (!taskForm.value.name.trim() || !activeSubject.value) return
  const s = activeSubject.value
  await taskStore.addTask({ name: taskForm.value.name.trim(), subject: s.name, desc: '从学科工作区', color: s.color, duration: taskForm.value.duration, load: taskForm.value.load, loadText: taskForm.value.load === 'low' ? '1.0 🧠' : taskForm.value.load === 'medium' ? '2.0 🧠' : '3.0 🧠', status: 'pending', subjectId: s.id })
  showTaskModal.value = false
  ElNotification({ title: '已生成', type: 'success', position: 'top-right' })
}

// ===== AI Refine =====
const isRefiningAi = ref(false)
const aiRefiningText = ref('')
let abortController: AbortController | null = null

// ===== Block CRUD =====
const blockDialogVisible = ref(false)
const selectedBlock = ref<any>(null)
const isEditMode = ref(false)
const isCreateMode = ref(false)
const editForm = ref({ id: '', subject: '', title: '', color: 'rgba(230,223,216,0.5)', preview: '', source: '手动添加' })

const themeColors = [
  { name: '绿', value: 'rgba(181,196,177,0.4)' },
  { name: '沙', value: 'rgba(217,197,178,0.4)' },
  { name: '粉', value: 'rgba(212,163,163,0.4)' },
  { name: '蓝', value: 'rgba(179,192,207,0.4)' },
  { name: '黄', value: 'rgba(230,223,216,0.5)' }
]

const handleBlockClick = (b: any) => { selectedBlock.value = b; isEditMode.value = false; blockDialogVisible.value = true }
const startEdit = () => { isEditMode.value = true; isCreateMode.value = false; if (selectedBlock.value) editForm.value = { id: selectedBlock.value.id, subject: selectedBlock.value.subject, title: selectedBlock.value.title, color: selectedBlock.value.color, preview: selectedBlock.value.preview, source: selectedBlock.value.source } }
const openCreateDialog = () => { selectedBlock.value = null; isEditMode.value = true; isCreateMode.value = true; editForm.value = { id: '', subject: activeSubject.value?.name || '', title: '', color: activeSubject.value?.color || 'rgba(181,196,177,0.4)', preview: '', source: '手动创建' }; blockDialogVisible.value = true }
const cancelEdit = () => { isCreateMode.value ? (blockDialogVisible.value = false) : (isEditMode.value = false) }
const closeBlockDialog = () => { blockDialogVisible.value = false; isEditMode.value = false; isCreateMode.value = false }

const handleSaveBlock = async () => {
  if (!editForm.value.subject.trim() || !editForm.value.title.trim() || !editForm.value.preview.trim()) { ElNotification({ title: '请填写必填项', type: 'warning', position: 'top-right' }); return }
  if (isCreateMode.value) { await blockStore.addBlock({ subject: editForm.value.subject, title: editForm.value.title, preview: editForm.value.preview, time: new Date().toLocaleString(), source: editForm.value.source, color: editForm.value.color, subjectId: subjectId.value, sourceFileId: selectedFileId.value || undefined }); ElNotification({ title: '已录入', type: 'success', position: 'top-right' }) }
  else { await blockStore.updateBlock({ ...selectedBlock.value, subject: editForm.value.subject, title: editForm.value.title, preview: editForm.value.preview, color: editForm.value.color, time: new Date().toLocaleString() }); ElNotification({ title: '已更新', type: 'success', position: 'top-right' }) }
  closeBlockDialog()
}

const handleDeleteBlock = async (id: string) => { if (!id || !confirm('确定删除？')) return; await blockStore.removeBlock(id); blockDialogVisible.value = false; ElNotification({ title: '已删除', type: 'success', position: 'top-right' }) }
const handleCopyBlockContent = (c: string) => { if (c) { navigator.clipboard.writeText(c); ElNotification({ title: '已复制', type: 'success', position: 'top-right', duration: 2000 }) } }
const presetQuestions = [
  '总结当前材料的核心概念',
  '查找本章的关键定义与解释',
  '针对当前内容生成 3 道测试题'
]

const sendPreset = (q: string) => {
  chatInput.value = q
  sendChat()
}

const focusAndOpenAi = () => {
  rightCollapsed.value = false
  nextTick(() => {
    if (chatInputRef.value) {
      chatInputRef.value.focus()
    }
  })
}

// ===== AI Chat (Right Panel) =====
interface ChatMsg { role: 'user' | 'assistant'; content: string }
const chatMessages = ref<ChatMsg[]>([])
const chatInput = ref('')
const isAiStreaming = ref(false)
const streamingContent = ref('')
const chatScrollRef = ref<HTMLElement | null>(null)
const chatInputRef = ref<HTMLTextAreaElement | null>(null)
const aiModes = ['学习伴读', '重点梳理', '练习出题']
const currentAiMode = ref(aiModes[0])
const showModelMenu = ref(false)

const autoResizeInput = () => {
  const el = chatInputRef.value
  if (!el) return
  el.style.height = '36px'
  el.style.height = Math.min(el.scrollHeight, 36 * 6) + 'px'
}

const scrollChatToBottom = () => {
  nextTick(() => { if (chatScrollRef.value) chatScrollRef.value.scrollTop = chatScrollRef.value.scrollHeight })
}

const sendChat = async () => {
  const msg = chatInput.value.trim()
  if (!msg || isAiStreaming.value) return
  chatMessages.value.push({ role: 'user', content: msg })
  chatInput.value = ''
  autoResizeInput()
  scrollChatToBottom()

  isAiStreaming.value = true
  streamingContent.value = ''
  let abortCtrl = new AbortController()
  abortController = abortCtrl

  const context = selectedFile.value ? `当前文件: ${selectedFile.value.name}` : `学科: ${activeSubject.value?.name}`
  const url = `/api/ai/chat?message=${encodeURIComponent(msg)}&subjectId=${subjectId.value}&context=${encodeURIComponent(context)}`

  try {
    const authStore = useAuthStore()
    await streamFetch(url, authStore.token || '', (c) => { streamingContent.value += c; scrollChatToBottom() }, () => {
      chatMessages.value.push({ role: 'assistant', content: streamingContent.value })
      streamingContent.value = ''
      isAiStreaming.value = false
      scrollChatToBottom()
    }, (err) => {
      isAiStreaming.value = false
      if (err.name !== 'AbortError') chatMessages.value.push({ role: 'assistant', content: '抱歉，请求失败。' })
    }, abortCtrl.signal)
  } catch { isAiStreaming.value = false }
}

const clearChat = () => { chatMessages.value = []; streamingContent.value = '' }

// ===== Lifecycle =====
onMounted(async () => {
  const id = subjectId.value
  if (id) {
    subjectStore.setActiveSubject(id)
    await subjectStore.loadSourceFiles(id)
    await blockStore.fetchBlocks(undefined, id)
    syncOutlineFileLinks()
    if (activeSourceFiles.value.length > 0) {
      selectedFileId.value = activeSourceFiles.value[0].id
      centerView.value = 'summary'
    } else {
      centerView.value = 'overview'
    }
  }
})

watch(subjectId, async (newId) => {
  if (newId) {
    subjectStore.setActiveSubject(newId)
    await subjectStore.loadSourceFiles(newId)
    await blockStore.fetchBlocks(undefined, newId)
    syncOutlineFileLinks()
    if (activeSourceFiles.value.length > 0) {
      selectedFileId.value = activeSourceFiles.value[0].id
      centerView.value = 'summary'
    } else {
      selectedFileId.value = null
      centerView.value = 'overview'
    }
  }
})

onUnmounted(() => { if (abortController) abortController.abort() })
</script>

<style scoped>
/* ===== Root & Themes Overrides ===== */
.workspace-container {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--color-zen-ivory); /* Zen Ivory base */
  padding: 8px;
  gap: 8px;

  /* Zen Minimalist Theme override */
  --color-primary-accent: #7D9372;
  --color-primary-accent-hover: #6c8062;
  --color-primary-light: rgba(163, 177, 155, 0.12);
  --color-primary-glow: rgba(163, 177, 155, 0.25);
  --accent-gradient: var(--color-zen-sage);
}

html.dark .workspace-container {
  background: var(--color-bg-primary);
}

/* ===== Tier-1 Icon Strip ===== */
.tier1-strip {
  width: 76px;
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 20px 0;
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--border-default);
  box-shadow: rgba(0, 0, 0, 0.02) 0px 4px 12px;
}

html.dark .tier1-strip {
  background: var(--color-bg-secondary);
  border: 1.5px solid var(--border-subtle);
}

.tier1-top, .tier1-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.tier1-btn {
  width: 62px;
  height: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.tier1-btn svg {
  stroke-width: 2.2;
}

.tier1-btn-text {
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.tier1-btn:hover {
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-primary);
}

html.dark .tier1-btn:hover {
  background: rgba(255, 255, 255, 0.06);
}

.tier1-btn.is-active {
  background: var(--color-primary-light);
  color: var(--color-primary-accent);
  font-weight: 700;
  box-shadow: var(--shadow-sm);
  border-left: 3px solid var(--color-primary-accent);
  border-radius: var(--radius-md);
}

.subject-mini-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  box-shadow: var(--shadow-sm);
}

/* ===== Tier-2 Drawer (Rounded Card) ===== */
.tier2-drawer {
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--border-default);
  box-shadow: rgba(0, 0, 0, 0.02) 0px 4px 12px;
  overflow: hidden;
  transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease, border-width 0.3s ease;
}

.tier2-drawer:not(.is-open) {
  width: 0 !important;
  opacity: 0;
  border-width: 0;
  pointer-events: none;
}

html.dark .tier2-drawer {
  background: var(--color-bg-secondary);
  border-color: var(--border-subtle);
}

.drawer-content { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 16px 14px;
  flex-shrink: 0;
}

.drawer-title { font-size: 13px; font-weight: 700; color: var(--text-primary); margin: 0; text-transform: uppercase; letter-spacing: 0.5px; }

.drawer-action {
  width: 26px;
  height: 26px;
  border: 1px dashed var(--border-strong);
  border-radius: 6px;
  background: none;
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.drawer-action:hover { border-color: var(--color-primary-accent); color: var(--color-primary-accent); background: rgba(255, 255, 255, 0.5); }

.drawer-list { flex: 1; overflow-y: auto; padding: 0 10px 10px; display: flex; flex-direction: column; gap: 4px; }

.drawer-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast);
  position: relative;
}

.drawer-item:hover { background: rgba(255, 255, 255, 0.8); }
html.dark .drawer-item:hover { background: rgba(255, 255, 255, 0.04); }

.drawer-item.is-active {
  background: var(--color-primary-light);
  font-weight: 700;
  color: var(--color-primary-accent);
}

.drawer-item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  background: var(--color-primary-accent);
  border-radius: 1.5px;
}

.drawer-item-icon { font-size: 16px; flex-shrink: 0; }
.drawer-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.drawer-item-name { font-size: 13.5px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.drawer-item-meta { font-size: 10.5px; color: var(--text-muted); }

.drawer-item-actions { display: flex; gap: 4px; opacity: 0; transition: opacity var(--transition-fast); }
.drawer-item:hover .drawer-item-actions { opacity: 1; }

.drawer-item-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition-fast);
}

.drawer-item-btn:hover { background: rgba(0, 0, 0, 0.06); }
.drawer-item-btn.danger:hover { background: rgba(239, 68, 68, 0.12); }

.drawer-empty { padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: 12px; display: flex; flex-direction: column; gap: 12px; align-items: center; }

.drawer-file-select { padding: 0 16px 12px; flex-shrink: 0; }
.drawer-select {
  width: 100%;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text-primary);
  outline: none;
  cursor: pointer;
}

.drawer-textarea {
  width: 100%;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--text-primary);
  resize: none;
  outline: none;
}

.drawer-primary-btn {
  background: var(--accent-gradient);
  color: white;
  border: none;
  padding: 8px 18px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  align-self: flex-start;
}

.drawer-primary-btn:hover { opacity: 0.9; }
.drawer-primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Outline Tree */
.outline-list { padding: 0 10px 10px; }
.outline-chapter { margin-bottom: 6px; }

.outline-chapter-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  transition: background var(--transition-fast);
}

.outline-chapter-title:hover { background: rgba(255, 255, 255, 0.6); }
.outline-arrow { font-size: 11px; color: var(--text-muted); width: 14px; text-align: center; }

.outline-sections { padding: 2px 0 4px 22px; display: flex; flex-direction: column; gap: 2px; }

.outline-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
}

.outline-section:hover { background: rgba(255, 255, 255, 0.5); }
.outline-section-name { font-size: 12px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.outline-section-actions { display: flex; gap: 4px; opacity: 0; transition: opacity var(--transition-fast); }
.outline-section:hover .outline-section-actions { opacity: 1; }

.outline-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.outline-btn:hover { background: rgba(0, 0, 0, 0.06); }

/* ===== Resizer (Clean visual spacing gap) ===== */
.resizer {
  width: 8px;
  margin: 0 -4px;
  flex-shrink: 0;
  background: transparent;
  position: relative;
  cursor: col-resize;
  z-index: 5;
  transition: background var(--transition-fast);
}

.resizer:hover {
  background: var(--color-primary-light);
  border-radius: 4px;
}

.resizer::before { content: ''; position: absolute; top: 0; bottom: 0; left: -2px; right: -2px; }

/* ===== Center Workspace ===== */
.workspace-center {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--border-default);
  box-shadow: rgba(0, 0, 0, 0.02) 0px 4px 12px;
}

html.dark .workspace-center {
  border: 1.5px solid var(--border-subtle);
}

.center-status-bar {
  height: 48px;
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  border-bottom: 1px solid var(--border-default);
  background: var(--color-bg-primary);
}

.status-left, .status-right { display: flex; align-items: center; gap: 10px; }
.status-file { font-size: 13.5px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status-page { font-size: 12px; color: var(--text-muted); }
.status-btn {
  background: none;
  border: none;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-primary-accent);
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 6px;
}

.status-btn:hover { background: var(--color-primary-light); }

.center-body {
  flex: 1;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Edge Collapse Buttons */
.edge-collapse {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 36px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--transition-fast);
  z-index: 10;
  color: var(--text-secondary);
}

.center-body:hover .edge-collapse { opacity: 0.5; }
.edge-collapse:hover { opacity: 1 !important; }
.edge-left { left: 2px; }
.edge-right { right: 2px; }

/* Skeleton */
.skeleton-screen {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  animation: skeletonPulse 1.5s ease-in-out infinite;
}

@keyframes skeletonPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.skeleton-line { height: 14px; border-radius: 4px; background: rgba(0, 0, 0, 0.06); }
.skeleton-line.w80 { width: 80%; }
.skeleton-line.w60 { width: 60%; }
.skeleton-line.w70 { width: 70%; }
.skeleton-line.w90 { width: 90%; }
.skeleton-block { height: 100px; border-radius: 8px; background: rgba(0, 0, 0, 0.04); }

/* PDF Workspace */
.pdf-workspace {
  flex: 1;
  overflow: hidden;
  background: #F5F7FA;
  display: flex;
  flex-direction: column;
}

/* Blocks Workspace */
.blocks-workspace { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 20px 24px; }

.blocks-top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-shrink: 0; }

.blocks-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1.5px solid var(--border-default);
  transition: border-color var(--transition-fast);
}

.blocks-search:focus-within { border-bottom-color: var(--color-primary-accent); }
.blocks-search svg { color: var(--text-secondary); flex-shrink: 0; }
.blocks-search input { background: none; border: none; outline: none; font-size: 13.5px; color: var(--text-primary); width: 200px; }

.blocks-add-btn {
  background: none;
  border: 1px solid var(--border-default);
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  cursor: pointer;
  padding: 6px 14px;
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.blocks-add-btn:hover { color: var(--color-primary-accent); border-color: var(--color-primary-accent); background: var(--color-primary-light); }

.blocks-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 20px;
  align-content: start;
}

.block-card {
  background: var(--color-bg-primary);
  border-radius: 14px;
  padding: 18px;
  cursor: pointer;
  transition: all var(--transition-normal);
  display: flex;
  flex-direction: column;
  min-height: 150px;
  border: 1.5px solid var(--border-subtle);
  box-shadow: rgba(0, 0, 0, 0.03) 0px 4px 16px;
}

.block-card:hover {
  transform: translateY(-3px);
  border-color: var(--color-primary-accent);
  box-shadow: rgba(163, 177, 155, 0.12) 0px 8px 24px;
}

.block-tag { align-self: flex-start; font-size: 10px; padding: 3px 10px; border-radius: 6px; color: var(--text-primary); font-weight: 700; margin-bottom: 10px; }
.block-title { font-size: 15px; font-weight: 700; color: var(--text-primary); margin: 0 0 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.block-preview {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0 0 12px;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.block-footer { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--text-muted); }

/* ===== Onboarding (Getting Started) Workspace ===== */
.onboarding-workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 32px;
  overflow-y: auto;
  text-align: center;
  background: var(--color-bg-primary);
}

.onboarding-header {
  margin-bottom: 44px;
  max-width: 640px;
}

.onboarding-emoji {
  font-size: 60px;
  margin-bottom: 20px;
  animation: bounce 2s infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.onboarding-title {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 16px;
  letter-spacing: -0.4px;
}

.onboarding-subtitle {
  font-size: 14.5px;
  color: var(--text-secondary);
  line-height: 1.65;
}

.onboarding-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
  width: 100%;
  max-width: 840px;
  margin-top: 10px;
}

.onboarding-card {
  background: var(--color-bg-primary);
  border: 1.5px solid var(--border-default);
  border-radius: 16px;
  padding: 24px;
  cursor: pointer;
  transition: all var(--transition-normal);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  box-shadow: var(--shadow-sm);
}

.onboarding-card:hover {
  transform: translateY(-4px);
  border-color: var(--color-primary-accent);
  box-shadow: var(--shadow-md), var(--color-primary-glow);
}

.onboarding-card-icon {
  font-size: 32px;
  width: 58px;
  height: 58px;
  background: var(--color-primary-light);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary-accent);
}

.onboarding-card-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.onboarding-card-body h4 {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.onboarding-card-body p {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.55;
  margin: 0;
}

.onboarding-card-btn {
  margin-top: auto;
  background: var(--color-primary-light);
  border: 1px solid rgba(163, 177, 155, 0.3);
  color: var(--color-primary-accent);
  font-size: 12px;
  font-weight: 700;
  padding: 8px 18px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.onboarding-card:hover .onboarding-card-btn {
  background: var(--color-primary-accent);
  color: white;
  border-color: transparent;
}

/* ===== Right: AI Assistant (Rounded Card) ===== */
.workspace-right {
  width: 340px;
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--border-default);
  box-shadow: rgba(0, 0, 0, 0.02) 0px 4px 12px;
  overflow: hidden;
}

html.dark .workspace-right {
  background: var(--color-bg-secondary);
  border: 1.5px solid var(--border-subtle);
}

.ai-header {
  height: 48px;
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid var(--border-default);
  background: var(--color-bg-primary);
}

html.dark .ai-header {
  background: #181716;
}

.ai-title { font-size: 13px; font-weight: 700; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.5px; }

.ai-clear {
  background: none;
  border: none;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.ai-clear:hover { color: var(--text-primary); background: rgba(0, 0, 0, 0.06); }

/* Chat Welcome Prompts */
.ai-welcome {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 10px 4px;
}

.welcome-title {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.welcome-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.55;
  margin: 0;
}

.preset-questions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.preset-btn {
  background: var(--color-bg-primary);
  border: 1.5px solid var(--border-default);
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 12.5px;
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
  transition: all var(--transition-fast);
  line-height: 1.4;
}

.preset-btn:hover {
  border-color: var(--color-primary-accent);
  color: var(--color-primary-accent);
  background: var(--color-primary-light);
  transform: translateX(3px);
}

/* Chat Bubbles & Rows */
.ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.chat-msg-row {
  display: flex;
  gap: 12px;
  max-width: 92%;
  align-self: flex-start;
}

.chat-msg-row.user {
  align-self: flex-end;
  flex-direction: row;
}

.chat-bubble-wrapper {
  flex: 1;
  min-width: 0;
}

.chat-bubble {
  border-radius: 14px;
  padding: 12px 16px;
  font-size: 13.5px;
  line-height: 1.6;
  word-break: break-word;
  box-shadow: rgba(0, 0, 0, 0.02) 0px 2px 8px;
}

.chat-msg-row.user .chat-bubble {
  background: var(--color-primary-accent);
  color: white;
  border-bottom-right-radius: 2px;
}

.chat-msg-row.assistant .chat-bubble {
  background: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  border-bottom-left-radius: 2px;
}

.chat-content {
  font-size: 13.5px;
}

/* Avatar styling */
.msg-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}

.ai-avatar {
  background: var(--color-zen-sage);
  color: white;
  box-shadow: 0 2px 8px rgba(163, 177, 155, 0.25);
}

.user-avatar {
  background: var(--color-zen-hairline);
  color: var(--text-primary);
}

.ai-reply :deep(p) { margin-bottom: 10px; }
.ai-reply :deep(p:last-child) { margin-bottom: 0; }
.ai-reply :deep(strong) { color: inherit; font-weight: 700; }
.ai-reply :deep(code) { background: rgba(0, 0, 0, 0.05); padding: 2px 5px; border-radius: 4px; font-size: 12px; font-family: var(--font-family-mono); }
.ai-reply :deep(pre) { background: #1e1e2e; color: #cdd6f4; padding: 12px; border-radius: 8px; overflow-x: auto; margin: 10px 0; font-size: 12px; line-height: 1.45; }
.ai-reply :deep(pre code) { background: none; padding: 0; color: inherit; }
.ai-reply :deep(ul), .ai-reply :deep(ol) { padding-left: 20px; margin: 8px 0; }
.ai-reply :deep(li) { margin-bottom: 4px; }

.typing-cursor {
  display: inline-block;
  width: 2px;
  height: 14px;
  background: var(--text-secondary);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: blink 0.8s step-end infinite;
}

@keyframes blink { 50% { opacity: 0; } }

/* Input Area */
.ai-input-area {
  flex-shrink: 0;
  padding: 14px 16px 16px;
  border-top: 1px solid var(--border-default);
  background: var(--color-bg-primary);
}

.ai-input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  background: var(--color-gray-100);
  border: 1.5px solid var(--border-subtle);
  border-radius: 14px;
  padding: 8px 12px;
  transition: all var(--transition-fast);
}

html.dark .ai-input-wrapper {
  background: var(--color-bg-tertiary);
}

.ai-input-wrapper:focus-within {
  border-color: var(--color-primary-accent);
  background: var(--color-bg-primary);
  box-shadow: 0 0 0 3px var(--color-primary-glow);
}

.ai-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 13.5px;
  color: var(--text-primary);
  font-family: inherit;
  line-height: 1.55;
  resize: none;
  min-height: 24px;
  max-height: 160px;
  padding: 4px 0;
}

.ai-input::placeholder { color: var(--text-muted); }

.ai-send-btn {
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-muted);
  opacity: 0.4;
  transition: all 150ms ease;
  flex-shrink: 0;
}

.ai-send-btn.is-ready { opacity: 1; color: var(--color-primary-accent); }
.ai-send-btn:disabled { cursor: default; }
.ai-send-btn.is-ready:hover { background: var(--color-primary-light); }

/* ===== AI Refine Overlay ===== */
.refine-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.refine-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  padding: 32px;
  width: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
}

.refine-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: var(--color-primary-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }
.refine-text { font-size: 13.5px; font-weight: 700; color: var(--text-primary); }
.loading-spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; }

/* ===== Modals ===== */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); z-index: 1000; }

.block-modal {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 540px; max-height: 80vh;
  background: var(--glass-bg); backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border); border-radius: var(--radius-xl);
  box-shadow: var(--glass-shadow); z-index: 1001;
  display: flex; flex-direction: column; overflow: hidden;
}

.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; border-bottom: 1px solid var(--border-subtle); }
.modal-header h3 { margin: 0; font-weight: 700; color: var(--text-primary); font-size: 15px; }
.modal-tags { display: flex; align-items: center; gap: 8px; }
.modal-tag { font-size: 10.5px; padding: 3px 10px; border-radius: var(--radius-sm); color: var(--text-primary); font-weight: 600; }
.modal-source-tag { font-size: 11px; color: var(--text-muted); }
.modal-close { background: none; border: none; font-size: 20px; color: var(--text-muted); cursor: pointer; padding: 4px 8px; border-radius: 4px; }
.modal-close:hover { background: rgba(255,255,255,0.06); color: var(--text-primary); }
.modal-body { padding: 24px; overflow-y: auto; flex: 1; }
.modal-title { font-size: 20px; font-weight: 800; color: var(--text-primary); margin: 0 0 10px; }
.modal-time { font-size: 12px; color: var(--text-muted); }
.modal-divider { height: 1px; background: var(--border-subtle); margin: 18px 0; }
.modal-content { font-size: 14px; color: var(--text-secondary); line-height: 1.7; }
.modal-content :deep(p) { margin-bottom: 12px; }
.modal-content :deep(strong) { letter-spacing: 0.2px; }

.modal-footer { display: flex; justify-content: space-between; gap: 8px; padding: 14px 24px; border-top: 1px solid var(--border-subtle); }
.footer-right { display: flex; gap: 8px; }

.footer-btn { padding: 8px 20px; border-radius: var(--radius-md); font-size: 13px; font-weight: 600; cursor: pointer; transition: all var(--transition-fast); font-family: inherit; }
.primary-btn { background: var(--accent-gradient); color: white; border: none; }
.primary-btn:hover { opacity: 0.9; }
.secondary-btn { background: transparent; border: 1px solid var(--border-default); color: var(--text-secondary); }
.secondary-btn:hover { border-color: var(--border-strong); color: var(--text-primary); }
.danger-btn { background: transparent; border: 1px solid rgba(239,68,68,0.3); color: #ef4444; }
.danger-btn:hover { background: rgba(239,68,68,0.1); }

.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.form-input { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 10px 12px; color: var(--text-primary); font-size: 13px; outline: none; font-family: inherit; }
.form-input:focus { border-color: var(--color-primary-accent); }
.form-textarea { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: var(--radius-md); padding: 12px 14px; color: var(--text-primary); font-size: 13px; resize: vertical; outline: none; font-family: inherit; }

.color-options { display: flex; gap: 8px; }
.color-dot { width: 22px; height: 22px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: all var(--transition-fast); }
.color-dot:hover { transform: scale(1.1); }
.color-dot.is-selected { border-color: var(--text-primary); transform: scale(1.15); }

/* ===== Subject summary & outline prototype ===== */
.outline-header-actions { display: flex; align-items: center; gap: 8px; }
.outline-ai-button { border: 0; border-radius: 7px; padding: 6px 9px; background: var(--color-primary-light); color: var(--color-primary-accent); font-size: 11px; font-weight: 700; cursor: pointer; }
.outline-add-button { width: 27px; height: 27px; border: 0; border-radius: 50%; background: var(--color-primary-accent); color: white; font-size: 19px; line-height: 1; cursor: pointer; }
.outline-composer, .outline-overview-list { padding: 0 12px 14px; overflow-y: auto; }
.outline-composer-tip { margin: 0 0 10px; color: var(--text-muted); font-size: 11px; }
.composer-chapter { margin-bottom: 10px; border: 1px solid var(--border-default); border-radius: 9px; background: rgba(255,255,255,.35); }
.composer-row, .composer-section { display: flex; align-items: center; gap: 7px; padding: 8px 10px; font-size: 12px; }
.composer-row { border-bottom: 1px solid var(--border-subtle); }
.composer-sections { padding: 3px 8px 8px 26px; }
.composer-section { border-radius: 6px; color: var(--text-secondary); }
.composer-section:hover { background: var(--color-primary-light); }
.drag-handle { color: var(--text-muted); cursor: grab; font-size: 14px; }
.outline-inline-input { width: 100%; box-sizing: border-box; border: 0; border-bottom: 1px dashed var(--border-strong); padding: 7px 3px; background: transparent; color: var(--text-primary); outline: none; font-size: 12px; }
.chapter-input { margin-top: 4px; padding: 10px 4px; }
.outline-overview-chapter { display: flex; flex-direction: column; gap: 5px; margin-bottom: 16px; font-size: 12px; }
.outline-overview-chapter strong { color: var(--text-primary); font-size: 13px; }
.outline-file-link { padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--text-secondary); text-align: left; cursor: pointer; font: inherit; }
.outline-file-link:hover { background: var(--color-primary-light); color: var(--color-primary-accent); }
.file-summary-workspace { width: min(780px, 100%); margin: 0 auto; padding: 46px 52px; overflow-y: auto; }
.file-summary-head { display: flex; align-items: center; gap: 14px; padding-bottom: 22px; margin-bottom: 26px; border-bottom: 1px solid var(--border-default); }
.file-summary-head p { margin: 0 0 4px; color: var(--text-muted); font-size: 12px; }.file-summary-head h2 { margin: 0; font-size: 22px; color: var(--text-primary); }.file-summary-icon { font-size: 30px; }
.summary-markdown { color: var(--text-secondary); line-height: 1.8; font-size: 14px; }.summary-markdown :deep(h2) { color: var(--text-primary); font-size: 17px; margin-top: 26px; }
.summary-empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 90px 15%; color: var(--text-secondary); }.summary-empty > span { color: var(--color-primary-accent); font-size: 28px; }.summary-empty h3 { color: var(--text-primary); margin: 12px 0 4px; }.summary-empty p { font-size: 13px; line-height: 1.7; }.summary-ask-ai { margin-top: 12px; padding: 9px 13px; border: 0; border-radius: 8px; background: var(--color-primary-accent); color: white; font-weight: 700; cursor: pointer; }

/* ===== Mobile AI visual language on PC ===== */
.ai-header { position: relative; justify-content: space-between; }.ai-model-switch { border: 0; background: transparent; color: var(--text-primary); font-weight: 700; cursor: pointer; padding: 6px 0; }.ai-model-menu { position: absolute; top: 42px; left: 16px; z-index: 4; min-width: 112px; padding: 5px; background: var(--color-bg-primary); border: 1px solid var(--border-default); border-radius: 9px; box-shadow: var(--shadow-md); }.ai-model-menu button { display: block; width: 100%; border: 0; border-radius: 5px; padding: 7px; background: transparent; color: var(--text-secondary); font-size: 12px; text-align: left; cursor: pointer; }.ai-model-menu button:hover { background: var(--color-primary-light); }
.ai-clear { width: 30px; height: 30px; display: grid; place-items: center; padding: 0; font-size: 0; }.ai-clear svg { stroke: currentColor; }
.ai-welcome { align-items: center; text-align: center; padding: 46px 25px 24px; }.ai-star-ring { width: 58px; height: 58px; display: grid; place-items: center; border-radius: 50%; color: var(--color-primary-accent); font-size: 25px; background: radial-gradient(circle, rgba(255,255,255,.96) 38%, transparent 40%), conic-gradient(from 30deg, rgba(125,147,114,.18), rgba(125,147,114,.8), rgba(125,147,114,.15)); box-shadow: 0 0 0 7px rgba(125,147,114,.08); margin-bottom: 18px; }.welcome-title { font-size: 17px; }.preset-btn { border-radius: 12px; background: var(--color-bg-primary); text-align: left; }
.msg-avatar.ai-avatar { background: #e7eee3; color: var(--color-primary-accent); font-weight: 800; }.msg-avatar.user-avatar { background: #303431; color: white; font-size: 11px; }.chat-msg-row.user .chat-bubble { background: #303431; color: white; }.chat-msg-row.assistant .chat-bubble { background: var(--color-bg-primary); border: 1px solid var(--border-default); }.ai-capsule-input { border-radius: 20px; padding-left: 10px; background: var(--color-bg-primary); border: 1px solid var(--border-default); }.ai-input-plus { color: var(--text-muted); font-size: 19px; }.ai-input { background: transparent; }.ai-send-btn { border-radius: 50%; }
</style>
