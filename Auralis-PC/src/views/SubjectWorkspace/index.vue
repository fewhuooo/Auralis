<template>
  <div class="workspace-container">

    <!-- ===== TIER-1: Icon Strip (72px fixed) ===== -->
    <nav class="tier1-strip">
      <div class="tier1-top">
        <button class="tier1-btn" title="返回" @click="router.push('/subjects')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
          <span class="tier1-btn-text">返回</span>
        </button>
        <button
          class="tier1-btn"
          :class="{ 'is-active': tier2Open && tier2Mode === 'files' }"
          title="学习材料"
          @click="toggleTier2('files')"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span class="tier1-btn-text">材料</span>
        </button>
        <button
          class="tier1-btn"
          :class="{ 'is-active': tier2Open && tier2Mode === 'outline' }"
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
        <div class="subject-mini-icon" :title="activeSubject?.name">
          <ElIcon v-if="isSubjectIconKey(activeSubject?.icon) || !getLegacySubjectIcon(activeSubject?.icon)" :size="24">
            <component :is="getSubjectIconComponent(activeSubject?.icon)" />
          </ElIcon>
          <span v-else>{{ getLegacySubjectIcon(activeSubject?.icon) }}</span>
        </div>
      </div>
    </nav>

    <!-- ===== TIER-2: Expandable Drawer ===== -->
    <aside class="tier2-drawer" :class="{ 'is-open': tier2Open }" :style="{ width: tier2Open ? tier2Width + '%' : '0px' }">
      <!-- Files Mode -->
      <div v-if="tier2Mode === 'files'" class="drawer-content">
        <div class="drawer-header">
          <h3 class="drawer-title">学习文件</h3>
          <button class="drawer-action" @click="openRegisterModal" title="添加文件">+</button>
        </div>
        <div class="drawer-list" v-if="activeSourceFiles.length > 0">
          <div
            v-for="file in activeSourceFiles"
            :key="file.id"
            class="drawer-item"
            :class="{ 'is-active': selectedFileId === file.id }"
            @click="selectFile(file.id)"
          >
<span class="drawer-item-icon">{{ getFileIcon(file.fileType) }}</span>
            <div class="drawer-item-body">
              <span class="drawer-item-name">{{ file.name }}</span>
<span class="drawer-item-meta">{{ (file.fileSize / (1024 * 1024)).toFixed(1) }} MB</span>
            </div>
          </div>
        </div>
        <div class="drawer-empty" v-else>
          <span>暂无学习文件</span>
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
            <div class="composer-row">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span class="drag-handle" title="拖拽章节">⠿</span>
                <strong>{{ chapter.title }}</strong>
              </div>
              <button class="composer-link-btn" title="删除章节" @click.stop="deleteChapter(chapterIndex)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div class="composer-sections">
              <div v-for="(section, sectionIndex) in chapter.sections" :key="section.id" class="composer-section" draggable="true" @dragstart.stop="startSectionDrag(chapterIndex, sectionIndex)" @dragover.prevent @drop.stop="handleSectionDrop(chapterIndex, sectionIndex)">
                <div style="display: flex; gap: 10px; flex: 1;">
                  <span class="drag-handle">⠿</span>
                  <div class="composer-section-content">
                    <span class="composer-section-title">{{ section.title }}</span>
                    <div class="composer-section-file" v-if="section.fileId">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                      <span class="composer-section-file-name">{{ fileById(section.fileId)?.name || '未知文件' }}</span>
                      <button class="composer-unlink-btn" title="解除关联" @click.stop="unlinkFile(chapterIndex, sectionIndex)">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                    </div>
                  </div>
                </div>
                <div style="display: flex; gap: 6px; align-items: center;">
                <el-popover placement="bottom-end" trigger="click" width="280" popper-class="zen-popover" :hide-after="0">
                  <template #reference>
                    <button class="composer-link-btn" title="关联文件" @click.stop>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                    </button>
                  </template>
                  <div style="margin-bottom: 12px; font-size: 13px; font-weight: 700; color: var(--text-primary);">选择工作区文件</div>
                  <div class="subject-capsule-grid" v-if="activeSourceFiles.length">
                    <div
                      v-for="file in activeSourceFiles"
                      :key="file.id"
                      class="subject-capsule-item"
                      @click="handleLinkFile(chapterIndex, sectionIndex, file.id)"
                    >
                      <span class="subj-capsule-icon">📄</span>
                      <span class="subj-capsule-name">{{ file.name }}</span>
                    </div>
                  </div>
                  <div v-else style="padding: 12px 0; text-align: center; color: var(--text-muted); font-size: 12px;">
                    暂无学习文件，请先导入
                  </div>
                </el-popover>
                <button class="composer-link-btn" title="删除小节" @click.stop="deleteSection(chapterIndex, sectionIndex)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
            </div>
            <input v-model="chapterDrafts[chapter.id]" class="outline-inline-input" placeholder="输入小节后按 Enter" @keyup.enter="addSection(chapter.id)" />
          </div>
          </div>
          <input v-model="chapterDraft" class="outline-inline-input chapter-input" placeholder="输入新章节后按 Enter" @keyup.enter="addChapter" />
        </div>
        <div v-else class="outline-overview-list">
          <div v-for="chapter in subjectOutline" :key="chapter.id" class="outline-overview-chapter">
            <strong>{{ chapter.title }}</strong>
            <div v-for="section in chapter.sections" :key="section.id" class="outline-section-container">
              <div class="outline-section-title">{{ section.title }}</div>
              <button class="outline-file-link" v-if="section.fileId" @click="openOutlineFile(section.fileId)">
                <svg class="outline-file-link-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                <span class="outline-file-link-file">{{ fileById(section.fileId)?.name || '未知文件' }}</span>
              </button>
            </div>
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
          <span v-if="centerView === 'summary' && selectedFile" class="status-file">
            <FileText :size="14" class="status-icon" /> {{ selectedFile.name }} · 文件总结
          </span>
          <span v-else-if="centerView === 'blocks'" class="status-file">
            <Blocks :size="14" class="status-icon" /> 知识块 · {{ filteredBlocks.length }} 个知识块
          </span>
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
          <div class="file-summary-head">
<span class="file-summary-icon">{{ getFileIcon(selectedFile.fileType) }}</span>
            <div class="file-summary-head-text">
              <p>文件学习总结</p>
              <h2>{{ selectedFile.name }}</h2>
            </div>
          </div>
          <div class="summary-markdown" v-if="selectedFileBlocks.length" v-html="renderMarkdown(fileSummaryMarkdown)"></div>
          <div class="summary-empty" v-else>
            <div class="summary-empty-icon-wrap"><FileText :size="28" /></div>
            <h3>还没有可展示的总结</h3>
            <p>该材料关联的知识块会集中展示在这里；<br/>也可以直接让 AI 为当前文件整理重点概览。</p>
            <button class="summary-ask-ai" @click="sendPreset('请总结当前文件的核心内容，并按章节列出重点。')">让 AI 整理总结</button>
          </div>
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
              <div class="onboarding-emoji" style="margin-bottom: 12px; opacity: 0.3; color: var(--text-muted);">
                <Blocks :size="60" />
              </div>
              <h3 style="font-size: 16px; font-weight: 700; color: var(--text-primary);">知识库暂无内容</h3>
              <p style="font-size: 12px; color: var(--text-muted);">建议导入材料进行提炼，或者直接手动创建您的第一个知识卡片</p>
            </div>
            <div class="onboarding-grid" style="max-width: 640px; margin: 0 auto;">
              <div class="onboarding-card" @click="openCreateDialog">
                <div class="onboarding-card-icon">
                  <Plus :size="24" />
                </div>
                <div class="onboarding-card-body">
                  <h4>手动新建知识块</h4>
                  <p>手动录入笔记、重要定义或概念卡片，支持 Markdown 渲染。</p>
                  <button class="onboarding-card-btn">手动录入</button>
                </div>
              </div>
              <div class="onboarding-card" @click="tier2Mode = 'files'; tier2Open = true; centerView = 'overview'">
                <div class="onboarding-card-icon">
                  <FileText :size="24" />
                </div>
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
            <div class="onboarding-emoji">
              <ElIcon v-if="isSubjectIconKey(activeSubject?.icon) || !getLegacySubjectIcon(activeSubject?.icon)" :size="60">
                <component :is="getSubjectIconComponent(activeSubject?.icon)" />
              </ElIcon>
              <span v-else>{{ getLegacySubjectIcon(activeSubject?.icon) }}</span>
            </div>
            <h2 class="onboarding-title">欢迎来到 {{ activeSubject?.name }} 智能学习工作区</h2>
            <p class="onboarding-subtitle">{{ activeSubject?.description || '在这里，您可以轻松管理您的材料，使用 AI 进行章节大纲提取与核心概念提炼，打造您的专属记忆库。' }}</p>
          </div>

            <div class="onboarding-drag-capsule">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              <span>将 PDF 或图片文件拖入此处进行关联</span>
            </div>
        </div>

        <!-- Collapse Right Button -->
        <button class="edge-collapse edge-right" @click="rightCollapsed = !rightCollapsed" :title="rightCollapsed ? '展开 AI 助手' : '收起 AI 助手'">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline :points="rightCollapsed ? '15 18 9 12 15 6' : '9 18 15 12 9 6'"/></svg>
        </button>
      </div>
    </main>

    <!-- Splitter 2 -->
    <div class="resizer" v-show="!rightCollapsed" @mousedown="startResizeRight"></div>

    <!-- ===== RIGHT: AI Assistant ===== -->
    <aside class="workspace-right" :class="{ 'is-open': !rightCollapsed }" :style="{ width: !rightCollapsed ? rightWidth + '%' : '0px' }">
      <div class="ai-header">
        <button class="ai-model-switch" @click="showModelMenu = !showModelMenu">
          <span class="model-icon-top">{{ currentAiModeObj.icon }}</span>
          <span class="model-text">{{ currentAiModeObj.label }}</span>
          <svg class="chevron-icon" :class="{ 'is-rotated': showModelMenu }" width="10" height="7" viewBox="0 0 10 7" fill="none">
            <path d="M1 1L5 5.5L9 1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="dropdown-mask" v-if="showModelMenu" @click="showModelMenu = false" style="position: fixed; inset: 0; z-index: 3;"></div>
        <div v-if="showModelMenu" class="ai-model-menu" style="z-index: 4;">
          <div v-for="m in aiModesOptions" :key="m.id" class="mini-menu-item" @click="currentAiMode = m.label; showModelMenu = false">
            <span class="mini-menu-icon">{{ m.icon }}</span>
            <div class="mini-menu-text">
              <span class="mini-menu-label" :class="{ 'is-active': currentAiMode === m.label }">{{ m.label }}</span>
              <span class="mini-menu-desc">{{ m.desc }}</span>
            </div>
            <span v-if="currentAiMode === m.label" class="mini-check">✓</span>
          </div>
        </div>
        <button class="ai-clear" @click="clearChat" title="清空对话" aria-label="清空对话"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg></button>
      </div>

        <!-- Chat Flow -->
        <div class="ai-messages" ref="chatScrollRef">
          <div class="ai-welcome" v-if="chatMessages.length === 0">
          <div class="ai-spark-wrap" aria-hidden="true">
            <div class="ai-spark-ring" style="display: none;"></div>
            <svg class="ai-spark-svg" viewBox="0 0 52 52" fill="none">
              <path d="M26 4C26 4 27.8 16 32 20.5C36.2 25 48 26 48 26C48 26 36.2 27 32 31.5C27.8 36 26 48 26 48C26 48 24.2 36 20 31.5C15.8 27 4 26 4 26C4 26 15.8 25 20 20.5C24.2 16 26 4 26 4Z" fill="url(#workspace-ai-welcome-gradient)" />
              <defs><linearGradient id="workspace-ai-welcome-gradient" x1="4" y1="4" x2="48" y2="48"><stop stop-color="#7D9372" /><stop offset=".5" stop-color="#9AB08F" /><stop offset="1" stop-color="#5C7051" /></linearGradient></defs>
            </svg>
          </div>
          <p class="welcome-title">今天想探索点什么？</p>
          <p class="welcome-desc">{{ aiGreetingName }}，我会结合当前学科与文件，帮你梳理重点、解释概念并一起学习。</p>
          
          <div class="preset-section-title">试 试 问 我</div>
          
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
          <div class="assistant-spark-avatar" v-if="msg.role === 'assistant'" aria-hidden="true">
            <svg viewBox="0 0 52 52" fill="none">
              <path d="M26 4C26 4 27.8 16 32 20.5C36.2 25 48 26 48 26C48 26 36.2 27 32 31.5C27.8 36 26 48 26 48C26 48 24.2 36 20 31.5C15.8 27 4 26 4 26C4 26 15.8 25 20 20.5C24.2 16 26 4 26 4Z" fill="url(#workspace-ai-avatar-gradient)" />
              <defs><linearGradient id="workspace-ai-avatar-gradient" x1="4" y1="4" x2="48" y2="48"><stop stop-color="#7D9372" /><stop offset="1" stop-color="#5C7051" /></linearGradient></defs>
            </svg>
          </div>

          <div class="chat-bubble-wrapper">
            <div class="chat-bubble">
              <div class="chat-content" v-if="msg.role === 'user'">{{ msg.content }}</div>
              <div class="chat-content ai-reply" v-else v-html="renderMarkdown(msg.content)"></div>
            </div>
          </div>
        </div>

        <div class="chat-msg-row assistant" v-if="isAiStreaming">
          <div class="assistant-spark-avatar" aria-hidden="true">
            <svg viewBox="0 0 52 52" fill="none">
              <path d="M26 4C26 4 27.8 16 32 20.5C36.2 25 48 26 48 26C48 26 36.2 27 32 31.5C27.8 36 26 48 26 48C26 48 24.2 36 20 31.5C15.8 27 4 26 4 26C4 26 15.8 25 20 20.5C24.2 16 26 4 26 4Z" fill="url(#workspace-ai-stream-gradient)" />
              <defs><linearGradient id="workspace-ai-stream-gradient" x1="4" y1="4" x2="48" y2="48"><stop stop-color="#7D9372" /><stop offset="1" stop-color="#5C7051" /></linearGradient></defs>
            </svg>
          </div>
          <div class="chat-bubble-wrapper">
            <div class="chat-bubble">
              <div class="ai-typing-dots" v-if="!streamingContent" aria-label="AI 正在思考">
                <span class="ai-typing-dot"></span><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span>
              </div>
              <div class="chat-content ai-reply" v-else>
                <span v-html="renderMarkdown(streamingContent)"></span>
                <span class="typing-cursor"></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Input Box -->
      <div class="ai-input-area">
        <div class="ai-input-wrapper ai-chat-capsule">
          <textarea
            ref="chatInputRef"
            v-model="chatInput"
            class="ai-input"
            placeholder="问问 Auralis AI..."
            rows="1"
            @keydown.enter.exact.prevent="sendChat"
            @input="autoResizeInput"
          ></textarea>
          <button
            class="ai-send-btn"
            :class="{ 'is-ready': chatInput.trim() }"
            :disabled="!chatInput.trim() || isAiStreaming"
            @click="sendChat"
            title="发送消息"
            aria-label="发送消息"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></svg>
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
    <div class="modal-overlay" v-if="showRegisterModal" @click.self="showRegisterModal = false" style="display: flex; align-items: center; justify-content: center; z-index: 1000; position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px);">
      <div class="modal-container register-modal">
        <div class="modal-header">
          <h3>登记本地参考文件</h3>
          <button class="close-btn" @click="showRegisterModal = false">✕</button>
        </div>
        <div 
          class="modal-body" 
          @dragover.prevent="isDraggingFile = true"
          @dragleave.prevent="isDraggingFile = false"
          @drop.prevent="handleFileDrop"
        >
          <div class="drag-drop-zone" :class="{ 'is-active': isDraggingFile }" @click="triggerFileInput">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 8px; color: var(--text-muted);"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <div class="drag-text">拖拽文件到此处自动识别，或点击选择</div>
          </div>
          <input type="file" ref="hiddenFileInput" style="display: none" @change="handleFileSelect" />
          <div class="form-group"><label>文件名称 <span class="required" style="color: #ef4444; margin-left: 4px;">*</span></label><input v-model="registerForm.name" class="styled-input" placeholder="例如: 计算机网络.pdf" /></div>
          <div class="form-group"><label>归档至 <span class="required" style="color: #ef4444; margin-left: 4px;">*</span></label>
            <div class="subject-capsule-grid" style="margin-top: 4px; max-height: 120px; overflow-y: auto; padding: 2px;">
              <div
                v-for="subj in subjectStore.subjects"
                :key="subj.id"
                class="subject-capsule-item"
                :class="{ 'is-active': registerForm.subjectId === subj.id }"
                @click="registerForm.subjectId = subj.id"
              >
                <span class="subj-capsule-name">{{ subj.name }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer" style="justify-content: flex-end">
          <button class="btn-secondary" @click="showRegisterModal = false">取消</button>
          <button class="btn-primary" :disabled="!registerForm.name.trim()" @click="handleRegisterFile">确认登记</button>
        </div>
      </div>
    </div>

    <!-- Create Task Modal -->
    <div class="modal-overlay" v-if="showTaskModal" @click.self="showTaskModal = false" style="display: flex; align-items: center; justify-content: center; z-index: 1000; position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px);">
      <div class="modal-container">
        <div class="modal-header">
          <h3>创建学习任务</h3>
          <button class="close-btn" @click="showTaskModal = false">✕</button>
        </div>
        <div class="modal-body" style="display:flex; flex-direction:column; gap:14px;">
          <div class="form-group"><label>任务名称 <span class="required" style="color: #ef4444; margin-left: 4px;">*</span></label><input v-model="taskForm.name" class="styled-input" /></div>
          <div class="form-group"><label>预计时长</label><select v-model.number="taskForm.duration" class="styled-input"><option :value="30">0.5 小时 (30分钟)</option><option :value="60">1.0 小时 (60分钟)</option><option :value="90">1.5 小时 (90分钟)</option><option :value="120">2.0 小时 (120分钟)</option><option :value="150">2.5 小时 (150分钟)</option><option :value="180">3.0 小时 (180分钟)</option><option :value="240">4.0 小时 (240分钟)</option></select></div>
        </div>
        <div class="modal-footer" style="justify-content: flex-end">
          <button class="btn-secondary" @click="showTaskModal = false">取消</button>
          <button class="btn-primary" :disabled="!taskForm.name.trim()" @click="handleAddTask">加入排期</button>
        </div>
      </div>
    </div>

    <!-- Block Detail / Edit Modal -->
    <div class="modal-overlay" v-if="blockDialogVisible" @click.self="closeBlockDialog" style="display: flex; align-items: center; justify-content: center; z-index: 1000; position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px);">
      <div class="modal-container">
        <div class="modal-header">
          <div class="modal-tags" v-if="!isEditMode">
            <span class="modal-tag" :style="{ background: selectedBlock?.color || 'var(--border-subtle)' }">{{ selectedBlock?.subject }}</span>
            <span class="modal-source-tag">来源: {{ selectedBlock?.source }}</span>
          </div>
          <h3 v-else>{{ isCreateMode ? '录入新知识块' : '编辑知识内容' }}</h3>
          <button class="close-btn" @click="closeBlockDialog">✕</button>
        </div>
        <div class="modal-body" v-if="isEditMode" style="display:flex; flex-direction:column; gap:14px;">
          <div class="form-group"><label>标题 <span class="required" style="color: #ef4444; margin-left: 4px;">*</span></label><input v-model="editForm.title" class="styled-input" /></div>
          <div class="form-group"><label>色彩</label><div class="color-options"><span v-for="c in themeColors" :key="c.value" class="color-dot" :class="{ 'is-selected': editForm.color === c.value }" :style="{ background: c.value }" @click="editForm.color = c.value"></span></div></div>
          <div class="form-group"><label>内容 <span class="required" style="color: #ef4444; margin-left: 4px;">*</span></label><textarea v-model="editForm.preview" class="styled-textarea" rows="8" placeholder="支持 Markdown"></textarea></div>
        </div>
        <div class="modal-body" v-else>
          <div class="block-read-header">
            <h2 class="modal-title">{{ selectedBlock?.title }}</h2>
            <div class="modal-meta-row">
              <span class="modal-time-badge">
                <ElIcon style="margin-right:4px;"><Clock /></ElIcon>
                {{ selectedBlock?.time }}
              </span>
              <span class="modal-tag" :style="{ background: selectedBlock?.color || 'var(--color-bg-secondary)' }">{{ selectedBlock?.subject }}</span>
            </div>
          </div>
          <div class="modal-divider"></div>
          <div class="modal-content summary-markdown" v-html="renderMarkdown(selectedBlock?.content || selectedBlock?.preview || '')"></div>
        </div>
        <div class="modal-footer" :style="{ justifyContent: isEditMode ? 'flex-end' : 'space-between' }">
          <template v-if="isEditMode">
            <button class="btn-secondary" @click="cancelEdit">取消</button>
            <button class="btn-primary" @click="handleSaveBlock">{{ isCreateMode ? '创建' : '保存' }}</button>
          </template>
          <template v-else>
            <button class="btn-secondary" style="color: #ef4444; border-color: rgba(239,68,68,0.3);" @click="handleDeleteBlock(selectedBlock?.id)">删除</button>
            <div class="footer-right" style="display: flex; gap: 12px;">
              <button class="btn-secondary" @click="handleCopyBlockContent(selectedBlock?.preview)">复制</button>
              <button class="btn-secondary" @click="startEdit">编辑</button>
              <button class="btn-primary" @click="closeBlockDialog">确定</button>
            </div>
          </template>
        </div>
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
import { ElIcon, ElNotification, ElMessage } from 'element-plus'
import { Clock } from '@element-plus/icons-vue'
import { Blocks, Plus, FileText } from 'lucide-vue-next'
import 'element-plus/theme-chalk/el-notification.css'
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-select.css'
import 'element-plus/theme-chalk/el-option.css'

import { useKnowledgeStore } from '@/store/useKnowledgeStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useAssetStore } from '@/store/useAssetStore'
import { useSourceStore } from '@/store/useSourceStore'
import { useChatStore } from '@/store/useChatStore'
import { getLegacySubjectIcon, getSubjectIconComponent, isSubjectIconKey } from '@/utils/subjectIcon'

marked.setOptions({ breaks: true, gfm: true })
const renderMarkdown = (c: string) => c ? DOMPurify.sanitize(marked.parse(c) as string) : ''

const route = useRoute()
const router = useRouter()
const blockStore = useKnowledgeStore()
const { recentBlocks } = storeToRefs(blockStore)
const authStore = useAuthStore()
const subjectStore = useSubjectStore()
const assetStore = useAssetStore()
const sourceStore = useSourceStore()
const chatStore = useChatStore()
const { activeSubject, activeSourceFiles } = storeToRefs(subjectStore)
const { messages: storedChatMessages, isStreaming: storedChatStreaming, streamingContent: storedStreamingContent } = storeToRefs(chatStore)
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
const deleteChapter = (chapterIndex: number) => {
  subjectOutline.value.splice(chapterIndex, 1)
}
const deleteSection = (chapterIndex: number, sectionIndex: number) => {
  subjectOutline.value[chapterIndex].sections.splice(sectionIndex, 1)
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



const handleLinkFile = (chapterIndex: number, sectionIndex: number, fileId: string) => {
  if (fileId) {
    subjectOutline.value[chapterIndex].sections[sectionIndex].fileId = fileId
    ElMessage.success('已关联文件')
  }
  document.body.click() // close popover
}

const unlinkFile = (chapterIndex: number, sectionIndex: number) => {
  delete subjectOutline.value[chapterIndex].sections[sectionIndex].fileId
  ElMessage.success('已解除关联')
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
const registerForm = ref({ name: '', filePath: '', fileType: 'PDF', fileSize: 0, subjectId: '' })
const isDraggingFile = ref(false)
const hiddenFileInput = ref<HTMLInputElement | null>(null)
const droppedFile = ref<File | null>(null)

const openRegisterModal = () => {
  registerForm.value = { name: '', filePath: '', fileType: 'PDF', fileSize: 0, subjectId: subjectId.value || '' }
  droppedFile.value = null
  isDraggingFile.value = false
  showRegisterModal.value = true
}

const parseFileMetadata = (file: File & { path?: string }) => {
  droppedFile.value = file
  registerForm.value.name = file.name
  if (file.path) registerForm.value.filePath = file.path
  else registerForm.value.filePath = file.name
  registerForm.value.fileSize = Number((file.size / (1024 * 1024)).toFixed(2))
  
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (ext === 'pdf') registerForm.value.fileType = 'PDF'
  else if (ext === 'md') registerForm.value.fileType = 'Markdown'
  else if (['ppt', 'pptx'].includes(ext)) registerForm.value.fileType = 'PPT'
  else if (['doc', 'docx'].includes(ext)) registerForm.value.fileType = 'Word'
  else registerForm.value.fileType = 'Other'
}

const handleFileDrop = (e: DragEvent) => {
  isDraggingFile.value = false
  const file = e.dataTransfer?.files[0] as (File & { path?: string }) | undefined
  if (file) parseFileMetadata(file)
}

const handleFileSelect = (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0] as (File & { path?: string }) | undefined
  if (file) parseFileMetadata(file)
  if (hiddenFileInput.value) hiddenFileInput.value.value = ''
}

const triggerFileInput = () => hiddenFileInput.value?.click()

const handleRegisterFile = async () => {
  const targetSubjectId = registerForm.value.subjectId
  if (!registerForm.value.name.trim() || !targetSubjectId || !droppedFile.value) return
  
  const currentFile = droppedFile.value
  
  try {
    const asset = await assetStore.upload(currentFile)
    const newId = await sourceStore.createFileSource(targetSubjectId, registerForm.value.name.trim(), asset.id)
    
    if (targetSubjectId === subjectId.value && !selectedFileId.value) {
      selectedFileId.value = newId
    }
    
    showRegisterModal.value = false
    registerForm.value = { name: '', filePath: '', fileType: 'PDF', fileSize: 0, subjectId: '' }
    droppedFile.value = null
    ElNotification({ title: '云端录入成功', message: currentFile.name, type: 'success', position: 'top-right' })
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
  if (!editForm.value.title.trim() || !editForm.value.preview.trim()) { ElNotification({ title: '请填写必填项', type: 'warning', position: 'top-right' }); return }
  if (isCreateMode.value) { await blockStore.addBlock({ subject: editForm.value.subject, title: editForm.value.title, preview: editForm.value.preview, time: new Date().toLocaleString(), source: editForm.value.source, color: editForm.value.color, subjectId: subjectId.value, sourceFileId: selectedFileId.value || undefined }); ElNotification({ title: '已录入', type: 'success', position: 'top-right' }) }
  else { await blockStore.updateBlock({ ...selectedBlock.value, subject: editForm.value.subject, title: editForm.value.title, preview: editForm.value.preview, color: editForm.value.color, time: new Date().toLocaleString() }); ElNotification({ title: '已更新', type: 'success', position: 'top-right' }) }
  closeBlockDialog()
}

const handleDeleteBlock = async (id: string) => { if (!id || !confirm('确定删除？')) return; await blockStore.removeBlock(id); blockDialogVisible.value = false; ElNotification({ title: '已删除', type: 'success', position: 'top-right' }) }
const handleCopyBlockContent = (c: string) => { if (c) { navigator.clipboard.writeText(c); ElNotification({ title: '已复制', type: 'success', position: 'top-right', duration: 2000 }) } }
const presetQuestions = [
  '总结当前文件的核心概念',
  '查找本章的关键定义与解释',
  '针对当前内容生成 3 道测试题'
]

const sendPreset = (q: string) => {
  chatInput.value = q
  sendChat()
}



// ===== AI Chat (Right Panel) =====
interface ChatMsg { role: 'user' | 'assistant'; content: string }
const chatMessages = computed<ChatMsg[]>(() => storedChatMessages.value
  .filter((message) => message.role === 'USER' || message.role === 'ASSISTANT')
  .map((message) => ({ role: message.role === 'USER' ? 'user' : 'assistant', content: message.content })))
const chatInput = ref('')
const isAiStreaming = computed(() => storedChatStreaming.value)
const streamingContent = computed(() => storedStreamingContent.value)
const chatScrollRef = ref<HTMLElement | null>(null)
const chatInputRef = ref<HTMLTextAreaElement | null>(null)
const aiModesOptions = [
  { id: 1, icon: '✦', label: '学习伴读', desc: '深度严谨，为你推演难题' },
  { id: 2, icon: '◈', label: '重点梳理', desc: '全科架构概览与核心提炼' },
  { id: 3, icon: '✧', label: '练习出题', desc: '知识巩固与测试检验' }
]
const currentAiMode = ref(aiModesOptions[0].label)
const currentAiModeObj = computed(() => aiModesOptions.find(m => m.label === currentAiMode.value) || aiModesOptions[0])
const showModelMenu = ref(false)
const aiGreetingName = computed(() => authStore.username || '同学')

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
  chatInput.value = ''
  autoResizeInput()
  scrollChatToBottom()
  try {
    const context = selectedFile.value ? `当前文件: ${selectedFile.value.name}` : `学科: ${activeSubject.value?.name || ''}`
    await chatStore.sendMessage(msg, { subjectId: subjectId.value, context })
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      ElNotification({ title: 'AI 请求失败', message: error instanceof Error ? error.message : '请稍后重试', type: 'error', position: 'top-right' })
    }
  } finally {
    scrollChatToBottom()
  }
}

const clearChat = () => { chatStore.clearActiveConversation() }

// ===== Lifecycle =====
onMounted(async () => {
  try {
    const sessions = await chatStore.loadSessions()
    if (sessions.length === 0) await chatStore.startNewSession('学科伴读')
    else if (chatStore.activeSessionId) await chatStore.loadMessages(chatStore.activeSessionId)
  } catch {
    // The workspace remains usable when chat is unavailable.
  }
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

onUnmounted(() => { chatStore.abortStream() })
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
  background: #7D9372;
  color: #fff;
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
  border: 1.5px solid transparent;
  border-radius: 50%;
  background: var(--color-bg-secondary);
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.drawer-action:hover { 
  border-color: rgba(125, 147, 114, 0.3); 
  color: #7D9372; 
  background: rgba(125, 147, 114, 0.1); 
  transform: translateY(-1px); 
}

html.dark .drawer-action:hover {
  background: rgba(154, 176, 143, 0.15);
  border-color: rgba(154, 176, 143, 0.3);
  color: #9AB08F;
}

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
.status-file { font-size: 13.5px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
.status-icon { color: var(--text-muted); opacity: 0.7; }
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
  scrollbar-width: none;
  -ms-overflow-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 20px;
  align-content: start;
}
.blocks-grid::-webkit-scrollbar { display: none; }

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
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 20px;
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

.onboarding-drag-capsule {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 32px;
  padding: 12px 24px;
  border-radius: 999px;
  background: rgba(125,147,114,0.06);
  color: #7D9372;
  font-size: 14px;
  font-weight: 600;
  border: 1px dashed rgba(125,147,114,0.3);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.onboarding-drag-capsule:hover {
  background: rgba(125,147,114,0.12);
  border-color: rgba(125,147,114,0.5);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(125,147,114,0.1);
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

.workspace-right:not(.is-open) {
  width: 0 !important;
  opacity: 0;
  border-width: 0;
  pointer-events: none;
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

/* Legacy Chat Welcome Prompts Removed (Now at bottom) */

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
  background: #303431;
  color: white;
  border-radius: 14px 2px 14px 14px;
}

.chat-msg-row.assistant .chat-bubble {
  background: var(--color-bg-primary);
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: var(--text-primary);
  border-radius: 2px 14px 14px 14px;
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

.modal-tags { display: flex; align-items: center; gap: 8px; }
.modal-tag { font-size: 11px; padding: 4px 12px; border-radius: 999px; color: var(--text-primary); font-weight: 600; border: 1px solid var(--border-default); box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
.modal-source-tag { font-size: 11.5px; color: var(--text-muted); font-weight: 500; }
.block-read-header { display: flex; flex-direction: column; gap: 12px; }
.modal-title { font-size: 22px; font-weight: 800; color: var(--text-primary); margin: 0; letter-spacing: -0.5px; line-height: 1.3; }
.modal-meta-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.modal-time-badge { display: inline-flex; align-items: center; font-size: 11.5px; font-weight: 600; color: var(--text-secondary); background: var(--color-bg-secondary); padding: 4px 12px; border-radius: 999px; border: 1px solid var(--border-default); }
.modal-divider { height: 1px; background: linear-gradient(90deg, transparent, var(--border-subtle) 15%, var(--border-subtle) 85%, transparent); margin: 20px 0; border: none; }
.modal-content { font-size: 14.5px; color: var(--text-secondary); line-height: 1.8; }

.color-options { display: flex; gap: 8px; }
.color-dot { width: 22px; height: 22px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: all var(--transition-fast); }
.color-dot:hover { transform: scale(1.1); }
.color-dot.is-selected { border-color: var(--text-primary); transform: scale(1.15); }

/* ===== Subject summary & outline prototype ===== */
.outline-header-actions { display: flex; align-items: center; gap: 8px; }
.outline-ai-button { border: 0; border-radius: 7px; padding: 6px 9px; background: var(--color-primary-light); color: var(--color-primary-accent); font-size: 11px; font-weight: 700; cursor: pointer; }
.outline-add-button { width: 27px; height: 27px; border: 0; border-radius: 50%; background: var(--btn-primary-bg, linear-gradient(135deg, #A3B19B 0%, #7D9372 100%)); color: white; font-size: 19px; line-height: 1; cursor: pointer; }
.outline-composer, .outline-overview-list { padding: 0 12px 14px; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
.outline-composer::-webkit-scrollbar, .outline-overview-list::-webkit-scrollbar { display: none; }
.outline-composer-tip { margin: 0 0 16px; color: var(--text-muted); font-size: 12px; display: flex; align-items: center; gap: 6px; }
.outline-composer-tip::before { content: ''; display: inline-block; width: 4px; height: 4px; border-radius: 50%; background: #7D9372; }
.composer-chapter { margin-bottom: 12px; border: 1px solid transparent; border-radius: 12px; background: rgba(0,0,0,0.02); transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
.composer-chapter:hover { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.05); }
.composer-row, .composer-section { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; font-size: 13px; transition: all 0.2s; }
.composer-row { border-bottom: 1px solid rgba(0,0,0,0.03); }
.composer-row:hover .composer-link-btn { opacity: 1; }
.composer-sections { padding: 6px 10px 10px 32px; display: flex; flex-direction: column; gap: 4px; }
.composer-section { border-radius: 8px; color: var(--text-secondary); padding: 8px 12px; justify-content: space-between; align-items: flex-start; }
.composer-section:hover { background: rgba(125,147,114,0.08); color: var(--text-primary); }
.composer-section-content { flex: 1; display: flex; flex-direction: column; gap: 6px; overflow: hidden; }
.composer-section-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 24px; }
.composer-section-file { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: #7D9372; background: rgba(125,147,114,0.1); padding: 4px 8px 4px 10px; border-radius: 6px; width: fit-content; max-width: 100%; border: 1px solid rgba(125,147,114,0.15); }
.composer-section-file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.composer-unlink-btn { background: transparent; border: none; padding: 2px; margin-left: 2px; cursor: pointer; color: inherit; opacity: 0.5; display: flex; border-radius: 4px; transition: all 0.2s; }
.composer-unlink-btn:hover { opacity: 1; background: rgba(0,0,0,0.08); }
.composer-link-btn { width: 24px; height: 24px; margin-top: 0px; border: none; border-radius: 6px; background: rgba(0,0,0,0.04); color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; opacity: 0; padding: 0; }
.composer-section:hover .composer-link-btn { opacity: 1; }
.composer-link-btn:hover { background: #7D9372; color: #fff; transform: scale(1.05); }
.drag-handle { color: var(--text-muted); cursor: grab; font-size: 14px; opacity: 0.3; transition: opacity 0.2s; user-select: none; }
.composer-row:hover .drag-handle, .composer-section:hover .drag-handle { opacity: 0.8; }
.outline-inline-input { width: 100%; box-sizing: border-box; border: 1px solid transparent; border-radius: 8px; padding: 8px 12px; background: rgba(0,0,0,0.04); color: var(--text-primary); outline: none; font-size: 12.5px; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
.outline-inline-input:focus { background: #ffffff; border-color: rgba(125,147,114,0.3); box-shadow: 0 4px 12px rgba(125,147,114,0.08); }
.outline-inline-input::placeholder { color: var(--text-muted); transition: color 0.2s; }
.outline-inline-input:focus::placeholder { color: transparent; }
.chapter-input { margin-top: 8px; padding: 10px 14px; font-size: 13px; background: rgba(0,0,0,0.03); border-radius: 10px; }

.outline-overview-chapter { display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; }
.outline-overview-chapter strong { position: relative; color: var(--text-primary); font-size: 13.5px; font-weight: 700; padding: 0 0 8px 12px; margin-bottom: 4px; border-bottom: 1px solid rgba(0,0,0,0.04); display: flex; align-items: center; }
.outline-overview-chapter strong::before { content: ''; position: absolute; left: 0; top: 8px; width: 4px; height: 12px; border-radius: 4px; background: #7D9372; }
.outline-section-container { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.outline-section-title { font-size: 13px; font-weight: 600; color: var(--text-secondary); padding-left: 12px; position: relative; display: flex; align-items: center; }
.outline-section-title::before { content: ''; position: absolute; left: 2px; top: 50%; transform: translateY(-50%); width: 4px; height: 4px; border-radius: 50%; background: rgba(0,0,0,0.15); }
.outline-file-link { margin-left: 12px; padding: 10px 12px; border: 1px solid transparent; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-size: 12.5px; background: rgba(0,0,0,0.02); color: var(--text-primary); cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); text-align: left; }
.outline-file-link:hover { background: rgba(125,147,114,0.08); border-color: rgba(125,147,114,0.15); transform: translateX(2px); color: #7D9372; }
.outline-file-link-icon { opacity: 0.7; }
.outline-file-link-file { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; }
.file-summary-workspace { width: min(780px, 100%); margin: 0 auto; padding: 56px 64px; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
.file-summary-workspace::-webkit-scrollbar { display: none; }
.file-summary-head { display: flex; align-items: flex-start; gap: 20px; padding-bottom: 24px; margin-bottom: 32px; border-bottom: 1px solid rgba(0,0,0,0.04); }
.file-summary-head-text { flex: 1; }
.file-summary-head p { margin: 0 0 6px; color: var(--text-muted); font-size: 12.5px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; }
.file-summary-head h2 { margin: 0; font-size: 28px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.5px; line-height: 1.3; }
.file-summary-icon { font-size: 38px; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.06)); }

.summary-markdown { color: var(--text-secondary); line-height: 1.85; font-size: 14.5px; word-break: break-word; }
.summary-markdown :deep(h1), .summary-markdown :deep(h2), .summary-markdown :deep(h3), .summary-markdown :deep(h4) { color: var(--text-primary); font-weight: 700; margin: 1.5em 0 0.5em; line-height: 1.3; }
.summary-markdown :deep(h1) { font-size: 1.5em; border-bottom: 1px solid var(--border-default); padding-bottom: 0.3em; }
.summary-markdown :deep(h2) { font-size: 1.25em; margin: 2em 0 1em; padding-bottom: 8px; border-bottom: 1px solid rgba(0,0,0,0.04); }
.summary-markdown :deep(h3) { font-size: 1.1em; margin: 1.5em 0 1em; }
.summary-markdown :deep(p) { margin-bottom: 16px; }
.summary-markdown :deep(ul), .summary-markdown :deep(ol) { margin: 0 0 16px 0; padding-left: 24px; }
.summary-markdown :deep(li) { margin-bottom: 6px; }
.summary-markdown :deep(li::marker) { color: var(--text-muted); }
.summary-markdown :deep(blockquote) { margin: 0 0 16px; padding: 12px 16px; border-left: 3px solid #7D9372; background: rgba(125, 147, 114, 0.05); border-radius: 0 8px 8px 0; color: var(--text-muted); font-style: italic; }
.summary-markdown :deep(pre) { background: #1C1C1A; padding: 16px; border-radius: 12px; overflow-x: auto; margin-bottom: 16px; border: 1px solid rgba(0,0,0,0.1); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
.summary-markdown :deep(code) { font-family: var(--font-family-mono); font-size: 13px; background: rgba(0,0,0,0.04); padding: 3px 6px; border-radius: 6px; color: #7D9372; font-weight: 500; }
.summary-markdown :deep(pre code) { background: transparent; padding: 0; color: #E6E6E4; font-weight: 400; font-size: 13.5px; }
.summary-markdown :deep(a) { color: #7D9372; text-decoration: none; border-bottom: 1px solid transparent; transition: all 0.2s; }
.summary-markdown :deep(a:hover) { border-bottom-color: #7D9372; }
.summary-markdown :deep(img) { max-width: 100%; border-radius: 12px; margin: 16px 0; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
.summary-markdown :deep(table) { width: 100%; border-collapse: collapse; margin-bottom: 16px; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.02); }
.summary-markdown :deep(th), .summary-markdown :deep(td) { padding: 10px 14px; border: 1px solid var(--border-subtle); text-align: left; }
.summary-markdown :deep(th) { background: rgba(0,0,0,0.02); font-weight: 600; color: var(--text-primary); }

.summary-empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 100px 15%; color: var(--text-secondary); animation: ai-fade-in 0.6s ease-out; }
.summary-empty-icon-wrap { width: 64px; height: 64px; border-radius: 20px; background: rgba(125,147,114,0.08); display: grid; place-items: center; margin-bottom: 20px; color: #7D9372; font-size: 28px; box-shadow: 0 8px 24px rgba(125,147,114,0.06); }
.summary-empty h3 { color: var(--text-primary); margin: 0 0 8px; font-size: 18px; font-weight: 700; }
.summary-empty p { font-size: 14px; line-height: 1.6; color: var(--text-muted); margin-bottom: 24px; max-width: 320px; }
.summary-ask-ai { padding: 12px 28px; border: 0; border-radius: 999px; background: var(--btn-primary-bg, linear-gradient(135deg, #A3B19B 0%, #7D9372 100%)); color: #ffffff; font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 4px 16px rgba(125,147,114,0.2); }
.summary-ask-ai:hover { background: #6c8062; transform: translateY(-1px); box-shadow: 0 6px 20px rgba(125,147,114,0.3); }

html.dark .file-summary-head { border-color: rgba(255,255,255,0.04); }
html.dark .summary-markdown :deep(h2) { border-color: rgba(255,255,255,0.04); }
html.dark .summary-empty-icon-wrap { background: rgba(255,255,255,0.05); color: #9AB08F; }

/* ===== Refined Zen Minimalist AI Visual Language (PC) ===== */
.ai-header { position: relative; justify-content: space-between; background: transparent; backdrop-filter: blur(12px); border-bottom: none; z-index: 10; padding: 24px 20px 12px; }
.ai-model-switch { display: flex; align-items: center; gap: 6px; border: none; background: rgba(0,0,0,0.04); color: var(--text-secondary); font-weight: 600; cursor: pointer; padding: 8px 16px; border-radius: 999px; transition: all 0.2s; font-size: 13px; }
.ai-model-switch:hover { background: rgba(0,0,0,0.08); color: var(--text-primary); }
.model-icon-top { font-size: 14px; color: #7D9372; }
.model-text { font-size: 13.5px; font-weight: 600; color: var(--text-primary); }
.chevron-icon { transition: transform 0.2s; opacity: 0.6; }
.chevron-icon.is-rotated { transform: rotate(180deg); opacity: 1; }
.ai-model-menu { position: absolute; top: 72px; left: 20px; z-index: 4; min-width: 200px; padding: 8px; background: rgba(255,255,255,0.95); backdrop-filter: blur(12px); border: 1px solid rgba(0,0,0,0.08); border-radius: 16px; box-shadow: 0 12px 32px rgba(0,0,0,0.1); display: flex; flex-direction: column; gap: 4px; }
.mini-menu-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; cursor: pointer; transition: background 0.2s; }
.mini-menu-item:hover { background: rgba(125,147,114,0.08); }
.mini-menu-icon { font-size: 16px; color: #7D9372; display: flex; align-items: center; justify-content: center; width: 24px; }
.mini-menu-text { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.mini-menu-label { font-size: 13.5px; font-weight: 600; color: var(--text-primary); line-height: 1.2; }
.mini-menu-label.is-active { color: #7D9372; }
.mini-menu-desc { font-size: 11.5px; color: var(--text-muted); line-height: 1.2; }
.mini-check { color: #7D9372; font-weight: bold; font-size: 14px; margin-left: auto; padding-right: 4px; }
.ai-clear { width: 34px; height: 34px; display: grid; place-items: center; padding: 0; font-size: 0; border-radius: 50%; border: none; background: rgba(0,0,0,0.04); transition: all 0.2s; color: var(--text-secondary); cursor: pointer; }
.ai-clear svg { stroke: currentColor; }
.ai-clear:hover { background: rgba(0,0,0,0.08); color: var(--text-primary); }

.ai-welcome { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 0 24px; animation: ai-fade-in 0.6s ease-out; }
.ai-spark-wrap { position: relative; width: 56px; height: 56px; display: grid; place-items: center; margin-bottom: 20px; }
.ai-spark-svg { width: 56px; height: 56px; opacity: 0.95; filter: drop-shadow(0 4px 12px rgba(125, 147, 114, 0.15)); }
.welcome-title { font-size: 24px; font-weight: 800; background: linear-gradient(135deg, var(--text-primary), #5C7051); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 10px; letter-spacing: -0.2px; }
.welcome-desc { font-size: 13.5px; font-weight: 400; color: var(--text-secondary); margin-bottom: 40px; max-width: 260px; line-height: 1.6; opacity: 0.85; }
.preset-section-title { display: flex; align-items: center; width: 100%; max-width: 240px; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 16px; letter-spacing: 2px; text-transform: uppercase; opacity: 0.6; }
.preset-section-title::before, .preset-section-title::after { content: ''; flex: 1; height: 1px; background: rgba(0,0,0,0.1); }
.preset-section-title::before { margin-right: 12px; }
.preset-section-title::after { margin-left: 12px; }
.preset-questions { display: flex; flex-direction: column; align-items: stretch; gap: 10px; margin-top: 12px; width: 100%; max-width: 280px; }
.preset-btn { width: 100%; border-radius: 999px; padding: 10px 18px; background: rgba(255,255,255,0.8); backdrop-filter: blur(8px); border: 1px solid rgba(0,0,0,0.08); text-align: center; font-size: 13px; color: var(--text-primary); font-weight: 500; transition: all 0.2s; box-shadow: 0 2px 8px rgba(0,0,0,0.02); cursor: pointer; }
.preset-btn:hover { border-color: #7D9372; background: rgba(125, 147, 114, 0.08); box-shadow: 0 4px 12px rgba(125, 147, 114, 0.15); color: #5C7051; transform: translateY(-1px); }

.assistant-spark-avatar { width: 34px; height: 34px; border: 1px solid rgba(0,0,0,0.06); border-radius: 50%; display: grid; place-items: center; background: #ffffff; flex: 0 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.02); }
.assistant-spark-avatar svg { width: 20px; height: 20px; }
.chat-msg-row.user .chat-bubble { background: var(--text-primary); color: var(--color-bg-primary); border-radius: 16px 4px 16px 16px; padding: 12px 18px; font-size: 14.5px; line-height: 1.6; box-shadow: 0 4px 16px rgba(0,0,0,0.04); }
.chat-msg-row.assistant .chat-bubble { background: #ffffff; border: 1px solid rgba(0,0,0,0.06); border-radius: 4px 16px 16px 16px; padding: 12px 18px; font-size: 14.5px; line-height: 1.6; color: var(--text-primary); box-shadow: 0 4px 16px rgba(0,0,0,0.02); }

.ai-input-area { padding: 16px 20px 24px; background: transparent; backdrop-filter: blur(12px); border-top: none; width: 100%; box-sizing: border-box; }
.ai-chat-capsule { display: flex; align-items: flex-end; width: 100%; box-sizing: border-box; min-height: 52px; border-radius: 26px; padding: 6px 6px 6px 18px; gap: 10px; background: rgba(255,255,255,0.9); backdrop-filter: blur(8px); border: 1px solid rgba(0,0,0,0.08); box-shadow: 0 4px 16px rgba(0,0,0,0.03); transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.ai-chat-capsule:focus-within { border-color: rgba(125,147,114,0.3); box-shadow: 0 6px 24px rgba(125,147,114,0.08); transform: translateY(-1px); }
.ai-input { flex: 1; background: transparent; font-size: 14.5px; line-height: 1.5; padding: 6px 0; color: var(--text-primary); border: none; outline: none; resize: none; overflow-y: auto; }
.ai-input::placeholder { color: var(--text-muted); }
.ai-send-btn { width: 38px; height: 38px; border-radius: 50%; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); flex-shrink: 0; background: transparent; color: var(--text-muted); }
.ai-send-btn.is-ready { background: var(--btn-primary-bg, linear-gradient(135deg, #A3B19B 0%, #7D9372 100%)); color: #fff; box-shadow: 0 4px 12px rgba(125, 147, 114, 0.25); }
.ai-send-btn.is-ready:hover { transform: scale(1.05); background: #6c8062; box-shadow: 0 6px 16px rgba(125, 147, 114, 0.3); }

.ai-typing-dots { display: flex; align-items: center; gap: 6px; min-height: 24px; padding: 4px 6px; }
.ai-typing-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); animation: ai-dot-bounce 1.4s ease-in-out infinite both; }
.ai-typing-dot:nth-child(1) { animation-delay: -.32s; }
.ai-typing-dot:nth-child(2) { animation-delay: -.16s; }


html.dark .ai-header, html.dark .ai-model-menu, html.dark .ai-chat-capsule, html.dark .assistant-spark-avatar, html.dark .chat-msg-row.assistant .chat-bubble { background: #1C1C1C; border-color: rgba(255,255,255,0.08); }
html.dark .preset-btn { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.06); color: var(--text-secondary); }
html.dark .preset-btn:hover { background: rgba(125, 147, 114, 0.15); border-color: #7D9372; color: #9AB08F; }
html.dark .welcome-title { background: linear-gradient(135deg, #ffffff, #9AB08F); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
html.dark .preset-section-title::before, html.dark .preset-section-title::after { background: rgba(255,255,255,0.1); }

html.dark .outline-overview-chapter strong { border-color: rgba(255,255,255,0.04); }
html.dark .outline-section-title::before { background: rgba(255,255,255,0.15); }
html.dark .outline-file-link { background: rgba(255,255,255,0.02); }
html.dark .outline-file-link:hover { background: rgba(125,147,114,0.15); border-color: rgba(125,147,114,0.25); }
html.dark .composer-chapter { background: rgba(255,255,255,0.02); }
html.dark .composer-chapter:hover { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.06); }
html.dark .composer-row { border-color: rgba(255,255,255,0.04); }
html.dark .composer-link-btn { background: rgba(255,255,255,0.05); }
html.dark .composer-section-file { background: rgba(125,147,114,0.15); border-color: rgba(125,147,114,0.25); color: #9AB08F; }
html.dark .composer-unlink-btn:hover { background: rgba(255,255,255,0.1); }
html.dark .outline-inline-input { background: rgba(255,255,255,0.05); }
html.dark .outline-inline-input:focus { background: #1C1C1C; border-color: rgba(125, 147, 114, 0.4); box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
html.dark .chapter-input { background: rgba(255,255,255,0.03); }
html.dark .onboarding-drag-capsule { background: rgba(125,147,114,0.1); border-color: rgba(125,147,114,0.3); color: #9AB08F; }
html.dark .onboarding-drag-capsule:hover { background: rgba(125,147,114,0.2); border-color: rgba(125,147,114,0.5); }

/* Custom Zen Dropdown (Unified for el-dropdown & el-select) */
.zen-dropdown,
.zen-dropdown.el-popper { border-radius: 14px !important; padding: 4px !important; background: rgba(255,255,255,0.85) !important; backdrop-filter: blur(12px) !important; -webkit-backdrop-filter: blur(12px) !important; border: 1px solid rgba(0,0,0,0.06) !important; box-shadow: 0 12px 32px rgba(0,0,0,0.12) !important; overflow: hidden !important; }
.zen-dropdown .el-popper__arrow { display: none !important; }
.zen-dropdown .el-select-dropdown { background: transparent !important; border: none !important; box-shadow: none !important; border-radius: 14px !important; }
.zen-dropdown .el-select-dropdown__list,
.zen-dropdown .el-dropdown-menu { padding: 2px !important; background: transparent !important; border: none !important; }
.zen-dropdown .el-dropdown-menu__item,
.zen-dropdown .el-select-dropdown__item { border-radius: 8px !important; margin: 2px !important; font-size: 13px !important; color: var(--text-primary) !important; transition: all 0.2s !important; padding: 8px 12px !important; line-height: 1.4 !important; height: auto !important; }
.zen-dropdown .el-dropdown-menu__item:hover,
.zen-dropdown .el-select-dropdown__item.is-hovering,
.zen-dropdown .el-select-dropdown__item:hover { background: rgba(125,147,114,0.1) !important; color: #7D9372 !important; }
.zen-dropdown .el-select-dropdown__item.selected,
.zen-dropdown .el-select-dropdown__item.is-selected { background: rgba(125,147,114,0.15) !important; color: #7D9372 !important; font-weight: 700 !important; }
.zen-dropdown .el-dropdown-menu__item.is-disabled,
.zen-dropdown .el-select-dropdown__item.is-disabled { opacity: 0.5 !important; background: transparent !important; color: var(--text-muted) !important; cursor: not-allowed !important; }
.zen-dropdown .el-dropdown-menu__item--divided { border-top: none !important; margin-top: 6px !important; position: relative; }
.zen-dropdown .el-dropdown-menu__item--divided::before { content: ''; position: absolute; top: -4px; left: 8px; right: 8px; height: 1px; background-color: rgba(0,0,0,0.06) !important; margin: 0 !important; }

html.dark .zen-dropdown,
html.dark .zen-dropdown.el-popper { background: rgba(30,30,30,0.85) !important; border-color: rgba(255,255,255,0.05) !important; box-shadow: 0 12px 32px rgba(0,0,0,0.4) !important; }
html.dark .zen-dropdown .el-dropdown-menu__item:hover,
html.dark .zen-dropdown .el-select-dropdown__item.is-hovering,
html.dark .zen-dropdown .el-select-dropdown__item:hover { background: rgba(125,147,114,0.2) !important; color: #9AB08F !important; }
html.dark .zen-dropdown .el-select-dropdown__item.selected,
html.dark .zen-dropdown .el-select-dropdown__item.is-selected { background: rgba(125,147,114,0.25) !important; color: #9AB08F !important; }
html.dark .zen-dropdown .el-dropdown-menu__item--divided::before { background-color: rgba(255,255,255,0.08) !important; }

/* ===== 关联文件气泡弹窗 (借鉴移动端卡片化胶囊设计) ===== */
.zen-popover { border-radius: 14px !important; padding: 16px !important; background: rgba(255,255,255,0.85) !important; backdrop-filter: blur(12px) !important; -webkit-backdrop-filter: blur(12px) !important; border: 1px solid rgba(0,0,0,0.05) !important; box-shadow: 0 12px 32px rgba(0,0,0,0.1) !important; }
html.dark .zen-popover { background: rgba(30,30,30,0.85) !important; border-color: rgba(255,255,255,0.05) !important; box-shadow: 0 12px 32px rgba(0,0,0,0.4) !important; }
.subject-capsule-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.subject-capsule-item { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; background: var(--color-bg-secondary); border: 1.5px solid transparent; border-radius: 9999px; font-size: 13px; font-weight: 600; color: var(--text-primary); cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
.subject-capsule-item:hover { transform: translateY(-1px); background: var(--color-bg-tertiary); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); border-color: rgba(125,147,114,0.3); color: #7D9372; }
.subject-capsule-item.is-active { background: rgba(125, 147, 114, 0.1) !important; border-color: #7D9372 !important; color: #7D9372 !important; box-shadow: 0 2px 8px rgba(125, 147, 114, 0.15); }
html.dark .subject-capsule-item.is-active { background: rgba(154, 176, 143, 0.15) !important; border-color: #9AB08F !important; color: #9AB08F !important; }
.subj-capsule-icon { font-size: 13px; }
@keyframes ai-spark-pulse { 0%, 100% { transform: scale(1); opacity: .5; } 50% { transform: scale(1.2); opacity: 1; } }
@keyframes ai-spark-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes ai-dot-bounce { 0%, 80%, 100% { transform: scale(0); opacity: .3; } 40% { transform: scale(1); opacity: 1; } }
@keyframes ai-fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ai-slide-up { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

/* Drag and Drop Zone */
.drag-drop-zone { border: 2px dashed rgba(0,0,0,0.1); border-radius: 8px; padding: 24px; text-align: center; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(255,255,255,0.4); margin-bottom: 8px; }
.drag-drop-zone:hover { border-color: rgba(0,0,0,0.2); background: rgba(255,255,255,0.8); }
.drag-drop-zone.is-active { border-color: #7D9372; background: rgba(125, 147, 114, 0.05); }
.drag-text { font-size: 13px; color: var(--text-muted); font-weight: 500; }
html.dark .drag-drop-zone { border-color: rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); }
html.dark .drag-drop-zone:hover { border-color: rgba(255,255,255,0.2); background: rgba(0,0,0,0.4); }
html.dark .drag-drop-zone.is-active { border-color: #9AB08F; background: rgba(154, 176, 143, 0.1); }

/* Home Modal Styles for Register Modal */
.modal-container { width: 90%; max-width: 520px; background: #FFFFFF; border-radius: 20px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.04); border: 1px solid var(--border-subtle); display: flex; flex-direction: column; overflow: hidden; animation: scale-up 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
html.dark .modal-container { background: #181D18; border-color: rgba(163, 177, 155, 0.25); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4); }
@keyframes scale-up { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.modal-container .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid var(--border-subtle); }
.modal-container .modal-header h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.3px; }
.close-btn { background: none; border: none; font-size: 20px; color: var(--text-muted); cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: all var(--transition-fast); }
.close-btn:hover { background: rgba(0, 0, 0, 0.04); color: var(--text-primary); }
html.dark .close-btn:hover { background: rgba(255, 255, 255, 0.06); }
.modal-container .modal-body { padding: 22px 28px; display: flex; flex-direction: column; gap: 20px; max-height: 70vh; overflow-y: auto; }
.form-group label { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.styled-input, .styled-textarea { width: 100%; padding: 12px 14px; background: var(--color-bg-secondary); border: 1px solid var(--border-default); border-radius: 12px; font-size: 13.5px; color: var(--text-primary); transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); outline: none; box-sizing: border-box; font-family: inherit; }
.styled-input:focus, .styled-textarea:focus { border-color: #7D9372; background: var(--color-bg-primary); box-shadow: 0 0 0 3px rgba(125, 147, 114, 0.15); }
html.dark .styled-input:focus, html.dark .styled-textarea:focus { border-color: #9AB08F; background: rgba(255, 255, 255, 0.05); box-shadow: 0 0 0 3px rgba(125, 147, 114, 0.2); }
.styled-textarea { resize: vertical; line-height: 1.6; min-height: 100px; }
.styled-el-select { width: 100%; }
.styled-el-select :deep(.el-input__wrapper) { background: var(--color-bg-secondary); border-radius: 12px; box-shadow: 0 0 0 1px var(--border-default) inset; padding: 4px 14px; transition: all 0.2s; }
.styled-el-select :deep(.el-input__wrapper.is-focus) { background: var(--color-bg-primary); box-shadow: 0 0 0 1px #7D9372 inset, 0 0 0 3px rgba(125, 147, 114, 0.15) !important; }
html.dark .styled-el-select :deep(.el-input__wrapper.is-focus) { background: rgba(255, 255, 255, 0.05); box-shadow: 0 0 0 1px #9AB08F inset, 0 0 0 3px rgba(125, 147, 114, 0.2) !important; }
.modal-container .modal-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 28px 22px; border-top: 1px solid var(--border-subtle); background: transparent; }
.btn-secondary { background: transparent; border: 1px solid var(--border-default); color: var(--text-secondary); padding: 8px 20px; border-radius: 9999px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-secondary:hover { background: var(--color-bg-secondary); color: var(--text-primary); }
.btn-primary { background: var(--btn-primary-bg, linear-gradient(135deg, #A3B19B 0%, #7D9372 100%)); border: none; color: #FFFFFF; padding: 8px 26px; border-radius: 9999px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 2px 8px rgba(125, 147, 114, 0.3); }
.btn-primary:hover:not(:disabled) { background: #6E8364; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(125, 147, 114, 0.45); }
.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
html.dark .btn-primary { background: #9AB08F; color: #1a1a1a; }
html.dark .btn-primary:hover { background: #b0c2a7; box-shadow: 0 4px 12px rgba(154, 176, 143, 0.2); }
</style>
