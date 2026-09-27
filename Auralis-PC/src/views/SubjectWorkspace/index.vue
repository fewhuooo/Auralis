<template>
  <div class="workspace-container">

    <!-- ===== TIER-1: Icon Strip (72px fixed) ===== -->
    <nav class="tier1-strip">
      <div class="tier1-top">
        <button class="tier1-btn" title="返回" @click="router.push('/subjects')">
          <IconArrowLeft :size="20" :stroke-width="1.6" />
          <span class="tier1-btn-text">返回</span>
        </button>
        <button
          class="tier1-btn"
          :class="{ 'is-active': tier2Open && tier2Mode === 'files' }"
          title="学习材料"
          @click="toggleTier2('files')"
        >
          <IconFileText :size="20" :stroke-width="1.6" />
          <span class="tier1-btn-text">材料</span>
        </button>
        <button
          class="tier1-btn"
          :class="{ 'is-active': tier2Open && tier2Mode === 'outline' }"
          title="总览"
          @click="toggleTier2('outline')"
        >
          <IconList :size="20" :stroke-width="1.6" />
          <span class="tier1-btn-text">总览</span>
        </button>
        <button
          class="tier1-btn"
          :class="{ 'is-active': centerView === 'blocks' }"
          title="知识库"
          @click="centerView = 'blocks'; tier2Open = false"
        >
          <IconLayoutGrid :size="20" :stroke-width="1.6" />
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
          <button class="drawer-action" @click="openRegisterModal" title="添加文件" aria-label="添加文件">
            <IconPlus :size="15" :stroke-width="2.4" />
          </button>
        </div>
        <div class="drawer-list" v-if="activeSourceFiles.length > 0">
          <div
            v-for="file in activeSourceFiles"
            :key="file.id"
            class="drawer-item"
            :class="{ 'is-active': selectedFileId === file.id }"
            @click="selectFile(file.id)"
          >
            <div class="drawer-item-body">
              <span class="drawer-item-name">{{ file.name }}<DocumentProcessingDot :source-id="file.id" /></span>
              <span class="drawer-item-meta">{{ (file.fileSize / (1024 * 1024)).toFixed(1) }} MB</span>
            </div>
            <button
              class="drawer-item-delete"
              type="button"
              :disabled="deletingFileId === file.id"
              :aria-label="`删除文件 ${file.name}`"
              title="删除文件"
              @click.stop="handleDeleteFile(file)"
            >
              <IconX :size="14" :stroke-width="2" />
            </button>
          </div>
        </div>
        <div class="drawer-empty" v-else>
          <span>暂无学习文件</span>
        </div>
      </div>

      <!-- Outline Mode -->
      <div v-else-if="tier2Mode === 'outline'" class="drawer-content">
        <div class="drawer-header outline-header">
          <div class="outline-header-left">
            <h3 class="drawer-title">总览</h3>
            <transition name="hint-capsule-fade">
              <div v-if="isOutlineComposer" class="outline-header-hint-capsule" title="可拖拽章节与小节调整顺序，点击文字直接修改">
                <span class="hint-dot"></span>
                <span class="hint-text">拖拽排序 · 点击修改</span>
              </div>
            </transition>
          </div>
          <div class="outline-header-actions">
            <button
              class="outline-add-button"
              :class="{ 'is-active': isOutlineComposer }"
              :title="isOutlineComposer ? '关闭编排' : '编排大纲'"
              :aria-label="isOutlineComposer ? '关闭编排' : '编排大纲'"
              @click="isOutlineComposer = !isOutlineComposer"
            >
              <IconPlus :size="15" :stroke-width="2.4" class="outline-add-icon" />
            </button>
          </div>
        </div>
        <div v-if="isOutlineComposer" class="outline-composer">
          <div class="subject-overview-wrapper">
            <article class="file-outline subject-overview is-editing">
              <!-- 统一卡片头部 -->
              <header class="file-outline__header subject-overview__header">
                <div class="file-outline__name subject-overview__name" style="cursor: default;">
                  <IconBook :size="13" :stroke-width="1.6" class="subject-icon" />
                  <span class="subject-overview-title">学科大纲</span>
                </div>
                <span class="file-outline__actions">
                  <button
                    type="button"
                    class="composer-capsule-btn is-primary"
                    :disabled="isSavingOutline"
                    title="保存大纲修改"
                    @click="saveCurrentOutline"
                  >
                    <IconCheck v-if="!isSavingOutline" :size="10.5" :stroke-width="2.2" />
                    <IconRotate v-else :size="10.5" :stroke-width="2" class="is-spinning" />
                    <span>{{ isSavingOutline ? '保存中' : '保存' }}</span>
                  </button>
                </span>
              </header>

              <!-- 卡片内容主体 -->
              <div class="subject-overview__body">
                <ol class="file-outline__chapters composer-chapter-list">
                  <li
                    v-for="(chapter, chapterIndex) in subjectOutline"
                    :key="chapter.id"
                    class="composer-chapter-item"
                    draggable="true"
                    @dragstart="startChapterDrag(chapterIndex)"
                    @dragover.prevent
                    @drop="handleChapterDrop(chapterIndex)"
                  >
                    <!-- 章节标题：统一非编辑态左侧绿色胶囊微条与排版 -->
                    <strong class="chapter-header composer-chapter-header">
                      <span class="composer-drag-handle" title="拖拽调整章节顺序">
                        <IconGripVertical :size="12" :stroke-width="1.8" />
                      </span>
                      <input
                        v-model="chapter.title"
                        class="composer-inline-title"
                        placeholder="章节名称"
                      />
                      <button
                        type="button"
                        class="composer-del-btn"
                        title="删除章节"
                        @click.stop="deleteChapter(chapterIndex)"
                      >
                        <IconTrash :size="12" :stroke-width="1.8" />
                      </button>
                    </strong>

                    <!-- 小节列表：统一非编辑态 4px 微圆点与极简导轨 -->
                    <div class="composer-sections-wrap">
                      <div
                        v-for="(section, sectionIndex) in chapter.sections"
                        :key="section.id"
                        class="subject-outline__section composer-section-item"
                        draggable="true"
                        @dragstart.stop="startSectionDrag(chapterIndex, sectionIndex)"
                        @dragover.prevent
                        @drop.stop="handleSectionDrop(chapterIndex, sectionIndex)"
                      >
                        <span class="composer-drag-handle composer-section-grip" title="拖拽调整小节顺序">
                          <IconGripVertical :size="11" :stroke-width="1.8" />
                        </span>

                        <div class="composer-section-main">
                          <input
                            v-model="section.title"
                            class="composer-inline-section"
                            placeholder="小节名称"
                          />
                          <span
                            v-for="sId in (section.sourceIds?.length ? section.sourceIds : (section.fileId ? [section.fileId] : []))"
                            :key="sId"
                            class="composer-file-tag"
                            :title="fileById(sId)?.name"
                          >
                            <IconFileText :size="10.5" :stroke-width="1.6" />
                            <span class="composer-file-name">{{ fileById(sId)?.name || '关联文件' }}</span>
                            <button
                              type="button"
                              class="composer-unlink-icon"
                              title="解除关联"
                              @click.stop="unlinkFile(chapterIndex, sectionIndex, sId)"
                            >
                              <IconX :size="10" :stroke-width="2" />
                            </button>
                          </span>
                        </div>

                        <div class="composer-item-actions">
                          <el-popover placement="bottom-end" trigger="click" width="280" popper-class="zen-popover zen-action-popover" :hide-after="0">
                            <template #reference>
                              <button type="button" class="composer-action-btn" title="选择关联文件" @click.stop>
                                <IconLink :size="12" :stroke-width="1.8" />
                              </button>
                            </template>
                            <div style="margin-bottom: 8px; font-size: 12px; font-weight: 650; color: var(--text-primary);">选择关联文件</div>
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
                            <div v-else style="padding: 10px 0; text-align: center; color: var(--text-muted); font-size: 11.5px;">
                              暂无学习文件，请先导入
                            </div>
                          </el-popover>
                          <button
                            type="button"
                            class="composer-action-btn"
                            title="删除小节"
                            @click.stop="deleteSection(chapterIndex, sectionIndex)"
                          >
                            <IconX :size="12" :stroke-width="2" />
                          </button>
                        </div>
                      </div>

                      <!-- 极简内联添加小节 -->
                      <div class="composer-add-section-row">
                        <span class="composer-add-dot">＋</span>
                        <input
                          v-model="chapterDrafts[chapter.id]"
                          class="composer-add-input"
                          placeholder="添加小节 (按 Enter 确认)"
                          @keyup.enter="addSection(chapter.id)"
                        />
                      </div>
                    </div>
                  </li>
                </ol>

                <!-- 添加新章节 -->
                <div class="composer-add-chapter-row">
                  <input
                    v-model="chapterDraft"
                    class="composer-add-chapter-input"
                    placeholder="＋ 添加新章节 (按 Enter 确认)"
                    @keyup.enter="addChapter"
                  />
                </div>
              </div>
            </article>
          </div>

          <!-- 分文件大纲编辑列表：在编辑态下每个文件大纲均可独立编辑、拖拽与保存 -->
          <div class="file-outline-composer-list">
            <div
              v-for="file in activeSourceFiles"
              :key="file.id"
              class="file-overview-wrapper"
            >
              <article class="file-outline file-overview is-editing" :class="{ 'is-selected': file.id === selectedFileId }">
                <!-- 文件大纲头部 -->
                <header class="file-outline__header">
                  <button
                    type="button"
                    class="overview-collapse-btn"
                    :title="fileCardCollapsed[file.id] ? '展开文件大纲' : '收起文件大纲'"
                    @click="fileCardCollapsed[file.id] = !fileCardCollapsed[file.id]"
                  >
                    <IconChevronDown v-if="!fileCardCollapsed[file.id]" :size="13" :stroke-width="2" />
                    <IconChevronRight v-else :size="13" :stroke-width="2" />
                  </button>
                  <button type="button" class="file-outline__name" :title="`查看并编辑 ${file.name}`" @click="selectFile(file.id)">
                    <IconFileText :size="13" :stroke-width="1.6" class="subject-icon" />
                    <span class="subject-overview-title">{{ file.name }}</span>
                  </button>
                  <span class="file-outline__actions">
                    <button
                      type="button"
                      class="composer-capsule-btn is-primary"
                      :disabled="savingFileIds.has(file.id)"
                      :title="`保存《${file.name}》大纲修改`"
                      @click="saveFileOutline(file.id)"
                    >
                      <IconCheck v-if="!savingFileIds.has(file.id)" :size="10.5" :stroke-width="2.2" />
                      <IconRotate v-else :size="10.5" :stroke-width="2" class="is-spinning" />
                      <span>{{ savingFileIds.has(file.id) ? '保存中' : '保存' }}</span>
                    </button>
                  </span>
                </header>

                <!-- 文件大纲内容主体 -->
                <div v-show="!fileCardCollapsed[file.id]" class="subject-overview__body">
                  <!-- 暂无大纲时的初始创建引导 -->
                  <div v-if="!fileOutlineDrafts[file.id]?.length" class="composer-file-empty-box">
                    <span class="empty-hint">该文件暂无大纲内容</span>
                    <button
                      type="button"
                      class="composer-capsule-btn"
                      @click="createInitialFileOutline(file.id)"
                    >
                      ＋ 创建初始大纲
                    </button>
                  </div>

                  <!-- 章节与小节列表 -->
                  <ol v-else class="file-outline__chapters composer-chapter-list">
                    <li
                      v-for="(chapter, chapterIndex) in fileOutlineDrafts[file.id]"
                      :key="chapter.id"
                      class="composer-chapter-item"
                      draggable="true"
                      @dragstart="startFileChapterDrag(file.id, chapterIndex)"
                      @dragover.prevent
                      @drop="handleFileChapterDrop(file.id, chapterIndex)"
                    >
                      <!-- 章节标题行 -->
                      <strong class="chapter-header composer-chapter-header">
                        <span class="composer-drag-handle" title="拖拽调整章节顺序">
                          <IconGripVertical :size="12" :stroke-width="1.8" />
                        </span>
                        <input
                          v-model="chapter.title"
                          class="composer-inline-title"
                          placeholder="章节名称"
                        />
                        <button
                          type="button"
                          class="composer-del-btn"
                          title="删除章节"
                          @click.stop="deleteFileChapter(file.id, chapterIndex)"
                        >
                          <IconTrash :size="12" :stroke-width="1.8" />
                        </button>
                      </strong>

                      <!-- 小节列表 -->
                      <div class="composer-sections-wrap">
                        <div
                          v-for="(section, sectionIndex) in chapter.sections"
                          :key="section.id"
                          class="subject-outline__section composer-section-item"
                          draggable="true"
                          @dragstart.stop="startFileSectionDrag(file.id, chapterIndex, sectionIndex)"
                          @dragover.prevent
                          @drop.stop="handleFileSectionDrop(file.id, chapterIndex, sectionIndex)"
                        >
                          <span class="composer-drag-handle composer-section-grip" title="拖拽调整小节顺序">
                            <IconGripVertical :size="11" :stroke-width="1.8" />
                          </span>

                          <div class="composer-section-main">
                            <input
                              v-model="section.title"
                              class="composer-inline-section"
                              placeholder="小节名称"
                            />
                          </div>

                          <div class="composer-item-actions">
                            <button
                              type="button"
                              class="composer-action-btn"
                              title="删除小节"
                              @click.stop="deleteFileSection(file.id, chapterIndex, sectionIndex)"
                            >
                              <IconX :size="12" :stroke-width="2" />
                            </button>
                          </div>
                        </div>

                        <!-- 内联添加小节 -->
                        <div class="composer-add-section-row">
                          <span class="composer-add-dot">＋</span>
                          <input
                            v-model="fileSectionDrafts[`${file.id}-${chapter.id}`]"
                            class="composer-add-input"
                            placeholder="添加小节 (按 Enter 确认)"
                            @keyup.enter="addFileSection(file.id, chapter.id, chapterIndex)"
                          />
                        </div>
                      </div>
                    </li>
                  </ol>

                  <!-- 添加新章节 -->
                  <div v-if="fileOutlineDrafts[file.id]?.length" class="composer-add-chapter-row">
                    <input
                      v-model="fileChapterDrafts[file.id]"
                      class="composer-add-chapter-input"
                      placeholder="＋ 添加新章节 (按 Enter 确认)"
                      @keyup.enter="addFileChapter(file.id)"
                    />
                  </div>
                </div>
              </article>
            </div>
            <div v-if="!activeSourceFiles.length" class="drawer-empty" style="padding: 18px 0;">
              <span>暂无学习文件</span>
            </div>
          </div>
        </div>
        <div v-else class="outline-overview-list">
          <SubjectOverviewSection
            v-model:collapsed="subjectOverviewCollapsed"
            :overview="subjectOverviewRecord"
            :source-count="activeSourceFiles.length"
            :is-stale="isSubjectOverviewStale"
            :is-generating="subjectOverviewGenerating"
            :error="subjectOverviewError"
            @generate="handleOutlineAi"
            @generate-outline="handleSubjectOutlineRegenerate"
            @open-summary="openSubjectSummary"
          />
          <FileOutlineList
            :files="fileOverviewItems"
            :selected-file-id="selectedFileId"
            @select-file="selectFile"
            @select-summary="openFileSummary"
            @select-outline-node="openOverviewLocator"
            @regenerate="regenerateFileOverview"
          />
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
          <span v-if="centerView === 'summary' && summaryTarget" class="status-file">
            {{ summaryTarget.title }} · 总结
          </span>
          <span v-else-if="centerView === 'preview' && selectedFile" class="status-file">
            <IconFileText :size="14" :stroke-width="1.6" class="status-icon" /> {{ selectedFile.name }}
          </span>
          <span v-else-if="centerView === 'blocks'" class="status-file">
            <IconNotes :size="14" :stroke-width="1.6" class="status-icon" /> 知识块 · {{ filteredBlocks.length }} 个知识块
          </span>
          <span v-else class="status-file">{{ activeSubject?.name }}</span>
        </div>
        <div class="status-right">
          <div v-if="centerView === 'preview' && selectedFile" class="preview-status-controls" aria-label="预览控制">
            <div class="preview-control-group preview-zoom-controls" aria-label="缩放控制">
              <button type="button" class="preview-status-button preview-status-button-icon" title="缩小" @click="filePreviewRef?.zoomOut()">−</button>
              <span class="preview-zoom-value" aria-live="polite">{{ previewZoomLabel }}</span>
              <button type="button" class="preview-status-button preview-status-button-icon" title="放大" @click="filePreviewRef?.zoomIn()">＋</button>
              <button type="button" class="preview-status-button preview-status-button-wide" title="重置缩放" @click="filePreviewRef?.resetZoom()">重置</button>
            </div>
            <div class="preview-control-group preview-rotation-controls" aria-label="旋转控制">
              <button type="button" class="preview-status-button preview-status-button-icon" title="向左旋转 90 度" aria-label="向左旋转 90 度" @click="filePreviewRef?.rotateLeft()">
                <IconArrowBackUp :size="14" :stroke-width="1.9" aria-hidden="true" />
              </button>
              <span class="preview-rotation-value" aria-live="polite">{{ previewRotation }}°</span>
              <button type="button" class="preview-status-button preview-status-button-icon" title="向右旋转 90 度" aria-label="向右旋转 90 度" @click="filePreviewRef?.rotateRight()">
                <IconArrowForwardUp :size="14" :stroke-width="1.9" aria-hidden="true" />
              </button>
            </div>
          </div>
          <span class="status-page" v-if="centerView === 'preview'">文件预览</span>
          <span class="status-page" v-else-if="centerView === 'summary'">AI 总结</span>
        </div>
      </header>

      <!-- Center Content -->
      <div class="center-body">
        <!-- Collapse Left Button -->
        <button class="edge-collapse edge-left" @click="toggleTier2Panel" :title="tier2Open ? '收起左栏' : '展开左栏'">
          <IconChevronLeft v-if="tier2Open" :size="12" :stroke-width="2.5" />
          <IconChevronRight v-else :size="12" :stroke-width="2.5" />
        </button>

        <OverviewSummaryView
          v-if="centerView === 'summary' && summaryTarget"
          :title="summaryTarget.title"
          :kind="summaryTarget.kind"
          :summary="summaryTarget.record?.summary || null"
          :is-generating="summaryTarget.isGenerating"
          :is-stale="summaryTarget.isStale"
          :error="summaryTarget.error"
          @close="closeSummary"
          @regenerate="regenerateSelectedSummary"
        />

        <template v-else-if="centerView === 'preview' && selectedFile">
          <FilePreview
            ref="filePreviewRef"
            :file="selectedFile"
            :bare="true"
            @preview-error="handlePreviewError"
            @control-ready="previewControlsReady = $event"
            @zoom-change="handlePreviewZoomChange"
            @rotation-change="previewRotation = $event"
            @page-change="handlePreviewPageChange"
            @text-selected="handleTextSelected"
          />

          <div v-if="selectedText" class="selection-actions" role="toolbar" aria-label="选中文本操作">
            <span class="selection-summary">已选 {{ selectedText.length }} 字</span>
            <button type="button" @click="explainSelection">解释</button>
            <button type="button" @click="askSelection">追问</button>
            <button type="button" @click="saveSelection">保存为知识块</button>
            <button type="button" class="selection-dismiss" aria-label="清除选区" @click="selectedText = ''">×</button>
          </div>

          <footer class="preview-page-footer" aria-label="文档页码">
            <button type="button" class="preview-page-button" :disabled="previewPage <= 1" @click="filePreviewRef?.prevPage()">上一页</button>
            <span class="preview-page-count">{{ previewPage }} / {{ previewPageCount }}</span>
            <button type="button" class="preview-page-button" :disabled="previewPage >= previewPageCount" @click="filePreviewRef?.nextPage()">下一页</button>
          </footer>
        </template>

        <!-- Knowledge Blocks Grid -->
        <div v-else-if="centerView === 'blocks'" class="blocks-workspace">
          <div class="blocks-top-bar">
            <div class="blocks-search">
              <IconSearch :size="12" :stroke-width="2" />
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
                <IconNotes :size="60" :stroke-width="1.5" />
              </div>
              <h3 style="font-size: 16px; font-weight: 700; color: var(--text-primary);">知识库暂无内容</h3>
              <p style="font-size: 12px; color: var(--text-muted);">建议导入材料进行提炼，或者直接手动创建您的第一个知识卡片</p>
            </div>
            <div class="onboarding-grid" style="max-width: 640px; margin: 0 auto;">
              <div class="onboarding-card" @click="openCreateDialog">
                <div class="onboarding-card-icon">
                  <IconPlus :size="24" :stroke-width="2" />
                </div>
                <div class="onboarding-card-body">
                  <h4>手动新建知识块</h4>
                  <p>手动录入笔记、重要定义或概念卡片，支持 Markdown 渲染。</p>
                  <button class="onboarding-card-btn">手动录入</button>
                </div>
              </div>
              <div class="onboarding-card" @click="tier2Mode = 'files'; tier2Open = true; centerView = 'overview'">
                <div class="onboarding-card-icon">
                  <IconFileText :size="24" :stroke-width="2" />
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
              <IconUpload :size="16" :stroke-width="2" />
              <span>将 PDF 或图片文件拖入此处进行关联</span>
            </div>
        </div>

        <!-- Collapse Right Button -->
        <button class="edge-collapse edge-right" @click="rightCollapsed = !rightCollapsed" :title="rightCollapsed ? '展开 AI 助手' : '收起 AI 助手'">
          <IconChevronRight v-if="rightCollapsed" :size="12" :stroke-width="2.5" />
          <IconChevronLeft v-else :size="12" :stroke-width="2.5" />
        </button>
      </div>
    </main>

    <!-- Splitter 2 -->
    <div class="resizer" v-show="!rightCollapsed" @mousedown="startResizeRight"></div>

    <!-- ===== RIGHT: AI Assistant ===== -->
    <aside class="workspace-right" :class="{ 'is-open': !rightCollapsed }" :style="{ width: !rightCollapsed ? rightWidth + '%' : '0px' }">
      <div class="ai-header">
        <button
          class="ai-model-switch ai-file-switch"
          :title="aiSourceSummaryTitle"
          @click="showModelMenu = !showModelMenu"
        >
          <span class="model-icon-top">
            <IconSparkles v-if="isAllAiSourcesSelected" :size="15" :stroke-width="1.8" />
            <IconFiles v-else-if="selectedAiSourceIds.length > 1" :size="15" :stroke-width="1.8" />
            <IconFileText v-else :size="15" :stroke-width="1.8" />
          </span>
          <span class="model-text">{{ aiSourceSummaryText }}</span>
          <IconChevronDown class="chevron-icon" :class="{ 'is-rotated': showModelMenu }" :size="12" :stroke-width="2" />
        </button>
        <div class="dropdown-mask" v-if="showModelMenu" @click="showModelMenu = false" style="position: fixed; inset: 0; z-index: 3;"></div>
        <div v-if="showModelMenu" class="ai-model-menu ai-file-menu" style="z-index: 4;" @click.stop>
          <div class="ai-menu-section-header">
            <span>参考范围 (多选)</span>
          </div>
          <div
            v-if="selectedFileId"
            class="mini-menu-item"
            :class="{ 'is-active': aiReferenceScope === 'AUTO' }"
            @click="selectCurrentAiSource"
          >
            <span class="mini-menu-icon"><IconFileText :size="16" :stroke-width="1.8" /></span>
            <div class="mini-menu-text">
              <span class="mini-menu-label" :class="{ 'is-active': aiReferenceScope === 'AUTO' }">当前文件</span>
              <span class="mini-menu-desc">优先检索当前文件，按原有规则处理跨文件问题</span>
            </div>
          </div>
          <div class="mini-menu-item" :class="{ 'is-active': isAllAiSourcesSelected }" @click="selectAllAiSources">
            <span class="mini-menu-icon"><IconSparkles :size="16" :stroke-width="1.8" /></span>
            <div class="mini-menu-text">
              <span class="mini-menu-label" :class="{ 'is-active': isAllAiSourcesSelected }">全学科资料</span>
              <span class="mini-menu-desc">检索当前学科所有已就绪资料</span>
            </div>
          </div>
          <div class="mini-menu-item" :class="{ 'is-active': aiReferenceScope === 'NONE' }" @click="selectNoAiSources">
            <span class="mini-menu-icon"><IconMessageCircle :size="16" :stroke-width="1.8" /></span>
            <div class="mini-menu-text">
              <span class="mini-menu-label" :class="{ 'is-active': aiReferenceScope === 'NONE' }">不引用资料</span>
              <span class="mini-menu-desc">按普通对话回答，不检索文件</span>
            </div>
          </div>

          <template v-if="activeSourceFiles.length > 0">
            <div class="ai-menu-divider"></div>
            <div class="ai-menu-section-header">
              <span>已关联文件</span>
              <span class="ai-menu-header-count" v-if="selectedAiSourceIds.length > 0 && !isAllAiSourcesSelected">
                已选 {{ selectedAiSourceIds.length }} / {{ activeSourceFiles.length }}
              </span>
            </div>
            <div
              v-for="file in activeSourceFiles"
              :key="file.id"
              class="mini-menu-item"
              :class="{ 'is-active': isAiSourceSelected(file.id), 'is-disabled': file.ingestionStatus !== 'READY' }"
              :aria-disabled="file.ingestionStatus !== 'READY'"
              :title="file.ingestionStatus !== 'READY' ? '文件处理完成后才能用于 AI 检索' : undefined"
              @click="toggleAiSource(file.id)"
            >
              <span class="mini-menu-icon"><IconFileText :size="16" :stroke-width="1.8" /></span>
              <div class="mini-menu-text">
                <span class="mini-menu-label" :class="{ 'is-active': isAiSourceSelected(file.id) }">{{ file.name }}</span>
                <span class="mini-menu-desc">{{ (file.fileSize / (1024 * 1024)).toFixed(1) }} MB</span>
              </div>
            </div>
          </template>
        </div>
        <button class="ai-clear" @click="clearChat" title="清空对话" aria-label="清空对话">
          <IconRotate :size="16" :stroke-width="2" />
        </button>
      </div>

        <!-- Chat Flow -->
        <div class="ai-messages" ref="chatScrollRef">
          <div class="ai-welcome" v-if="chatMessages.length === 0">
            <div class="ai-brand-wrap" aria-hidden="true">
              <div class="ai-spark-ring" style="display: none;"></div>
              <svg class="ai-spark-svg" width="56" height="56" viewBox="0 0 28 28" fill="none">
                <rect width="28" height="28" rx="8" fill="url(#workspace-ai-welcome-brand-grad)" />
                <path d="M8 14L12 10L16 14L20 10" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M8 18L12 14L16 18L20 14" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>
                <defs>
                  <linearGradient id="workspace-ai-welcome-brand-grad" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#8B9A6E" />
                    <stop offset="1" stop-color="#AAB88E" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <h3 class="welcome-title">今天想探索点什么？</h3>
            <p class="welcome-desc">{{ aiGreetingName }}，结合当前参考资料，我随时可以为您梳理重点、解释概念或生成练习。</p>

            <div class="preset-questions">
              <button
                v-for="item in presetQuestions"
                :key="item.label"
                type="button"
                class="preset-pill"
                @click="sendPreset(item.prompt)"
              >
                {{ item.label }}
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
              <defs><linearGradient id="workspace-ai-avatar-gradient" x1="4" y1="4" x2="48" y2="48"><stop stop-color="#8B9A6E" /><stop offset="1" stop-color="#76855B" /></linearGradient></defs>
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
              <defs><linearGradient id="workspace-ai-stream-gradient" x1="4" y1="4" x2="48" y2="48"><stop stop-color="#8B9A6E" /><stop offset="1" stop-color="#76855B" /></linearGradient></defs>
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

        <div v-if="chatStore.lastError" class="chat-error" role="alert">
          <span class="chat-error-message">{{ chatStore.lastError }}</span>
          <button
            v-if="pendingChatMessage"
            type="button"
            class="chat-error-retry"
            :disabled="isAiStreaming"
            @click="retryChat"
          >重试</button>
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
            <IconArrowUp :size="16" :stroke-width="2" />
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

    <DocumentNotReadyDialog
      v-model="showNotReadyDialog"
      :file-name="selectedFile?.name || '当前文件'"
      @cancel="showNotReadyDialog = false"
      @go-profile="goToProcessingCenter"
    />
    <KnowledgeBlockEditor
      v-model="showKnowledgeEditor"
      :initial-content="selectedText"
      @cancel="showKnowledgeEditor = false"
      @save="saveKnowledgeBlock"
    />

    <!-- Register File Modal -->
    <FileRegisterDialog
      v-model="showRegisterModal"
      title="登记本地参考文件"
      :is-uploading="isUploading"
      :upload-progress="uploadProgress"
      :upload-stage="uploadStage"
      :default-subject-id="subjectId"
      :accepted-extensions="SUPPORTED_UPLOAD_EXTENSIONS"
      :accept="SUPPORTED_UPLOAD_EXTENSIONS.join(',')"
      :disabled="!registerForm.subjectId || !droppedFile || isUploading"
      @submit="handleRegisterFile"
    />

    <!-- Create Task Modal -->
    <TaskCreateDialog
      v-model="showTaskModal"
      title="创建学习任务"
      submit-text="加入排期"
      :fixed-subject-id="activeSubject?.id"
      :fixed-subject-name="activeSubject?.name"
      @submit="handleAddTask"
    />

    <!-- Block Detail / Edit Modal -->
    <WorkspaceKnowledgeBlockDialog
      v-model="blockDialogVisible"
      :mode="blockDialogMode"
      :block="selectedBlock"
      :active-subject-name="activeSubject?.name"
      :theme-colors="themeColors"
      @update:mode="blockDialogMode = $event"
      @save="handleSaveBlockFromDialog"
      @delete="handleDeleteBlock"
      @copy="handleCopyBlockContent"
      @close="closeBlockDialog"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ElIcon, ElNotification, ElMessage, ElMessageBox } from 'element-plus'
import {
  IconArrowLeft,
  IconFileText,
  IconList,
  IconLayoutGrid,
  IconX,
  IconLink,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
  IconSearch,
  IconUpload,
  IconRotate,
  IconArrowUp,
  IconPlus,
  IconNotes,
  IconSparkles,
  IconFiles,
  IconMessageCircle,
  IconBook,
  IconCheck,
  IconGripVertical,
  IconTrash
} from '@tabler/icons-vue'
import 'element-plus/theme-chalk/el-notification.css'
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-select.css'
import 'element-plus/theme-chalk/el-option.css'

import FilePreview from '@/components/FilePreview.vue'
import DocumentProcessingDot from '@/components/documentProcessing/DocumentProcessingDot.vue'
import DocumentNotReadyDialog from '@/components/documentProcessing/DocumentNotReadyDialog.vue'
import KnowledgeBlockEditor from '@/components/knowledge/KnowledgeBlockEditor.vue'
import WorkspaceKnowledgeBlockDialog from '@/components/knowledge/WorkspaceKnowledgeBlockDialog.vue'
import SubjectOverviewSection from '@/components/subject/SubjectOverviewSection.vue'
import FileOutlineList, { type FileOverviewItem } from '@/components/subject/FileOutlineList.vue'
import OverviewSummaryView from '@/components/subject/OverviewSummaryView.vue'
import FileRegisterDialog from '@/components/asset/FileRegisterDialog.vue'
import TaskCreateDialog from '@/components/task/TaskCreateDialog.vue'
import { useKnowledgeStore } from '@/store/useKnowledgeStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useAssetStore } from '@/store/useAssetStore'
import { useSourceStore } from '@/store/useSourceStore'
import { useChatStore } from '@/store/useChatStore'
import { useDocumentProcessingStore } from '@/store/useDocumentProcessingStore'
import { getOverviewRepository } from '@/services/localDb'
import { OverviewGenerationService, hasUsableOverview } from '@/services/overviewGenerationService'
import { overviewFailureMessage } from '@/services/overviewFailurePolicy'
import { classifyClientError, logClientError } from '@/services/clientErrorPolicy'
import { documentProcessingRuntime } from '@/services/documentProcessing/runtime'
import { useOverviewApi } from '@/api/useOverviewApi'
import { useSourceApi } from '@/api/useSourceApi'
import { computeSubjectInputFingerprint, type OverviewRepository } from '@/services/overviewRepository'
import type { FileOverviewRecord, OverviewChapter, OverviewLocator, OverviewRegenerationResult, SubjectOverviewRecord } from '@/types/overview'
import type { SourceFileModel } from '@/services/domainMappers'
import { getLegacySubjectIcon, getSubjectIconComponent, isSubjectIconKey } from '@/utils/subjectIcon'
import { SUPPORTED_UPLOAD_EXTENSIONS, validateUploadFile } from '@/utils/filePreview'

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
const documentProcessingStore = useDocumentProcessingStore()
const { activeSubject } = storeToRefs(subjectStore)
const { activeSourceFiles } = storeToRefs(sourceStore)
const {
  messages: storedChatMessages,
  isStreaming: storedChatStreaming,
  streamingContent: storedStreamingContent,
  pendingMessage: storedPendingMessage,
} = storeToRefs(chatStore)
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
const centerView = ref<'blocks' | 'preview' | 'overview' | 'summary'>('overview')
const rightCollapsed = ref(false)

const toggleTier2 = (mode: 'files' | 'outline') => {
  if (tier2Open.value && tier2Mode.value === mode && centerView.value !== 'blocks') {
    tier2Open.value = false
  } else {
    tier2Mode.value = mode
    tier2Open.value = true
    if (centerView.value === 'blocks') {
      centerView.value = selectedFileId.value ? 'preview' : 'overview'
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
const selectedText = ref('')
const showNotReadyDialog = ref(false)
const showKnowledgeEditor = ref(false)
const filePreviewRef = ref<InstanceType<typeof FilePreview> | null>(null)
const previewPage = ref(1)
const previewPageCount = ref(1)
const previewControlsReady = ref(false)
const previewZoomLabel = ref('100%')
const previewRotation = ref(0)

watch(selectedFileId, () => {
  previewPage.value = 1
  previewPageCount.value = 1
  previewControlsReady.value = false
  previewZoomLabel.value = '100%'
  previewRotation.value = 0
  selectedText.value = ''
})

const handlePreviewZoomChange = (state: { label?: string; scale: number }) => {
  previewZoomLabel.value = state.label || `${Math.round(state.scale * 100)}%`
}

const selectedFile = computed<SourceFileModel | null>(() => activeSourceFiles.value.find(f => f.id === selectedFileId.value) || null)
const selectedSourceId = computed(() => selectedFile.value?.id)
const deletingFileId = ref<string | null>(null)
const subjectOverviewCollapsed = ref(true)
const subjectOverviewRecord = ref<SubjectOverviewRecord | null>(null)
const fileOverviewRecords = ref<Record<string, FileOverviewRecord>>({})
const subjectOverviewGenerating = ref(false)
const generatingFileIds = ref<Set<string>>(new Set())
const isSubjectOverviewStale = ref(false)
const subjectOverviewManualError = ref<string | null>(null)
const fileOverviewManualErrors = ref<Record<string, string>>({})
const selectedSummaryScope = ref<{ kind: 'file' | 'subject'; id: string } | null>(null)
let overviewRepository: OverviewRepository | null = null
let overviewGeneration: OverviewGenerationService | null = null

const subjectOverviewError = computed(() => subjectOverviewManualError.value
  || (subjectOverviewRecord.value?.status === 'FAILED'
    ? overviewFailureMessage(subjectOverviewRecord.value.errorCode)
    : null))

const fileOverviewItems = computed<FileOverviewItem[]>(() => activeSourceFiles.value.map((file) => {
  const record = fileOverviewRecords.value[file.id]
  return {
    id: file.id,
    name: file.name,
    outline: record?.outline ?? null,
    summary: record?.summary ?? null,
    status: record?.status ?? (file.ingestionStatus === 'READY' ? 'PENDING' : undefined),
    error: fileOverviewManualErrors.value[file.id]
      || (record?.status === 'FAILED' ? overviewFailureMessage(record?.errorCode) : null),
    isGenerating: generatingFileIds.value.has(file.id),
  }
}))

const summaryTarget = computed(() => {
  const scope = selectedSummaryScope.value
  if (!scope) return null
  if (scope.kind === 'subject') return {
    kind: 'subject' as const,
    title: activeSubject.value?.name || '学科',
    record: subjectOverviewRecord.value,
    isGenerating: subjectOverviewGenerating.value,
    isStale: isSubjectOverviewStale.value,
    error: subjectOverviewError.value,
  }
  const file = activeSourceFiles.value.find(item => item.id === scope.id)
  const record = fileOverviewRecords.value[scope.id] ?? null
  return file ? {
    kind: 'file' as const,
    title: file.name,
    record,
    isGenerating: generatingFileIds.value.has(scope.id),
    isStale: Boolean(record && file.ingestionRevision && record.ingestionRevision !== file.ingestionRevision),
    error: fileOverviewManualErrors.value[scope.id]
      || (record?.status === 'FAILED' ? overviewFailureMessage(record?.errorCode) : null),
  } : null
})

const setFileGenerating = (fileId: string, generating: boolean) => {
  const next = new Set(generatingFileIds.value)
  if (generating) next.add(fileId); else next.delete(fileId)
  generatingFileIds.value = next
}

const overviewSkipMessage = (code: string) => {
  if (code === 'SOURCE_NOT_READY' || code === 'SOURCE_NOT_ELIGIBLE') return '文件尚未处理完成'
  if (code === 'REVISION_MISMATCH') return '文件版本已变化，请刷新后重试'
  if (code === 'NO_USABLE_INPUT') return '没有可用于生成的内容'
  return '暂时无法生成，请刷新后重试'
}

const manualOverviewFailureMessage = (code: string) => {
  if (code === 'SOURCE_NOT_READY' || code === 'SOURCE_NOT_ELIGIBLE') return '文件尚未处理完成'
  if (code === 'REVISION_MISMATCH') return '文件版本已变化，请刷新后重试'
  if (code === 'NO_USABLE_INPUT') return '没有可用于生成的内容'
  return '生成失败，请重试'
}

const clearFileOverviewManualError = (fileId: string) => {
  const next = { ...fileOverviewManualErrors.value }
  delete next[fileId]
  fileOverviewManualErrors.value = next
}

const applyManualOverviewResult = (result: OverviewRegenerationResult, scope: { kind: 'file'; id: string } | { kind: 'subject'; id: string }) => {
  if (result.status === 'STARTED') {
    ElMessage.success('已更新')
    if (scope.kind === 'subject') subjectOverviewManualError.value = null
    else clearFileOverviewManualError(scope.id)
    return true
  }
  const message = result.status === 'SKIPPED' ? overviewSkipMessage(result.code) : manualOverviewFailureMessage(result.code)
  if (scope.kind === 'subject') subjectOverviewManualError.value = message
  else fileOverviewManualErrors.value = { ...fileOverviewManualErrors.value, [scope.id]: message }
  if (result.status === 'SKIPPED') ElMessage.warning(message)
  else ElMessage.error(message)
  return false
}

const refreshOverviewCache = async () => {
  if (!overviewRepository) return
  const records = await Promise.all(activeSourceFiles.value.map(async (file) => file.ingestionRevision
    ? overviewRepository!.getFileOverview(file.id, file.ingestionRevision)
    : null))
  fileOverviewRecords.value = Object.fromEntries(records.filter((record): record is FileOverviewRecord => record !== null).map(record => [record.sourceId, record]))
  subjectOverviewRecord.value = await overviewRepository.getSubjectOverview(subjectId.value)
  const usable = records.filter((record): record is FileOverviewRecord => Boolean(record && hasUsableOverview(record)))
  isSubjectOverviewStale.value = Boolean(subjectOverviewRecord.value?.inputFingerprint
    && await computeSubjectInputFingerprint(usable) !== subjectOverviewRecord.value.inputFingerprint)
}

const ensureOverviewRuntime = async () => {
  const userId = authStore.user?.id
  const serverDeviceId = authStore.serverDeviceId
  if (!userId || !serverDeviceId) return false
  if (!overviewRepository) overviewRepository = await getOverviewRepository(userId, serverDeviceId)
  const runtime = documentProcessingRuntime.getSnapshot()
  const matchingRuntime = runtime?.userId === userId && runtime.serverDeviceId === serverDeviceId
    ? runtime
    : null
  if (matchingRuntime) {
    if (overviewGeneration !== matchingRuntime.overviewGeneration) overviewGeneration = matchingRuntime.overviewGeneration
  } else if (!overviewGeneration) {
    overviewGeneration = new OverviewGenerationService({
      api: useOverviewApi,
      repository: overviewRepository,
      sourceApi: useSourceApi,
      isFileGenerationEligible: async () => false,
      getLocalFileGenerationRevision: async () => null,
      listLocalFileOverviews: async () => {
        await refreshOverviewCache()
        return Object.values(fileOverviewRecords.value)
      },
    })
  }
  await refreshOverviewCache()
  return true
}

const openFileSummary = (fileId: string) => {
  selectedFileId.value = fileId
  selectedSummaryScope.value = { kind: 'file', id: fileId }
  centerView.value = 'summary'
}

const openSubjectSummary = () => {
  selectedSummaryScope.value = { kind: 'subject', id: subjectId.value }
  centerView.value = 'summary'
}

const closeSummary = () => {
  selectedSummaryScope.value = null
  centerView.value = selectedFileId.value ? 'preview' : 'overview'
}

const openOverviewLocator = async ({ fileId }: { fileId: string }) => {
  await selectFile(fileId)
}

const regenerateFileOverview = async ({ fileId, mode }: { fileId: string; mode: 'OUTLINE' | 'ALL' }) => {
  if (!await ensureOverviewRuntime() || !overviewGeneration) return
  setFileGenerating(fileId, true)
  try {
    const result = await overviewGeneration.regenerateFileOverview(fileId, mode)
    if (applyManualOverviewResult(result, { kind: 'file', id: fileId })) await refreshOverviewCache()
  } finally {
    setFileGenerating(fileId, false)
  }
}

const regenerateSelectedSummary = async (instruction?: string) => {
  const scope = selectedSummaryScope.value
  if (!scope || !await ensureOverviewRuntime() || !overviewGeneration) return
  if (scope.kind === 'subject') {
    subjectOverviewGenerating.value = true
    try {
      const result = await overviewGeneration.regenerateSubjectOverview(scope.id, 'SUMMARY', instruction)
      if (applyManualOverviewResult(result, scope)) await refreshOverviewCache()
    }
    finally { subjectOverviewGenerating.value = false }
  } else {
    setFileGenerating(scope.id, true)
    try {
      const result = await overviewGeneration.regenerateFileOverview(scope.id, 'SUMMARY', instruction)
      if (applyManualOverviewResult(result, scope)) await refreshOverviewCache()
    }
    finally { setFileGenerating(scope.id, false) }
  }
}

const selectFile = async (id: string) => {
  if (selectedFileId.value === id) {
    selectedSummaryScope.value = null
    centerView.value = 'preview'
    return
  }
  const fileSelectGen = ++currentSubjectSwitchGen
  const targetSubjectId = subjectId.value
  await chatStore.endActiveSession().catch(() => undefined)
  if (!isComponentMounted || currentSubjectSwitchGen !== fileSelectGen || subjectId.value !== targetSubjectId) {
    return
  }
  selectedFileId.value = id
  selectedSummaryScope.value = null
  centerView.value = 'preview'
  const file = activeSourceFiles.value.find((item) => item.id === id)
  if (file) {
    const readingSessionId = await chatStore.startReadingSession(id, targetSubjectId, file.name).catch(() => undefined)
    if (!isComponentMounted || currentSubjectSwitchGen !== fileSelectGen || subjectId.value !== targetSubjectId || selectedFileId.value !== id) {
      if (readingSessionId) {
        void chatStore.endSessionById(readingSessionId).catch(() => undefined)
      }
    }
  }
}

const handleDeleteFile = async (file: SourceFileModel) => {
  if (deletingFileId.value) return
  try {
    await ElMessageBox.confirm(`确认删除文件“${file.name}”吗？关联的知识块将会保留。`, '删除文件', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    deletingFileId.value = file.id
    await subjectStore.deleteSourceFile(file.id)
    await refreshOverviewCache().catch(() => undefined)
    ElMessage.success('已删除文件')
    if (selectedFileId.value === file.id) {
      if (activeSourceFiles.value.length > 0) {
        selectFile(activeSourceFiles.value[0].id)
      } else {
        selectedFileId.value = null
        centerView.value = 'overview'
      }
    }
  } catch (error: any) {
    if (error === 'cancel') return
    let message = error?.message || '删除失败'
    if (error?.name === 'ApiProblemError') {
      const status = error.status || error.problem?.status
      const code = error.problem?.code
      if (status === 401) message = '未登录，请先登录'
      else if (status === 404 || code === 'RESOURCE_NOT_FOUND') message = '文件不存在或已被删除'
      else if (status === 409 || code === 'RESOURCE_VERSION_CONFLICT') message = '版本冲突，请刷新后重试'
      else if (status >= 500) message = '后端服务异常，请稍后重试'
    }
    ElMessage.error(message)
  } finally {
    deletingFileId.value = null
  }
}

const handlePreviewError = (message: string) => {
  ElMessage.warning(message)
}

const handlePreviewPageChange = (page: number, total: number) => {
  previewPage.value = page
  previewPageCount.value = Math.max(1, total)
}

// ===== Subject outline (visual prototype; not persisted) =====
interface OutlineSection {
  id: string
  title: string
  fileId?: string
  sourceIds?: string[]
  summary?: string | null
  locator?: OverviewLocator | null
}
interface OutlineChapter { id: string; title: string; sections: OutlineSection[] }
const isOutlineComposer = ref(false)
const chapterDraft = ref('')
const chapterDrafts = ref<Record<string, string>>({})
const chapterDragIndex = ref<number | null>(null)
const sectionDrag = ref<{ chapterIndex: number; sectionIndex: number } | null>(null)
const subjectOutline = ref<OutlineChapter[]>([])
const isSavingOutline = ref(false)

// ===== 各文件大纲编辑草稿与状态 =====
interface FileDraftSection {
  id: string
  title: string
  locator?: OverviewLocator | null
  summary?: string | null
}
interface FileDraftChapter {
  id: string
  title: string
  sections: FileDraftSection[]
}

const fileOutlineDrafts = ref<Record<string, FileDraftChapter[]>>({})
const savingFileIds = ref<Set<string>>(new Set())
const fileSectionDrafts = ref<Record<string, string>>({})
const fileChapterDrafts = ref<Record<string, string>>({})
const fileCardCollapsed = ref<Record<string, boolean>>({})

const draggingFileChapter = ref<{ fileId: string; index: number } | null>(null)
const draggingFileSection = ref<{ fileId: string; chapterIndex: number; sectionIndex: number } | null>(null)

const initFileOutlineDraft = (fileId: string, force = false) => {
  const currentDraft = fileOutlineDrafts.value[fileId]
  if (!force && currentDraft && currentDraft.length > 0) return

  const item = fileOverviewItems.value.find(i => i.id === fileId)
  const outline = item?.outline || fileOverviewRecords.value[fileId]?.outline
  if (Array.isArray(outline) && outline.length > 0) {
    fileOutlineDrafts.value[fileId] = outline.map((chap, cIdx) => ({
      id: `fchap-${fileId}-${cIdx}-${Date.now()}`,
      title: chap.title || `第 ${cIdx + 1} 章`,
      sections: (chap.sections || []).map((sec, sIdx) => ({
        id: `fsec-${fileId}-${cIdx}-${sIdx}-${Date.now()}`,
        title: sec.title || `第 ${sIdx + 1} 节`,
        locator: sec.locator ?? null,
        summary: sec.summary ?? null
      }))
    }))
  } else if (!currentDraft) {
    fileOutlineDrafts.value[fileId] = []
  }
}

const initAllFileOutlineDrafts = (force = false) => {
  for (const file of activeSourceFiles.value) {
    initFileOutlineDraft(file.id, force)
  }
}

const initSubjectOutlineFromExisting = (force = false) => {
  // 1. 如果学科总览已包含章节大纲，优先载入真正的学科综合大纲
  const subjectChapList = subjectOverviewRecord.value?.outline
  if (Array.isArray(subjectChapList) && subjectChapList.length > 0) {
    subjectOutline.value = subjectChapList.map((chap, i) => ({
      id: `chap-${i}-${Date.now()}`,
      title: chap.title || `第 ${i + 1} 章`,
      sections: (chap.sections || []).map((sec, j) => ({
        id: `sec-${i}-${j}-${Date.now()}`,
        title: sec.title || `第 ${j + 1} 节`,
        fileId: sec.sourceIds?.[0] || '',
        sourceIds: Array.isArray(sec.sourceIds) ? [...sec.sourceIds] : (sec.sourceIds ? [sec.sourceIds] : []),
        summary: sec.summary ?? null,
        locator: sec.locator ?? null
      }))
    }))
    return
  }

  // 2. 如果学科总览尚未生成综合大纲：
  // 若只有单一文件且已有大纲，载入该文件大纲；
  // 若有多份文件，不将所有文件大纲无脑揉在一起，而是保持学科大纲独立，分文件大纲在下方各卡片独立展示
  const filesWithOutline = fileOverviewItems.value.filter(item => Array.isArray(item.outline) && item.outline.length > 0)
  if (filesWithOutline.length === 1) {
    const singleFile = filesWithOutline[0]
    subjectOutline.value = (singleFile.outline || []).map((chap, i) => ({
      id: `chap-${i}-${Date.now()}`,
      title: chap.title || `第 ${i + 1} 章`,
      sections: (chap.sections || []).map((sec, j) => ({
        id: `sec-${i}-${j}-${Date.now()}`,
        title: sec.title || `第 ${j + 1} 节`,
        fileId: singleFile.id,
        sourceIds: Array.isArray(sec.sourceIds) && sec.sourceIds.length > 0 ? [...sec.sourceIds] : [singleFile.id],
        summary: sec.summary ?? null,
        locator: sec.locator ?? null
      }))
    }))
    return
  }

  // 3. 多份文件且未生成学科综合大纲时，初始化默认起始章节供用户编排学科大纲
  if (force || !subjectOutline.value.length) {
    subjectOutline.value = [
      { id: `chapter-${Date.now()}`, title: '第一章 · 新建章节', sections: [] }
    ]
  }
}

watch(isOutlineComposer, (val) => {
  if (val) {
    initSubjectOutlineFromExisting()
    initAllFileOutlineDrafts()
  }
})

watch(() => subjectOverviewRecord.value?.outline, (newOutline) => {
  if (isOutlineComposer.value && newOutline && newOutline.length > 0) {
    initSubjectOutlineFromExisting()
  }
})

watch(fileOverviewItems, (items) => {
  if (isOutlineComposer.value) {
    for (const item of items) {
      const draft = fileOutlineDrafts.value[item.id]
      if ((!draft || draft.length === 0) && item.outline && item.outline.length > 0) {
        initFileOutlineDraft(item.id, true)
      }
    }
  }
}, { deep: true, immediate: true })

const saveCurrentOutline = async () => {
  if (!subjectId.value || !overviewRepository || isSavingOutline.value) return
  if (!subjectOutline.value.length) return
  const targetSubjectId = subjectId.value
  isSavingOutline.value = true
  try {
    const formattedOutline: OverviewChapter[] = subjectOutline.value.map(chap => ({
      title: chap.title.trim() || '未命名章节',
      sections: chap.sections.map(sec => {
        const sourceIds = Array.isArray(sec.sourceIds) && sec.sourceIds.length > 0
          ? sec.sourceIds.filter(Boolean)
          : (sec.fileId ? [sec.fileId] : [])
        return {
          title: sec.title.trim() || '未命名小节',
          summary: sec.summary ?? null,
          sourceIds,
          locator: sec.locator ?? null
        }
      })
    }))

    const fingerprint = subjectOverviewRecord.value?.inputFingerprint || 'manual-edit'
    const record = await overviewRepository.saveSubjectOverviewPart({
      subjectId: targetSubjectId,
      mode: 'OUTLINE',
      response: {
        schemaVersion: 1,
        title: subjectOverviewRecord.value?.title || '学科总览',
        outline: formattedOutline,
        summary: subjectOverviewRecord.value?.summary || null
      },
      inputFingerprint: fingerprint
    })
    // 检查保存返回后当前学科是否仍为目标学科，若已切换学科则不更新当前页面的 state 与提示，防止旧学科大纲污染新学科
    if (subjectId.value !== targetSubjectId) return
    subjectOverviewRecord.value = record
    ElMessage.success('大纲已成功保存')
  } catch (err) {
    if (subjectId.value !== targetSubjectId) return
    console.error('保存大纲失败:', err)
    ElMessage.error('保存大纲失败，请重试')
  } finally {
    isSavingOutline.value = false
  }
}
const fileById = (id?: string) => activeSourceFiles.value.find(file => file.id === id)
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
  if (chapter) chapter.sections.push({ id: `section-${Date.now()}`, title, sourceIds: [], summary: null, locator: null })
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

// ===== 各文件大纲操作与保存逻辑 =====
const saveFileOutline = async (fileId: string) => {
  const file = activeSourceFiles.value.find(f => f.id === fileId)
  if (!file || !overviewRepository) return

  const drafts = fileOutlineDrafts.value[fileId] || []
  savingFileIds.value.add(fileId)
  try {
    const formattedOutline: OverviewChapter[] = drafts.map(chap => ({
      title: chap.title.trim() || '未命名章节',
      sections: chap.sections.map(sec => ({
        title: sec.title.trim() || '未命名小节',
        summary: sec.summary ?? null,
        sourceIds: [fileId],
        locator: sec.locator ?? null
      }))
    }))

    const existingRecord = fileOverviewRecords.value[fileId]
    const revision = file.ingestionRevision || existingRecord?.ingestionRevision || 'manual-edit'

    const updatedRecord = await overviewRepository.saveFileOverviewPart({
      sourceId: fileId,
      ingestionRevision: revision,
      mode: 'OUTLINE',
      response: {
        schemaVersion: 1,
        title: existingRecord?.title || file.name,
        outline: formattedOutline,
        summary: existingRecord?.summary || null
      }
    })

    fileOverviewRecords.value = {
      ...fileOverviewRecords.value,
      [fileId]: updatedRecord
    }

    ElMessage.success(`《${file.name}》大纲已保存`)
  } catch (err) {
    console.error(`保存文件大纲失败 [${fileId}]:`, err)
    ElMessage.error(`保存《${file.name}》大纲失败，请重试`)
  } finally {
    savingFileIds.value.delete(fileId)
  }
}

const createInitialFileOutline = (fileId: string) => {
  fileOutlineDrafts.value[fileId] = [
    {
      id: `fchap-${fileId}-0-${Date.now()}`,
      title: '第一章 · 新建章节',
      sections: []
    }
  ]
}

const addFileChapter = (fileId: string) => {
  const title = (fileChapterDrafts.value[fileId] || '').trim()
  if (!title) return
  if (!fileOutlineDrafts.value[fileId]) {
    fileOutlineDrafts.value[fileId] = []
  }
  fileOutlineDrafts.value[fileId].push({
    id: `fchap-${fileId}-${Date.now()}`,
    title,
    sections: []
  })
  fileChapterDrafts.value[fileId] = ''
}

const deleteFileChapter = (fileId: string, chapterIndex: number) => {
  fileOutlineDrafts.value[fileId]?.splice(chapterIndex, 1)
}

const addFileSection = (fileId: string, chapterId: string, chapterIndex: number) => {
  const draftKey = `${fileId}-${chapterId}`
  const title = (fileSectionDrafts.value[draftKey] || '').trim()
  if (!title) return
  const chapter = fileOutlineDrafts.value[fileId]?.[chapterIndex]
  if (!chapter) return
  chapter.sections.push({
    id: `fsec-${fileId}-${chapterId}-${Date.now()}`,
    title
  })
  fileSectionDrafts.value[draftKey] = ''
}

const deleteFileSection = (fileId: string, chapterIndex: number, sectionIndex: number) => {
  fileOutlineDrafts.value[fileId]?.[chapterIndex]?.sections?.splice(sectionIndex, 1)
}

const startFileChapterDrag = (fileId: string, chapterIndex: number) => {
  draggingFileChapter.value = { fileId, index: chapterIndex }
}

const handleFileChapterDrop = (fileId: string, targetIndex: number) => {
  if (!draggingFileChapter.value || draggingFileChapter.value.fileId !== fileId) return
  const src = draggingFileChapter.value.index
  if (src === targetIndex) return
  const list = fileOutlineDrafts.value[fileId]
  if (!list) return
  const [item] = list.splice(src, 1)
  list.splice(targetIndex, 0, item)
  draggingFileChapter.value = null
}

const startFileSectionDrag = (fileId: string, chapterIndex: number, sectionIndex: number) => {
  draggingFileSection.value = { fileId, chapterIndex, sectionIndex }
}

const handleFileSectionDrop = (fileId: string, targetChapterIndex: number, targetSectionIndex: number) => {
  if (!draggingFileSection.value || draggingFileSection.value.fileId !== fileId) return
  const { chapterIndex: srcChap, sectionIndex: srcSec } = draggingFileSection.value
  const list = fileOutlineDrafts.value[fileId]
  if (!list) return
  const srcChapter = list[srcChap]
  const targetChapter = list[targetChapterIndex]
  if (!srcChapter || !targetChapter) return
  const [sec] = srcChapter.sections.splice(srcSec, 1)
  targetChapter.sections.splice(targetSectionIndex, 0, sec)
  draggingFileSection.value = null
}

const handleLinkFile = (chapterIndex: number, sectionIndex: number, fileId: string) => {
  if (fileId) {
    const section = subjectOutline.value[chapterIndex]?.sections?.[sectionIndex]
    if (section) {
      section.fileId = fileId
      if (!section.sourceIds) section.sourceIds = []
      if (!section.sourceIds.includes(fileId)) {
        section.sourceIds.push(fileId)
      }
      ElMessage.success('已关联文件')
    }
  }
  document.body.click() // close popover
}

const unlinkFile = (chapterIndex: number, sectionIndex: number, targetFileId?: string) => {
  const section = subjectOutline.value[chapterIndex]?.sections?.[sectionIndex]
  if (!section) return
  if (targetFileId) {
    if (Array.isArray(section.sourceIds)) {
      section.sourceIds = section.sourceIds.filter(id => id !== targetFileId)
    }
    if (section.fileId === targetFileId) {
      section.fileId = section.sourceIds?.[0] || ''
    }
  } else {
    delete section.fileId
    section.sourceIds = []
  }
  ElMessage.success('已解除关联')
}

const handleOutlineAi = async () => {
  tier2Open.value = true
  subjectOverviewCollapsed.value = false
  if (!await ensureOverviewRuntime() || !overviewGeneration) return
  subjectOverviewGenerating.value = true
  try {
    const result = await overviewGeneration.regenerateSubjectOverview(subjectId.value, 'ALL')
    if (applyManualOverviewResult(result, { kind: 'subject', id: subjectId.value })) await refreshOverviewCache()
  } finally {
    subjectOverviewGenerating.value = false
  }
}

const handleSubjectOutlineRegenerate = async () => {
  tier2Open.value = true
  subjectOverviewCollapsed.value = false
  if (!await ensureOverviewRuntime() || !overviewGeneration) return
  subjectOverviewGenerating.value = true
  try {
    const result = await overviewGeneration.regenerateSubjectOverview(subjectId.value, 'OUTLINE')
    if (applyManualOverviewResult(result, { kind: 'subject', id: subjectId.value })) await refreshOverviewCache()
  } finally {
    subjectOverviewGenerating.value = false
  }
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
const droppedFile = ref<File | null>(null)
const uploadProgress = ref(0)
const uploadStage = ref('')

const openRegisterModal = () => {
  registerForm.value = { name: '', filePath: '', fileType: 'PDF', fileSize: 0, subjectId: subjectId.value || '' }
  droppedFile.value = null
  uploadProgress.value = 0
  uploadStage.value = ''
  showRegisterModal.value = true
}

const isUploading = ref(false)

const handleRegisterFile = async (data: { file: File; name: string; subjectId: string }) => {
  droppedFile.value = data.file
  registerForm.value.name = data.name
  registerForm.value.subjectId = data.subjectId

  const targetSubjectId = registerForm.value.subjectId
  if (!registerForm.value.name.trim() || !targetSubjectId || !droppedFile.value || isUploading.value) {
    if (!droppedFile.value) ElMessage.warning('请先选择或拖拽文件')
    else if (!registerForm.value.name.trim()) ElMessage.warning('请输入文件名称')
    else if (!targetSubjectId) ElMessage.warning('请选择归档学科')
    return
  }

  const currentFile = droppedFile.value
  try {
    validateUploadFile(currentFile)
  } catch {
    ElMessage.error('文件上传失败，请检查格式和大小')
    return
  }
  isUploading.value = true
  uploadProgress.value = 0
  uploadStage.value = '准备上传'

  try {
    const asset = await assetStore.upload(currentFile, (percent, stage) => {
      uploadProgress.value = percent
      uploadStage.value = stage
    })
    const newId = await sourceStore.createFileSource(
      targetSubjectId,
      registerForm.value.name.trim(),
      asset.id,
      '[]',
      asset.sizeBytes,
    )
    
    if (targetSubjectId === subjectId.value && !selectedFileId.value) {
      selectedFileId.value = newId
      centerView.value = 'preview'
    }

    if (targetSubjectId === subjectId.value) await sourceStore.loadLocalSourceFiles(subjectId.value)

    showRegisterModal.value = false
    registerForm.value = { name: '', filePath: '', fileType: 'PDF', fileSize: 0, subjectId: '' }
    droppedFile.value = null
    ElNotification({ title: '已保存到本地', message: `${currentFile.name} 将在后台同步`, type: 'success', position: 'top-right' })
  } catch (e: any) {
    console.error(e)
    ElNotification({ title: '录入失败', message: e.message || '文件上传或创建失败，请重试', type: 'error', position: 'top-right' })
  } finally {
    isUploading.value = false
  }
}

// ===== Task Creation =====
const showTaskModal = ref(false)

const handleAddTask = async (taskData: { name: string; duration: number }) => {
  if (!taskData.name.trim() || !activeSubject.value) return
  const s = activeSubject.value
  await taskStore.addTask({ name: taskData.name.trim(), subject: s.name, desc: '从学科工作区', duration: taskData.duration, status: 'pending', subjectId: s.id })
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
const openCreateDialog = () => { selectedBlock.value = null; isEditMode.value = true; isCreateMode.value = true; editForm.value = { id: '', subject: activeSubject.value?.name || '', title: '', color: 'rgba(181,196,177,0.4)', preview: '', source: '手动创建' }; blockDialogVisible.value = true }
const blockDialogMode = computed<'view' | 'edit' | 'create'>({
  get: () => {
    if (isCreateMode.value) return 'create'
    if (isEditMode.value) return 'edit'
    return 'view'
  },
  set: (val) => {
    if (val === 'create') {
      isCreateMode.value = true
      isEditMode.value = true
    } else if (val === 'edit') {
      isCreateMode.value = false
      isEditMode.value = true
    } else {
      isCreateMode.value = false
      isEditMode.value = false
    }
  }
})

const handleSaveBlockFromDialog = async (data: { id?: string; subject: string; title: string; color: string; preview: string; source: string }) => {
  editForm.value = {
    id: data.id || '',
    subject: data.subject,
    title: data.title,
    color: data.color,
    preview: data.preview,
    source: data.source
  }
  await handleSaveBlock()
}

const closeBlockDialog = () => { blockDialogVisible.value = false; isEditMode.value = false; isCreateMode.value = false }

const handleSaveBlock = async () => {
  if (!editForm.value.title.trim() || !editForm.value.preview.trim()) { ElNotification({ title: '请填写必填项', type: 'warning', position: 'top-right' }); return }
  if (isCreateMode.value) { await blockStore.addBlock({ subject: editForm.value.subject, title: editForm.value.title, preview: editForm.value.preview, time: new Date().toLocaleString(), source: editForm.value.source, color: editForm.value.color, subjectId: subjectId.value, sourceFileId: selectedSourceId.value || undefined }); ElNotification({ title: '已录入', type: 'success', position: 'top-right' }) }
  else { await blockStore.updateBlock({ ...selectedBlock.value, subject: editForm.value.subject, title: editForm.value.title, preview: editForm.value.preview, color: editForm.value.color, time: new Date().toLocaleString() }); ElNotification({ title: '已更新', type: 'success', position: 'top-right' }) }
  closeBlockDialog()
}

const handleDeleteBlock = async (id: string) => { if (!id || !confirm('确定删除？')) return; await blockStore.removeBlock(id); blockDialogVisible.value = false; ElNotification({ title: '已删除', type: 'success', position: 'top-right' }) }
const handleCopyBlockContent = (c: string) => { if (c) { navigator.clipboard.writeText(c); ElNotification({ title: '已复制', type: 'success', position: 'top-right', duration: 2000 }) } }
interface PresetQuestionItem {
  label: string
  prompt: string
}

const presetQuestions: PresetQuestionItem[] = [
  { label: '提炼当前核心要点', prompt: '总结当前文件的核心要点与关键脉络' },
  { label: '梳理本章关键概念', prompt: '查找并梳理本章的核心概念与权威解释' },
  { label: '生成三道自测考题', prompt: '针对当前内容生成 3 道自测题以巩固记忆' }
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
const pendingChatMessage = computed(() => storedPendingMessage.value)
const chatInput = ref('')
const isAiStreaming = computed(() => storedChatStreaming.value)
const streamingContent = computed(() => storedStreamingContent.value)
const chatScrollRef = ref<HTMLElement | null>(null)
const chatInputRef = ref<HTMLTextAreaElement | null>(null)
const showProcessingRequired = computed(() => {
  const sourceIds = aiReferenceScope.value === 'AUTO'
    ? (selectedFileId.value ? [selectedFileId.value] : [])
    : aiReferenceScope.value === 'SELECTED_SOURCES'
      ? selectedAiSourceIds.value
      : []
  return sourceIds.some((sourceId) => {
    const file = activeSourceFiles.value.find((item) => item.id === sourceId)
    return !file || file.ingestionStatus !== 'READY'
      || documentProcessingStore.jobs.some((job) => job.sourceId === sourceId && job.phase !== 'READY')
  })
})
const showFileMenu = ref(false)
const showModelMenu = showFileMenu

type AiReferenceScope = 'AUTO' | 'SELECTED_SOURCES' | 'SUBJECT' | 'NONE'
const MAX_AI_REFERENCE_SOURCES = 100
const aiReferenceScope = ref<AiReferenceScope>('NONE')
const selectedAiSourceIds = ref<string[]>([])

const addAiReferenceSourceWithinLimit = (selected: Set<string>, sourceId: string) => {
  if (selected.has(sourceId)) return true
  if (selected.size >= MAX_AI_REFERENCE_SOURCES) {
    ElNotification({
      title: '参考资料数量已达上限',
      message: '最多引用 100 份资料（包含当前文件），请先取消选择其他资料。',
      type: 'warning',
      position: 'top-right',
    })
    return false
  }
  selected.add(sourceId)
  return true
}

watch(
  selectedFileId,
  (newId) => {
    if (aiReferenceScope.value === 'AUTO') {
      selectedAiSourceIds.value = newId ? [newId] : []
    } else if (aiReferenceScope.value === 'SELECTED_SOURCES' && newId) {
      const current = activeSourceFiles.value.find((file) => file.id === newId)
      if (current?.ingestionStatus === 'READY' && !selectedAiSourceIds.value.includes(newId)) {
        const selected = new Set(selectedAiSourceIds.value)
        if (addAiReferenceSourceWithinLimit(selected, newId)) {
          selectedAiSourceIds.value = [...selected]
        }
      }
    }
  },
  { immediate: true }
)

const isAllAiSourcesSelected = computed(() => {
  return aiReferenceScope.value === 'SUBJECT'
})

const isAiSourceSelected = (id: string) => {
  return aiReferenceScope.value === 'SUBJECT' || selectedAiSourceIds.value.includes(id)
}

const toggleAiSource = (id: string) => {
  const file = activeSourceFiles.value.find((item) => item.id === id)
  if (!file || file.ingestionStatus !== 'READY') return
  if (id === selectedFileId.value) {
    selectCurrentAiSource()
    return
  }

  const selected = new Set(aiReferenceScope.value === 'SELECTED_SOURCES'
    ? selectedAiSourceIds.value
    : [])
  const current = activeSourceFiles.value.find((item) => item.id === selectedFileId.value)
  if (selected.has(id)) {
    selected.delete(id)
    if (current?.ingestionStatus === 'READY' && !addAiReferenceSourceWithinLimit(selected, current.id)) return
  } else {
    if (current?.ingestionStatus === 'READY' && !addAiReferenceSourceWithinLimit(selected, current.id)) return
    if (!addAiReferenceSourceWithinLimit(selected, id)) return
  }

  selectedAiSourceIds.value = [...selected]
  aiReferenceScope.value = selected.size === 0
    ? 'NONE'
    : selected.size === 1 && selected.has(selectedFileId.value || '')
      ? 'AUTO'
      : 'SELECTED_SOURCES'
}

const selectCurrentAiSource = () => {
  if (!selectedFileId.value) return
  aiReferenceScope.value = 'AUTO'
  selectedAiSourceIds.value = [selectedFileId.value]
}

const selectNoAiSources = () => {
  aiReferenceScope.value = 'NONE'
  selectedAiSourceIds.value = []
}

const selectAllAiSources = () => {
  aiReferenceScope.value = 'SUBJECT'
  selectedAiSourceIds.value = []
}

const aiChatReferenceOptions = () => {
  const current = activeSourceFiles.value.find((file) =>
    file.id === selectedFileId.value && file.subjectId === subjectId.value && file.ingestionStatus === 'READY')
  if (aiReferenceScope.value === 'NONE') {
    return { subjectId: subjectId.value, retrievalMode: 'NONE' as const }
  }
  if (aiReferenceScope.value === 'SUBJECT') {
    return { subjectId: subjectId.value, retrievalMode: 'SUBJECT' as const }
  }
  if (aiReferenceScope.value === 'AUTO') {
    return {
      subjectId: subjectId.value,
      sourceId: current?.id,
      retrievalMode: 'AUTO' as const,
    }
  }

  const sourceIds = [...new Set(selectedAiSourceIds.value.filter((id) =>
    activeSourceFiles.value.some((file) =>
      file.id === id && file.subjectId === subjectId.value && file.ingestionStatus === 'READY')))]
  if (sourceIds.length === 1 && sourceIds[0] === current?.id) {
    return { subjectId: subjectId.value, sourceId: current.id, retrievalMode: 'AUTO' as const }
  }
  return {
    subjectId: subjectId.value,
    sourceIds,
    retrievalMode: sourceIds.length ? 'SELECTED_SOURCES' as const : 'NONE' as const,
  }
}

const aiSourceSummaryText = computed(() => {
  if (aiReferenceScope.value === 'SUBJECT') return '全学科资料'
  if (aiReferenceScope.value === 'NONE') return '不引用资料'
  if (aiReferenceScope.value === 'AUTO') return selectedFile.value?.name || '当前文件'
  const count = selectedAiSourceIds.value.length
  if (count === 1) {
    const file = activeSourceFiles.value.find(f => f.id === selectedAiSourceIds.value[0])
    return file?.name || '1 份资料'
  }
  return `已选 ${count} 份资料`
})

const aiSourceSummaryTitle = computed(() => {
  if (aiReferenceScope.value === 'SUBJECT') return `当前参考：全学科资料 (共 ${activeSourceFiles.value.length} 份)`
  if (aiReferenceScope.value === 'NONE') return '当前不引用资料，AI 不会检索文件'
  if (aiReferenceScope.value === 'AUTO') return `当前参考：${selectedFile.value?.name || '当前文件'}`
  const count = selectedAiSourceIds.value.length
  if (count === 1) {
    const file = activeSourceFiles.value.find(f => f.id === selectedAiSourceIds.value[0])
    return `当前参考：${file?.name || '1 份资料'}`
  }
  const names = selectedAiSourceIds.value
    .map(id => activeSourceFiles.value.find(f => f.id === id)?.name)
    .filter(Boolean)
    .join('、')
  return `当前参考 (${count} 份)：${names}`
})

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
  if (showProcessingRequired.value) {
    showNotReadyDialog.value = true
    return
  }
  chatInput.value = ''
  autoResizeInput()
  scrollChatToBottom()
  try {
    await chatStore.sendMessage(msg, {
      ...aiChatReferenceOptions(),
    })
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      const safe = classifyClientError(error, 'CHAT')
      logClientError('[SubjectWorkspace] chat send failed', error, safe)
      ElNotification({ title: 'AI 请求失败', message: safe.message, type: 'error', position: 'top-right' })
    }
  } finally {
    scrollChatToBottom()
  }
}

const retryChat = async () => {
  const pending = pendingChatMessage.value
  if (!pending?.clientRequestId || isAiStreaming.value) return
  const reqOptions = { ...(pending.requestOptions || {}) }
  if (reqOptions.sourceId && !activeSourceFiles.value.some(f => f.id === reqOptions.sourceId && f.subjectId === subjectId.value)) {
    delete reqOptions.sourceId
  }
  if (reqOptions.subjectId && reqOptions.subjectId !== subjectId.value) {
    reqOptions.subjectId = subjectId.value
  }
  try {
    await chatStore.sendMessage(pending.content, {
      ...reqOptions,
      pendingRequestId: pending.clientRequestId,
    })
  } catch (error) {
    const safe = classifyClientError(error, 'CHAT')
    logClientError('[SubjectWorkspace] chat retry failed', error, safe)
    ElNotification({ title: 'AI 请求失败', message: safe.message, type: 'error', position: 'top-right' })
  } finally {
    scrollChatToBottom()
  }
}

const clearChat = () => { chatStore.clearActiveConversation() }

const handleTextSelected = (text: string) => { selectedText.value = text.slice(0, 4000) }
const goToProcessingCenter = () => {
  showNotReadyDialog.value = false
  router.push('/profile')
}
const sendSelectionQuestion = async (prompt: string) => {
  if (!selectedText.value || isAiStreaming.value) return
  if (showProcessingRequired.value) {
    showNotReadyDialog.value = true
    return
  }
  try {
    await chatStore.sendMessage(prompt, { ...aiChatReferenceOptions(), selectionText: selectedText.value })
  } catch (error) {
    const safe = classifyClientError(error, 'CHAT')
    logClientError('[SubjectWorkspace] selection chat failed', error, safe)
    ElNotification({ title: 'AI 请求失败', message: safe.message, type: 'error', position: 'top-right' })
  }
}
const explainSelection = () => { void sendSelectionQuestion('请解释我选中的内容，并指出其中的关键概念。') }
const askSelection = () => {
  chatInput.value = '请围绕我选中的内容继续讲解：'
  void sendSelectionQuestion(chatInput.value)
  chatInput.value = ''
}
const saveSelection = () => { showKnowledgeEditor.value = true }
const saveKnowledgeBlock = async (value: { title: string; content: string; tags: string[] }) => {
  if (!activeSubject.value) return
  const validSourceFileId = activeSourceFiles.value.some(f => f.id === selectedFileId.value && f.subjectId === subjectId.value)
    ? (selectedFileId.value || undefined)
    : undefined
  await blockStore.addBlock({
    subjectId: subjectId.value,
    sourceFileId: validSourceFileId,
    subject: activeSubject.value.name,
    title: value.title,
    preview: value.content.slice(0, 180),
    content: value.content,
    tags: value.tags,
    source: selectedFile.value?.name || '选中文本',
  })
  showKnowledgeEditor.value = false
  ElNotification({ title: '已保存为知识块', type: 'success', position: 'top-right' })
}

// ===== Lifecycle =====
const startFreshChatSession = async () => {
  await chatStore.endActiveSession()
}

let processingRefreshTimer: ReturnType<typeof setInterval> | null = null
let currentSubjectSwitchGen = 0
let isComponentMounted = false

const startProcessingRefresh = () => {
  if (!isComponentMounted || processingRefreshTimer !== null) return
  processingRefreshTimer = setInterval(() => { void documentProcessingStore.refresh() }, 1500)
}

const stopProcessingRefresh = () => {
  if (processingRefreshTimer !== null) {
    clearInterval(processingRefreshTimer)
    processingRefreshTimer = null
  }
}

onMounted(async () => {
  isComponentMounted = true
  startProcessingRefresh()
  const mountGen = ++currentSubjectSwitchGen
  try {
    await startFreshChatSession()
  } catch {
    // The workspace remains usable when chat is unavailable.
  }
  const id = subjectId.value
  if (id) {
    if (!isComponentMounted || currentSubjectSwitchGen !== mountGen || subjectId.value !== id) return
    subjectStore.setActiveSubject(id)
    await subjectStore.loadSourceFiles(id)
    if (!isComponentMounted || currentSubjectSwitchGen !== mountGen || subjectId.value !== id) return
    await ensureOverviewRuntime()
    if (!isComponentMounted || currentSubjectSwitchGen !== mountGen || subjectId.value !== id) return
    await blockStore.fetchBlocks(undefined, id)
    if (!isComponentMounted || currentSubjectSwitchGen !== mountGen || subjectId.value !== id) return
    if (activeSourceFiles.value.length > 0) {
      const firstFile = activeSourceFiles.value[0]
      aiReferenceScope.value = 'AUTO'
      selectedAiSourceIds.value = [firstFile.id]
      selectedFileId.value = firstFile.id
      centerView.value = 'preview'
      const readingSessionId = await chatStore.startReadingSession(firstFile.id, id, firstFile.name).catch(() => undefined)
      if (!isComponentMounted || currentSubjectSwitchGen !== mountGen || subjectId.value !== id || selectedFileId.value !== firstFile.id) {
        if (readingSessionId) {
          void chatStore.endSessionById(readingSessionId).catch(() => undefined)
        }
        return
      }
    } else {
      centerView.value = 'overview'
    }
  }
})

watch(subjectId, async (newId) => {
  const switchGen = ++currentSubjectSwitchGen
  if (newId) {
    // 立即同步清空草稿、大纲与选中文件状态，杜绝任何异步间隙内新学科携带旧文件或旧草稿
    chatStore.abortStream()
    chatStore.clearActiveConversation()
    selectedFileId.value = null
    selectedText.value = ''
    selectedAiSourceIds.value = []
    aiReferenceScope.value = 'NONE'
    sourceStore.clearActiveSourceFiles()
    subjectOutline.value = []
    fileOutlineDrafts.value = {}
    chapterDraft.value = ''
    chapterDrafts.value = {}
    fileSectionDrafts.value = {}
    fileChapterDrafts.value = {}
    selectedSummaryScope.value = null
    subjectOverviewRecord.value = null
    fileOverviewRecords.value = {}
    isSubjectOverviewStale.value = false
    subjectOverviewManualError.value = null
    fileOverviewManualErrors.value = {}
    subjectOverviewGenerating.value = false
    generatingFileIds.value = new Set()

    subjectStore.setActiveSubject(newId)

    try {
      await startFreshChatSession()
    } catch {
      // Keep the workspace usable when a fresh chat session cannot be created.
    }
    if (!isComponentMounted || currentSubjectSwitchGen !== switchGen || subjectId.value !== newId) return

    await subjectStore.loadSourceFiles(newId)
    if (!isComponentMounted || currentSubjectSwitchGen !== switchGen || subjectId.value !== newId) return

    await ensureOverviewRuntime()
    if (!isComponentMounted || currentSubjectSwitchGen !== switchGen || subjectId.value !== newId) return

    await blockStore.fetchBlocks(undefined, newId)
    if (!isComponentMounted || currentSubjectSwitchGen !== switchGen || subjectId.value !== newId) return
    if (isOutlineComposer.value) {
      initSubjectOutlineFromExisting(true)
      initAllFileOutlineDrafts(true)
    }
    if (activeSourceFiles.value.length > 0) {
      const firstFile = activeSourceFiles.value[0]
      aiReferenceScope.value = 'AUTO'
      selectedAiSourceIds.value = [firstFile.id]
      selectedFileId.value = firstFile.id
      centerView.value = 'preview'
      const readingSessionId = await chatStore.startReadingSession(firstFile.id, newId, firstFile.name).catch(() => undefined)
      if (!isComponentMounted || currentSubjectSwitchGen !== switchGen || subjectId.value !== newId || selectedFileId.value !== firstFile.id) {
        if (readingSessionId) {
          void chatStore.endSessionById(readingSessionId).catch(() => undefined)
        }
        return
      }
    } else {
      selectedFileId.value = null
      centerView.value = 'overview'
    }
  }
})

onUnmounted(() => {
  isComponentMounted = false
  currentSubjectSwitchGen++
  stopProcessingRefresh()
  void chatStore.endActiveSession().catch(() => undefined)
})
</script>

<style scoped>
/* ===== Root & Themes Overrides ===== */
.workspace-container {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--color-bg-secondary, #EEEEEE); /* 页面大背景 / 次级中性底 */
  padding: 8px;
  gap: 8px;

  /* Zen Minimalist Theme override */
  --color-primary-accent: #8B9A6E;
  --color-primary-accent-hover: #76855B;
  --color-primary-light: rgba(139, 154, 110, 0.16);
  --color-primary-glow: rgba(139, 154, 110, 0.28);
  --accent-gradient: linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%);
  --workspace-card-shadow: 0 10px 24px -4px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03);
}

html.dark .workspace-container {
  background: var(--color-bg-primary);
  --workspace-card-shadow: 0 10px 24px -4px rgba(0, 0, 0, 0.35), 0 2px 6px -1px rgba(0, 0, 0, 0.2);
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
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--workspace-card-shadow);
}

html.dark .tier1-strip {
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-subtle);
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
  color: #ffffff;
  box-shadow: var(--shadow-sm);
}

/* ===== Tier-2 Drawer (Rounded Card) ===== */
.tier2-drawer {
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--workspace-card-shadow);
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
  width: 27px;
  height: 27px;
  border: 0;
  border-radius: 50%;
  background: var(--btn-primary-bg, linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%));
  color: #ffffff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.35);
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease, opacity 0.2s ease;
}

.drawer-action:hover {
  transform: scale(1.06);
  box-shadow: 0 4px 14px rgba(139, 154, 110, 0.5);
  opacity: 0.95;
}

.drawer-action:active {
  transform: scale(0.96);
  box-shadow: 0 2px 4px rgba(139, 154, 110, 0.25);
}

html.dark .drawer-action {
  background: var(--btn-primary-bg, linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%));
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.4);
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

.drawer-item:hover { background: var(--color-bg-tertiary, #FAF7F2); }
html.dark .drawer-item:hover { background: rgba(255, 255, 255, 0.04); }

.drawer-item.is-active {
  background: linear-gradient(90deg, rgba(139, 154, 110, 0.15) 0%, rgba(139, 154, 110, 0.04) 100%);
  font-weight: 700;
  color: var(--color-primary-accent);
  box-shadow: 0 2px 10px rgba(139, 154, 110, 0.08);
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
  box-shadow: 0 0 8px rgba(139, 154, 110, 0.5);
}

.drawer-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.drawer-item-name { font-size: 13.5px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.drawer-item-meta { font-size: 10.5px; color: var(--text-muted); }

.drawer-item-delete {
  display: flex;
  flex: none;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--transition-fast), background var(--transition-fast), color var(--transition-fast);
}

.selection-actions {
  position: absolute;
  z-index: 8;
  left: 24px;
  bottom: 58px;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: calc(100% - 48px);
  padding: 7px 9px;
  border: 1px solid rgba(125, 147, 114, .28);
  border-radius: 10px;
  background: rgba(250, 248, 243, .96);
  box-shadow: 0 8px 22px rgba(40, 45, 38, .12);
}
.selection-actions button { border: 0; border-radius: 7px; padding: 5px 8px; background: rgba(125, 147, 114, .1); color: var(--text-secondary); cursor: pointer; font-size: 11px; white-space: nowrap; }
.selection-actions .selection-summary { color: var(--text-muted); font-size: 11px; white-space: nowrap; }
.selection-actions .selection-dismiss { padding: 3px 6px; background: transparent; color: var(--text-muted); font-size: 16px; line-height: 1; }

.drawer-item:hover .drawer-item-delete { opacity: 1; }
.drawer-item-delete:focus-visible { opacity: 1; outline: 2px solid var(--color-primary-accent); outline-offset: 2px; }
.drawer-item-delete:hover:not(:disabled) { color: var(--error, #b4534b); background: rgba(239, 68, 68, 0.1); }
.drawer-item-delete:disabled { cursor: wait; opacity: 0.5; }

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
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--workspace-card-shadow);
}

html.dark .workspace-center {
  border: 1px solid var(--border-subtle);
}

.center-status-bar {
  height: 48px;
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--color-bg-primary, #F7F2EB);
  position: relative;
  z-index: 2;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
}

.status-left, .status-right { display: flex; align-items: center; gap: 10px; }
.status-left { min-width: 0; flex: 1; }
.status-right { flex: none; }
.status-file { font-size: 13.5px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
.status-left .status-file { min-width: 0; }
.status-icon { color: var(--text-muted); opacity: 0.7; }
.status-page { font-size: 12px; color: var(--text-muted); }
.preview-status-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}
.preview-control-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border-subtle);
  border-radius: 9px;
  background: var(--color-bg-tertiary, #FAF7F2);
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04);
}
.preview-status-button,
.preview-page-button {
  min-width: 28px;
  height: 28px;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: 7px;
  color: var(--text-secondary);
  background: transparent;
  box-shadow: none;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  transition: all 120ms ease;
}
.preview-status-button {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}
.preview-status-button:hover:not(:disabled) {
  border-color: transparent;
  background: rgba(139, 154, 110, 0.14);
  color: var(--color-primary-accent, #8B9A6E);
  box-shadow: none;
}
.preview-page-button {
  border: 1px solid var(--border-subtle);
  background: var(--color-bg-tertiary, #FAF7F2);
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04);
}
.preview-page-button:hover:not(:disabled) {
  border-color: var(--color-primary-accent, #8B9A6E);
  background: rgba(139, 154, 110, 0.14);
  color: var(--color-primary-accent, #8B9A6E);
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.2);
}
.preview-status-button:active:not(:disabled) {
  transform: translateY(1px);
  box-shadow: none;
}
.preview-page-button:active:not(:disabled) { transform: translateY(1px); box-shadow: 0 1px 2px rgba(24, 32, 28, 0.08); }
.preview-status-button:focus-visible,
.preview-page-button:focus-visible { outline: 2px solid var(--color-primary-accent, #8B9A6E); outline-offset: 2px; }
.preview-status-button:disabled,
.preview-page-button:disabled {
  cursor: not-allowed;
  border-color: transparent;
  color: var(--text-muted);
  background: transparent;
  box-shadow: none;
  opacity: 0.5;
}
.preview-status-button:disabled {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}
.preview-status-button-wide {
  min-width: 42px;
  color: var(--color-primary-accent, #8B9A6E);
}
.preview-status-button-wide:hover:not(:disabled) {
  color: #76855B;
  background: rgba(139, 154, 110, 0.18);
}
.preview-status-button-icon { width: 30px; padding: 0; }
.preview-zoom-value,
.preview-rotation-value {
  min-width: 42px;
  color: var(--text-primary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  line-height: 28px;
  text-align: center;
}
.preview-rotation-controls { display: inline-flex; align-items: center; gap: 4px; }
.preview-rotation-value { min-width: 34px; color: var(--text-secondary); }
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
  background: var(--color-bg-primary, #F7F2EB);
}

.preview-page-footer {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 48px;
  padding: 6px 0;
  border-top: 1px solid var(--border-subtle);
  background: var(--color-bg-primary, #F7F2EB);
  position: relative;
  z-index: 2;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.03);
}
.preview-page-count { min-width: 48px; color: var(--text-secondary); font-size: 12px; text-align: center; }

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
  background: var(--color-bg-primary, #F7F2EB);
  display: flex;
  flex-direction: column;
}

/* Blocks Workspace */
.blocks-workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 24px 28px 20px;
  background: var(--color-bg-primary, #F7F2EB);
}

.blocks-top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-shrink: 0; }

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
  padding: 8px 6px 24px 6px;
  margin: 0 -6px;
}
.blocks-grid::-webkit-scrollbar { display: none; }

.block-card {
  position: relative;
  background: var(--color-bg-tertiary, #FAF7F2);
  border-radius: 14px;
  padding: 18px;
  cursor: pointer;
  transition: all var(--transition-normal);
  display: flex;
  flex-direction: column;
  min-height: 150px;
  border: 1px solid var(--border-subtle);
  box-shadow: 0 4px 14px -2px rgba(0, 0, 0, 0.04), 0 2px 6px -1px rgba(0, 0, 0, 0.02);
}

html.dark .block-card {
  background: var(--color-bg-secondary);
  box-shadow: 0 8px 20px -4px rgba(0, 0, 0, 0.35), 0 3px 6px -1px rgba(0, 0, 0, 0.2);
}

.block-card:hover {
  transform: translateY(-3px);
  border-color: var(--color-primary-accent, #8B9A6E);
  box-shadow: 0 10px 22px -3px rgba(0, 0, 0, 0.06), 0 4px 10px -2px rgba(139, 154, 110, 0.12);
  z-index: 2;
}

html.dark .block-card:hover {
  box-shadow: 0 14px 28px -4px rgba(0, 0, 0, 0.45), 0 6px 12px -2px rgba(0, 0, 0, 0.3);
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
  background: rgba(139, 154, 110, 0.08);
  color: var(--color-primary-accent, #8B9A6E);
  font-size: 14px;
  font-weight: 600;
  border: 1px dashed rgba(139, 154, 110, 0.35);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.onboarding-drag-capsule:hover {
  background: rgba(139, 154, 110, 0.14);
  border-color: rgba(139, 154, 110, 0.55);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(139, 154, 110, 0.12);
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
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 24px;
  cursor: pointer;
  transition: all var(--transition-normal);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  box-shadow: 0 4px 14px -2px rgba(0, 0, 0, 0.04), 0 2px 6px -1px rgba(0, 0, 0, 0.02);
}

html.dark .onboarding-card {
  background: var(--color-bg-secondary);
}

.onboarding-card:hover {
  transform: translateY(-3px);
  border-color: var(--color-primary-accent, #8B9A6E);
  box-shadow: 0 10px 22px -3px rgba(0, 0, 0, 0.06), 0 4px 10px -2px rgba(139, 154, 110, 0.12);
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
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--workspace-card-shadow);
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
  border: 1px solid var(--border-subtle);
}

.ai-header {
  height: 48px;
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--color-bg-primary, #F7F2EB);
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
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  border-radius: 2px 14px 14px 14px;
  box-shadow: 0 2px 8px -1px rgba(0, 0, 0, 0.03);
}

.chat-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.08);
  color: #b42318;
  font-size: 12px;
}

.chat-error-message {
  min-width: 0;
  overflow-wrap: anywhere;
}

.chat-error-retry {
  flex-shrink: 0;
  border: 1px solid currentColor;
  border-radius: 6px;
  padding: 4px 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
}

.chat-error-retry:disabled {
  cursor: default;
  opacity: 0.55;
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
  border-top: 1px solid var(--border-subtle);
  background: var(--color-bg-primary, #F7F2EB);
}

.ai-input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-default);
  border-radius: 14px;
  padding: 8px 12px;
  transition: all var(--transition-fast);
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.03);
}

html.dark .ai-input-wrapper {
  background: var(--color-bg-secondary);
}

.ai-input-wrapper:focus-within {
  border-color: var(--color-primary-accent, #8B9A6E);
  background: var(--color-bg-tertiary, #FAF7F2);
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18), 0 2px 6px rgba(0, 0, 0, 0.04);
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
  width: 34px;
  height: 34px;
  border: none;
  background: rgba(139, 154, 110, 0.12);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-muted);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0;
}

.ai-send-btn.is-ready {
  background: var(--btn-primary-bg, linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%));
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.4);
}
.ai-send-btn.is-ready:hover {
  transform: scale(1.06);
  background: #76855B;
  box-shadow: 0 4px 14px rgba(139, 154, 110, 0.55);
}
.ai-send-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

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
.modal-time-badge { display: inline-flex; align-items: center; font-size: 11.5px; font-weight: 600; color: var(--text-secondary); background: var(--color-bg-tertiary, #FAF7F2); padding: 4px 12px; border-radius: 999px; border: 1px solid var(--border-default); }
.modal-divider { height: 1px; background: linear-gradient(90deg, transparent, var(--border-subtle) 15%, var(--border-subtle) 85%, transparent); margin: 20px 0; border: none; }
.modal-content { font-size: 14.5px; color: var(--text-secondary); line-height: 1.8; }

.color-options { display: flex; gap: 8px; }
.color-dot { width: 22px; height: 22px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: all var(--transition-fast); }
.color-dot:hover { transform: scale(1.1); }
.color-dot.is-selected { border-color: var(--text-primary); transform: scale(1.15); }

/* ===== Subject summary & outline prototype ===== */
.outline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 14px 12px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.05));
  margin-bottom: 10px;
}
.outline-header .drawer-title {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: 0.3px;
  flex-shrink: 0;
}
.outline-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.outline-header-hint-capsule {
  display: inline-flex;
  align-items: center;
  gap: 4.5px;
  padding: 1.5px 7.5px;
  border-radius: 999px;
  background: rgba(125, 147, 114, 0.1);
  border: 1px solid rgba(125, 147, 114, 0.25);
  color: var(--color-primary-accent);
  font-size: 10px;
  font-weight: 550;
  white-space: nowrap;
  line-height: 1.2;
  user-select: none;
  min-width: 0;
  flex-shrink: 1;
}
.hint-dot {
  width: 4.5px;
  height: 4.5px;
  border-radius: 50%;
  background: var(--color-primary-accent);
  box-shadow: 0 0 5px rgba(125, 147, 114, 0.55);
  flex-shrink: 0;
  animation: hint-dot-pulse 2.2s ease-in-out infinite alternate;
}
@keyframes hint-dot-pulse {
  0% {
    transform: scale(0.85);
    opacity: 0.65;
    box-shadow: 0 0 3px rgba(125, 147, 114, 0.35);
  }
  100% {
    transform: scale(1.18);
    opacity: 1;
    box-shadow: 0 0 7px rgba(125, 147, 114, 0.75);
  }
}
.hint-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hint-capsule-fade-enter-active {
  transition: opacity 0.32s cubic-bezier(0.16, 1, 0.3, 1), transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.hint-capsule-fade-leave-active {
  transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.hint-capsule-fade-enter-from {
  opacity: 0;
  transform: translateX(-6px) scale(0.88);
}
.hint-capsule-fade-leave-to {
  opacity: 0;
  transform: translateX(-3px) scale(0.94);
}
.outline-header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.outline-add-button {
  position: relative;
  width: 27px;
  height: 27px;
  border: 0;
  border-radius: 50%;
  background: var(--bg-modifier-hover, rgba(0, 0, 0, 0.07));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  padding: 0;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.35);
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease, background 0.25s ease;
}
.outline-add-button::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--btn-primary-bg, linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%));
  opacity: 1;
  transform: scale(1);
  transition: opacity 0.28s cubic-bezier(0.2, 0, 0, 1), transform 0.28s cubic-bezier(0.2, 0, 0, 1);
  z-index: 1;
}
.outline-add-button::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 1.5px solid rgba(139, 154, 110, 0.4);
  box-shadow: 0 0 10px rgba(139, 154, 110, 0.3);
  opacity: 0;
  transform: scale(0.8);
  pointer-events: none;
  transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 0;
}
.outline-add-button:hover {
  transform: scale(1.06);
  box-shadow: 0 4px 14px rgba(139, 154, 110, 0.5);
}
.outline-add-button:active {
  transform: scale(0.96);
}
.outline-add-icon {
  position: relative;
  z-index: 2;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(0deg);
  transform-origin: 50% 50%;
  transition: transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.25s ease;
}
.outline-add-button.is-active {
  box-shadow: none;
  background: var(--bg-modifier-hover, rgba(0, 0, 0, 0.08));
}
.outline-add-button.is-active::before {
  opacity: 0;
  transform: scale(0.82);
}
.outline-add-button.is-active::after {
  opacity: 1;
  transform: scale(1);
  animation: outline-button-pulse 2.6s ease-in-out infinite alternate;
}
.outline-add-button.is-active:hover {
  background: rgba(0, 0, 0, 0.12);
  box-shadow: none;
}
.outline-add-button.is-active .outline-add-icon {
  transform: rotate(45deg);
  color: var(--text-muted, #767676);
}
@keyframes outline-button-pulse {
  0% {
    box-shadow: 0 0 5px rgba(125, 147, 114, 0.25), 0 0 1px rgba(125, 147, 114, 0.3);
    border-color: rgba(125, 147, 114, 0.3);
  }
  100% {
    box-shadow: 0 0 14px rgba(125, 147, 114, 0.55), 0 0 2px rgba(125, 147, 114, 0.5);
    border-color: rgba(125, 147, 114, 0.65);
  }
}
.outline-composer, .outline-overview-list { padding: 0 0 14px; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
.outline-composer::-webkit-scrollbar, .outline-overview-list::-webkit-scrollbar { display: none; }

/* ===== 大纲编排卡片与头部样式 ===== */
.subject-overview-wrapper {
  padding: 0 10px;
  margin-bottom: 10px;
}
.file-outline-composer-list {
  display: grid;
  gap: 10px;
  padding: 0 10px 14px;
}
.file-overview-wrapper {
  min-width: 0;
}
.file-outline.subject-overview.is-editing,
.file-outline.file-overview.is-editing {
  position: relative;
  border: 1px solid var(--border-subtle);
  border-radius: 11px;
  background: var(--color-bg-tertiary, #FAF7F2);
  overflow: hidden;
  box-shadow: 0 4px 14px -2px rgba(0, 0, 0, 0.04), 0 2px 6px -1px rgba(0, 0, 0, 0.02);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.file-outline.subject-overview.is-editing {
  border-width: 1.5px;
  border-color: rgba(139, 154, 110, 0.4);
}
.file-outline.subject-overview.is-editing:hover,
.file-outline.file-overview.is-editing:hover {
  border-color: var(--color-primary-accent, #8B9A6E);
  box-shadow: 0 8px 20px -3px rgba(0, 0, 0, 0.06), 0 3px 8px -1px rgba(139, 154, 110, 0.12);
}
.file-outline.file-overview.is-editing.is-selected {
  border-color: var(--color-primary-accent, #8B9A6E);
  box-shadow: 0 0 0 1px rgba(139, 154, 110, 0.35), 0 8px 20px -3px rgba(139, 154, 110, 0.14);
}
.composer-file-empty-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 10px;
  margin: 4px 0;
  background: var(--color-bg-tertiary, #FAF7F2);
  border-radius: 8px;
  border: 1px dashed var(--border-subtle);
}
.composer-file-empty-box .empty-hint {
  font-size: 11px;
  color: var(--text-muted);
}
.file-outline__header {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 6px !important;
  padding: 6px 10px !important;
  background: var(--color-bg-tertiary, #FAF7F2) !important;
  border-bottom: 1px solid var(--border-subtle) !important;
  box-sizing: border-box !important;
  flex-wrap: nowrap !important;
  min-width: 0 !important;
  width: 100% !important;
}
.file-outline__header.subject-overview__header {
  background: var(--color-bg-tertiary, #FAF7F2) !important;
  border-bottom: 1px solid var(--border-subtle) !important;
}
.overview-collapse-btn {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  margin-right: 1px;
  transition: background 0.15s ease, color 0.15s ease;
}
.overview-collapse-btn:hover {
  background: var(--bg-modifier-hover);
  color: var(--text-primary);
}
.file-outline__name {
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  min-width: 0 !important;
  flex: 1 !important;
  overflow: hidden !important;
  border: 0 !important;
  background: transparent !important;
  padding: 2px 4px !important;
  border-radius: 6px !important;
  text-align: left !important;
  cursor: pointer !important;
  transition: background 0.15s ease, color 0.15s ease !important;
}
.file-outline__name:hover {
  background: rgba(125, 147, 114, 0.08) !important;
}
.file-outline.is-selected .file-outline__name {
  color: var(--color-primary-accent) !important;
}
.subject-icon {
  color: var(--color-primary-accent) !important;
  flex-shrink: 0 !important;
}
.subject-overview-title {
  font-size: 12px !important;
  font-weight: 650 !important;
  color: var(--text-primary) !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  line-height: 1.2 !important;
}
.composer-mode-badge {
  flex-shrink: 0 !important;
  display: inline-flex !important;
  align-items: center !important;
  padding: 1px 5px !important;
  border-radius: 999px !important;
  background: rgba(125, 147, 114, 0.14) !important;
  border: 1px solid rgba(125, 147, 114, 0.22) !important;
  color: var(--color-primary-accent) !important;
  font-size: 9.5px !important;
  font-weight: 600 !important;
  line-height: 1.2 !important;
  user-select: none !important;
  white-space: nowrap !important;
}
.file-outline__actions {
  flex-shrink: 0 !important;
  display: flex !important;
  align-items: center !important;
  gap: 4px !important;
}
.subject-overview__body {
  padding: 6px 8px 10px;
  display: grid;
  gap: 6px;
}
.composer-capsule-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2.5px 8px;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 10.5px;
  font-weight: 550;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
  user-select: none;
}
.composer-capsule-btn:hover:not(:disabled) {
  border-color: var(--color-primary-accent);
  color: var(--color-primary-accent);
  background: var(--bg-modifier-hover);
}
.composer-capsule-btn.is-primary {
  background: var(--color-primary-accent);
  color: #ffffff;
  border-color: transparent;
  box-shadow: 0 1px 4px rgba(125, 147, 114, 0.35);
}
.composer-capsule-btn.is-primary:hover:not(:disabled) {
  filter: brightness(1.08);
  transform: translateY(-1px);
}
.composer-capsule-btn:disabled {
  opacity: 0.55;
  cursor: wait;
}
.composer-chapter-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 4px 0 2px;
  padding: 2px 2px 4px;
  list-style: none;
}
.composer-chapter-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: relative;
}
.composer-chapter-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 4px;
  color: var(--text-primary);
  font-size: 11.5px;
  font-weight: 650;
  letter-spacing: -0.01em;
  user-select: none;
  position: relative;
}
.composer-chapter-header::before {
  content: "";
  display: inline-block;
  width: 3px;
  height: 11px;
  border-radius: 999px;
  background: var(--color-primary-accent);
  opacity: 0.75;
  flex-shrink: 0;
  margin-right: 2px;
}
.composer-drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  cursor: grab;
  opacity: 0.22;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
}
.composer-chapter-header:hover .composer-drag-handle,
.composer-section-item:hover .composer-drag-handle {
  opacity: 0.8;
}
.composer-inline-title {
  flex: 1;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-primary);
  font-size: 11.5px;
  font-weight: 650;
  letter-spacing: -0.01em;
  padding: 1.5px 4px;
  outline: none;
  transition: all 0.15s ease;
}
.composer-inline-title:hover {
  background: var(--bg-modifier-hover);
}
.composer-inline-title:focus {
  background: var(--bg-card);
  border-color: var(--color-primary-accent);
  box-shadow: 0 0 0 2px rgba(125, 147, 114, 0.15);
}
.composer-del-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s ease;
}
.composer-chapter-header:hover .composer-del-btn {
  opacity: 0.7;
}
.composer-del-btn:hover {
  opacity: 1 !important;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}
.composer-sections-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.composer-section-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3.5px 6px 3.5px 8px;
  margin: 1px 0 1px 4px;
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.45;
  transition: background 0.15s ease, color 0.15s ease;
}
.composer-section-item::before {
  content: "";
  display: inline-block;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--text-muted);
  opacity: 0.4;
  flex-shrink: 0;
  transition: transform 0.15s ease, background 0.15s ease, opacity 0.15s ease;
}
.composer-section-item:hover {
  background: var(--bg-modifier-hover);
  color: var(--text-primary);
}
.composer-section-item:hover::before {
  background: var(--color-primary-accent);
  opacity: 1;
  transform: scale(1.25);
}
.composer-section-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.composer-inline-section {
  flex: 1;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.45;
  padding: 1px 4px;
  outline: none;
  transition: all 0.15s ease;
}
.composer-inline-section:hover {
  background: rgba(0, 0, 0, 0.03);
  color: var(--text-primary);
}
.composer-inline-section:focus {
  background: var(--bg-card);
  color: var(--text-primary);
  border-color: var(--color-primary-accent);
  box-shadow: 0 0 0 2px rgba(125, 147, 114, 0.12);
}
.composer-file-tag {
  display: inline-flex;
  align-items: center;
  gap: 3.5px;
  max-width: 130px;
  padding: 1.5px 7px;
  border-radius: 999px;
  background: rgba(125, 147, 114, 0.12);
  border: 1px solid rgba(125, 147, 114, 0.28);
  color: var(--color-primary-accent);
  font-size: 10px;
  font-weight: 550;
  flex-shrink: 0;
  line-height: 1.2;
  transition: all 0.15s ease;
}
.composer-file-tag:hover {
  background: rgba(125, 147, 114, 0.18);
  border-color: rgba(125, 147, 114, 0.4);
}
.composer-file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.composer-unlink-icon {
  border: 0;
  background: transparent;
  padding: 0;
  color: inherit;
  cursor: pointer;
  opacity: 0.6;
  display: flex;
}
.composer-unlink-icon:hover {
  opacity: 1;
  color: #ef4444;
}
.composer-item-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.composer-section-item:hover .composer-item-actions {
  opacity: 1;
}
.composer-action-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}
.composer-action-btn:hover {
  background: var(--bg-modifier-hover);
  color: var(--text-primary);
}
.composer-add-section-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 2px 0 2px 14px;
  padding: 2px 6px;
}
.composer-add-dot {
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1;
  opacity: 0.45;
}
.composer-add-input {
  flex: 1;
  border: 1px dashed transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 10.5px;
  padding: 2px 6px;
  outline: none;
  transition: all 0.15s ease;
}
.composer-add-input:hover {
  border-color: var(--border-default);
  background: var(--bg-modifier-hover);
}
.composer-add-input:focus {
  border-style: solid;
  border-color: var(--color-primary-accent);
  background: var(--bg-card);
  box-shadow: 0 0 0 2px rgba(125, 147, 114, 0.12);
}
.composer-add-chapter-row {
  margin: 8px 4px 4px;
  padding: 2px 0;
}
.composer-add-chapter-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px dashed var(--border-default);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  text-align: center;
  padding: 6px 12px;
  outline: none;
  cursor: pointer;
  transition: all 0.15s ease;
}
.composer-add-chapter-input:hover {
  border-color: var(--color-primary-accent);
  color: var(--color-primary-accent);
  background: rgba(125, 147, 114, 0.05);
}
.composer-add-chapter-input:focus {
  border-style: solid;
  border-color: var(--color-primary-accent);
  background: var(--bg-card);
  text-align: left;
  cursor: text;
  box-shadow: 0 0 0 2px rgba(125, 147, 114, 0.12);
}

.outline-overview-chapter { display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; }
.outline-overview-chapter strong { position: relative; color: var(--text-primary); font-size: 13.5px; font-weight: 700; padding: 0 0 8px 12px; margin-bottom: 4px; border-bottom: 1px solid rgba(0,0,0,0.04); display: flex; align-items: center; }
.outline-overview-chapter strong::before { content: ''; position: absolute; left: 0; top: 8px; width: 4px; height: 12px; border-radius: 4px; background: var(--color-primary-accent, #8B9A6E); }
.outline-section-container { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.outline-section-title { font-size: 13px; font-weight: 600; color: var(--text-secondary); padding-left: 12px; position: relative; display: flex; align-items: center; }
.outline-section-title::before { content: ''; position: absolute; left: 2px; top: 50%; transform: translateY(-50%); width: 4px; height: 4px; border-radius: 50%; background: rgba(0,0,0,0.15); }
.outline-file-link { margin-left: 12px; padding: 10px 12px; border: 1px solid transparent; border-radius: 8px; display: flex; align-items: center; gap: 8px; font-size: 12.5px; background: rgba(0,0,0,0.02); color: var(--text-primary); cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); text-align: left; }
.outline-file-link:hover { background: rgba(139,154,110,0.1); border-color: rgba(139,154,110,0.22); transform: translateX(2px); color: var(--color-primary-accent, #8B9A6E); }
.outline-file-link-icon { opacity: 0.7; }
.outline-file-link-file { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; }
.summary-markdown { color: var(--text-secondary); line-height: 1.85; font-size: 14.5px; word-break: break-word; }
.summary-markdown :deep(h1), .summary-markdown :deep(h2), .summary-markdown :deep(h3), .summary-markdown :deep(h4) { color: var(--text-primary); font-weight: 700; margin: 1.5em 0 0.5em; line-height: 1.3; }
.summary-markdown :deep(h1) { font-size: 1.5em; border-bottom: 1px solid var(--border-default); padding-bottom: 0.3em; }
.summary-markdown :deep(h2) { font-size: 1.25em; margin: 2em 0 1em; padding-bottom: 8px; border-bottom: 1px solid rgba(0,0,0,0.04); }
.summary-markdown :deep(h3) { font-size: 1.1em; margin: 1.5em 0 1em; }
.summary-markdown :deep(p) { margin-bottom: 16px; }
.summary-markdown :deep(ul), .summary-markdown :deep(ol) { margin: 0 0 16px 0; padding-left: 24px; }
.summary-markdown :deep(li) { margin-bottom: 6px; }
.summary-markdown :deep(li::marker) { color: var(--text-muted); }
.summary-markdown :deep(blockquote) { margin: 0 0 16px; padding: 12px 16px; border-left: 3px solid #8B9A6E; background: rgba(139, 154, 110, 0.08); border-radius: 0 8px 8px 0; color: var(--text-muted); font-style: italic; }
.summary-markdown :deep(pre) { background: #1C1C1A; padding: 16px; border-radius: 12px; overflow-x: auto; margin-bottom: 16px; border: 1px solid rgba(0,0,0,0.1); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
.summary-markdown :deep(code) { font-family: var(--font-family-mono); font-size: 13px; background: rgba(0,0,0,0.04); padding: 3px 6px; border-radius: 6px; color: #8B9A6E; font-weight: 500; }
.summary-markdown :deep(pre code) { background: transparent; padding: 0; color: #E6E6E4; font-weight: 400; font-size: 13.5px; }
.summary-markdown :deep(a) { color: #8B9A6E; text-decoration: none; border-bottom: 1px solid transparent; transition: all 0.2s; }
.summary-markdown :deep(a:hover) { border-bottom-color: #8B9A6E; }
.summary-markdown :deep(img) { max-width: 100%; border-radius: 12px; margin: 16px 0; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
.summary-markdown :deep(table) { width: 100%; border-collapse: collapse; margin-bottom: 16px; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.02); }
.summary-markdown :deep(th), .summary-markdown :deep(td) { padding: 10px 14px; border: 1px solid var(--border-subtle); text-align: left; }
.summary-markdown :deep(th) { background: rgba(0,0,0,0.02); font-weight: 600; color: var(--text-primary); }

html.dark .summary-markdown :deep(h2) { border-color: rgba(255,255,255,0.04); }

/* ===== Refined Zen Minimalist AI Visual Language (PC) ===== */
.ai-header { position: relative; justify-content: space-between; background: transparent; backdrop-filter: blur(12px); border-bottom: none; z-index: 10; padding: 24px 20px 12px; }
.ai-model-switch.ai-file-switch { display: flex; align-items: center; gap: 8px; border: 1px solid var(--border-subtle); background: var(--color-bg-tertiary, #FAF7F2); color: var(--text-secondary); font-weight: 600; cursor: pointer; padding: 6px 14px; border-radius: 999px; transition: all 0.2s; font-size: 12.5px; box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04); max-width: 210px; }
.ai-model-switch.ai-file-switch:hover { background: rgba(139, 154, 110, 0.14); border-color: rgba(139, 154, 110, 0.45); color: var(--color-primary-accent, #8B9A6E); box-shadow: 0 4px 12px rgba(139, 154, 110, 0.2); transform: translateY(-1px); }
.ai-file-switch .model-icon-top { display: flex; align-items: center; color: var(--color-primary-accent, #8B9A6E); flex-shrink: 0; }
.ai-file-switch .model-text { font-size: 12.5px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 130px; }
.chevron-icon { transition: transform 0.2s; opacity: 0.6; flex-shrink: 0; }
.chevron-icon.is-rotated { transform: rotate(180deg); opacity: 1; }
.ai-model-menu.ai-file-menu { position: absolute; top: 62px; left: 20px; z-index: 10; min-width: 240px; max-width: 290px; max-height: 320px; overflow-y: auto; padding: 8px; background: var(--color-bg-tertiary, #FAF7F2); backdrop-filter: blur(16px); border: 1px solid var(--border-default); border-radius: 14px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04); display: flex; flex-direction: column; gap: 3px; }
html.dark .ai-model-menu.ai-file-menu { background: var(--color-bg-secondary); border-color: var(--border-subtle); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35); }
.ai-menu-section-header { display: flex; justify-content: space-between; align-items: center; font-size: 10px; font-weight: 700; color: var(--text-muted); padding: 6px 10px 4px; letter-spacing: 0.5px; text-transform: uppercase; }
.ai-menu-header-count { font-size: 10px; color: var(--color-primary-accent, #8B9A6E); font-weight: 600; text-transform: none; }
.ai-menu-divider { height: 1px; background: var(--border-subtle); margin: 4px 6px; }
.mini-menu-item { position: relative; display: flex; align-items: center; gap: 10px; padding: 8px 12px 8px 14px; border-radius: 8px; cursor: pointer; transition: all 0.15s ease; user-select: none; }
.mini-menu-item:hover { background: rgba(0, 0, 0, 0.04); }
html.dark .mini-menu-item:hover { background: rgba(255, 255, 255, 0.04); }
.mini-menu-item.is-active { background: var(--color-primary-light); color: var(--color-primary-accent); font-weight: 700; }
.mini-menu-item.is-active::before { content: ''; position: absolute; left: 0; top: 6px; bottom: 6px; width: 3px; background: var(--color-primary-accent); border-radius: 1.5px; }
.mini-menu-icon { font-size: 16px; color: var(--text-muted); display: flex; align-items: center; justify-content: center; width: 18px; flex-shrink: 0; transition: color 0.15s; }
.mini-menu-item.is-active .mini-menu-icon { color: var(--color-primary-accent); }
.mini-menu-text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.mini-menu-label { font-size: 12.5px; font-weight: 500; color: var(--text-primary); line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mini-menu-item.is-active .mini-menu-label { color: var(--color-primary-accent); font-weight: 700; }
.mini-menu-desc { font-size: 10.5px; color: var(--text-muted); line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mini-menu-item.is-active .mini-menu-desc { color: var(--color-primary-accent); opacity: 0.8; }
.ai-clear { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; padding: 0; border-radius: 50%; border: 1px solid var(--border-subtle); background: var(--color-bg-tertiary, #FAF7F2); color: var(--text-secondary); cursor: pointer; box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04); transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
.ai-clear svg { stroke: currentColor; }
.ai-clear:hover { background: rgba(139, 154, 110, 0.14); border-color: rgba(139, 154, 110, 0.4); color: var(--color-primary-accent, #8B9A6E); box-shadow: 0 4px 12px rgba(139, 154, 110, 0.2); transform: rotate(-30deg); }

.ai-welcome { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 20px 24px 28px; animation: ai-fade-in 0.4s ease-out; width: 100%; max-width: 320px; margin: 0 auto; box-sizing: border-box; }
.ai-spark-wrap, .ai-brand-wrap { position: relative; width: 56px; height: 56px; display: grid; place-items: center; margin-bottom: 16px; filter: drop-shadow(0 8px 20px rgba(139, 154, 110, 0.24)); transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
.ai-brand-wrap:hover { transform: translateY(-2px) scale(1.03); }
.ai-spark-svg, .ai-brand-svg { width: 56px; height: 56px; display: block; border-radius: 16px; }
.welcome-title { font-size: 22.5px; font-weight: 650; color: var(--text-primary); margin: 0 0 8px; letter-spacing: -0.3px; line-height: 1.3; }
.welcome-desc { font-size: 12.5px; font-weight: 400; color: var(--text-muted); margin: 0 0 26px; line-height: 1.55; max-width: 260px; }
.preset-questions { display: flex; flex-direction: column; align-items: center; gap: 9px; width: 100%; max-width: 260px; box-sizing: border-box; }
.preset-pill { width: 100%; padding: 9px 20px; border-radius: 999px; background: var(--color-bg-tertiary, #FAF7F2); border: 1px solid var(--border-subtle); color: var(--text-primary); font-size: 13px; font-weight: 550; letter-spacing: 0.8px; text-align: center; cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 2px 8px -1px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02); user-select: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box; }
.preset-pill:hover { background: rgba(139, 154, 110, 0.14); border-color: rgba(139, 154, 110, 0.45); color: var(--color-primary-accent, #8B9A6E); font-weight: 600; transform: translateY(-1.5px); box-shadow: 0 6px 16px -2px rgba(139, 154, 110, 0.22), 0 2px 4px rgba(0, 0, 0, 0.03); }
.preset-pill:active { transform: translateY(0); box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04); }

.assistant-spark-avatar { width: 34px; height: 34px; border: 1px solid var(--border-subtle); border-radius: 50%; display: grid; place-items: center; background: var(--color-bg-tertiary, #FAF7F2); flex: 0 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.02); }
.assistant-spark-avatar svg { width: 20px; height: 20px; }
.chat-msg-row.user .chat-bubble { background: #303431; color: #FAF7F2; border-radius: 16px 4px 16px 16px; padding: 12px 18px; font-size: 14.5px; line-height: 1.6; box-shadow: 0 4px 16px rgba(0,0,0,0.04); }
.chat-msg-row.assistant .chat-bubble { background: var(--color-bg-tertiary, #FAF7F2); border: 1px solid var(--border-subtle); border-radius: 4px 16px 16px 16px; padding: 12px 18px; font-size: 14.5px; line-height: 1.6; color: var(--text-primary); box-shadow: 0 2px 8px -1px rgba(0, 0, 0, 0.03); }

.ai-input-area { padding: 16px 20px 24px; background: transparent; backdrop-filter: blur(12px); border-top: none; width: 100%; box-sizing: border-box; }
.ai-chat-capsule { display: flex; align-items: flex-end; width: 100%; box-sizing: border-box; min-height: 52px; border-radius: 26px; padding: 6px 6px 6px 18px; gap: 10px; background: var(--color-bg-tertiary, #FAF7F2); backdrop-filter: blur(8px); border: 1px solid var(--border-default); box-shadow: 0 4px 16px -2px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.02); transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.ai-chat-capsule:focus-within { border-color: var(--color-primary-accent, #8B9A6E); box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18), 0 4px 14px rgba(0,0,0,0.05); transform: translateY(-1px); }
.ai-input { flex: 1; background: transparent; font-size: 14.5px; line-height: 1.5; padding: 6px 0; color: var(--text-primary); border: none; outline: none; resize: none; overflow-y: auto; }
.ai-input::placeholder { color: var(--text-muted); }
.ai-send-btn { width: 36px; height: 36px; border-radius: 50%; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); flex-shrink: 0; background: var(--color-bg-tertiary, #FAF7F2); border: 1px solid var(--border-subtle); color: var(--color-primary-accent, #8B9A6E); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.ai-send-btn.is-ready { background: var(--btn-primary-bg, linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%)) !important; color: #fff !important; box-shadow: 0 2px 8px rgba(139, 154, 110, 0.4) !important; }
.ai-send-btn.is-ready:hover { transform: scale(1.06); background: #76855B !important; box-shadow: 0 4px 14px rgba(139, 154, 110, 0.55) !important; }

.ai-typing-dots { display: flex; align-items: center; gap: 6px; min-height: 24px; padding: 4px 6px; }
.ai-typing-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); animation: ai-dot-bounce 1.4s ease-in-out infinite both; }
.ai-typing-dot:nth-child(1) { animation-delay: -.32s; }
.ai-typing-dot:nth-child(2) { animation-delay: -.16s; }


html.dark .ai-header, html.dark .ai-model-menu, html.dark .ai-chat-capsule, html.dark .assistant-spark-avatar, html.dark .chat-msg-row.assistant .chat-bubble { background: #1C1C1C; border-color: rgba(255,255,255,0.08); }
html.dark .preset-pill { background: rgba(255, 255, 255, 0.03); border-color: rgba(255, 255, 255, 0.07); color: var(--text-secondary); box-shadow: 0 3px 8px -1px rgba(0, 0, 0, 0.35); }
html.dark .preset-pill:hover { background: rgba(125, 147, 114, 0.12); border-color: rgba(125, 147, 114, 0.4); color: #A3B899; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3); }
html.dark .ai-brand-wrap { filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.45)); }
html.dark .welcome-title { color: #FFFFFF; }

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
.zen-dropdown .el-select-dropdown__item:hover { background: rgba(139, 154, 110, 0.12) !important; color: var(--color-primary-accent, #8B9A6E) !important; }
.zen-dropdown .el-select-dropdown__item.selected,
.zen-dropdown .el-select-dropdown__item.is-selected { background: rgba(139, 154, 110, 0.18) !important; color: var(--color-primary-accent, #8B9A6E) !important; font-weight: 700 !important; }
.zen-dropdown .el-dropdown-menu__item.is-disabled,
.zen-dropdown .el-select-dropdown__item.is-disabled { opacity: 0.5 !important; background: transparent !important; color: var(--text-muted) !important; cursor: not-allowed !important; }
.zen-dropdown .el-dropdown-menu__item--divided { border-top: none !important; margin-top: 6px !important; position: relative; }
.zen-dropdown .el-dropdown-menu__item--divided::before { content: ''; position: absolute; top: -4px; left: 8px; right: 8px; height: 1px; background-color: rgba(0,0,0,0.06) !important; margin: 0 !important; }

html.dark .zen-dropdown,
html.dark .zen-dropdown.el-popper { background: rgba(30,30,30,0.85) !important; border-color: rgba(255,255,255,0.05) !important; box-shadow: 0 12px 32px rgba(0,0,0,0.4) !important; }
html.dark .zen-dropdown .el-dropdown-menu__item:hover,
html.dark .zen-dropdown .el-select-dropdown__item.is-hovering,
html.dark .zen-dropdown .el-select-dropdown__item:hover { background: rgba(139, 154, 110, 0.2) !important; color: #9AB08F !important; }
html.dark .zen-dropdown .el-select-dropdown__item.selected,
html.dark .zen-dropdown .el-select-dropdown__item.is-selected { background: rgba(139, 154, 110, 0.25) !important; color: #9AB08F !important; }
html.dark .zen-dropdown .el-dropdown-menu__item--divided::before { background-color: rgba(255,255,255,0.08) !important; }

/* ===== 关联文件气泡弹窗 (借鉴移动端卡片化胶囊设计) ===== */
.zen-popover { border-radius: 14px !important; padding: 16px !important; background: rgba(255,255,255,0.85) !important; backdrop-filter: blur(12px) !important; -webkit-backdrop-filter: blur(12px) !important; border: 1px solid rgba(0,0,0,0.05) !important; box-shadow: 0 12px 32px rgba(0,0,0,0.1) !important; }
html.dark .zen-popover { background: rgba(30,30,30,0.85) !important; border-color: rgba(255,255,255,0.05) !important; box-shadow: 0 12px 32px rgba(0,0,0,0.4) !important; }
.subject-capsule-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.subject-capsule-item { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; background: var(--color-bg-tertiary, #FAF7F2); border: 1.5px solid var(--border-default); border-radius: 9999px; font-size: 13px; font-weight: 600; color: var(--text-primary); cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
.subject-capsule-item:hover { transform: translateY(-1px); background: var(--color-bg-tertiary); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); border-color: rgba(139, 154, 110, 0.35); color: var(--color-primary-accent, #8B9A6E); }
.subject-capsule-item.is-active { background: rgba(139, 154, 110, 0.12) !important; border-color: #8B9A6E !important; color: #8B9A6E !important; box-shadow: 0 2px 8px rgba(139, 154, 110, 0.18); }
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
.drag-drop-zone.is-active { border-color: #8B9A6E; background: rgba(139, 154, 110, 0.08); }
.drag-text { font-size: 13px; color: var(--text-muted); font-weight: 500; }
.drag-hint { margin-top: 6px; color: var(--text-muted); font-size: 11px; }
html.dark .drag-drop-zone { border-color: rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); }
html.dark .drag-drop-zone:hover { border-color: rgba(255,255,255,0.2); background: rgba(0,0,0,0.4); }
html.dark .drag-drop-zone.is-active { border-color: #9AB08F; background: rgba(154, 176, 143, 0.1); }

/* Home Modal Styles for Register Modal */
.modal-container { width: 90%; max-width: 520px; background: var(--color-bg-tertiary, #FAF7F2); border-radius: 20px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.04); border: 1px solid var(--border-subtle); display: flex; flex-direction: column; overflow: hidden; animation: scale-up 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
html.dark .modal-container { background: #181D18; border-color: rgba(163, 177, 155, 0.25); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4); }
@keyframes scale-up { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.modal-container .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid var(--border-subtle); }
.modal-container .modal-header h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.3px; }
.close-btn { background: none; border: none; font-size: 20px; color: var(--text-muted); cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: all var(--transition-fast); }
.close-btn:hover { background: rgba(0, 0, 0, 0.04); color: var(--text-primary); }
html.dark .close-btn:hover { background: rgba(255, 255, 255, 0.06); }
.modal-container .modal-body { padding: 22px 28px; display: flex; flex-direction: column; gap: 20px; max-height: 70vh; overflow-y: auto; }
.form-group label { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.styled-input, .styled-textarea { width: 100%; padding: 12px 14px; background: var(--color-bg-tertiary, #FAF7F2); border: 1px solid var(--border-default); border-radius: 12px; font-size: 13.5px; color: var(--text-primary); transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); outline: none; box-sizing: border-box; font-family: inherit; }
.styled-input:focus, .styled-textarea:focus { border-color: #8B9A6E; background: var(--color-bg-tertiary, #FAF7F2); box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18); }
html.dark .styled-input:focus, html.dark .styled-textarea:focus { border-color: #9AB08F; background: rgba(255, 255, 255, 0.05); box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.2); }
.styled-textarea { resize: vertical; line-height: 1.6; min-height: 100px; }
.styled-el-select { width: 100%; }
.styled-el-select :deep(.el-input__wrapper) { background: var(--color-bg-tertiary, #FAF7F2); border-radius: 12px; box-shadow: 0 0 0 1px var(--border-default) inset; padding: 4px 14px; transition: all 0.2s; }
.styled-el-select :deep(.el-input__wrapper.is-focus) { background: var(--color-bg-tertiary, #FAF7F2); box-shadow: 0 0 0 1px #8B9A6E inset, 0 0 0 3px rgba(139, 154, 110, 0.18) !important; }
html.dark .styled-el-select :deep(.el-input__wrapper.is-focus) { background: rgba(255, 255, 255, 0.05); box-shadow: 0 0 0 1px #9AB08F inset, 0 0 0 3px rgba(139, 154, 110, 0.2) !important; }
.modal-container .modal-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 28px 22px; border-top: 1px solid var(--border-subtle); background: transparent; }
.btn-secondary { background: var(--color-bg-tertiary, #FAF7F2); border: 1px solid var(--border-default); color: var(--text-secondary); padding: 8px 20px; border-radius: 9999px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-secondary:hover { background: rgba(0, 0, 0, 0.05); color: var(--text-primary); }
.btn-primary { background: var(--btn-primary-bg, linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%)); border: none; color: #FFFFFF; padding: 8px 26px; border-radius: 9999px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 2px 8px rgba(139, 154, 110, 0.3); }
.btn-primary:hover:not(:disabled) { background: #76855B; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(139, 154, 110, 0.45); }
.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
html.dark .btn-primary { background: #9AB08F; color: #1a1a1a; }
html.dark .btn-primary:hover { background: #b0c2a7; box-shadow: 0 4px 12px rgba(154, 176, 143, 0.2); }
</style>
