<template>
  <div class="workspace-container">

    <!-- ===== TIER-1: Icon Strip (72px fixed) ===== -->
    <nav class="tier1-strip">
      <div class="tier1-top">
        <button class="tier1-btn" :title="t(messages.back)" @click="router.push('/subjects')">
          <IconArrowLeft :size="20" :stroke-width="1.6" />
          <span class="tier1-btn-text">{{ t(messages.back) }}</span>
        </button>
        <button
          class="tier1-btn"
          :class="{ 'is-active': tier2Open && tier2Mode === 'files' }"
          :title="t(messages.learningMaterials)"
          @click="toggleTier2('files')"
        >
          <IconFileText :size="20" :stroke-width="1.6" />
          <span class="tier1-btn-text">{{ t(messages.materials) }}</span>
        </button>
        <button
          class="tier1-btn"
          :class="{ 'is-active': tier2Open && tier2Mode === 'outline' }"
          :title="t(messages.overview)"
          @click="toggleTier2('outline')"
        >
          <IconList :size="20" :stroke-width="1.6" />
          <span class="tier1-btn-text">{{ t(messages.overview) }}</span>
        </button>
        <button
          class="tier1-btn"
          :class="{ 'is-active': centerView === 'blocks' }"
          :title="t(messages.knowledgeBase)"
          @click="centerView = 'blocks'; tier2Open = false"
        >
          <IconLayoutGrid :size="20" :stroke-width="1.6" />
          <span class="tier1-btn-text">{{ t(messages.knowledgeBase) }}</span>
        </button>
        <button
          class="tier1-btn"
          :class="{ 'is-active': centerView === 'review' }"
          :title="t(messages.review)"
          @click="centerView = 'review'; tier2Open = false"
        >
          <IconHistory :size="20" :stroke-width="1.6" />
          <span class="tier1-btn-text">{{ t(messages.review) }}</span>
        </button>
        <button
          class="tier1-btn"
          :class="{ 'is-active': centerView === 'stats' }"
          :title="t(messages.statistics)"
          @click="centerView = 'stats'; tier2Open = false"
        >
          <IconChartBar :size="20" :stroke-width="1.6" />
          <span class="tier1-btn-text">{{ t(messages.statistics) }}</span>
        </button>
      </div>
      <div class="tier1-bottom">
        <div class="subject-mini-icon" :title="activeSubject?.name">
          <ElIcon :size="24">
            <component :is="getSubjectIconComponent(activeSubject?.icon)" />
          </ElIcon>
        </div>
      </div>
    </nav>

    <!-- ===== TIER-2: Expandable Drawer ===== -->
    <aside class="tier2-drawer" :class="{ 'is-open': tier2Open, 'is-resizing': isResizing }" :style="{ width: tier2Open ? tier2Width + '%' : '0px' }">
      <!-- Files Mode -->
      <div v-if="tier2Mode === 'files'" class="drawer-content">
        <div class="drawer-header">
          <h3 class="drawer-title">{{ t(messages.learningFiles) }}</h3>
          <button class="drawer-action" @click="openRegisterModal" :title="t(messages.addFile)" :aria-label="t(messages.addFile)">
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
              :aria-label="t(messages.deleteNamedFile, { name: file.name })"
              :title="t(messages.deleteFile)"
              @click.stop="handleDeleteFile(file)"
            >
              <IconX :size="14" :stroke-width="2" />
            </button>
          </div>
        </div>
        <div class="drawer-empty" v-else>
          <span>{{ t(messages.noFiles) }}</span>
        </div>
      </div>

      <!-- Outline Mode -->
      <div v-else-if="tier2Mode === 'outline'" class="drawer-content">
        <div class="drawer-header outline-header">
          <div class="outline-header-left">
            <h3 class="drawer-title">{{ t(messages.overview) }}</h3>
            <transition name="hint-capsule-fade">
              <div v-if="isOutlineComposer" class="outline-header-hint-capsule" :title="t(messages.editMarkdown)">
                <span class="hint-dot"></span>
                <span class="hint-text">{{ t(messages.markdownEditor) }}</span>
              </div>
            </transition>
          </div>
          <div class="outline-header-actions">
            <button
              class="outline-add-button"
              :class="{ 'is-active': isOutlineComposer }"
              :title="isOutlineComposer ? t(messages.closeEditor) : t(messages.openEditor)"
              :aria-label="isOutlineComposer ? t(messages.closeEditor) : t(messages.openEditor)"
              @click="isOutlineComposer = !isOutlineComposer"
            >
              <IconPlus :size="15" :stroke-width="2.4" class="outline-add-icon" />
            </button>
          </div>
        </div>
        <div v-if="isOutlineComposer" class="outline-composer">
          <div class="subject-overview-wrapper">
            <article class="file-outline subject-overview is-editing">
              <header class="file-outline__header subject-overview__header">
                <div class="file-outline__name subject-overview__name" style="cursor: default;">
                  <IconBook :size="13" :stroke-width="1.6" class="subject-icon" />
                  <span class="subject-overview-title">{{ t(messages.subjectOutline) }}</span>
                </div>
                <span class="file-outline__actions">
                  <button
                    type="button"
                    class="composer-capsule-btn is-primary"
                    :disabled="isSavingSubjectOutline"
                    :title="t(messages.saveChanges)"
                    @click="saveCurrentOutline"
                  >
                    <IconCheck v-if="!isSavingSubjectOutline" :size="10.5" :stroke-width="2.2" />
                    <IconRotate v-else :size="10.5" :stroke-width="2" class="is-spinning" />
                    <span>{{ isSavingSubjectOutline ? t(messages.saving) : t(messages.save) }}</span>
                  </button>
                </span>
              </header>
              <div class="subject-overview__body">
                <textarea
                  v-model="subjectOutlineDraft"
                  class="composer-markdown-editor"
                  :placeholder="t(messages.outlinePlaceholder)"
                  rows="6"
                />
              </div>
            </article>

            <article
              v-for="file in activeSourceFiles"
              :key="'draft-' + file.id"
              class="file-outline is-editing"
            >
              <header class="file-outline__header">
                <button
                  type="button"
                  class="overview-collapse-btn"
                  :title="fileCardCollapsed[file.id] ? t(messages.expandOutline) : t(messages.collapseOutline)"
                  @click="fileCardCollapsed[file.id] = !fileCardCollapsed[file.id]"
                >
                  <IconChevronDown v-if="!fileCardCollapsed[file.id]" :size="13" :stroke-width="2" />
                  <IconChevronRight v-else :size="13" :stroke-width="2" />
                </button>
                <button type="button" class="file-outline__name" :title="t(messages.editNamedFile, { name: file.name })" @click="selectFile(file.id)">
                  <IconFileText :size="13" :stroke-width="1.6" class="subject-icon" />
                  <span class="subject-overview-title">{{ file.name }}</span>
                </button>
                <span class="file-outline__actions">
                  <button
                    type="button"
                    class="composer-capsule-btn is-primary"
                    :disabled="fileOutlineSaves.has(file.id) || !file.ingestionRevision || fileDraftRevisions[file.id] !== file.ingestionRevision"
                    :title="t(messages.saveNamedOutline, { name: file.name })"
                    @click="saveFileOutline(file.id)"
                  >
                    <IconCheck v-if="!fileOutlineSaves.has(file.id)" :size="10.5" :stroke-width="2.2" />
                    <IconRotate v-else :size="10.5" :stroke-width="2" class="is-spinning" />
                    <span>{{ fileOutlineSaves.has(file.id) ? t(messages.saving) : t(messages.save) }}</span>
                  </button>
                </span>
              </header>
              <div v-show="!fileCardCollapsed[file.id]" class="subject-overview__body">
                <div v-if="!file.ingestionRevision" class="composer-file-empty-box" role="status">
                  <span class="empty-hint">{{ t(messages.revisionUnconfirmed) }}</span>
                </div>
                <div v-else-if="fileDraftRevisions[file.id] !== file.ingestionRevision && fileOutlineDraftHasUnsavedChanges(file.id)" class="composer-file-empty-box">
                  <span class="empty-hint" role="status">{{ t(messages.revisionChanged) }}</span>
                  <button
                    type="button"
                    class="composer-capsule-btn"
                    :disabled="fileOutlineSaves.has(file.id)"
                    @click="initFileOutlineDraft(file, true)"
                  >{{ t(messages.discardDraft) }}</button>
                </div>
                <textarea
                  v-model="fileOutlineDrafts[file.id]"
                  class="composer-markdown-editor"
                  :readonly="!file.ingestionRevision || fileDraftRevisions[file.id] !== file.ingestionRevision"
                  :placeholder="t(messages.editNamedOutline, { name: file.name })"
                  rows="5"
                />
              </div>
            </article>
            <div v-if="!activeSourceFiles.length" class="drawer-empty" style="padding: 18px 0;">
              <span>{{ t(messages.noFiles) }}</span>
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
            :generation-conflict-resolving="Boolean(subjectOverviewRecord?.generationConflicts?.some(conflict => resolvingGenerationConflicts.has('SUBJECT:' + conflict.clientWriteId)))"
            :error="subjectOverviewError"
            @generate="handleOutlineAi"
            @generate-outline="handleSubjectOutlineRegenerate"
            @stop="stopManualOverview('subject', subjectId)"
            @open-summary="openSubjectSummary"
            @resolve-sync-conflict="resolveSubjectOverviewConflict"
            @resolve-generation-conflict="resolveSubjectGenerationEditConflict"
          />
          <FileOutlineList
            :files="fileOverviewItems"
            :selected-file-id="selectedFileId"
            @select-file="selectFile"
            @select-summary="openFileSummary"
            @regenerate="regenerateFileOverview"
            @stop-regeneration="stopManualOverview('file', $event)"
            @resolve-sync-conflict="resolveFileOverviewConflict"
            @resolve-generation-conflict="resolveFileGenerationEditConflict"
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
            {{ t(messages.summaryFor, { name: summaryTarget.title }) }}
          </span>
          <span v-else-if="centerView === 'preview' && selectedFile" class="status-file">
            <IconFileText :size="14" :stroke-width="1.6" class="status-icon" /> {{ selectedFile.name }}
          </span>
          <span v-else-if="centerView === 'blocks'" class="status-file">
            <IconNotes :size="14" :stroke-width="1.6" class="status-icon" /> {{ t(messages.blocksCount, { count: filteredBlocks.length }) }}
          </span>
          <span v-else-if="centerView === 'review'" class="status-file">{{ t(messages.reviewFor, { name: activeSubject?.name ?? '' }) }}</span>
          <span v-else-if="centerView === 'stats'" class="status-file">{{ t(messages.statsFor, { name: activeSubject?.name ?? '' }) }}</span>
          <span v-else class="status-file">{{ activeSubject?.name }}</span>
        </div>
        <div class="status-right">
          <div v-if="centerView === 'preview' && selectedFile" class="preview-status-controls" :aria-label="t(messages.previewControls)">
            <div class="preview-control-group preview-zoom-controls" :aria-label="t(messages.zoomControls)">
              <button type="button" class="preview-status-button preview-status-button-icon" :title="t(messages.zoomOut)" @click="filePreviewRef?.zoomOut()">−</button>
              <span class="preview-zoom-value" aria-live="polite">{{ previewZoomLabel }}</span>
              <button type="button" class="preview-status-button preview-status-button-icon" :title="t(messages.zoomIn)" @click="filePreviewRef?.zoomIn()">＋</button>
              <button type="button" class="preview-status-button preview-status-button-wide" :title="t(messages.resetZoom)" @click="filePreviewRef?.resetZoom()">{{ t(messages.reset) }}</button>
            </div>
            <div class="preview-control-group preview-rotation-controls" :aria-label="t(messages.rotationControls)">
              <button type="button" class="preview-status-button preview-status-button-icon" :title="t(messages.rotateLeft)" :aria-label="t(messages.rotateLeft)" @click="filePreviewRef?.rotateLeft()">
                <IconArrowBackUp :size="14" :stroke-width="1.9" aria-hidden="true" />
              </button>
              <span class="preview-rotation-value" aria-live="polite">{{ previewRotation }}°</span>
              <button type="button" class="preview-status-button preview-status-button-icon" :title="t(messages.rotateRight)" :aria-label="t(messages.rotateRight)" @click="filePreviewRef?.rotateRight()">
                <IconArrowForwardUp :size="14" :stroke-width="1.9" aria-hidden="true" />
              </button>
            </div>
          </div>
          <span class="status-page" v-if="centerView === 'preview'">{{ t(messages.filePreview) }}</span>
          <span class="status-page" v-else-if="centerView === 'summary'">{{ t(messages.aiSummary) }}</span>
        </div>
      </header>

      <!-- Center Content -->
      <div class="center-body">
        <!-- Collapse Left Button -->
        <button class="edge-collapse edge-left" @click="toggleTier2Panel" :title="tier2Open ? t(messages.collapseLeft) : t(messages.expandLeft)">
          <IconChevronLeft v-if="tier2Open" :size="12" :stroke-width="2.5" />
          <IconChevronRight v-else :size="12" :stroke-width="2.5" />
        </button>

        <Transition name="workspace-view-fade" mode="out-in">
          <SubjectReviewPane
            v-if="centerView === 'review'"
            :key="'review-' + subjectId"
            :subject-id="subjectId"
            @back="handleReviewOrStatsBack"
          />

          <SubjectStatsPane
            v-else-if="centerView === 'stats'"
            :key="'stats-' + subjectId"
            :subject-id="subjectId"
            @back="handleReviewOrStatsBack"
          />

          <OverviewSummaryView
            v-else-if="centerView === 'summary' && summaryTarget"
            key="summary-view"
            :title="summaryTarget.title"
            :kind="summaryTarget.kind"
            :summary-markdown="summaryTarget.record?.summaryMarkdown || null"
            :is-generating="summaryTarget.isGenerating"
            :is-stale="summaryTarget.isStale"
            :error="summaryTarget.error"
            @close="closeSummary"
            @regenerate="regenerateSelectedSummary"
            @stop="summaryTarget && stopManualOverview(summaryTarget.kind, summaryTarget.id)"
          />

          <div
            v-else-if="centerView === 'preview' && selectedFile"
            :key="'preview-' + selectedFile.id"
            ref="previewPaneWrapperRef"
            class="preview-pane-wrapper"
            @mouseup="updateSelectionPosition('preview')"
            @keyup="updateSelectionPosition('preview')"
            @scroll.passive="updateSelectionPosition('preview')"
          >
            <div v-if="selectedFile.ingestionStatus === 'FAILED'" class="file-processing-alert-banner">
              <div class="file-processing-alert-text">
                <span class="file-processing-alert-badge">{{ t(messages.processingFailed) }}</span>
                <span class="file-processing-alert-msg">{{ selectedFile.safeErrorDetail || t(messages.processingIncomplete) }}</span>
              </div>
              <button
                type="button"
                class="file-processing-alert-btn"
                :disabled="retryingSourceId === selectedFile.id"
                @click="handleRetryFileProcessing(selectedFile.id)"
              >
                {{ retryingSourceId === selectedFile.id ? t(messages.retrying) : t(messages.retryProcessing) }}
              </button>
            </div>

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

            <footer class="preview-page-footer" :aria-label="t(messages.documentPages)">
              <button type="button" class="preview-page-button" :disabled="previewPage <= 1" @click="filePreviewRef?.prevPage()">{{ t(messages.previousPage) }}</button>
              <span class="preview-page-count">{{ previewPage }} / {{ previewPageCount }}</span>
              <button type="button" class="preview-page-button" :disabled="previewPage >= previewPageCount" @click="filePreviewRef?.nextPage()">{{ t(messages.nextPage) }}</button>
            </footer>
          </div>

          <!-- Knowledge Blocks Grid -->
          <div v-else-if="centerView === 'blocks'" key="blocks-view" class="blocks-workspace">
            <div class="blocks-top-bar">
              <div class="blocks-search-wrapper">
                <IconSearch :size="14" :stroke-width="1.8" class="search-icon" />
                <input
                  v-model="blockSearchQuery"
                  class="blocks-search-input"
                  :placeholder="t(messages.searchBlocks)"
                />
                <button
                  v-if="blockSearchQuery"
                  class="search-clear-btn"
                  :title="t(messages.clearSearch)"
                  @click="blockSearchQuery = ''"
                >
                  <IconX :size="12" />
                </button>
              </div>

              <div class="blocks-bar-actions">
                <span class="blocks-count-badge">
                  {{ t(messages.resultsCount, { count: filteredBlocks.length }) }}
                </span>
                <button class="blocks-add-btn" @click="openCreateDialog">
                  <IconPlus :size="14" :stroke-width="2.2" class="blocks-add-icon" />
                  <span>{{ t(messages.addBlock) }}</span>
                </button>
              </div>
            </div>
            
            <div class="blocks-grid" v-if="filteredBlocks.length > 0">
              <div
                v-for="block in filteredBlocks"
                :key="block.id"
                class="block-card"
                :class="{ 'is-selected': selectedBlock?.id === block.id }"
                role="button"
                tabindex="0"
                :aria-label="t(messages.viewNamedBlock, { name: block.title || t(messages.untitledBlock) })"
                @click="handleBlockClick(block)"
                @keydown.enter="handleBlockClick(block)"
              >
                <div class="block-card-header">
                  <div class="block-title-row">
                    <IconNotes :size="14" :stroke-width="1.8" class="block-title-badge-icon" />
                    <h4 class="block-title" :title="block.title">{{ block.title || t(messages.untitledBlock) }}</h4>
                    <span v-if="blockStore.knowledgeBlockConflicts[block.id]" class="block-time">{{ t(messages.updateNotSynced) }}</span>
                    <span v-else-if="blockStore.pendingKnowledgeBlockUpdates[block.id]" class="block-time">{{ t(messages.pendingSync) }}</span>
                  </div>
                  <div class="block-card-hover-actions">
                    <button
                      type="button"
                      class="card-action-btn"
                      :class="{ 'is-copied': copiedBlockId === block.id }"
                      :title="copiedBlockId === block.id ? t(messages.copied) : t(messages.copyBlock)"
                      :aria-label="copiedBlockId === block.id ? t(messages.copied) : t(messages.copyBlock)"
                      @click.stop="handleCopyCardContent(block)"
                    >
                      <IconCheck v-if="copiedBlockId === block.id" :size="13" :stroke-width="2.2" class="copy-success-icon" />
                      <IconCopy v-else :size="13" :stroke-width="1.8" />
                    </button>
                    <button
                      type="button"
                      class="card-action-btn danger"
                      :title="t(messages.deleteBlock)"
                      :aria-label="t(messages.deleteBlock)"
                      @click.stop="handleDeleteBlockCard(block.id, block.version)"
                    >
                      <IconTrash :size="13" :stroke-width="1.8" />
                    </button>
                  </div>
                </div>

                <div class="block-card-body">
                  <div
                    class="block-preview modal-markdown-body"
                    v-if="block.content"
                    v-html="renderMarkdown(block.content)"
                  ></div>
                  <p class="block-preview empty" v-else>{{ t(messages.noDetails) }}</p>
                </div>

                <div class="block-footer">
                  <div class="block-source-wrapper" v-if="block.source" :title="t(messages.sourceName, { name: block.source })">
                    <IconFileText :size="11.5" :stroke-width="1.6" />
                    <span class="block-source-text">{{ block.source }}</span>
                  </div>
                  <div class="block-time-wrapper" :title="block.time">
                    <IconHistory :size="11.5" :stroke-width="1.6" />
                    <span>{{ timeAgo(block.time) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Empty Knowledge Blocks Onboarding -->
            <div class="onboarding-workspace blocks-empty-workspace" v-else>
              <div class="onboarding-header" style="margin-bottom: 28px;">
                <div class="empty-icon-halo">
                  <IconNotes :size="36" :stroke-width="1.6" class="empty-halo-svg" />
                </div>
                <h3 style="font-size: 17px; font-weight: 750; color: var(--text-primary); letter-spacing: -0.015em; margin-bottom: 8px;">{{ t(messages.emptyKnowledge) }}</h3>
                <p style="font-size: 13px; color: var(--text-muted); line-height: 1.6;">{{ t(messages.emptyKnowledgeHint) }}</p>
              </div>
              <div class="onboarding-grid" style="max-width: 640px; margin: 0 auto;">
                <div class="onboarding-card" @click="openCreateDialog">
                  <div class="onboarding-card-icon">
                    <IconPlus :size="24" :stroke-width="2" />
                  </div>
                  <div class="onboarding-card-body">
                    <h4>{{ t(messages.createBlock) }}</h4>
                    <p>{{ t(messages.createBlockHint) }}</p>
                    <button class="onboarding-card-btn">{{ t(messages.createManually) }}</button>
                  </div>
                </div>
                <div class="onboarding-card" @click="tier2Mode = 'files'; tier2Open = true; centerView = 'overview'">
                  <div class="onboarding-card-icon">
                    <IconFileText :size="24" :stroke-width="2" />
                  </div>
                  <div class="onboarding-card-body">
                    <h4>{{ t(messages.linkMaterials) }}</h4>
                    <p>{{ t(messages.linkMaterialsHint) }}</p>
                    <button class="onboarding-card-btn">{{ t(messages.viewMaterials) }}</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Default: Subject Onboarding Overview -->
          <div v-else key="onboarding-view" class="onboarding-workspace">
            <div class="onboarding-header">
              <div class="onboarding-emoji">
                <ElIcon :size="60">
                  <component :is="getSubjectIconComponent(activeSubject?.icon)" />
                </ElIcon>
              </div>
              <h2 class="onboarding-title">{{ t(messages.workspaceWelcome, { name: activeSubject?.name ?? '' }) }}</h2>
              <p class="onboarding-subtitle">{{ activeSubject?.description || t(messages.workspaceDescription) }}</p>
            </div>

            <div class="onboarding-drag-capsule">
              <IconUpload :size="16" :stroke-width="2" />
              <span>{{ t(messages.dropMaterials) }}</span>
            </div>
          </div>
        </Transition>

        <!-- Collapse Right Button -->
        <button class="edge-collapse edge-right" @click="rightCollapsed = !rightCollapsed" :title="rightCollapsed ? t(messages.expandAi) : t(messages.collapseAi)">
          <IconChevronRight v-if="rightCollapsed" :size="12" :stroke-width="2.5" />
          <IconChevronLeft v-else :size="12" :stroke-width="2.5" />
        </button>
      </div>
    </main>

    <!-- Splitter 2 -->
    <div class="resizer" v-show="!rightCollapsed" @mousedown="startResizeRight"></div>

    <!-- ===== RIGHT: AI Assistant ===== -->
    <aside class="workspace-right" :class="{ 'is-open': !rightCollapsed, 'is-resizing': isResizing }" :style="{ width: !rightCollapsed ? rightWidth + '%' : '0px' }">
      <div class="ai-header">
        <button
          class="ai-model-switch ai-file-switch"
          :title="isScopeLocked ? t(messages.scopeLocked) : aiSourceSummaryTitle"
          @click="handleScopeSwitchClick"
        >
          <span class="model-icon-top">
            <IconSparkles v-if="isAllAiSourcesSelected" :size="15" :stroke-width="1.8" />
            <IconFiles v-else-if="aiSourceSelectedCount > 1" :size="15" :stroke-width="1.8" />
            <IconFileText v-else :size="15" :stroke-width="1.8" />
          </span>
          <span class="model-text">{{ aiSourceSummaryText }}</span>
          <IconChevronDown class="chevron-icon" :class="{ 'is-rotated': showModelMenu }" :size="12" :stroke-width="2" />
        </button>
        <div class="dropdown-mask" v-if="showModelMenu" @click="showModelMenu = false" style="position: fixed; inset: 0; z-index: 3;"></div>
        <div v-if="showModelMenu" class="ai-model-menu ai-file-menu" style="z-index: 4;" @click.stop>
          <div class="ai-menu-section-header">
            <span>{{ t(messages.referenceScope) }}</span>
          </div>
          <div class="mini-menu-item" :class="{ 'is-active': isAllAiSourcesSelected }" @click="selectAllAiSources">
            <span class="mini-menu-icon"><IconSparkles :size="16" :stroke-width="1.8" /></span>
            <div class="mini-menu-text">
              <span class="mini-menu-label" :class="{ 'is-active': isAllAiSourcesSelected }">{{ t(messages.allMaterials) }}</span>
              <span class="mini-menu-desc">{{ t(messages.allMaterialsHint) }}</span>
            </div>
          </div>

          <template v-if="activeSourceFiles.length > 0">
            <div class="ai-menu-divider"></div>
            <div class="ai-menu-section-header">
              <span>{{ t(messages.linkedFiles) }}</span>
              <span class="ai-menu-header-count" v-if="selectedAiSourceIds.length > 0 && !isAllAiSourcesSelected">
                {{ t(messages.selectedReferences, { selected: selectedAiSourceIds.length, total: activeSourceFiles.length }) }}
              </span>
            </div>
            <div
              v-for="file in activeSourceFiles"
              :key="file.id"
              class="mini-menu-item"
              :class="{ 'is-active': isAiSourceSelected(file.id), 'is-disabled': file.ingestionStatus !== 'READY' }"
              :aria-disabled="file.ingestionStatus !== 'READY'"
              :title="file.ingestionStatus !== 'READY' ? t(messages.indexingRequired) : undefined"
              @click="toggleAiSource(file.id)"
            >
              <span class="mini-menu-icon"><IconFileText :size="16" :stroke-width="1.8" /></span>
              <div class="mini-menu-text">
                <div class="mini-menu-label-row">
                  <span class="mini-menu-label" :class="{ 'is-active': isAiSourceSelected(file.id) }">{{ file.name }}</span>
                  <span class="mini-menu-current-tag" v-if="file.id === selectedFileId">{{ t(messages.currentFileTag) }}</span>
                </div>
                <span class="mini-menu-desc">{{ (file.fileSize / (1024 * 1024)).toFixed(1) }} MB</span>
              </div>
            </div>
          </template>
        </div>
        <button class="ai-clear" @click="clearChat" :title="t(messages.newConversationHint)" :aria-label="t(messages.refreshConversation)">
          <IconRotate :size="16" :stroke-width="2" />
        </button>
      </div>

        <!-- Chat Flow -->
        <div
          class="ai-messages"
          ref="chatScrollRef"
          @mouseup="updateSelectionPosition('chat')"
          @keyup="updateSelectionPosition('chat')"
          @scroll.passive="updateSelectionPosition('chat')"
          @wheel="handleChatWheel"
          @touchstart.passive="handleTouchStart"
          @touchmove.passive="handleTouchMove"
        >
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
            <h3 class="welcome-title">{{ t(messages.chatWelcome) }}</h3>
            <p class="welcome-desc">{{ t(messages.chatIntro, { name: aiGreetingName }) }}</p>

            <div class="preset-questions">
              <button
                v-for="item in presetQuestions"
                :key="item.prompt"
                type="button"
                class="preset-pill"
                @click="sendPreset(item.prompt)"
              >
                {{ t(item.label) }}
              </button>
            </div>
          </div>
        
        <div
          v-for="msg in chatMessages"
          :key="msg.id"
          class="chat-msg-row"
          :class="msg.role"
        >
          <div class="chat-bubble-wrapper">
            <div class="chat-bubble">
              <div class="chat-content" v-if="msg.role === 'user'">
                <div v-if="msg.quoteText" class="chat-bubble-quote-snippet">
                  <span class="bubble-quote-bar"></span>
                  <span class="bubble-quote-content">“{{ msg.quoteText }}”</span>
                </div>
                <div class="chat-message-text-selection">{{ msg.content }}</div>
              </div>
              <div class="chat-content ai-reply" v-else>
                <template v-if="msg.status !== 'FAILED'">
                  <ChatProcessArea
                    v-if="msg.reasoningText || (msg.tools && msg.tools.length > 0)"
                    :reasoning="msg.reasoningText"
                    :tools="msg.tools"
                    :streaming="false"
                    :has-content="true"
                  />
                  <ChatContentRenderer
                    class="chat-message-text-selection"
                    :parts="msg.parts"
                    :streaming="false"
                    :busy="!canSendWorkspaceChat"
                    @submit="submitChatActivity"
                  />
                  <div class="chat-msg-citations" v-if="msg.citationFileNames && msg.citationFileNames.length > 0">
                    <div class="citation-title">
                      <IconFileText :size="12" :stroke-width="2" class="citation-title-icon" />
                      <span>{{ t(messages.references) }}</span>
                      <span class="citation-count">{{ msg.citationFileNames.length }}</span>
                    </div>
                    <div class="citation-chips">
                      <button
                        v-for="(fileName, idx) in msg.citationFileNames"
                        :key="fileName"
                        type="button"
                        class="citation-chip"
                        :title="t(messages.openSource, { name: fileName })"
                        @click="handleCitationClick(fileName)"
                      >
                        <span class="citation-idx">[{{ idx + 1 }}]</span>
                        <span class="citation-name">{{ fileName }}</span>
                      </button>
                    </div>
                  </div>
                </template>

                <div v-if="chatStore.recoverableTarget && chatStore.recoverableTarget.attemptId === msg.attemptId" class="chat-msg-interrupted-bar is-unknown">
                  <span class="interrupted-hint">{{ t(messages.unknownRun) }}</span>
                  <button type="button" class="chat-retry-reply-btn" :disabled="chatStore.isRecovering" @click="handleRecoverUnknown">
                    <IconRotate :size="12" :stroke-width="2" />
                    <span>{{ chatStore.isRecovering ? t(messages.recovering) : t(messages.recoverStatus) }}</span>
                  </button>
                </div>
                <div v-else-if="(msg.status === 'FAILED' || msg.status === 'INTERRUPTED') && !isAiStreaming" class="chat-msg-interrupted-bar">
                  <span class="interrupted-hint">{{ msg.status === 'FAILED' ? t(messages.generationFailed) : t(messages.partialReply) }}</span>
                  <button v-if="canSendWorkspaceChat" type="button" class="chat-retry-reply-btn" @click="handleRetryAssistantMessage(msg.id)">
                    <IconRotate :size="12" :stroke-width="2" />
                    <span>{{ t(messages.retryReply) }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="chat-msg-row assistant" v-if="isAiDisplayStreaming">
          <div class="chat-bubble-wrapper">
            <div class="chat-bubble">
              <div class="chat-content ai-reply">
                <ChatProcessArea
                  v-if="(isAiDisplayStreaming && !streamingContent && streamingParts.length === 0) || Boolean(streamingReasoning) || (streamingTools && streamingTools.length > 0)"
                  :reasoning="streamingReasoning"
                  :tools="streamingTools"
                  :streaming="isAiStreaming"
                  :has-content="Boolean(streamingContent || streamingParts.length > 0)"
                  @complete="handleThinkingComplete"
                />
                <template v-if="isThinkingComplete && (streamingContent || streamingParts.length > 0)">
                  <ChatContentRenderer :parts="streamingParts" :streaming="isAiStreaming" :busy="isAiDisplayStreaming" @submit="submitChatActivity" />
                  <span class="typing-cursor" v-if="isAiStreaming"></span>
                </template>
              </div>
            </div>
          </div>
        </div>

        <div v-if="chatStore.recoverableTarget" class="chat-recover-banner" role="alert">
          <span class="chat-recover-message">{{ t(messages.recoverConversationHint) }}</span>
          <button
            type="button"
            class="chat-recover-btn"
            :disabled="chatStore.isRecovering"
            @click="handleRecoverUnknown"
          >
            {{ chatStore.isRecovering ? t(messages.recoveringConversation) : t(messages.recoverStatus) }}
          </button>
        </div>
        <div v-else-if="chatStore.lastError" class="chat-error" role="alert">
          <span class="chat-error-message">{{ chatStore.lastError }}</span>
          <button
            v-if="chatStore.lastErrorCode === 'CHAT_SCOPE_CONFLICT'"
            type="button"
            class="chat-error-retry"
            @click="clearChat"
          >{{ t(messages.startNewConversation) }}</button>
          <button
            v-else-if="pendingChatMessage"
            type="button"
            class="chat-error-retry"
            :disabled="!canSendWorkspaceChat"
            @click="retryChat"
          >{{ t(messages.retry) }}</button>
        </div>
      </div>

      <!-- 意图感知磁吸悬浮胶囊：向上滚动时脱离自动跟随，浮现平滑小胶囊 -->
      <Transition name="scroll-pill-fade">
        <button
          v-if="isAiStreaming && isAutoScrollLocked"
          type="button"
          class="chat-scroll-resume-pill"
          @click="resumeAutoScroll"
        >
          <span class="resume-pill-pulse-dot" />
          <span class="resume-pill-arrow">↓</span>
          <span class="resume-pill-text">{{ t(messages.generating) }}</span>
        </button>
      </Transition>

      <!-- Input Box -->
      <div class="ai-input-area">
        <!-- Quoted Selection Banner: 文字添加到提问的 UI -->
        <Transition name="quote-fade">
          <div v-if="quotedSelection" class="chat-selection-quote-card">
            <div class="quote-header">
              <div class="quote-tag">
                <span>{{ t(messages.quotedText) }}</span>
                <span class="quote-length">{{ t(messages.quoteLength, { count: quotedSelection.length }) }}</span>
              </div>
              <button
                type="button"
                class="quote-remove-btn"
                :title="t(messages.removeQuote)"
                :aria-label="t(messages.removeQuote)"
                @click="quotedSelection = ''"
              >
                <IconX :size="12" :stroke-width="2" />
              </button>
            </div>
            <div class="quote-text" :title="quotedSelection">
              {{ quotedSelection }}
            </div>
          </div>
        </Transition>

        <div class="ai-input-wrapper ai-chat-capsule">
          <textarea
            ref="chatInputRef"
            v-model="chatInput"
            class="ai-input"
            :placeholder="quotedSelection ? t(messages.quotedChatPlaceholder) : t(messages.chatPlaceholder)"
            rows="1"
            @keydown.enter.exact="handleChatKeydown"
            @compositionstart="handleCompositionStart"
            @compositionend="handleCompositionEnd"
            @input="autoResizeInput"
          ></textarea>
          <button
            class="ai-send-btn"
            :class="{ 'is-ready': chatInput.trim() || quotedSelection }"
            :disabled="!canUseWorkspaceChat || Boolean(chatStore.recoverableTarget) || (!isAiStreaming && (!canSendWorkspaceChat || (!chatInput.trim() && !quotedSelection)))"
            @click="isAiStreaming ? chatStore.requestCancel() : sendChat()"
            :title="chatStore.recoverableTarget ? t(messages.recoverBeforeSending) : (isAiStreaming ? t(messages.stopGeneration) : t(messages.sendMessage))"
            :aria-label="chatStore.recoverableTarget ? t(messages.recoverBeforeSending) : (isAiStreaming ? t(messages.stopGeneration) : t(messages.sendMessage))"
          >
            <IconX v-if="isAiStreaming" :size="16" :stroke-width="2" />
            <IconArrowUp v-else :size="16" :stroke-width="2" />
          </button>
        </div>
      </div>
    </aside>

    <!-- AI Refine Loading -->
    <Transition name="refine-fade">
      <div v-if="isRefiningAi" class="refine-overlay">
        <div class="refine-card">
          <div class="refine-spinner"></div>
          <span class="refine-text">{{ aiRefiningText }}</span>
        </div>
      </div>
    </Transition>

    <DocumentNotReadyDialog
      v-model="showNotReadyDialog"
      :file-name="selectedFile?.name || t(messages.currentFile)"
      @cancel="showNotReadyDialog = false"
      @go-profile="goToProcessingCenter"
    />
    <KnowledgeBlockEditor
      v-model="showKnowledgeEditor"
      :initial-content="selectedText"
      :is-saving="isCreatingKnowledgeBlock"
      @cancel="showKnowledgeEditor = false"
      @save="saveKnowledgeBlock"
    />

    <Teleport to="body">
      <Transition name="selection-bubble-pop">
        <div
          v-if="selectedText && selectionPosition"
          class="selection-actions floating-selection-bubble"
          :style="{
            top: `${selectionPosition.top}px`,
            left: `${selectionPosition.left}px`,
            transform: selectionPosition.showBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
          }"
          role="toolbar"
          :aria-label="t(messages.selectionActions)"
          @mousedown.stop.prevent
        >
          <span class="selection-summary">{{ t(messages.selectionLength, { count: selectedText.length }) }}</span>
          <span class="selection-divider" aria-hidden="true"></span>
          <button type="button" class="selection-btn action-quote" @click="addSelectionToChat">
            <IconMessageCircle :size="13" :stroke-width="2" />
            <span>{{ t(selectionScope === 'chat' ? messages.addToNextQuestion : messages.addToQuestion) }}</span>
          </button>
          <button type="button" class="selection-btn action-save" @click="saveSelection">
            <IconNotes :size="13" :stroke-width="2" />
            <span>{{ t(messages.saveAsBlock) }}</span>
          </button>
          <button type="button" class="selection-dismiss" :aria-label="t(messages.clearSelection)" :title="t(messages.clearSelection)" @click="clearSelection">
            <IconX :size="13" />
          </button>
        </div>
      </Transition>
    </Teleport>

    <!-- Register File Modal -->
    <FileRegisterDialog
      v-model="showRegisterModal"
      :title="t(messages.registerFile)"
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
      :title="t(messages.createTask)"
      :submit-text="t(messages.addToSchedule)"
      :fixed-subject-id="activeSubject?.id"
      :fixed-subject-name="activeSubject?.name"
      @submit="handleAddTask"
    />

    <!-- Block Detail / Edit Modal -->
    <WorkspaceKnowledgeBlockDialog
      v-model="blockDialogVisible"
      :mode="blockDialogMode"
      :block="selectedBlock"
      :edit-baseline="blockEditBaseline"
      :active-subject-name="activeSubject?.name"
      :theme-colors="themeColors"
      :is-saving="isSavingBlockEdit || isResolvingBlockConflict || (blockDialogMode === 'create' && isCreatingKnowledgeBlock)"
      :edit-warning="blockEditWarning"
      :can-review-latest="!!selectedBlock && selectedBlock.version !== blockEditBaseline?.version && !selectedBlockConflict"
      :remote-conflict="selectedBlockConflict?.remote"
      @update:mode="blockDialogMode = $event"
      @save="handleSaveBlockFromDialog"
      @review-latest="reviewLatestBlock"
      @resolve-conflict="handleResolveBlockConflict"
      @delete="handleDeleteBlock"
      @copy="handleCopyBlockContent"
      @close="closeBlockDialog"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { locale, t, type Message } from '@/i18n'
import { messages } from './workspaceMessages'
import { storeToRefs } from 'pinia'
import { renderMarkdown } from '@/utils/markdown'
import { ElIcon, ElNotification, ElMessage, ElMessageBox } from 'element-plus'
import {
  IconArrowLeft,
  IconFileText,
  IconList,
  IconLayoutGrid,
  IconX,
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
  IconTrash,
  IconHistory,
  IconChartBar,
  IconCopy
} from '@tabler/icons-vue'
import 'element-plus/theme-chalk/el-notification.css'
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-select.css'
import 'element-plus/theme-chalk/el-option.css'

import FilePreview from '@/components/FilePreview.vue'
import ChatContentRenderer from '@/components/chat/ChatContentRenderer.vue'
import ChatProcessArea from '@/components/chat/ChatProcessArea.vue'
import DocumentProcessingDot from '@/components/documentProcessing/DocumentProcessingDot.vue'
import DocumentNotReadyDialog from '@/components/documentProcessing/DocumentNotReadyDialog.vue'
import KnowledgeBlockEditor from '@/components/knowledge/KnowledgeBlockEditor.vue'
import WorkspaceKnowledgeBlockDialog from '@/components/knowledge/WorkspaceKnowledgeBlockDialog.vue'
import SubjectOverviewSection from '@/components/subject/SubjectOverviewSection.vue'
import SubjectReviewPane from '@/components/subject/SubjectReviewPane.vue'
import SubjectStatsPane from '@/components/subject/SubjectStatsPane.vue'
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
import { getLocalRepository, getOverviewRepository } from '@/services/localDb'
import { LocalConflictError } from '@/services/localRepository'
import { OverviewGenerationService, hasUsableOverview } from '@/services/overviewGenerationService'
import { overviewFailureMessage } from '@/services/overviewFailurePolicy'
import { classifyClientError, logClientError } from '@/services/clientErrorPolicy'
import { documentProcessingRuntime } from '@/services/documentProcessing/runtime'
import { useOverviewApi } from '@/api/useOverviewApi'
import { useSourceApi } from '@/api/useSourceApi'
import { computeSubjectInputFingerprint, type OverviewRepository } from '@/services/overviewRepository'
import { OverviewResultsSyncService, runOverviewConflictResolutionOnce } from '@/services/overviewResultsSyncService'
import { subscribeOverviewCacheUpdated } from '@/services/overviewSyncWakeup'
import { autoSyncEnabled } from '@/services/desktopPreferences'
import type { FileOverviewRecord, OverviewOperationHandle, OverviewRegenerationResult, SubjectOverviewRecord } from '@/types/overview'
import { shouldAdoptGeneratedOutline } from '@/services/outlineIdentity'
import type { KnowledgeBlockModel, SourceFileModel } from '@/services/domainMappers'
import { getSubjectIconComponent } from '@/utils/subjectIcon'
import { SUPPORTED_UPLOAD_EXTENSIONS, validateUploadFile } from '@/utils/filePreview'

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
  streamingReasoning: storedStreamingReasoning,
  streamingParts: storedStreamingParts,
  streamingTools: storedStreamingTools,
  pendingMessage: storedPendingMessage,
} = storeToRefs(chatStore)
const taskStore = useTaskStore()
const isScopeLocked = computed(() => Boolean(chatStore.isBoundSession))
const boundScope = computed(() => {
  if (isScopeLocked.value && chatStore.activeSession?.chatScope) {
    return chatStore.activeSession.chatScope
  }
  return null
})

const subjectId = computed(() => route.params.id as string)
const timeAgo = (iso: string) => {
  if (!iso) return ''
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return t(messages.justNow)
  const formatter = new Intl.RelativeTimeFormat(locale.value, { style: 'short' })
  if (m < 60) return formatter.format(-m, 'minute')
  const h = Math.floor(m / 60)
  if (h < 24) return formatter.format(-h, 'hour')
  return Number.isFinite(h) ? formatter.format(-Math.floor(h / 24), 'day') : ''
}

// ===== Tier-1 / Tier-2 State =====
const tier2Open = ref(true)
const tier2Mode = ref<'files' | 'outline'>('files')
const centerView = ref<'blocks' | 'preview' | 'overview' | 'summary' | 'review' | 'stats'>('overview')
const rightCollapsed = ref(false)

const lastWorkspaceState = ref<{
  view: 'preview' | 'overview' | 'blocks'
  tier2Open: boolean
  tier2Mode: 'files' | 'outline'
  selectedFileId: string | null
}>({
  view: 'overview',
  tier2Open: true,
  tier2Mode: 'files',
  selectedFileId: null,
})

const handleReviewOrStatsBack = () => {
  const previous = lastWorkspaceState.value
  if (previous) {
    centerView.value = previous.view
    tier2Open.value = previous.tier2Open
    tier2Mode.value = previous.tier2Mode
    if (previous.selectedFileId) {
      selectedFileId.value = previous.selectedFileId
    }
  } else if (selectedFileId.value) {
    centerView.value = 'preview'
    tier2Open.value = true
    tier2Mode.value = 'files'
  } else if (activeSourceFiles.value.length > 0) {
    selectedFileId.value = activeSourceFiles.value[0].id
    centerView.value = 'preview'
    tier2Open.value = true
    tier2Mode.value = 'files'
  } else {
    centerView.value = 'overview'
    tier2Open.value = true
    tier2Mode.value = 'outline'
  }

  if (route.query.view || route.query.reviewState) {
    const query = { ...route.query }
    delete query.view
    delete query.reviewState
    void router.replace({ query })
  }
}

const toggleTier2 = (mode: 'files' | 'outline') => {
  if (tier2Open.value && tier2Mode.value === mode && centerView.value !== 'blocks' && centerView.value !== 'review' && centerView.value !== 'stats') {
    tier2Open.value = false
  } else {
    tier2Mode.value = mode
    tier2Open.value = true
    if (centerView.value === 'blocks' || centerView.value === 'review' || centerView.value === 'stats') {
      centerView.value = selectedFileId.value ? 'preview' : 'overview'
      if (route.query.view || route.query.reviewState) {
        const query = { ...route.query }
        delete query.view
        delete query.reviewState
        void router.replace({ query })
      }
    }
  }
}

const toggleTier2Panel = () => { tier2Open.value = !tier2Open.value }

// ===== Left Resizer =====
const tier2Width = ref(25)
const rightWidth = ref(25)
const isResizing = ref(false)

const startResizeLeft = (e: MouseEvent) => {
  e.preventDefault()
  isResizing.value = true
  const startX = e.clientX
  const startW = tier2Width.value
  const containerEl = document.querySelector('.workspace-container')
  const containerWidth = containerEl ? containerEl.getBoundingClientRect().width : window.innerWidth
  const onMove = (ev: MouseEvent) => {
    const deltaX = ev.clientX - startX
    const deltaPercent = (deltaX / containerWidth) * 100
    tier2Width.value = Math.max(15, Math.min(45, startW + deltaPercent))
  }
  const onUp = () => {
    isResizing.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

const startResizeRight = (e: MouseEvent) => {
  e.preventDefault()
  isResizing.value = true
  const startX = e.clientX
  const startW = rightWidth.value
  const containerEl = document.querySelector('.workspace-container')
  const containerWidth = containerEl ? containerEl.getBoundingClientRect().width : window.innerWidth
  const onMove = (ev: MouseEvent) => {
    const deltaX = ev.clientX - startX
    const deltaPercent = (deltaX / containerWidth) * 100
    rightWidth.value = Math.max(15, Math.min(45, startW - deltaPercent))
  }
  const onUp = () => {
    isResizing.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// ===== File summary =====
const selectedFileId = ref<string | null>(null)
const selectedText = ref('')
const quotedSelection = ref('')
const previewPaneWrapperRef = ref<HTMLElement | null>(null)
const selectionScope = ref<'preview' | 'chat' | null>(null)
const selectionPosition = ref<{ top: number; left: number; showBelow: boolean } | null>(null)
const showNotReadyDialog = ref(false)
const showKnowledgeEditor = ref(false)
const retryingSourceId = ref<string | null>(null)
const filePreviewRef = ref<InstanceType<typeof FilePreview> | null>(null)
const previewPage = ref(1)
const previewPageCount = ref(1)
const previewControlsReady = ref(false)
const previewZoomLabel = ref('100%')
const previewRotation = ref(0)

const handleRetryFileProcessing = async (sourceId: string) => {
  if (retryingSourceId.value === sourceId) return
  retryingSourceId.value = sourceId
  try {
    await sourceStore.retrySourceProcessing(sourceId)
    ElMessage.success('已重新发起文件解析')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '重试解析失败，请稍后再试')
  } finally {
    retryingSourceId.value = null
  }
}

watch(selectedFileId, () => {
  previewPage.value = 1
  previewPageCount.value = 1
  previewControlsReady.value = false
  previewZoomLabel.value = '100%'
  previewRotation.value = 0
  selectedText.value = ''
  selectionScope.value = null
  selectionPosition.value = null
  quotedSelection.value = ''
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
const resolvingGenerationConflicts = ref<Set<string>>(new Set())
const selectedSummaryScope = ref<{ kind: 'file' | 'subject'; id: string } | null>(null)
let overviewRepository: OverviewRepository | null = null
let overviewGeneration: OverviewGenerationService | null = null
let unsubscribeOverviewCache: (() => void) | null = null

const subjectOverviewError = computed(() => subjectOverviewManualError.value
  || (subjectOverviewRecord.value?.status === 'FAILED'
    ? overviewFailureMessage(subjectOverviewRecord.value.errorCode)
    : null))

const getFileOverviewRecord = (file: SourceFileModel, allowUnknownRevision = false) => {
  const record = fileOverviewRecords.value[file.id]
  const revision = file.ingestionRevision
  return (revision ? record?.ingestionRevision === revision : allowUnknownRevision) ? record : undefined
}

const fileOverviewItems = computed<FileOverviewItem[]>(() => activeSourceFiles.value.map((file) => {
  const record = getFileOverviewRecord(file, true)
  return {
    id: file.id,
    name: file.name,
    outlineMarkdown: record?.outlineMarkdown ?? null,
    summaryMarkdown: record?.summaryMarkdown ?? null,
    status: record?.status ?? (file.ingestionStatus === 'READY' ? 'PENDING' : undefined),
    error: fileOverviewManualErrors.value[file.id]
      || (record?.status === 'FAILED' ? overviewFailureMessage(record?.errorCode) : null),
    syncStatus: record?.syncStatus,
    generationConflicts: record?.generationConflicts ?? [],
    generationConflictResolving: Boolean(record?.generationConflicts?.some(conflict => resolvingGenerationConflicts.value.has(`FILE:${conflict.clientWriteId}`))),
    isGenerating: generatingFileIds.value.has(file.id),
  }
}))

const summaryTarget = computed(() => {
  const scope = selectedSummaryScope.value
  if (!scope) return null
  if (scope.kind === 'subject') return {
    kind: 'subject' as const,
    id: scope.id,
    title: activeSubject.value?.name || '学科',
    record: subjectOverviewRecord.value,
    isGenerating: subjectOverviewGenerating.value,
    isStale: isSubjectOverviewStale.value,
    error: subjectOverviewError.value,
  }
  const file = activeSourceFiles.value.find(item => item.id === scope.id)
  const record = file ? getFileOverviewRecord(file, true) ?? null : null
  return file ? {
    kind: 'file' as const,
    id: scope.id,
    title: file.name,
    record,
    isGenerating: generatingFileIds.value.has(scope.id),
    isStale: false,
    error: fileOverviewManualErrors.value[scope.id]
      || (record?.status === 'FAILED' ? overviewFailureMessage(record?.errorCode) : null),
  } : null
})

const setFileGenerating = (fileId: string, generating: boolean) => {
  const next = new Set(generatingFileIds.value)
  if (generating) next.add(fileId); else next.delete(fileId)
  generatingFileIds.value = next
}

type ManualOverviewScope = { kind: 'file'; id: string } | { kind: 'subject'; id: string }
const manualOverviewHandles = new Map<string, OverviewOperationHandle>()
const manualOverviewKey = (kind: 'file' | 'subject', id: string) => `${kind}:${id}`
const stopManualOverview = (kind: 'file' | 'subject', id: string) => {
  const key = manualOverviewKey(kind, id)
  const handle = manualOverviewHandles.get(key)
  if (!handle) return
  manualOverviewHandles.delete(key)
  handle.stop()
  if (kind === 'file') setFileGenerating(id, false)
  else subjectOverviewGenerating.value = false
}
const stopAllManualOverviews = () => {
  for (const key of [...manualOverviewHandles.keys()]) {
    const separator = key.indexOf(':')
    stopManualOverview(key.slice(0, separator) as 'file' | 'subject', key.slice(separator + 1))
  }
}
const runManualOverview = async (scope: ManualOverviewScope, handle: OverviewOperationHandle) => {
  const key = manualOverviewKey(scope.kind, scope.id)
  manualOverviewHandles.get(key)?.stop()
  manualOverviewHandles.set(key, handle)
  if (scope.kind === 'file') setFileGenerating(scope.id, true)
  else subjectOverviewGenerating.value = true
  try {
    const result = await handle
    if (manualOverviewHandles.get(key) !== handle) return
    if (applyManualOverviewResult(result, scope)) {
      await refreshOverviewCache()
      if (scope.kind === 'subject' && result.status !== 'LOCAL_EDIT_CONFLICT'
        && subjectOverviewRecord.value?.syncStatus === 'CONFLICT' && !subjectOverviewRecord.value.generationConflicts?.length) {
        void resolveSubjectOverviewConflict('LOCAL', true)
      }
    }
  } finally {
    if (manualOverviewHandles.get(key) === handle) {
      manualOverviewHandles.delete(key)
      if (scope.kind === 'file') setFileGenerating(scope.id, false)
      else subjectOverviewGenerating.value = false
    }
  }
}

const resolveGenerationEditConflict = async (scopeType: 'FILE' | 'SUBJECT', scopeId: string, revisionKey: string,
  clientWriteId: string, choice: 'KEEP_LOCAL' | 'USE_AI') => {
  const key = `${scopeType}:${clientWriteId}`
  if (resolvingGenerationConflicts.value.has(key) || !overviewRepository) return
  const userId = authStore.user?.id
  const serverDeviceId = authStore.serverDeviceId
  const capturedSubjectId = subjectId.value
  const capturedSwitchGeneration = currentSubjectSwitchGen
  const capturedRepository = overviewRepository
  const capturedFenceToken = capturedRepository.captureScopeFenceToken(scopeType,scopeId)
  const source = scopeType === 'FILE' ? activeSourceFiles.value.find(file => file.id === scopeId) : null
  const isCurrent = () => isComponentMounted && authStore.isAuthenticated && authStore.user?.id === userId
    && authStore.serverDeviceId === serverDeviceId && subjectId.value === capturedSubjectId
    && currentSubjectSwitchGen === capturedSwitchGeneration && overviewRepository === capturedRepository
    && capturedRepository.isScopeFenceTokenCurrent(capturedFenceToken)
    && (scopeType === 'SUBJECT' ? capturedSubjectId === scopeId
      : Boolean(source && activeSourceFiles.value.some(file => file.id === scopeId && file.subjectId === capturedSubjectId
        && file.ingestionStatus === 'READY' && file.ingestionRevision === revisionKey)))
  resolvingGenerationConflicts.value = new Set(resolvingGenerationConflicts.value).add(key)
  try {
    if (!isCurrent() || !userId || !serverDeviceId) return
    const candidate = (await capturedRepository.listOverviewOutbox()).find(item => item.clientWriteId === clientWriteId
      && item.scopeType === scopeType && item.scopeId === scopeId && item.revisionKey === revisionKey
      && item.state === 'CONFLICT' && item.errorCode === 'OVERVIEW_GENERATION_EDIT_CONFLICT')
    if (!candidate || !isCurrent()) return
    const validateInputs = async () => {
      if (scopeType !== 'SUBJECT' || choice !== 'USE_AI') return isCurrent()
      const files = (await Promise.all(activeSourceFiles.value.filter(file => file.ingestionStatus === 'READY' && file.ingestionRevision)
        .map(file => capturedRepository.getFileOverview(file.id,file.ingestionRevision!))))
        .filter((record): record is FileOverviewRecord => Boolean(record && hasUsableOverview(record)))
      if (!isCurrent()) return false
      const currentFingerprint = await computeSubjectInputFingerprint(files)
      return isCurrent() && Boolean(candidate.inputFingerprint && currentFingerprint === candidate.inputFingerprint)
    }
    if (!await validateInputs()) throw new Error('OVERVIEW_INPUT_CHANGED')
    const result = await capturedRepository.resolveGenerationEditConflict(clientWriteId,choice,isCurrent,validateInputs)
    if (!isCurrent()) return
    await refreshOverviewCache()
    if (result.status === 'CHANGED') ElMessage.warning('本机内容又有更新，请检查双方内容后重新选择。')
    else if (result.status === 'KEPT') ElMessage.success('已保留本机修改')
    else ElMessage.success('已采用生成结果并加入正常同步队列')
  } catch (error) {
    if (!isCurrent()) return
    const code = error instanceof Error ? error.message : ''
    if (code === 'OVERVIEW_INPUT_CHANGED' || code.endsWith('_STALE')) ElMessage.warning('资料已变化，生成结果未覆盖本机内容。')
    else if (code === 'OVERVIEW_GENERATION_CONFLICT_MISSING') ElMessage.warning('这项生成冲突已处理，请刷新后查看。')
    else ElMessage.error('冲突处理失败，请稍后重试。')
  } finally {
    const next = new Set(resolvingGenerationConflicts.value)
    next.delete(key)
    resolvingGenerationConflicts.value = next
  }
}
const resolveSubjectGenerationEditConflict = (payload: { clientWriteId: string; choice: 'KEEP_LOCAL' | 'USE_AI' }) => {
  return resolveGenerationEditConflict('SUBJECT',subjectId.value,'subject-v1',payload.clientWriteId,payload.choice)
}
const resolveFileGenerationEditConflict = (payload: { fileId: string; clientWriteId: string; choice: 'KEEP_LOCAL' | 'USE_AI' }) => {
  const revision = activeSourceFiles.value.find(file => file.id === payload.fileId)?.ingestionRevision
  if (!revision) return Promise.resolve()
  return resolveGenerationEditConflict('FILE',payload.fileId,revision,payload.clientWriteId,payload.choice)
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

const applyManualOverviewResult = (result: OverviewRegenerationResult, scope: ManualOverviewScope) => {
  if (result.status === 'LOCAL_EDIT_CONFLICT') return true
  if (result.status === 'STARTED') {
    if (scope.kind !== 'subject') ElMessage.success('已更新')
    if (scope.kind === 'subject') subjectOverviewManualError.value = null
    else clearFileOverviewManualError(scope.id)
    return true
  }
  if (result.status === 'SKIPPED' && result.code === 'ABORTED') return false
  const message = result.status === 'SKIPPED' ? overviewSkipMessage(result.code) : manualOverviewFailureMessage(result.code)
  if (scope.kind === 'subject') subjectOverviewManualError.value = message
  else fileOverviewManualErrors.value = { ...fileOverviewManualErrors.value, [scope.id]: message }
  if (result.status === 'SKIPPED') {
    if (scope.kind !== 'subject') ElMessage.warning(message)
  } else {
    if (scope.kind !== 'subject') ElMessage.error(message)
  }
  return false
}

let overviewCacheRefreshGeneration = 0
const refreshOverviewCache = async () => {
  const repository = overviewRepository
  if (!repository || repository.userId !== authStore.user?.id
    || repository.serverDeviceId !== authStore.serverDeviceId) return false
  const generation = ++overviewCacheRefreshGeneration
  const requestedSubjectId = subjectId.value
  const requestedFiles = activeSourceFiles.value
  const loginGeneration = authStore.loginGeneration
  const records = await Promise.all(requestedFiles.map(file => file.ingestionRevision
    ? repository.getFileOverview(file.id, file.ingestionRevision)
    : repository.getLatestFileOverview(file.id)))
  const subjectOverview = await repository.getSubjectOverview(requestedSubjectId)
  const usable = records.filter((record, index): record is FileOverviewRecord =>
    Boolean(record && record.ingestionRevision === requestedFiles[index]?.ingestionRevision && hasUsableOverview(record)))
  const isStale = Boolean(subjectOverview?.inputFingerprint
    && await computeSubjectInputFingerprint(usable) !== subjectOverview.inputFingerprint)
  if (!isComponentMounted || generation !== overviewCacheRefreshGeneration || subjectId.value !== requestedSubjectId
    || activeSourceFiles.value !== requestedFiles || authStore.loginGeneration !== loginGeneration
    || overviewRepository !== repository) return false
  fileOverviewRecords.value = Object.fromEntries(records.filter((record): record is FileOverviewRecord => record !== null).map(record => [record.sourceId, record]))
  subjectOverviewRecord.value = subjectOverview
  isSubjectOverviewStale.value = isStale
  if (subjectOverview?.syncStatus === 'CONFLICT' && !subjectOverview.generationConflicts?.length) {
    void resolveSubjectOverviewConflict('LOCAL', true)
  }
  return true
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
      listLocalFileOverviews: async (requestedSubjectId) => {
        await refreshOverviewCache()
        if (subjectId.value !== requestedSubjectId) return []
        return activeSourceFiles.value.flatMap(file => {
          const record = getFileOverviewRecord(file)
          return record ? [record] : []
        })
      },
    })
  }
  await refreshOverviewCache()
  return true
}

const resolveOverviewSyncConflict = (scopeType: 'FILE' | 'SUBJECT', scopeId: string, revisionKey: string, choice: 'LOCAL' | 'REMOTE', silent = false) => {
  if (silent && !autoSyncEnabled.value) return Promise.resolve()
  const userId = authStore.user?.id
  const serverDeviceId = authStore.serverDeviceId
  const capturedSubjectId = subjectId.value
  if (!authStore.isAuthenticated || !userId || !serverDeviceId) return Promise.resolve()
  const capturedRepository = overviewRepository
  const capturedFenceToken = capturedRepository?.captureScopeFenceToken(scopeType, scopeId)
  const isScopeCurrent = () => isComponentMounted && authStore.isAuthenticated && authStore.user?.id === userId
    && authStore.serverDeviceId === serverDeviceId && subjectId.value === capturedSubjectId
    && (!capturedRepository || Boolean(capturedFenceToken && overviewRepository === capturedRepository
      && capturedRepository.isScopeFenceTokenCurrent(capturedFenceToken)))
    && (scopeType === 'SUBJECT'
      ? capturedSubjectId === scopeId
      : activeSourceFiles.value.some(file => file.id === scopeId && file.ingestionRevision === revisionKey))
  const key = JSON.stringify([userId, serverDeviceId, scopeType, scopeId, revisionKey])
  const resolve = async () => {
    if (!isScopeCurrent() || !(await ensureOverviewRuntime()) || !overviewRepository || !isScopeCurrent()) return
    const localRepository = await getLocalRepository(userId,serverDeviceId)
    if (!isScopeCurrent()) return
    const isCurrent = isScopeCurrent
    const mapCurrentSources = async () => {
      if (!isCurrent()) return []
      const rows = await localRepository.list<Record<string, unknown>>('SOURCE', { includeDeleted: false })
      if (!isCurrent()) return []
      return rows.flatMap(row => {
        const value = row.value
        if (!value || typeof value.id !== 'string' || typeof value.type !== 'string'
          || typeof value.subjectId !== 'string' || typeof value.ingestionStatus !== 'string') return []
        return [{
          id: value.id, type: value.type, subjectId: value.subjectId, ingestionStatus: value.ingestionStatus,
          ingestionRevision: typeof value.ingestionRevision === 'string' ? value.ingestionRevision : null,
          deletedAt: row.deletedAt,
        }]
      })
    }
    const options = {
      sources: sourceStore.sources.map(source => ({
        id: source.id, type: source.type ?? 'FILE', subjectId: source.subjectId,
        ingestionStatus: source.ingestionStatus ?? '', ingestionRevision: source.ingestionRevision ?? null,
        deletedAt: source.deletedAt,
      })),
      subjectIds: subjectStore.subjects.map(subject => subject.id),
      isCurrent,
      isSourceCurrent: async (source: { id: string; ingestionRevision: string | null }) => {
        if (!isCurrent()) return false
        const row = await localRepository.read<Record<string, unknown>>('SOURCE', source.id)
        const value = row?.value
        return isCurrent() && Boolean(row && !row.deletedAt && value && value.id === source.id && value.type === 'FILE'
          && value.ingestionStatus === 'READY' && value.ingestionRevision === source.ingestionRevision)
      },
      isSubjectCurrent: async (id: string) => {
        if (!isCurrent()) return false
        const row = await localRepository.read<Record<string, unknown>>('SUBJECT', id)
        return isCurrent() && Boolean(row && !row.deletedAt && row.id === id)
      },
      getCurrentSources: mapCurrentSources,
    }
    if (silent && !autoSyncEnabled.value) return
    try {
      await new OverviewResultsSyncService(overviewRepository,userId,serverDeviceId)
        .resolveConflict(scopeType,scopeId,revisionKey,choice,options)
      if (options.isCurrent()) await refreshOverviewCache()
      if (!silent) {
        ElMessage.success(choice === 'LOCAL' ? '已提交本机总览同步' : '已采用云端总览')
      }
    } catch (error) {
      if (!silent) {
        const code = error instanceof Error ? error.message : ''
        if (code === 'OVERVIEW_INPUT_CHANGED') ElMessage.warning('资料已变化，本机总览未覆盖云端，请先重新生成。')
        else if (code === 'OVERVIEW_REMOTE_MISSING') ElMessage.warning('云端没有当前版本，保留本机总览并重试。')
        else if (code === 'OVERVIEW_SCOPE_CHANGED' || code.endsWith('_STALE')) ElMessage.warning('资料版本已变化，请刷新后重试。')
        else ElMessage.error('总览同步处理失败，请稍后重试。')
      }
    }
  }
  if (scopeType === 'SUBJECT' && choice === 'LOCAL' && silent) {
    return runOverviewConflictResolutionOnce(key, resolve)
  }
  return resolve()
}

const resolveSubjectOverviewConflict = (choice: 'LOCAL' | 'REMOTE' = 'LOCAL', silent = false) => {
  if (subjectId.value) void resolveOverviewSyncConflict('SUBJECT',subjectId.value,'subject-v1',choice, silent)
}

const resolveFileOverviewConflict = (payload: { fileId: string; choice: 'LOCAL' | 'REMOTE' }) => {
  const file = activeSourceFiles.value.find(item => item.id === payload.fileId)
  if (file?.ingestionRevision) void resolveOverviewSyncConflict('FILE',payload.fileId,file.ingestionRevision,payload.choice)
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


const regenerateFileOverview = async ({ fileId, mode }: { fileId: string; mode: 'OUTLINE' | 'ALL' }) => {
  const launchSubjectId = subjectId.value
  setFileGenerating(fileId, true)
  try {
    if (!await ensureOverviewRuntime() || !overviewGeneration) {
      setFileGenerating(fileId, false)
      return
    }
    if (!isComponentMounted || subjectId.value !== launchSubjectId || !activeSourceFiles.value.some(file => file.id === fileId)) {
      setFileGenerating(fileId, false)
      return
    }
    await runManualOverview({ kind: 'file', id: fileId }, overviewGeneration.regenerateFileOverview(fileId, mode))
  } catch (e) {
    setFileGenerating(fileId, false)
    throw e
  }
}

const regenerateSelectedSummary = async (instruction?: string) => {
  const scope = selectedSummaryScope.value
  if (!scope) return
  if (scope.kind === 'subject') subjectOverviewGenerating.value = true
  else setFileGenerating(scope.id, true)
  try {
    if (!await ensureOverviewRuntime() || !overviewGeneration) {
      if (scope.kind === 'subject') subjectOverviewGenerating.value = false
      else setFileGenerating(scope.id, false)
      return
    }
    if (!isComponentMounted || selectedSummaryScope.value?.kind !== scope.kind || selectedSummaryScope.value?.id !== scope.id) {
      if (scope.kind === 'subject') subjectOverviewGenerating.value = false
      else setFileGenerating(scope.id, false)
      return
    }
    if (scope.kind === 'subject') {
      await runManualOverview(scope, overviewGeneration.regenerateSubjectOverview(scope.id, 'SUMMARY', instruction))
    } else {
      await runManualOverview(scope, overviewGeneration.regenerateFileOverview(scope.id, 'SUMMARY', instruction))
    }
  } catch (e) {
    if (scope.kind === 'subject') subjectOverviewGenerating.value = false
    else setFileGenerating(scope.id, false)
    throw e
  }
}

const selectFile = async (id: string) => {
  if (selectedFileId.value === id) {
    selectedSummaryScope.value = null
    centerView.value = 'preview'
    return
  }
  ++currentSubjectSwitchGen
  selectedFileId.value = id
  selectedSummaryScope.value = null
  centerView.value = 'preview'
  const file = activeSourceFiles.value.find((item) => item.id === id)
  if (file && !isScopeLocked.value) {
    selectedAiSourceIds.value = [id]
    aiReferenceScope.value = 'AUTO'
    if (!chatStore.activeSession && !chatSessionInitialization) {
      await startFreshChatSession(file.name)
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
    if (isComponentMounted && subjectId.value === file.subjectId && selectedFileId.value === file.id) {
      const firstFile = activeSourceFiles.value.find((item) => item.subjectId === file.subjectId)
      if (firstFile) {
        void selectFile(firstFile.id)
      } else {
        selectedFileId.value = null
        selectedSummaryScope.value = null
        centerView.value = 'overview'
      }
    }
    ElMessage.success('已删除文件')
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

// ===== 大纲 Markdown 编辑草稿与状态 =====
const isOutlineComposer = ref(false)
const subjectOutlineDraft = ref('')
const subjectOutlineBaseline = ref('')
const subjectOutlineSave = ref<symbol | null>(null)
const isSavingSubjectOutline = computed(() => subjectOutlineSave.value !== null)

const fileOutlineDrafts = ref<Record<string, string>>({})
const fileDraftBaselines = ref<Record<string, string>>({})
const fileDraftRevisions = ref<Record<string, string>>({})
const fileDraftOutlineGeneratedAt = ref<Record<string, string | null>>({})
const fileOutlineSaves = ref(new Map<string, symbol>())
const fileCardCollapsed = ref<Record<string, boolean>>({})

const subjectOutlineHasUnsavedChanges = (): boolean => subjectOutlineDraft.value !== subjectOutlineBaseline.value
const fileOutlineDraftHasUnsavedChanges = (fileId: string): boolean =>
  (fileOutlineDrafts.value[fileId] ?? '') !== (fileDraftBaselines.value[fileId] ?? '')

const initFileOutlineDraft = (file: SourceFileModel, discardDraft = false) => {
  const fileId = file.id
  if (!file.ingestionRevision || fileOutlineSaves.value.has(fileId)) return
  if (!discardDraft && fileOutlineDraftHasUnsavedChanges(fileId)) return

  const record = getFileOverviewRecord(file)
  const remote = record?.outlineMarkdown ?? ''
  fileOutlineDrafts.value[fileId] = remote
  fileDraftBaselines.value[fileId] = remote
  fileDraftRevisions.value[fileId] = file.ingestionRevision
  fileDraftOutlineGeneratedAt.value[fileId] = record?.outlineGeneratedAt ?? null
}

const initAllFileOutlineDrafts = () => {
  for (const file of activeSourceFiles.value) {
    initFileOutlineDraft(file)
  }
}

const initSubjectOutlineFromExisting = () => {
  if (isSavingSubjectOutline.value || subjectOutlineHasUnsavedChanges()) return
  const remote = subjectOverviewRecord.value?.outlineMarkdown ?? ''
  subjectOutlineDraft.value = remote
  subjectOutlineBaseline.value = remote
}

watch(isOutlineComposer, (val) => {
  if (val) {
    initSubjectOutlineFromExisting()
    initAllFileOutlineDrafts()
  }
})

watch(() => subjectOverviewRecord.value?.outlineMarkdown, (newOutline) => {
  if (isOutlineComposer.value && newOutline !== undefined) {
    initSubjectOutlineFromExisting()
  }
})

watch([fileOverviewItems, fileOutlineSaves], () => {
  if (!isOutlineComposer.value) return
  for (const file of activeSourceFiles.value) {
    if (fileOutlineSaves.value.has(file.id)) continue
    if (fileDraftRevisions.value[file.id] !== file.ingestionRevision) {
      initFileOutlineDraft(file)
      continue
    }
    const generatedAt = getFileOverviewRecord(file)?.outlineGeneratedAt ?? null
    const previousGeneratedAt = fileDraftOutlineGeneratedAt.value[file.id]
    if (shouldAdoptGeneratedOutline(previousGeneratedAt, generatedAt, fileOutlineDraftHasUnsavedChanges(file.id))) {
      initFileOutlineDraft(file)
    }
  }
}, { deep: true, immediate: true })

watch(activeSourceFiles, async () => {
  if (!isComponentMounted) return
  if (!await refreshOverviewCache().catch(() => false)) return
  if (isOutlineComposer.value) {
    initSubjectOutlineFromExisting()
    initAllFileOutlineDrafts()
  }
}, { deep: true })

const saveCurrentOutline = async () => {
  const repository = overviewRepository
  const targetSubjectId = subjectId.value
  if (!targetSubjectId || !repository || isSavingSubjectOutline.value
    || repository.userId !== authStore.user?.id || repository.serverDeviceId !== authStore.serverDeviceId) return
  const submittedDraft = subjectOutlineDraft.value
  const outlineMarkdown = submittedDraft.trim()
  if (!outlineMarkdown) {
    ElMessage.warning('大纲内容不能为空')
    return
  }
  const loginGeneration = authStore.loginGeneration
  const save = Symbol()
  subjectOutlineSave.value = save
  const isStillCurrent = () => isComponentMounted && authStore.loginGeneration === loginGeneration
    && overviewRepository === repository && subjectId.value === targetSubjectId && subjectOutlineSave.value === save
  try {
    const fingerprint = subjectOverviewRecord.value?.inputFingerprint || 'manual-edit'
    const record = await repository.saveSubjectOverviewPart({
      subjectId: targetSubjectId,
      mode: 'OUTLINE',
      response: {
        schemaVersion: 2,
        title: subjectOverviewRecord.value?.title || '学科总览',
        outlineMarkdown,
        summaryMarkdown: subjectOverviewRecord.value?.summaryMarkdown || null,
      },
      inputFingerprint: fingerprint,
      isStillCurrent,
    })
    if (!isStillCurrent()) return
    subjectOutlineBaseline.value = submittedDraft
    subjectOverviewRecord.value = record
    ElMessage.success('大纲已成功保存')
  } catch (err) {
    if (!isStillCurrent()) return
    console.error('保存大纲失败:', err)
    ElMessage.error('保存大纲失败，请重试')
  } finally {
    if (subjectOutlineSave.value === save) subjectOutlineSave.value = null
  }
}

const saveFileOutline = async (fileId: string) => {
  const repository = overviewRepository
  const targetSubjectId = subjectId.value
  const file = activeSourceFiles.value.find(f => f.id === fileId && f.subjectId === targetSubjectId)
  const revision = file?.ingestionRevision
  if (!file || !revision || fileDraftRevisions.value[fileId] !== revision
    || !repository || fileOutlineSaves.value.has(fileId)
    || repository.userId !== authStore.user?.id || repository.serverDeviceId !== authStore.serverDeviceId) return

  const submittedDraft = fileOutlineDrafts.value[fileId] ?? ''
  const outlineMarkdown = submittedDraft.trim()
  if (!outlineMarkdown) {
    ElMessage.warning('大纲内容不能为空')
    return
  }
  const loginGeneration = authStore.loginGeneration
  const save = Symbol()
  fileOutlineSaves.value.set(fileId, save)
  const isStillCurrent = () => isComponentMounted && authStore.loginGeneration === loginGeneration
    && overviewRepository === repository && subjectId.value === targetSubjectId
    && fileOutlineSaves.value.get(fileId) === save
    && activeSourceFiles.value.some(file => file.id === fileId && file.subjectId === targetSubjectId
      && file.ingestionRevision === revision)
  try {
    const existingRecord = getFileOverviewRecord(file)

    const updatedRecord = await repository.saveFileOverviewPart({
      sourceId: fileId,
      ingestionRevision: revision,
      mode: 'OUTLINE',
      response: {
        schemaVersion: 2,
        title: existingRecord?.title || file.name,
        outlineMarkdown,
        summaryMarkdown: existingRecord?.summaryMarkdown || null,
      },
      isStillCurrent,
    })
    if (!isStillCurrent()) return

    fileDraftBaselines.value[fileId] = submittedDraft
    fileDraftOutlineGeneratedAt.value[fileId] = updatedRecord.outlineGeneratedAt
    fileOverviewRecords.value = {
      ...fileOverviewRecords.value,
      [fileId]: updatedRecord,
    }
    ElMessage.success(`《${file.name}》大纲已保存`)
  } catch (err) {
    if (!isStillCurrent()) return
    console.error(`保存文件大纲失败 [${fileId}]:`, err)
    ElMessage.error(`保存《${file.name}》大纲失败，请重试`)
  } finally {
    if (fileOutlineSaves.value.get(fileId) === save) fileOutlineSaves.value.delete(fileId)
  }
}

const handleOutlineAi = async () => {
  const launchSubjectId = subjectId.value
  tier2Open.value = true
  subjectOverviewCollapsed.value = false
  subjectOverviewGenerating.value = true
  try {
    if (!await ensureOverviewRuntime() || !overviewGeneration) {
      subjectOverviewGenerating.value = false
      return
    }
    if (!isComponentMounted || subjectId.value !== launchSubjectId) {
      subjectOverviewGenerating.value = false
      return
    }
    await runManualOverview({ kind: 'subject', id: launchSubjectId }, overviewGeneration.regenerateSubjectOverview(launchSubjectId, 'ALL'))
  } catch (e) {
    subjectOverviewGenerating.value = false
    throw e
  }
}

const handleSubjectOutlineRegenerate = async () => {
  const launchSubjectId = subjectId.value
  tier2Open.value = true
  subjectOverviewCollapsed.value = false
  subjectOverviewGenerating.value = true
  try {
    if (!await ensureOverviewRuntime() || !overviewGeneration) {
      subjectOverviewGenerating.value = false
      return
    }
    if (!isComponentMounted || subjectId.value !== launchSubjectId) {
      subjectOverviewGenerating.value = false
      return
    }
    await runManualOverview({ kind: 'subject', id: launchSubjectId }, overviewGeneration.regenerateSubjectOverview(launchSubjectId, 'OUTLINE'))
  } catch (e) {
    subjectOverviewGenerating.value = false
    throw e
  }
}

// ===== Knowledge Blocks =====
const blockSearchQuery = ref('')
const subjectBlocks = computed(() => recentBlocks.value.filter(b => b.subjectId === subjectId.value))
const filteredBlocks = computed(() => {
  const q = blockSearchQuery.value.trim().toLowerCase()
  if (!q) return subjectBlocks.value
  return subjectBlocks.value.filter(b => (b.title?.toLowerCase().includes(q)) || (b.content?.toLowerCase().includes(q)))
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
      uploadProgress.value = percent < 100 ? Math.round(percent * 0.7) : 70 // uploadProgress.value = percent
      uploadStage.value = stage
    })
    uploadProgress.value = 75
    uploadStage.value = '正在关联学科资料...'
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

    if (targetSubjectId === subjectId.value) {
      uploadProgress.value = 90
      uploadStage.value = '正在刷新资料列表...'
      await sourceStore.loadLocalSourceFiles(subjectId.value)
    }

    uploadProgress.value = 100
    uploadStage.value = '导入完成'
    await new Promise(resolve => setTimeout(resolve, 400))

    showRegisterModal.value = false
    registerForm.value = { name: '', filePath: '', fileType: 'PDF', fileSize: 0, subjectId: '' }
    droppedFile.value = null
    ElNotification({ title: '已保存到本地', message: `${currentFile.name} 将在后台同步`, type: 'success', position: 'top-right' })
  } catch (e: any) {
    console.error(e)
    uploadProgress.value = 0
    uploadStage.value = ''
    ElNotification({ title: '录入失败', message: e.message || '文件上传或创建失败，请重试', type: 'error', position: 'top-right' })
  } finally {
    isUploading.value = false
  }
}


// ===== Task Creation =====
const showTaskModal = ref(false)

const handleAddTask = async (taskData: { name: string; duration: number; due?: string; dueAt?: string }) => {
  if (!taskData.name.trim() || !activeSubject.value) return
  const s = activeSubject.value
  await taskStore.addTask({
    title: taskData.name.trim(),
    subject: s.name,
    description: '从学科工作区',
    durationMinutes: taskData.duration,
    status: 'pending',
    subjectId: s.id,
    dueAt: taskData.dueAt,
  })
  showTaskModal.value = false
  ElNotification({ title: '已生成', type: 'success', position: 'top-right' })
}

// ===== AI Refine =====
const isRefiningAi = ref(false)
const aiRefiningText = ref('')

// ===== Block CRUD =====
const blockDialogVisible = ref(false)
const selectedBlockId = ref<string | null>(null)
const selectedBlock = computed(() => subjectBlocks.value.find((block) => block.id === selectedBlockId.value) ?? null)
const isEditMode = ref(false)
const isCreateMode = ref(false)
const blockEditBaseline = ref<KnowledgeBlockModel | null>(null)
const isSavingBlockEdit = ref(false)
const isResolvingBlockConflict = ref(false)
const selectedBlockConflict = computed(() => selectedBlockId.value ? blockStore.knowledgeBlockConflicts[selectedBlockId.value] : undefined)
const blockEditError = ref('')
const blockEditWarning = computed(() => {
  const baseline = blockEditBaseline.value
  if (!baseline) return ''
  if (blockEditError.value) return blockEditError.value
  if (!selectedBlock.value) return '该知识块已从当前列表移除。草稿仍可复制。'
  if (selectedBlockConflict.value) return '上次更新未同步。请先处理冲突，当前草稿仍可复制。'
  if (selectedBlock.value.version !== baseline.version) return '知识块已更新。草稿仍可复制，查看最新版本后可重新编辑。'
  return ''
})
const isCreatingKnowledgeBlock = ref(false)

const themeColors = [
  { name: '绿', value: 'rgba(181,196,177,0.4)' },
  { name: '沙', value: 'rgba(217,197,178,0.4)' },
  { name: '粉', value: 'rgba(212,163,163,0.4)' },
  { name: '蓝', value: 'rgba(179,192,207,0.4)' },
  { name: '黄', value: 'rgba(230,223,216,0.5)' }
]

const handleBlockClick = (block: KnowledgeBlockModel) => {
  if (blockDialogVisible.value && isEditMode.value && !isCreateMode.value && selectedBlockId.value === block.id) return
  blockDialogMode.value = 'view'
  selectedBlockId.value = block.id
  blockDialogVisible.value = true
}
const openCreateDialog = () => {
  selectedBlockId.value = null
  blockDialogMode.value = 'create'
  blockDialogVisible.value = true
}
const blockDialogMode = computed<'view' | 'edit' | 'create'>({
  get: () => {
    if (isCreateMode.value) return 'create'
    if (isEditMode.value) return 'edit'
    return 'view'
  },
  set: (mode) => {
    if (mode === 'edit') {
      if (!selectedBlock.value || selectedBlockConflict.value) return
      blockEditBaseline.value = { ...selectedBlock.value }
    } else {
      blockEditBaseline.value = null
    }
    blockEditError.value = ''
    isCreateMode.value = mode === 'create'
    isEditMode.value = mode !== 'view'
  }
})

const reviewLatestBlock = () => {
  const block = selectedBlock.value
  if (!block || !blockEditBaseline.value || selectedBlockConflict.value) return
  blockEditBaseline.value = { ...block }
  blockEditError.value = ''
}

const handleSaveBlockFromDialog = async (data: {
  id?: string
  subjectId?: string
  subject: string
  title: string
  color: string
  content: string
  source: string
}) => {
  if (!data.title.trim() || !data.content.trim()) {
    ElNotification({ title: '请填写标题与正文内容', type: 'warning', position: 'top-right' })
    return
  }
  if (isCreateMode.value) {
    const newId = await createKnowledgeBlock({
      subject: data.subject || activeSubject.value?.name || '',
      title: data.title,
      content: data.content,
      time: new Date().toLocaleString(),
      source: data.source,
      color: data.color,
      subjectId: data.subjectId || subjectId.value,
      sourceFileId: selectedSourceId.value || undefined
    })
    if (!newId) return
    selectedBlockId.value = newId
    ElNotification({ title: '已录入', type: 'success', position: 'top-right' })
    closeBlockDialog()
    return
  }

  const baseline = blockEditBaseline.value
  if (!baseline || data.id !== baseline.id || isSavingBlockEdit.value || blockEditWarning.value) return
  const isCurrent = captureKnowledgeBlockScope()
  isSavingBlockEdit.value = true
  try {
    await blockStore.updateBlock({
      ...baseline,
      title: data.title,
      content: data.content,
      color: data.color,
    })
    if (!isCurrent()) return
    closeBlockDialog()
    ElNotification({ title: '已在本机保存，等待同步', type: 'success', position: 'top-right' })
  } catch (error) {
    if (!isCurrent()) return
    if (error instanceof LocalConflictError) {
      blockEditError.value = error.blockedByMutation
        ? '此知识块的同步冲突需要处理。当前草稿仍可复制。'
        : error.resource && error.resource.deletedAt === null
          ? '知识块已更新。草稿仍可复制，查看最新版本后可重新编辑。'
          : '该知识块已从当前列表移除。草稿仍可复制。'
      await blockStore.loadLocalBlocks(undefined, baseline.subjectId).catch(() => undefined)
      return
    }
    ElNotification({ title: '保存失败，草稿已保留', type: 'error', position: 'top-right' })
  } finally {
    if (isCurrent()) isSavingBlockEdit.value = false
  }
}

const closeBlockDialog = () => {
  blockDialogVisible.value = false
  blockDialogMode.value = 'view'
}

watch([selectedBlock, blockDialogMode], ([block, mode]) => {
  if (blockDialogVisible.value && mode === 'view' && !block) closeBlockDialog()
})

watch([subjectId, () => authStore.loginGeneration], () => {
  closeBlockDialog()
  selectedBlockId.value = null
  isSavingBlockEdit.value = false
  isResolvingBlockConflict.value = false
}, { flush: 'sync' })

const captureKnowledgeBlockScope = () => {
  const targetSubjectId = subjectId.value
  const loginGeneration = authStore.loginGeneration
  const generation = currentSubjectSwitchGen
  return () => isComponentMounted && subjectId.value === targetSubjectId
    && authStore.loginGeneration === loginGeneration && currentSubjectSwitchGen === generation
}

const handleResolveBlockConflict = async (action: 'REMOTE' | 'RETRY') => {
  const conflict = selectedBlockConflict.value
  if (!conflict || isResolvingBlockConflict.value || isEditMode.value) return
  const isCurrent = captureKnowledgeBlockScope()
  isResolvingBlockConflict.value = true
  try {
    await blockStore.resolveBlockConflict(conflict, action)
    if (!isCurrent()) return
    ElNotification({
      title: action === 'REMOTE' ? '已采用云端版本' : '已在本机保存，等待同步',
      type: 'success',
      position: 'top-right',
    })
  } catch (error) {
    if (!isCurrent()) return
    ElNotification({ title: '未能处理同步冲突', message: error instanceof Error ? error.message : undefined, type: 'warning', position: 'top-right' })
  } finally {
    if (isCurrent()) isResolvingBlockConflict.value = false
  }
}

const handleDeleteBlock = async (id: string, version: number) => {
  if (!id || !confirm('确定删除？')) return
  const isCurrent = captureKnowledgeBlockScope()
  try {
    await blockStore.removeBlock(id, version)
  } catch (error) {
    if (!isCurrent()) return
    let title = '删除失败，请重试'
    if (error instanceof LocalConflictError) {
      title = '知识块已更新，请查看最新内容后再删除'
      if (error.blockedByMutation) title = '知识块正在同步或有待处理的同步问题'
      else if (!error.resource || error.resource.deletedAt) title = '该知识块已删除'
    }
    ElNotification({ title, type: 'warning', position: 'top-right' })
    return
  }
  if (!isCurrent()) return
  if (selectedBlockId.value === id) selectedBlockId.value = null
  closeBlockDialog()
  ElNotification({ title: '已在本机删除，等待同步', type: 'success', position: 'top-right' })
}
const handleCopyBlockContent = (c: string) => { if (c) { navigator.clipboard.writeText(c); ElNotification({ title: '已复制', type: 'success', position: 'top-right', duration: 2000 }) } }
const copiedBlockId = ref<string | null>(null)
let copyTimeout: ReturnType<typeof setTimeout> | null = null

const handleCopyCardContent = (block: any) => {
  const text = block.content || ''
  if (!text) return
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      copiedBlockId.value = block.id
      if (copyTimeout) clearTimeout(copyTimeout)
      copyTimeout = setTimeout(() => {
        copiedBlockId.value = null
      }, 1500)
      ElMessage.success('已复制知识内容')
    }).catch(() => {})
  }
}
const handleDeleteBlockCard = (id: string, version: number) => {
  void handleDeleteBlock(id, version)
}
interface PresetQuestionItem {
  label: Message
  prompt: string
}

const presetQuestions: PresetQuestionItem[] = [
  { label: messages.presetKeyPoints, prompt: '总结当前文件的核心要点与关键脉络' },
  { label: messages.presetConcepts, prompt: '查找并梳理本章的核心概念与权威解释' },
  { label: messages.presetQuiz, prompt: '针对当前内容生成 3 道自测题以巩固记忆' }
]

const sendPreset = (q: string) => {
  if (!canSendWorkspaceChat.value) return
  chatInput.value = q
  sendChat()
}



// ===== AI Chat (Right Panel) =====
interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  status?: import('@/store/useChatStore').ChatMessage['status']
  content: string
  parts: import('@/types/chatContent').ChatContentPart[]
  reasoningText?: string
  tools?: readonly import('@/services/aiStreamReducer').ChatToolActivity[]
  quoteText?: string
  citationFileNames?: string[]
  runId?: string
  attemptId?: string
}
const isStreamSettling = ref(false)
let streamSettleTimer: ReturnType<typeof setTimeout> | null = null
const isAiStreaming = computed(() => storedChatStreaming.value)
const isAiDisplayStreaming = computed(() => storedChatStreaming.value || isStreamSettling.value)

const chatMessages = computed<ChatMsg[]>(() => {
  let list = storedChatMessages.value.filter(
    (message) => (message.role === 'USER' || message.role === 'ASSISTANT') && !(message.role === 'ASSISTANT' && message.status === 'PENDING')
  )
  if (isStreamSettling.value) {
    // 思考链收起动效缓冲期内，最后一条刚完成的助手消息仍在活跃流气泡内执行收回动效，暂不在历史列表并存展示
    const lastAssistantIdx = list.map((m) => m.role).lastIndexOf('ASSISTANT')
    if (lastAssistantIdx >= 0) {
      list = list.filter((_, idx) => idx !== lastAssistantIdx)
    }
  }
  return list.map((message) => ({
    id: message.id,
    role: message.role === 'USER' ? 'user' : 'assistant',
    status: message.status,
    content: message.content,
    parts: message.parts,
    reasoningText: message.reasoningText,
    tools: message.tools,
    quoteText: message.requestOptions?.selectionText,
    citationFileNames: [],
    runId: message.runId,
    attemptId: message.attemptId,
  }))
})
const pendingChatMessage = computed(() => storedPendingMessage.value)
const chatInput = ref('')
const streamingContent = computed(() => storedStreamingContent.value)
const streamingReasoning = computed(() => {
  if (!isAiDisplayStreaming.value) return ''
  if (storedStreamingReasoning.value) return storedStreamingReasoning.value
  // 仅在真实流已结束但处于 450ms 收起动效缓冲期时，才回退显示刚完成的助手消息以保持平滑过渡
  if (isStreamSettling.value && !isAiStreaming.value) {
    const target = [...storedChatMessages.value].reverse().find((m) => m.role === 'ASSISTANT')
    return target?.reasoningText || ''
  }
  return ''
})
const streamingParts = computed(() => {
  if (!isAiDisplayStreaming.value) return []
  if (storedStreamingParts.value && storedStreamingParts.value.length > 0) {
    return storedStreamingParts.value
  }
  // 仅在真实流已结束但处于 450ms 收起动效缓冲期时，才回退显示刚完成的助手消息以保持平滑过渡
  if (isStreamSettling.value && !isAiStreaming.value) {
    const target = [...storedChatMessages.value].reverse().find((m) => m.role === 'ASSISTANT')
    return target?.parts || []
  }
  return []
})
const streamingTools = computed(() => {
  if (!isAiDisplayStreaming.value) return []
  if (storedStreamingTools.value && storedStreamingTools.value.length > 0) {
    return storedStreamingTools.value
  }
  // 仅在真实流已结束但处于 450ms 收起动效缓冲期时，才回退显示刚完成的助手消息以保持平滑过渡
  if (isStreamSettling.value && !isAiStreaming.value) {
    const target = [...storedChatMessages.value].reverse().find((m) => m.role === 'ASSISTANT')
    return target?.tools || []
  }
  return []
})
const isThinkingComplete = ref(true)

function handleThinkingComplete() {
  isThinkingComplete.value = true
}
const chatScrollRef = ref<HTMLElement | null>(null)
const chatInputRef = ref<HTMLTextAreaElement | null>(null)
const showProcessingRequired = computed(() => {
  const bound = typeof boundScope !== 'undefined' ? boundScope.value : null
  const sourceIds = bound
    ? (bound.retrievalMode === 'AUTO'
        ? (bound.currentSourceId ? [bound.currentSourceId] : [])
        : bound.retrievalMode === 'SELECTED_SOURCES'
          ? (bound.sourceIds || [])
          : [])
    : (aiReferenceScope.value === 'AUTO'
        ? (selectedFileId.value ? [selectedFileId.value] : [])
        : aiReferenceScope.value === 'SELECTED_SOURCES'
          ? selectedAiSourceIds.value
          : [])
  return sourceIds.some((sourceId) => {
    const file = activeSourceFiles.value.find((item) => item.id === sourceId)
    return !file || file.ingestionStatus !== 'READY'
      || documentProcessingStore.jobs.some((job) => job.sourceId === sourceId && job.phase !== 'READY')
  })
})
const showFileMenu = ref(false)
const showModelMenu = showFileMenu

const notifyScopeLocked = () => {
  ElNotification({
    title: '参考范围已固定',
    message: '当前对话已固定参考资料范围，如需更换请点击右上角刷新按钮开启新对话重选。',
    type: 'info',
    position: 'top-right',
  })
}

const handleScopeSwitchClick = () => {
  if (isScopeLocked.value) {
    notifyScopeLocked()
    return
  }
  showModelMenu.value = !showModelMenu.value
}

watch(isScopeLocked, (locked) => {
  if (locked) {
    showModelMenu.value = false
  }
})

type AiReferenceScope = 'AUTO' | 'SELECTED_SOURCES' | 'SUBJECT'
const MAX_AI_REFERENCE_SOURCES = 100
const aiReferenceScope = ref<AiReferenceScope>('SUBJECT')
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
    if (typeof isScopeLocked !== 'undefined' && isScopeLocked.value) return
    const current = activeSourceFiles.value.find((file) => file.id === newId)
    if (aiReferenceScope.value === 'AUTO') {
      selectedAiSourceIds.value = newId ? [newId] : []
      if (!newId) aiReferenceScope.value = 'SUBJECT'
    } else if (aiReferenceScope.value === 'SELECTED_SOURCES' && newId) {
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

watch(
  [activeSourceFiles, subjectId],
  () => {
    if (typeof isScopeLocked !== 'undefined' && isScopeLocked.value) return
    if (aiReferenceScope.value !== 'SELECTED_SOURCES') return
    const selected = selectedAiSourceIds.value.filter((id) =>
      activeSourceFiles.value.some((file) => file.id === id && file.subjectId === subjectId.value))
    if (selected.length === selectedAiSourceIds.value.length) return
    selectedAiSourceIds.value = selected
    const current = activeSourceFiles.value.find((file) =>
      file.id === selectedFileId.value && file.subjectId === subjectId.value)
    if (selected.length === 0 || (selected.length === 1 && selected[0] === current?.id)) {
      aiReferenceScope.value = current ? 'AUTO' : 'SUBJECT'
      selectedAiSourceIds.value = current ? [current.id] : []
    }
  },
  { deep: true }
)

const isAllAiSourcesSelected = computed(() => {
  const bound = typeof boundScope !== 'undefined' ? boundScope.value : null
  if (bound) {
    return bound.retrievalMode === 'SUBJECT'
  }
  return aiReferenceScope.value === 'SUBJECT'
})

const isAiSourceSelected = (id: string) => {
  const bound = typeof boundScope !== 'undefined' ? boundScope.value : null
  if (bound) {
    if (bound.retrievalMode === 'SUBJECT') {
      return activeSourceFiles.value.some((file) =>
        file.id === id && file.subjectId === subjectId.value && file.ingestionStatus === 'READY')
    }
    if (bound.retrievalMode === 'AUTO') {
      return bound.currentSourceId === id
    }
    return (bound.sourceIds || []).includes(id)
  }

  if (aiReferenceScope.value === 'SUBJECT') {
    return activeSourceFiles.value.some((file) =>
      file.id === id && file.subjectId === subjectId.value && file.ingestionStatus === 'READY')
  }
  return selectedAiSourceIds.value.includes(id)
}

const aiSourceSelectedCount = computed(() => {
  const bound = typeof boundScope !== 'undefined' ? boundScope.value : null
  if (bound) {
    if (bound.retrievalMode === 'SUBJECT') {
      return activeSourceFiles.value.filter((file) =>
        file.subjectId === subjectId.value && file.ingestionStatus === 'READY').length
    }
    if (bound.retrievalMode === 'AUTO') return 1
    return bound.sourceIds?.length || 0
  }
  if (aiReferenceScope.value === 'SUBJECT') {
    return activeSourceFiles.value.filter((file) =>
      file.subjectId === subjectId.value && file.ingestionStatus === 'READY').length
  }
  if (aiReferenceScope.value === 'AUTO') return 1
  return selectedAiSourceIds.value.length
})

const toggleAiSource = (id: string) => {
  if (typeof isScopeLocked !== 'undefined' && isScopeLocked.value) {
    if (typeof notifyScopeLocked === 'function') notifyScopeLocked()
    return
  }
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
    ? (current ? 'AUTO' : 'SUBJECT')
    : selected.size === 1 && selected.has(selectedFileId.value || '')
      ? 'AUTO'
      : 'SELECTED_SOURCES'
  if (aiReferenceScope.value === 'AUTO' && current) {
    selectedAiSourceIds.value = [current.id]
  } else if (aiReferenceScope.value === 'SUBJECT') {
    selectedAiSourceIds.value = []
  }
}

const selectCurrentAiSource = () => {
  if (typeof isScopeLocked !== 'undefined' && isScopeLocked.value) {
    if (typeof notifyScopeLocked === 'function') notifyScopeLocked()
    return
  }
  const current = activeSourceFiles.value.find((file) => file.id === selectedFileId.value)
  if (current) {
    aiReferenceScope.value = 'AUTO'
    selectedAiSourceIds.value = [current.id]
  } else {
    aiReferenceScope.value = 'SUBJECT'
    selectedAiSourceIds.value = []
  }
}


watch(
  [() => chatStore.activeSession?.id, () => chatStore.activeSession?.chatScopeState, () => chatStore.activeSession?.chatScope],
  ([, scopeState, scope]) => {
    if (scopeState === 'BOUND' && scope) {
      if (scope.retrievalMode === 'SUBJECT') {
        aiReferenceScope.value = 'SUBJECT'
        selectedAiSourceIds.value = []
      } else if (scope.retrievalMode === 'AUTO') {
        aiReferenceScope.value = 'AUTO'
        selectedAiSourceIds.value = scope.currentSourceId ? [scope.currentSourceId] : []
      } else if (scope.retrievalMode === 'SELECTED_SOURCES') {
        aiReferenceScope.value = 'SELECTED_SOURCES'
        selectedAiSourceIds.value = [...(scope.sourceIds || [])]
      }
    } else if (scopeState === 'UNBOUND' || !scopeState) {
      if (selectedFileId.value) {
        aiReferenceScope.value = 'AUTO'
        selectedAiSourceIds.value = [selectedFileId.value]
      } else {
        aiReferenceScope.value = 'SUBJECT'
        selectedAiSourceIds.value = []
      }
    }
  },
  { immediate: true }
)

const selectAllAiSources = () => {
  if (typeof isScopeLocked !== 'undefined' && isScopeLocked.value) {
    if (typeof notifyScopeLocked === 'function') notifyScopeLocked()
    return
  }
  aiReferenceScope.value = 'SUBJECT'
  selectedAiSourceIds.value = []
}

const aiChatReferenceOptions = () => {
  const bound = typeof boundScope !== 'undefined' ? boundScope.value : null
  if (bound) {
    if (bound.retrievalMode === 'SUBJECT') {
      return { subjectId: bound.subjectId || subjectId.value, retrievalMode: 'SUBJECT' as const }
    }
    if (bound.retrievalMode === 'AUTO') {
      return {
        subjectId: bound.subjectId || subjectId.value,
        sourceId: bound.currentSourceId || undefined,
        retrievalMode: 'AUTO' as const,
      }
    }
    return {
      subjectId: bound.subjectId || subjectId.value,
      sourceIds: bound.sourceIds?.length ? [...bound.sourceIds] : undefined,
      retrievalMode: 'SELECTED_SOURCES' as const,
    }
  }

  const current = activeSourceFiles.value.find((file) =>
    file.id === selectedFileId.value && file.subjectId === subjectId.value && file.ingestionStatus === 'READY')
  if (aiReferenceScope.value === 'SUBJECT') {
    return { subjectId: subjectId.value, retrievalMode: 'SUBJECT' as const }
  }
  if (aiReferenceScope.value === 'AUTO') {
    return {
      subjectId: subjectId.value,
      sourceId: current?.id,
      retrievalMode: current ? ('AUTO' as const) : ('SUBJECT' as const),
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
    sourceIds: sourceIds.length ? sourceIds : undefined,
    sourceId: !sourceIds.length && current ? current.id : undefined,
    retrievalMode: sourceIds.length ? 'SELECTED_SOURCES' as const : (current ? 'AUTO' as const : 'SUBJECT' as const),
  }
}

const aiSourceSummaryText = computed(() => {
  const bound = typeof boundScope !== 'undefined' ? boundScope.value : null
  if (bound) {
    if (bound.retrievalMode === 'SUBJECT') return t(messages.allMaterials)
    if (bound.retrievalMode === 'AUTO') {
      const boundFile = activeSourceFiles.value.find(f => f.id === bound.currentSourceId)
      return boundFile?.name || t(messages.currentFile)
    }
    const count = bound.sourceIds?.length || 0
    if (count === 1) {
      const file = activeSourceFiles.value.find(f => f.id === bound.sourceIds[0])
      return file?.name || t(messages.oneReference)
    }
    return t(messages.referenceCount, { count })
  }

  if (aiReferenceScope.value === 'SUBJECT') return t(messages.allMaterials)
  if (aiReferenceScope.value === 'AUTO') return selectedFile.value?.name || t(messages.currentFile)
  const count = selectedAiSourceIds.value.length
  if (count === 1) {
    const file = activeSourceFiles.value.find(f => f.id === selectedAiSourceIds.value[0])
    return file?.name || t(messages.oneReference)
  }
  return t(messages.referenceCount, { count })
})

const aiSourceSummaryTitle = computed(() => {
  const bound = typeof boundScope !== 'undefined' ? boundScope.value : null
  if (bound) {
    if (bound.retrievalMode === 'SUBJECT') {
      const count = activeSourceFiles.value.filter((file) =>
        file.subjectId === subjectId.value && file.ingestionStatus === 'READY').length
      return t(messages.allReferencesCount, { count })
    }
    if (bound.retrievalMode === 'AUTO') {
      const boundFile = activeSourceFiles.value.find(f => f.id === bound.currentSourceId)
      return t(messages.currentReference, { name: boundFile?.name || t(messages.currentFile) })
    }
    const count = bound.sourceIds?.length || 0
    if (count === 1) {
      const file = activeSourceFiles.value.find(f => f.id === bound.sourceIds[0])
      return t(messages.currentReference, { name: file?.name || t(messages.oneReference) })
    }
    const names = (bound.sourceIds || [])
      .map(id => activeSourceFiles.value.find(f => f.id === id)?.name)
      .filter(Boolean)
      .join(locale.value === 'en' ? ', ' : '、')
    return t(messages.currentReferenceList, { count, names })
  }

  if (aiReferenceScope.value === 'SUBJECT') {
    const count = activeSourceFiles.value.filter((file) =>
      file.subjectId === subjectId.value && file.ingestionStatus === 'READY').length
    return t(messages.allReferencesCount, { count })
  }
  if (aiReferenceScope.value === 'AUTO') return t(messages.currentReference, { name: selectedFile.value?.name || t(messages.currentFile) })
  const count = selectedAiSourceIds.value.length
  if (count === 1) {
    const file = activeSourceFiles.value.find(f => f.id === selectedAiSourceIds.value[0])
    return t(messages.currentReference, { name: file?.name || t(messages.oneReference) })
  }
  const names = selectedAiSourceIds.value
    .map(id => activeSourceFiles.value.find(f => f.id === id)?.name)
    .filter(Boolean)
    .join(locale.value === 'en' ? ', ' : '、')
  return t(messages.currentReferenceList, { count, names })
})

const aiGreetingName = computed(() => authStore.username || t(messages.greetingName))

const isChatComposing = ref(false)
let lastChatCompositionEndTime = 0

const handleCompositionStart = () => {
  isChatComposing.value = true
}

const handleCompositionEnd = () => {
  isChatComposing.value = false
  lastChatCompositionEndTime = Date.now()
}

const handleChatKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    if (isChatComposing.value || e.isComposing || Date.now() - lastChatCompositionEndTime < 200) {
      return
    }
    e.preventDefault()
    sendChat()
  }
}

const autoResizeInput = () => {
  const el = chatInputRef.value
  if (!el) return
  if (!chatInput.value?.trim() && !el.value?.trim()) {
    el.style.height = '36px'
    return
  }
  el.style.height = '36px'
  el.style.height = Math.min(el.scrollHeight, 36 * 6) + 'px'
}

watch(chatInput, (val) => {
  if (!val || !val.trim()) {
    nextTick(() => {
      if (chatInputRef.value) {
        chatInputRef.value.style.height = '36px'
      }
    })
  }
})

const isAutoScrollLocked = ref(false)
let touchStartY = 0

const handleTouchStart = (e: TouchEvent) => {
  if (e.touches[0]) {
    touchStartY = e.touches[0].clientY
  }
}

const handleTouchMove = (e: TouchEvent) => {
  if (e.touches[0] && e.touches[0].clientY > touchStartY + 12) {
    isAutoScrollLocked.value = true
  }
}

const handleChatWheel = (e: WheelEvent) => {
  if (e.deltaY < 0) {
    // 物理滚轮向上：意图查阅上方内容，立即断开自动跟随
    isAutoScrollLocked.value = true
  } else if (e.deltaY > 0 && isNearBottom()) {
    // 滚轮滑至底部：恢复自动跟随
    isAutoScrollLocked.value = false
  }
}

const resumeAutoScroll = () => {
  isAutoScrollLocked.value = false
  scrollChatToBottom()
}

const scrollChatToBottom = () => {
  nextTick(() => { if (chatScrollRef.value) chatScrollRef.value.scrollTop = chatScrollRef.value.scrollHeight })
}

const isNearBottom = () => {
  if (!chatScrollRef.value) return true
  const { scrollTop, scrollHeight, clientHeight } = chatScrollRef.value
  return scrollHeight - (scrollTop + clientHeight) < 140
}

const autoScrollChatIfNeeded = () => {
  if (!isAutoScrollLocked.value && isNearBottom()) {
    scrollChatToBottom()
  }
}

watch([streamingContent, streamingReasoning, () => streamingParts.value.length], () => {
  if (isAiStreaming.value && !isAutoScrollLocked.value) {
    autoScrollChatIfNeeded()
  }
})

watch(isAiStreaming, (streaming, oldVal) => {
  if (oldVal && !streaming) {
    // 正文输出完，流式结束：启动 450ms 收起动效缓冲期，让展开的思考链平滑执行收起动效
    isStreamSettling.value = true
    if (streamSettleTimer) clearTimeout(streamSettleTimer)
    streamSettleTimer = setTimeout(() => {
      isStreamSettling.value = false
      streamSettleTimer = null
    }, 450)
    isAutoScrollLocked.value = false
    isThinkingComplete.value = true
  } else if (streaming) {
    if (streamSettleTimer) {
      clearTimeout(streamSettleTimer)
      streamSettleTimer = null
    }
    isStreamSettling.value = false
    isThinkingComplete.value = false
  }
})

watch([streamingReasoning, streamingTools, streamingContent, () => streamingParts.value.length], ([_reasoning, _tools, content, partsLen]) => {
  if (isAiStreaming.value && !isThinkingComplete.value) {
    // 只要有正文内容或结构化块到达，思考阶段已经结束，立即放行正文渲染，杜绝被延时或竞争卡死
    if (content || partsLen > 0) {
      isThinkingComplete.value = true
    }
  }
})

const sendChat = async () => {
  if (!canSendWorkspaceChat.value) return
  const msg = chatInput.value.trim()
  const selectionToSend = quotedSelection.value ? quotedSelection.value.slice(0, 4000) : undefined
  if (!msg && !selectionToSend) return
  if (showProcessingRequired.value) {
    showNotReadyDialog.value = true
    return
  }
  const contentToSend = msg || '请围绕我引用的这段内容进行详细讲解和要点梳理。'
  chatInput.value = ''
  quotedSelection.value = ''
  if (chatInputRef.value) {
    chatInputRef.value.value = ''
    chatInputRef.value.style.height = '36px'
  }
  nextTick(() => {
    autoResizeInput()
  })
  isAutoScrollLocked.value = false
  scrollChatToBottom()
  try {
    await chatStore.sendMessage(contentToSend, {
      ...aiChatReferenceOptions(),
      selectionText: selectionToSend,
    })
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      const safe = classifyClientError(error, 'CHAT')
      logClientError('[SubjectWorkspace] chat send failed', error, safe)
      ElNotification({ title: 'AI 请求失败', message: safe.message, type: 'error', position: 'top-right' })
    }
  }
}

const retryChat = async () => {
  if (!canSendWorkspaceChat.value) return
  const pending = pendingChatMessage.value
  if (!pending) return
  isAutoScrollLocked.value = false
  scrollChatToBottom()
  try {
    await chatStore.retryPendingMessage(pending.id)
  } catch (error) {
    const safe = classifyClientError(error, 'CHAT')
    logClientError('[SubjectWorkspace] chat retry failed', error, safe)
    ElNotification({ title: 'AI 请求失败', message: safe.message, type: 'error', position: 'top-right' })
  }
}

const handleRetryAssistantMessage = (msgId: string) => {
  if (!canSendWorkspaceChat.value) return
  isAutoScrollLocked.value = false
  try {
    void chatStore.retryPendingMessage(msgId)
  } catch (error) {
    const safe = classifyClientError(error, 'CHAT')
    logClientError('[SubjectWorkspace] assistant retry failed', error, safe)
    ElNotification({ title: 'AI 请求失败', message: safe.message, type: 'error', position: 'top-right' })
  }
}

const handleRecoverUnknown = async () => {
  if (!canUseWorkspaceChat.value) return
  try {
    const ok = await chatStore.recoverUnknownAttempt()
    if (ok) {
      ElNotification({
        title: '会话已恢复',
        message: '未知状态已结束并释放，您可以继续提问或重试未完成的回复。',
        type: 'success',
        position: 'top-right',
      })
    }
  } catch (error) {
    const safe = classifyClientError(error, 'CHAT')
    logClientError('[SubjectWorkspace] recover attempt failed', error, safe)
    ElNotification({ title: '恢复失败', message: safe.message, type: 'error', position: 'top-right' })
  }
}

const clearChat = () => {
  if (!chatSessionInitialization) void startFreshChatSession('学科对话', true)
}

const submitChatActivity = async (questionId: string, answer: import('@/types/chatContent').ChatActivityAnswer) => {
  if (!canSendWorkspaceChat.value) return
  const block = storedChatMessages.value.flatMap((message) => message.parts)
    .find((part): part is Extract<import('@/types/chatContent').ChatContentPart, { kind: 'block' }> => part.kind === 'block' && part.questionId === questionId)
  if (!block) return
  try {
    await chatStore.submitActivity(questionId, answer, block)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    const safe = classifyClientError(error, 'CHAT')
    ElNotification({ title: '提交失败', message: safe.message, type: 'error', position: 'top-right' })
  }
}

const handleCitationClick = (fileName: string) => {
  const match = activeSourceFiles.value.find(
    (f) => f.name === fileName || f.name.toLowerCase() === fileName.toLowerCase() || f.name.includes(fileName) || fileName.includes(f.name)
  )
  if (match) {
    void selectFile(match.id)
  }
}

const updateSelectionPosition = (scope: 'preview' | 'chat') => {
  nextTick(() => {
    const selection = typeof window !== 'undefined' ? window.getSelection() : null
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      if (!showKnowledgeEditor.value) {
        selectedText.value = ''
        selectionScope.value = null
        selectionPosition.value = null
      }
      return
    }
    const text = selection.toString().trim().slice(0, 4000)
    if (!text) {
      if (!showKnowledgeEditor.value) {
        selectedText.value = ''
        selectionScope.value = null
        selectionPosition.value = null
      }
      return
    }
    const range = selection.getRangeAt(0)
    const anchor = range.commonAncestorContainer
    const anchorElement = anchor.nodeType === Node.ELEMENT_NODE ? anchor as Element : anchor.parentElement
    const chatSelection = anchorElement?.closest('.chat-message-text-selection')
    const wrapper = scope === 'chat' ? chatScrollRef.value : previewPaneWrapperRef.value
    if (!wrapper || (scope === 'chat' && !chatSelection) || (scope === 'preview' && chatSelection)) {
      selectionScope.value = null
      selectionPosition.value = null
      return
    }
    const rangeRect = range.getBoundingClientRect()
    if (!rangeRect || (rangeRect.width === 0 && rangeRect.height === 0)) {
      selectionPosition.value = null
      return
    }
    selectedText.value = text
    selectionScope.value = scope
    const showBelow = rangeRect.top < 56
    const top = showBelow
      ? Math.min(rangeRect.bottom + 8, window.innerHeight - 44)
      : Math.max(8, rangeRect.top - 8)
    const clampedLeft = Math.max(140, Math.min(rangeRect.left + rangeRect.width / 2, window.innerWidth - 140))

    selectionPosition.value = {
      top,
      left: clampedLeft,
      showBelow,
    }
  })
}

const handleTextSelected = (text: string) => {
  selectedText.value = text.slice(0, 4000)
  updateSelectionPosition('preview')
}

const clearSelection = () => {
  selectedText.value = ''
  selectionScope.value = null
  selectionPosition.value = null
  if (typeof window !== 'undefined') {
    window.getSelection()?.removeAllRanges()
  }
}

const addSelectionToChat = () => {
  if (!selectedText.value) return
  quotedSelection.value = [quotedSelection.value, selectedText.value].filter(Boolean).join('\n\n').slice(0, 4000)
  clearSelection()
  nextTick(() => {
    chatInputRef.value?.focus()
  })
}

const goToProcessingCenter = () => {
  showNotReadyDialog.value = false
  router.push('/profile')
}
const sendSelectionQuestion = async (prompt: string) => {
  if (!canSendWorkspaceChat.value || !selectedText.value) return
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
  if (!canSendWorkspaceChat.value) return
  chatInput.value = '请围绕我选中的内容继续讲解：'
  void sendSelectionQuestion(chatInput.value)
  chatInput.value = ''
}
void explainSelection
void askSelection
const saveSelection = () => {
  selectionPosition.value = null
  showKnowledgeEditor.value = true
}
const saveKnowledgeBlock = async (value: { title: string; content: string }) => {
  if (!showKnowledgeEditor.value || !activeSubject.value) return
  const isPreviewSelection = selectionScope.value === 'preview'
  const validSourceFileId = isPreviewSelection
    && activeSourceFiles.value.some(f => f.id === selectedFileId.value && f.subjectId === subjectId.value)
    ? (selectedFileId.value || undefined)
    : undefined
  const newId = await createKnowledgeBlock({
    subjectId: subjectId.value,
    sourceFileId: validSourceFileId,
    subject: activeSubject.value.name,
    title: value.title,
    content: value.content,
    source: isPreviewSelection ? selectedFile.value?.name || '选中文本' : t(messages.chatSelectionSource),
  })
  if (!newId) return
  showKnowledgeEditor.value = false
  clearSelection()
  selectedBlockId.value = newId
  ElNotification({ title: '已保存为知识块', type: 'success', position: 'top-right' })
}

const createKnowledgeBlock = async (block: Parameters<typeof blockStore.addBlock>[0]) => {
  if (isCreatingKnowledgeBlock.value) return
  const loginGeneration = authStore.loginGeneration
  const subjectSwitchGeneration = currentSubjectSwitchGen
  const isCurrent = () => isComponentMounted && authStore.loginGeneration === loginGeneration
    && currentSubjectSwitchGen === subjectSwitchGeneration && subjectId.value === block.subjectId
  isCreatingKnowledgeBlock.value = true
  try {
    const id = await blockStore.addBlock(block)
    if (isCurrent()) return id
  } catch {
    if (!isCurrent()) return
    ElNotification({
      title: '保存失败',
      message: '知识块保存失败，请重试',
      type: 'error',
      position: 'top-right'
    })
  } finally {
    isCreatingKnowledgeBlock.value = false
  }
}

// ===== Lifecycle =====
let chatSessionInitialization: Promise<string | undefined> | null = null
const workspaceChatSession = ref<{ subjectId: string; sessionId: string } | null>(null)
const canUseWorkspaceChat = computed(() => workspaceChatSession.value !== null
  && workspaceChatSession.value.subjectId === subjectId.value
  && workspaceChatSession.value.sessionId === chatStore.activeSession?.id)
const canSendWorkspaceChat = computed(() => canUseWorkspaceChat.value
  && !isAiStreaming.value && !chatStore.activeRun?.executionActive && !chatStore.isRecovering)

const startFreshChatSession = (fallbackTitle = '学科对话', createNew = false) => {
  const id = subjectId.value
  const loginGeneration = authStore.loginGeneration
  const previousSession = workspaceChatSession.value
  workspaceChatSession.value = null
  const title = activeSubject.value?.name || fallbackTitle
  const pending = (id
    ? (createNew ? chatStore.startNewSubjectConversation(id, title) : chatStore.startSubjectConversation(id, title))
    : chatStore.startNewSession()
  ).catch((error) => {
    if (chatSessionInitialization !== pending || !isComponentMounted || subjectId.value !== id
      || authStore.loginGeneration !== loginGeneration) return undefined
    if (previousSession?.subjectId === id && previousSession.sessionId === chatStore.activeSession?.id) {
      workspaceChatSession.value = previousSession
    }
    ElNotification({ title: '对话初始化失败', message: error instanceof Error ? error.message : '请稍后重试', type: 'error' })
    return undefined
  })
  chatSessionInitialization = pending
  void pending.then(sessionId => {
    if (chatSessionInitialization !== pending) return
    chatSessionInitialization = null
    if (isComponentMounted && subjectId.value === id && authStore.loginGeneration === loginGeneration && sessionId) {
      workspaceChatSession.value = { subjectId: id, sessionId }
    }
  })
  return pending
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

const handleDocSelectionChange = () => {
  const selection = typeof window !== 'undefined' ? window.getSelection() : null
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    if (!showKnowledgeEditor.value) {
      selectedText.value = ''
      selectionScope.value = null
      selectionPosition.value = null
    }
  }
}

onMounted(async () => {
  if (typeof window !== 'undefined') {
    document.addEventListener('selectionchange', handleDocSelectionChange)
    unsubscribeOverviewCache = subscribeOverviewCacheUpdated(
      window,
      (detail) => Boolean(authStore.isAuthenticated && authStore.user?.id === detail.userId && authStore.serverDeviceId === detail.serverDeviceId),
      async (detail) => {
        if (!isComponentMounted) return
        const isCurrentSubject = detail.scopeType === 'SUBJECT' && detail.scopeId === subjectId.value
        const isCurrentFile = detail.scopeType === 'FILE' && activeSourceFiles.value.some(file => file.id === detail.scopeId
          && (detail.removed || !file.ingestionRevision || !detail.revisionKey || file.ingestionRevision === detail.revisionKey))
        if (isCurrentSubject || isCurrentFile) {
          if (!detail.removed) {
            if (detail.scopeType === 'FILE') setFileGenerating(detail.scopeId, false)
            else subjectOverviewGenerating.value = false
          }
          if (!await refreshOverviewCache().catch(() => false)) return
          if (isOutlineComposer.value) {
            initSubjectOutlineFromExisting()
            initAllFileOutlineDrafts()
          }
        }
      }
    )
  }
  isComponentMounted = true
  startProcessingRefresh()
  const mountGen = ++currentSubjectSwitchGen
  const chatInitialization = startFreshChatSession()
  const id = subjectId.value
  if (id) {
    if (!isComponentMounted || currentSubjectSwitchGen !== mountGen || subjectId.value !== id) return
    subjectStore.setActiveSubject(id, { skipSourceLoad: true })
    const blocksPromise = blockStore.fetchBlocks(undefined, id).catch((error) => {
      console.warn('[SubjectWorkspace] blocks load deferred', error)
    })
    await subjectStore.loadSourceFiles(id)
    if (!isComponentMounted || currentSubjectSwitchGen !== mountGen || subjectId.value !== id) return
    await Promise.all([ensureOverviewRuntime(), blocksPromise])
    if (!isComponentMounted || currentSubjectSwitchGen !== mountGen || subjectId.value !== id) return
    if (route.query.view === 'review' || route.query.view === 'stats') {
      centerView.value = route.query.view
      tier2Open.value = false
    } else if (route.query.view === 'blocks') {
      centerView.value = 'blocks'
      tier2Open.value = false
    } else if (activeSourceFiles.value.length > 0) {
      const firstFile = activeSourceFiles.value[0]
      aiReferenceScope.value = 'AUTO'
      selectedAiSourceIds.value = [firstFile.id]
      selectedFileId.value = firstFile.id
      centerView.value = 'preview'
      const sessionId = await chatInitialization
      if (!isComponentMounted || currentSubjectSwitchGen !== mountGen || subjectId.value !== id) return
      if (!sessionId && !chatStore.activeSession && !chatSessionInitialization) {
        await startFreshChatSession(firstFile.name)
      }
    } else {
      centerView.value = 'overview'
      aiReferenceScope.value = 'SUBJECT'
      selectedAiSourceIds.value = []
    }
  }
})

watch(subjectId, async (newId) => {
  const switchGen = ++currentSubjectSwitchGen
  stopAllManualOverviews()
  subjectOutlineSave.value = null
  fileOutlineSaves.value.clear()
  if (newId) {
    // 立即同步清空草稿、大纲与选中文件状态，杜绝任何异步间隙内新学科携带旧文件或旧草稿
    selectedFileId.value = null
    selectedText.value = ''
    selectionPosition.value = null
    quotedSelection.value = ''
    selectedAiSourceIds.value = []
    aiReferenceScope.value = 'SUBJECT'
    sourceStore.clearActiveSourceFiles()
    subjectOutlineDraft.value = ''
    subjectOutlineBaseline.value = ''
    fileOutlineDrafts.value = {}
    fileDraftBaselines.value = {}
    fileDraftRevisions.value = {}
    fileDraftOutlineGeneratedAt.value = {}
    selectedSummaryScope.value = null
    subjectOverviewRecord.value = null
    fileOverviewRecords.value = {}
    isSubjectOverviewStale.value = false
    subjectOverviewManualError.value = null
    fileOverviewManualErrors.value = {}
    subjectOverviewGenerating.value = false
    generatingFileIds.value = new Set()

    subjectStore.setActiveSubject(newId, { skipSourceLoad: true })

    const chatInitialization = startFreshChatSession()
    if (!isComponentMounted || currentSubjectSwitchGen !== switchGen || subjectId.value !== newId) return

    const blocksPromise = blockStore.fetchBlocks(undefined, newId).catch((error) => {
      console.warn('[SubjectWorkspace] blocks load deferred', error)
    })
    await subjectStore.loadSourceFiles(newId)
    if (!isComponentMounted || currentSubjectSwitchGen !== switchGen || subjectId.value !== newId) return

    await Promise.all([ensureOverviewRuntime(), blocksPromise])
    if (!isComponentMounted || currentSubjectSwitchGen !== switchGen || subjectId.value !== newId) return
    if (route.query.view === 'review' || route.query.view === 'stats') {
      centerView.value = route.query.view
      tier2Open.value = false
    } else if (route.query.view === 'blocks') {
      centerView.value = 'blocks'
      tier2Open.value = false
    } else if (activeSourceFiles.value.length > 0) {
      const firstFile = activeSourceFiles.value[0]
      aiReferenceScope.value = 'AUTO'
      selectedAiSourceIds.value = [firstFile.id]
      selectedFileId.value = firstFile.id
      centerView.value = 'preview'
      const sessionId = await chatInitialization
      if (!isComponentMounted || currentSubjectSwitchGen !== switchGen || subjectId.value !== newId) return
      if (!sessionId && !chatStore.activeSession && !chatSessionInitialization) {
        await startFreshChatSession(firstFile.name)
      }
    } else {
      selectedFileId.value = null
      centerView.value = 'overview'
      aiReferenceScope.value = 'SUBJECT'
      selectedAiSourceIds.value = []
    }
  }
})

watch(centerView, (newView, oldView) => {
  if (oldView && oldView !== 'review' && oldView !== 'stats' && (newView === 'review' || newView === 'stats')) {
    lastWorkspaceState.value = {
      view: oldView === 'blocks' || oldView === 'preview' || oldView === 'overview' ? oldView : (selectedFileId.value ? 'preview' : 'overview'),
      tier2Open: tier2Open.value,
      tier2Mode: tier2Mode.value,
      selectedFileId: selectedFileId.value,
    }
  }
  const queryView = newView === 'review' || newView === 'stats' || newView === 'blocks' ? newView : undefined
  if (route.query.view === queryView) return
  const query = { ...route.query }
  if (queryView) query.view = queryView
  else delete query.view
  void router.replace({ query })
})

watch(() => route.query.view, (newView) => {
  if (newView === 'review' || newView === 'stats' || newView === 'blocks') {
    if (centerView.value !== 'review' && centerView.value !== 'stats' && (newView === 'review' || newView === 'stats')) {
      lastWorkspaceState.value = {
        view: centerView.value === 'blocks' || centerView.value === 'preview' || centerView.value === 'overview' ? centerView.value : (selectedFileId.value ? 'preview' : 'overview'),
        tier2Open: tier2Open.value,
        tier2Mode: tier2Mode.value,
        selectedFileId: selectedFileId.value,
      }
    }
    centerView.value = newView
    tier2Open.value = false
  }
})

onUnmounted(() => {
  if (streamSettleTimer) {
    clearTimeout(streamSettleTimer)
    streamSettleTimer = null
  }
  if (typeof window !== 'undefined') {
    document.removeEventListener('selectionchange', handleDocSelectionChange)
  }
  unsubscribeOverviewCache?.()
  unsubscribeOverviewCache = null
  isComponentMounted = false
  stopAllManualOverviews()
  currentSubjectSwitchGen++
  stopProcessingRefresh()
  chatStore.abortStream()
})
</script>

<style scoped>
.chat-tool-capsule{display:inline-flex;align-items:center;margin:8px 8px 0 0;padding:5px 9px;border:1px solid var(--border-subtle);border-radius:999px;background:var(--color-bg-card);color:var(--text-muted);font-size:11px;line-height:1.3}.chat-tool-capsule[data-status="RUNNING"]{border-color:color-mix(in srgb,var(--color-zen-sage) 50%,var(--border-subtle));color:var(--color-sage-dark)}.chat-tool-capsule[data-status="FAILED"]{color:var(--color-warning)}
/* ===== File Processing Alert Banner ===== */
.file-processing-alert-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  margin: 10px 16px 0 16px;
  border-radius: 8px;
  background: rgba(216, 92, 92, 0.08);
  border: 1px solid rgba(216, 92, 92, 0.22);
  color: var(--text-primary);
  font-size: 12px;
  flex-shrink: 0;
}
.file-processing-alert-text {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.file-processing-alert-badge {
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(216, 92, 92, 0.16);
  color: #c0392b;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.file-processing-alert-msg {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-processing-alert-btn {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(216, 92, 92, 0.35);
  background: transparent;
  color: #c0392b;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
  transition: all 0.2s ease;
}
.file-processing-alert-btn:hover:not(:disabled) {
  background: rgba(216, 92, 92, 0.12);
}
.file-processing-alert-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ===== Root & Themes Overrides ===== */
.workspace-container {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--color-bg-secondary, #EEEEEE); /* 页面大背景 / 次级中性底 */
  padding: calc(8px - var(--card-padding-reduction));
  gap: calc(8px - var(--layout-gap-reduction));

  /* Zen Minimalist Theme override */
  --color-primary-accent: #8B9A6E;
  --color-primary-accent-hover: #76855B;
  --color-primary-light: rgba(139, 154, 110, 0.14);
  --color-primary-glow: rgba(139, 154, 110, 0.28);
  --accent-gradient: linear-gradient(135deg, #8E9F70 0%, #768758 100%);
  --workspace-card-shadow: 0 16px 36px -6px rgba(0, 0, 0, 0.04), 0 4px 12px -2px rgba(0, 0, 0, 0.02);
}

html.dark .workspace-container {
  background: var(--color-bg-primary);
  --workspace-card-shadow: 0 20px 48px -8px rgba(0, 0, 0, 0.45);
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
  padding: 22px 0 18px;
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: 16px;
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
  box-shadow: var(--workspace-card-shadow);
  box-sizing: border-box;
}

html.dark .tier1-strip {
  background: var(--color-bg-secondary);
  border-color: rgba(255, 255, 255, 0.08);
}

.tier1-top, .tier1-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.tier1-btn {
  width: 62px;
  height: 58px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: none;
  background: transparent;
  border-radius: 14px;
  cursor: pointer;
  color: var(--text-muted, #7A7A75);
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
  padding: 0;
}

.tier1-btn svg {
  stroke-width: 2;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.tier1-btn-text {
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.01em;
}

.tier1-btn:hover {
  background: rgba(0, 0, 0, 0.045);
  color: var(--text-primary, #1C1C1A);
  transform: translateY(-1px);
}

.tier1-btn:hover svg {
  transform: scale(1.06);
}

html.dark .tier1-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #e6dfd8;
}

.tier1-btn:active {
  transform: scale(0.94);
}

.tier1-btn.is-active {
  background: var(--color-primary-light);
  color: var(--color-primary-accent, #76855B);
  font-weight: 700;
  box-shadow: 0 3px 12px rgba(139, 154, 110, 0.16);
  border-radius: 14px;
}

html.dark .tier1-btn.is-active {
  background: rgba(163, 177, 155, 0.18);
  color: #B4C4AA;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.35);
}

.subject-mini-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 19px;
  background: linear-gradient(135deg, #8E9F70 0%, #768758 100%);
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(118, 135, 88, 0.35);
  transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
  cursor: default;
}

.subject-mini-icon:hover {
  transform: scale(1.08) rotate(3deg);
}

/* ===== Tier-2 Drawer (Rounded Card) ===== */
.tier2-drawer {
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: 16px;
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
  box-shadow: var(--workspace-card-shadow);
  overflow: hidden;
  transition: width 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.28s ease, border-width 0.28s ease;
  box-sizing: border-box;
}

.tier2-drawer:not(.is-open) {
  width: 0 !important;
  opacity: 0;
  border-width: 0;
  pointer-events: none;
}

html.dark .tier2-drawer {
  background: var(--color-bg-secondary);
  border-color: rgba(255, 255, 255, 0.08);
}

.drawer-content { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: calc(20px - var(--card-padding-reduction)) calc(18px - var(--card-padding-reduction)) calc(14px - var(--card-padding-reduction));
  flex-shrink: 0;
}

.drawer-title {
  font-size: calc(13.5px + var(--ui-font-size-adjustment));
  font-weight: 750;
  color: var(--text-primary, #1C1C1A);
  margin: 0;
  letter-spacing: -0.01em;
}

html.dark .drawer-title {
  color: var(--text-primary, #e6dfd8);
}

.drawer-action {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  background: var(--accent-gradient);
  color: #ffffff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.35);
  transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.24s ease, opacity 0.2s ease;
}

.drawer-action:hover {
  transform: rotate(90deg) scale(1.08);
  box-shadow: 0 4px 14px rgba(139, 154, 110, 0.5);
  opacity: 0.95;
}

.drawer-action:active {
  transform: scale(0.92);
  box-shadow: 0 1px 3px rgba(139, 154, 110, 0.25);
}

html.dark .drawer-action {
  background: var(--accent-gradient);
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.4);
}

.drawer-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.drawer-list::-webkit-scrollbar {
  display: none;
}

.drawer-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  user-select: none;
  background: transparent;
}

.drawer-item:hover {
  background: var(--color-bg-tertiary, #FAF7F2);
  transform: translateX(2px);
}

html.dark .drawer-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.drawer-item.is-active {
  background: linear-gradient(90deg, rgba(139, 154, 110, 0.16) 0%, rgba(139, 154, 110, 0.04) 100%);
  font-weight: 700;
  color: var(--color-primary-accent, #76855B);
  box-shadow: 0 2px 10px rgba(139, 154, 110, 0.08);
}

.drawer-item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 9px;
  bottom: 9px;
  width: 3px;
  background: var(--color-primary-accent);
  border-radius: 1.5px;
  box-shadow: 0 0 8px rgba(139, 154, 110, 0.5);
}

.drawer-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.drawer-item-name { font-size: calc(13.5px + var(--ui-font-size-adjustment)); color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; }
.drawer-item-meta { font-size: calc(12px + var(--ui-font-size-adjustment)); color: var(--text-muted); font-feature-settings: "tnum"; }

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

.selection-actions.floating-selection-bubble {
  position: fixed;
  z-index: 100;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 10px;
  border: 0.5px solid rgba(139, 154, 110, 0.28);
  border-radius: var(--radius-full, 9999px);
  background: var(--color-bg-primary, #FFFFFF);
  box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(139, 154, 110, 0.18);
  backdrop-filter: blur(14px) saturate(180%);
  user-select: none;
  white-space: nowrap;
  pointer-events: auto;
  transition: opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  animation: bubble-spring-pop 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes bubble-spring-pop {
  from { opacity: 0; transform: scale(0.92) translateY(6px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

html.dark .selection-actions.floating-selection-bubble {
  background: #1C1E1B;
  border-color: rgba(163, 177, 155, 0.3);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.55), 0 4px 12px rgba(163, 177, 155, 0.15);
}

.selection-actions .selection-summary {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 550;
  padding: 0 4px 0 4px;
  font-feature-settings: "tnum";
}

.selection-actions .selection-divider {
  width: 1px;
  height: 14px;
  background: rgba(139, 154, 110, 0.2);
}

html.dark .selection-actions .selection-divider {
  background: color-mix(in srgb, var(--color-primary-accent, #8B9A6E) 8%, rgba(0, 0, 0, 0.03));
  color: var(--text-secondary);
}

.selection-actions .selection-btn {
  border: none;
  border-radius: var(--radius-full, 9999px);
  padding: 5px 12px;
  background: rgba(139, 154, 110, 0.12);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.selection-actions .selection-btn:hover {
  background: var(--color-primary-accent, #8B9A6E);
  color: #FFFFFF;
  transform: translateY(-0.5px);
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.35);
}

.selection-actions .selection-btn:active {
  transform: scale(0.95);
}

.selection-actions .selection-dismiss {
  border: none;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.selection-actions .selection-dismiss:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-primary);
  transform: scale(1.1);
}

html.dark .selection-actions .selection-dismiss:hover {
  background: color-mix(in srgb, var(--color-primary-accent, #8B9A6E) 8%, rgba(0, 0, 0, 0.03));
  color: var(--text-secondary);
}

.selection-bubble-pop-enter-active,
.selection-bubble-pop-leave-active {
  transition: opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1), transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}
.selection-bubble-pop-enter-from,
.selection-bubble-pop-leave-to {
  opacity: 0;
  transform: translate(-50%, -85%) scale(0.95);
}

/* ===== Quoted Selection in AI Chat Input ===== */
.chat-selection-quote-card {
  margin-bottom: 8px;
  padding: 8px 12px;
  background: rgba(139, 154, 110, 0.08);
  border: 0.5px solid rgba(139, 154, 110, 0.25);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
  backdrop-filter: blur(8px);
}
.quote-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.quote-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary-accent, #8B9A6E);
}
.quote-length {
  font-weight: 400;
  color: var(--text-muted);
  font-size: 12px;
}
.quote-remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  transition: all var(--transition-fast);
}
.quote-remove-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-primary);
}
.quote-text {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-all;
}
html.dark .chat-selection-quote-card {
  background: rgba(139, 154, 110, 0.12);
  border-color: rgba(139, 154, 110, 0.3);
}
html.dark .quote-remove-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.quote-fade-enter-active,
.quote-fade-leave-active {
  transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.quote-fade-enter-from,
.quote-fade-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
}

/* Chat bubble quote preview */
.chat-bubble-quote-snippet {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 4px 8px;
  margin-bottom: 6px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-primary-accent, #8B9A6E) 8%, rgba(0, 0, 0, 0.03));
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.4;
  opacity: 0.9;
}
.chat-bubble-quote-snippet .bubble-quote-bar {
  width: 2px;
  height: 100%;
  min-height: 14px;
  background: var(--color-primary-accent, #8B9A6E);
  border-radius: 1px;
  flex-shrink: 0;
}
.chat-bubble-quote-snippet .bubble-quote-content {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-all;
}

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
  font-size: 12px;
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
  border: 0.5px solid var(--border-default);
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
  border: 0.5px solid var(--border-default);
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
.outline-arrow { font-size: 12px; color: var(--text-muted); width: 14px; text-align: center; }

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
  font-size: 12px;
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
.status-file { font-size: calc(13.5px + var(--ui-font-size-adjustment)); font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
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
  padding: 3px 5px;
  border: 1px solid rgba(139, 154, 110, 0.22);
  border-radius: var(--radius-full, 9999px);
  background: var(--color-bg-tertiary, #FAF7F2);
  box-shadow: 0 2px 8px -1px rgba(0, 0, 0, 0.04);
}

html.dark .preview-control-group {
  background: var(--color-bg-secondary, #252422);
  border-color: rgba(163, 177, 155, 0.25);
  box-shadow: 0 2px 8px -1px rgba(0, 0, 0, 0.3);
}

.preview-status-button,
.preview-page-button {
  min-width: 28px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-full, 9999px);
  color: var(--text-secondary);
  background: transparent;
  box-shadow: none;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  transition: all 0.16s cubic-bezier(0.16, 1, 0.3, 1);
}

.preview-status-button {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

.preview-status-button:hover:not(:disabled) {
  background: rgba(139, 154, 110, 0.16);
  color: var(--color-primary-accent, #8B9A6E);
  transform: translateY(-0.5px);
}

.preview-status-button:active:not(:disabled) {
  transform: scale(0.94);
}

.preview-page-button {
  border: 1px solid rgba(139, 154, 110, 0.22);
  background: var(--color-bg-primary, #FFFFFF);
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04);
  padding: 0 14px;
}

html.dark .preview-page-button {
  background: var(--color-bg-secondary, #252422);
  border-color: rgba(163, 177, 155, 0.25);
}

.preview-page-button:hover:not(:disabled) {
  border-color: var(--color-primary-accent, #8B9A6E);
  background: rgba(139, 154, 110, 0.14);
  color: var(--color-primary-accent, #8B9A6E);
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.2);
  transform: translateY(-1px);
}

.preview-page-button:active:not(:disabled) {
  transform: scale(0.95);
}
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
  min-height: 0;
  padding: 26px 36px 24px;
  background: var(--color-bg-primary, #F7F2EB);
}

.blocks-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-shrink: 0;
  gap: 16px;
}

.blocks-search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-default, rgba(0, 0, 0, 0.08));
  border-radius: var(--radius-full, 9999px);
  padding: 8px 16px;
  width: 340px;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
  box-sizing: border-box;
}

html.dark .blocks-search-wrapper {
  background: var(--color-bg-secondary, #252422);
  border-color: rgba(255, 255, 255, 0.08);
}

.blocks-search-wrapper:focus-within {
  border-color: var(--color-primary-accent, #8B9A6E);
  background: var(--color-bg-primary, #FFFFFF);
  box-shadow: 0 0 0 3.5px rgba(139, 154, 110, 0.16), 0 3px 10px rgba(0, 0, 0, 0.04);
}

html.dark .blocks-search-wrapper:focus-within {
  background: #1f1e1c;
  box-shadow: 0 0 0 3.5px rgba(163, 177, 155, 0.22), 0 4px 12px rgba(0, 0, 0, 0.3);
}

.blocks-search-wrapper .search-icon {
  color: var(--text-muted, #7A7A75);
  margin-right: 8px;
  flex-shrink: 0;
  transition: color 0.2s ease;
}

.blocks-search-wrapper:focus-within .search-icon {
  color: var(--color-primary-accent, #8B9A6E);
}

.blocks-search-input {
  background: transparent;
  border: none;
  outline: none;
  font-size: 13px;
  color: var(--text-primary);
  width: 100%;
}

.search-clear-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.search-clear-btn:hover {
  color: var(--text-primary);
  transform: scale(1.15);
}

.blocks-bar-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.blocks-count-badge {
  display: inline-flex;
  align-items: center;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--color-primary-accent, #8B9A6E);
  background: rgba(139, 154, 110, 0.12);
  border: 1px solid rgba(139, 154, 110, 0.24);
  padding: 3px 12px;
  border-radius: var(--radius-full, 9999px);
  box-shadow: 0 1px 3px rgba(139, 154, 110, 0.08);
}

html.dark .blocks-count-badge {
  color: #B4C4AA;
  background: rgba(163, 177, 155, 0.14);
  border-color: rgba(163, 177, 155, 0.26);
}

.blocks-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--btn-primary-bg, linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%));
  border: none;
  font-size: 12.5px;
  font-weight: 650;
  color: #FFFFFF;
  cursor: pointer;
  padding: 7px 18px;
  border-radius: var(--radius-full, 9999px);
  box-shadow: 0 2px 10px -1px rgba(139, 154, 110, 0.35);
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.blocks-add-btn .blocks-add-icon {
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.blocks-add-btn:hover {
  transform: translateY(-1.5px);
  box-shadow: 0 4px 14px -1px rgba(139, 154, 110, 0.45);
  color: #FFFFFF;
}

.blocks-add-btn:hover .blocks-add-icon {
  transform: rotate(90deg) scale(1.1);
}

.blocks-add-btn:active {
  transform: scale(0.95);
}

.blocks-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  grid-auto-rows: 196px;
  gap: 20px;
  align-content: start;
  padding: 4px 2px 28px 2px;
}
.blocks-grid::-webkit-scrollbar {
  display: none;
}

.block-card {
  position: relative;
  background: var(--color-bg-tertiary, #FAF7F2);
  border-radius: 16px;
  padding: 16px 18px 14px 18px;
  cursor: pointer;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
  height: 190px;
  box-sizing: border-box;
  flex-shrink: 0;
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
  box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02);
  overflow: hidden;
}

html.dark .block-card {
  background: var(--color-bg-secondary, #252422);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 14px -2px rgba(0, 0, 0, 0.3);
}

.block-card.is-selected {
  border-color: var(--color-primary-accent, #8B9A6E);
  box-shadow: 0 0 0 1.5px var(--color-primary-accent, #8B9A6E), 0 8px 20px -3px rgba(139, 154, 110, 0.15);
}

html.dark .block-card.is-selected {
  border-color: rgba(163, 177, 155, 0.7);
  box-shadow: 0 0 0 1.5px rgba(163, 177, 155, 0.7), 0 10px 22px -3px rgba(0, 0, 0, 0.45);
}

.block-card:hover {
  transform: translateY(-2.5px);
  border-color: rgba(139, 154, 110, 0.45);
  box-shadow: 0 10px 22px -3px rgba(0, 0, 0, 0.06), 0 3px 8px -2px rgba(139, 154, 110, 0.12);
  z-index: 2;
}

html.dark .block-card:hover {
  border-color: rgba(163, 177, 155, 0.45);
  box-shadow: 0 12px 24px -4px rgba(0, 0, 0, 0.45), 0 3px 10px -2px rgba(0, 0, 0, 0.3);
}

.block-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.block-title-row {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  flex: 1;
  min-width: 0;
}

.block-title-badge-icon {
  color: var(--text-muted, #7A7A75);
  margin-top: 2px;
  flex-shrink: 0;
  transition: color 0.2s ease, transform 0.2s ease;
}

.block-card:hover .block-title-badge-icon {
  color: var(--color-primary-accent, #8B9A6E);
  transform: scale(1.1);
}

.block-title {
  font-size: 15px;
  font-weight: 650;
  color: var(--text-primary, #1C1C1A);
  margin: 0;
  line-height: 1.35;
  letter-spacing: -0.015em;
  flex: 1;
  min-width: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
  transition: color 0.2s ease;
}

.block-card:hover .block-title {
  color: var(--color-primary-accent, #8B9A6E);
}

html.dark .block-card:hover .block-title {
  color: #B4C4AA;
}

html.dark .block-title {
  color: var(--text-primary, #E6DFD8);
}

.block-card-hover-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  opacity: 0;
  transform: translateX(4px);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0;
}

.block-card:hover .block-card-hover-actions {
  opacity: 1;
  transform: translateX(0);
}

.card-action-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 0.5px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-secondary, #7A7A75);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

html.dark .card-action-btn {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.08);
  color: #9E9B95;
}

.card-action-btn:hover {
  background: var(--color-primary-accent, #8B9A6E);
  color: #FFFFFF;
  border-color: var(--color-primary-accent, #8B9A6E);
  transform: scale(1.08);
}

.card-action-btn:active {
  transform: scale(0.92);
}

.card-action-btn.is-copied {
  background: rgba(139, 154, 110, 0.18) !important;
  color: var(--color-primary-accent, #8B9A6E) !important;
  border-color: var(--color-primary-accent, #8B9A6E) !important;
}

.copy-success-icon {
  animation: check-bounce 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes check-bounce {
  0% { transform: scale(0.6); }
  60% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.card-action-btn.danger:hover {
  background: #D14343;
  color: #FFFFFF;
  border-color: #D14343;
}

.block-card-body {
  flex: 1;
  min-height: 0;
  margin-bottom: 8px;
  overflow: hidden;
  position: relative;
}

.block-preview {
  font-size: 13px;
  color: var(--text-secondary, #4A4A45);
  line-height: 1.62;
  margin: 0;
  height: 100%;
  overflow: hidden;
  word-break: break-word;
  position: relative;
  -webkit-mask-image: linear-gradient(to bottom, black 65%, transparent 100%);
  mask-image: linear-gradient(to bottom, black 65%, transparent 100%);
}

.block-preview.empty {
  color: var(--text-muted);
  font-style: italic;
  -webkit-mask-image: none;
  mask-image: none;
}

.block-preview :deep(p) {
  margin: 0 0 4px 0;
}

.block-preview :deep(p:last-child) {
  margin-bottom: 0;
}

.block-preview :deep(strong) {
  color: var(--text-primary);
  font-weight: 650;
}

.block-preview :deep(code) {
  font-family: inherit;
  font-size: 12px;
  padding: 1.5px 5px;
  border-radius: 4px;
  background: rgba(139, 154, 110, 0.10);
  color: var(--color-primary-accent, #8B9A6E);
}

.block-preview :deep(.katex-display-wrapper) {
  margin: 4px 0;
  padding: 2px 6px;
  background: rgba(139, 154, 110, 0.08);
  border-radius: 4px;
  text-align: left;
}

html.dark .block-preview :deep(.katex-display-wrapper) {
  background: rgba(139, 154, 110, 0.12);
}

.block-preview :deep(.katex) {
  font-size: 1.02em;
  line-height: 1.2;
}

html.dark .block-preview {
  color: var(--text-secondary, #C5BDB5);
}

.block-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--text-muted, #7A7A75);
  padding-top: 8px;
  border-top: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.04));
  gap: 12px;
  flex-shrink: 0;
  margin-top: auto;
}

.block-source-wrapper,
.block-time-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.block-source-wrapper {
  flex: 1;
  min-width: 0;
  background: transparent;
  padding: 0;
  transition: color 0.18s ease;
}

.block-card:hover .block-source-wrapper {
  color: var(--text-secondary, #4A4A45);
}

html.dark .block-card:hover .block-source-wrapper {
  color: var(--text-secondary, #C5BDB5);
}

.block-source-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 空状态下的光环 */
.empty-icon-halo {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: rgba(139, 154, 110, 0.10);
  border: 0.5px solid rgba(139, 154, 110, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  color: var(--color-primary-accent, #8B9A6E);
  box-shadow: 0 8px 24px -4px rgba(139, 154, 110, 0.20), inset 0 2px 6px rgba(255, 255, 255, 0.5);
}

html.dark .empty-icon-halo {
  background: rgba(163, 177, 155, 0.12);
  border-color: rgba(163, 177, 155, 0.24);
  color: #B4C4AA;
  box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.4), inset 0 2px 6px rgba(255, 255, 255, 0.05);
}

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
  font-weight: 850;
  color: var(--text-primary);
  margin-bottom: 14px;
  letter-spacing: -0.025em;
  line-height: 1.3;
}

.onboarding-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.68;
}

.onboarding-drag-capsule {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 32px;
  padding: 13px 28px;
  border-radius: var(--radius-full, 9999px);
  background: rgba(139, 154, 110, 0.08);
  color: var(--color-primary-accent, #8B9A6E);
  font-size: 13.5px;
  font-weight: 650;
  border: 1.5px dashed rgba(139, 154, 110, 0.38);
  box-shadow: 0 4px 16px -2px rgba(139, 154, 110, 0.08);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  cursor: pointer;
}

.onboarding-drag-capsule:hover {
  background: rgba(139, 154, 110, 0.15);
  border-color: var(--color-primary-accent, #8B9A6E);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px -4px rgba(139, 154, 110, 0.20);
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
  background: var(--color-bg-primary, #FFFFFF);
  border: 1px solid rgba(139, 154, 110, 0.16);
  border-radius: 18px;
  padding: 26px 24px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  box-shadow: 0 4px 18px -2px rgba(0, 0, 0, 0.04), 0 2px 6px -1px rgba(0, 0, 0, 0.02);
}

html.dark .onboarding-card {
  background: var(--color-bg-secondary, #22211f);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 6px 20px -2px rgba(0, 0, 0, 0.35);
}

.onboarding-card:hover {
  transform: translateY(-3.5px);
  border-color: rgba(139, 154, 110, 0.45);
  box-shadow: 0 14px 28px -4px rgba(139, 154, 110, 0.16), 0 4px 10px -2px rgba(0, 0, 0, 0.04);
}

.onboarding-card-icon {
  font-size: 28px;
  width: 56px;
  height: 56px;
  background: rgba(139, 154, 110, 0.12);
  border: 1px solid rgba(139, 154, 110, 0.24);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary-accent, #8B9A6E);
  box-shadow: 0 4px 12px -2px rgba(139, 154, 110, 0.2);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.onboarding-card:hover .onboarding-card-icon {
  transform: scale(1.08) rotate(3deg);
  background: rgba(139, 154, 110, 0.18);
}

.onboarding-card-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.onboarding-card-body h4 {
  font-size: 15.5px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: -0.015em;
}

.onboarding-card-body p {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
}

.onboarding-card-btn {
  margin-top: auto;
  background: rgba(139, 154, 110, 0.12);
  border: 1px solid rgba(139, 154, 110, 0.25);
  color: var(--color-primary-accent, #8B9A6E);
  font-size: 12px;
  font-weight: 650;
  padding: 7px 20px;
  border-radius: var(--radius-full, 9999px);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.onboarding-card:hover .onboarding-card-btn {
  background: var(--btn-primary-bg, linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%));
  color: #FFFFFF;
  border-color: transparent;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.35);
  transform: translateY(-1px);
}

.onboarding-card-btn:active {
  transform: scale(0.95);
}

/* ===== Right: AI Assistant (Rounded Card) ===== */
.workspace-right {
  position: relative;
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--workspace-card-shadow);
  overflow: hidden;
  min-width: 300px;
  max-width: 650px;
  transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease, border-width 0.3s ease;
}

.workspace-right.is-resizing,
.tier2-drawer.is-resizing {
  transition: none !important;
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
  scrollbar-gutter: stable;
  padding: 20px 16px 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.chat-msg-row {
  display: flex;
  gap: 12px;
  max-width: 92%;
  align-self: flex-start;
  align-items: flex-start;
}

.chat-msg-row.user {
  align-self: flex-end;
  max-width: 80%;
  flex-direction: row;
}

.chat-bubble-wrapper {
  flex: 1;
  min-width: 0;
}

.chat-bubble {
  border-radius: 14px;
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.68;
  word-break: break-word;
}

.chat-msg-row.user .chat-bubble {
  background: var(--color-bg-card, #ffffff);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle, #e0deda);
  border-radius: 20px 20px 6px 20px;
  padding: 11px 18px;
  font-size: calc(14px + var(--ui-font-size-adjustment));
  line-height: 1.55;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.chat-msg-row.assistant {
  max-width: 100%;
  width: 100%;
  align-items: flex-start;
}

.chat-msg-row.assistant .chat-bubble {
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  padding: 2px 0 14px !important;
  font-size: calc(14.5px + var(--ui-font-size-adjustment));
  line-height: 1.74;
  color: var(--text-primary);
  box-shadow: none !important;
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

.chat-recover-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(234, 179, 8, 0.35);
  border-radius: 10px;
  background: rgba(234, 179, 8, 0.08);
  color: #a16207;
  font-size: 12px;
}

html.dark .chat-recover-banner {
  border-color: rgba(234, 179, 8, 0.3);
  background: rgba(234, 179, 8, 0.12);
  color: #facc15;
}

.chat-recover-message {
  min-width: 0;
  overflow-wrap: anywhere;
}

.chat-recover-btn {
  flex-shrink: 0;
  border: 1px solid currentColor;
  border-radius: 6px;
  padding: 4px 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
}

.chat-recover-btn:hover:not(:disabled) {
  background: rgba(234, 179, 8, 0.15);
}

.chat-recover-btn:disabled {
  cursor: default;
  opacity: 0.55;
}


/* 意图感知磁吸悬浮胶囊：向上滚动时脱离自动跟随，浮现平滑小胶囊 */
.chat-scroll-resume-pill {
  position: absolute;
  bottom: 84px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 25;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 14px 0 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-bg-card, #ffffff) 90%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 45%, var(--border-default, #dcd8d0));
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.09), 0 1px 3px rgba(0, 0, 0, 0.04);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.chat-scroll-resume-pill:hover {
  background: var(--color-bg-card, #ffffff);
  border-color: var(--color-zen-sage, #8b9a6e);
  box-shadow: 0 6px 22px color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 24%, transparent);
  transform: translateX(-50%) translateY(-2px);
}

.resume-pill-pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-zen-sage, #8b9a6e);
  animation: resume-dot-pulse 1.4s infinite ease-in-out;
}

@keyframes resume-dot-pulse {
  0%, 100% {
    transform: scale(0.9);
    opacity: 0.5;
  }
  50% {
    transform: scale(1.35);
    opacity: 1;
  }
}

.resume-pill-arrow {
  font-size: 13px;
  color: var(--color-sage-dark, #5c6b44);
  font-weight: 700;
}

.resume-pill-text {
  letter-spacing: -0.01em;
  color: var(--text-secondary);
}

.scroll-pill-fade-enter-active,
.scroll-pill-fade-leave-active {
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.scroll-pill-fade-enter-from,
.scroll-pill-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
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
.ai-reply :deep(pre) { background: var(--color-bg-card, #ffffff); color: var(--text-primary); border: 1px solid var(--border-subtle, #e0deda); padding: 12px 14px; border-radius: 10px; overflow-x: auto; margin: 10px 0; font-size: 12.5px; line-height: 1.55; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02); }
.ai-reply :deep(pre code) { background: transparent; padding: 0; color: inherit; font-size: inherit; font-family: inherit; }
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
  padding: calc(14px - var(--card-padding-reduction)) calc(16px - var(--card-padding-reduction)) calc(16px - var(--card-padding-reduction));
  border-top: 1px solid var(--border-subtle);
  background: var(--color-bg-primary, #F7F2EB);
}

.ai-input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  background: var(--color-bg-card, #ffffff);
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
  background: var(--color-bg-card, #ffffff);
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18), 0 2px 6px rgba(0, 0, 0, 0.04);
}

.ai-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: calc(13.5px + var(--ui-font-size-adjustment));
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

.refine-fade-enter-active,
.refine-fade-leave-active {
  transition: opacity 0.22s ease;
}

.refine-fade-enter-active .refine-card,
.refine-fade-leave-active .refine-card {
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s ease;
  will-change: transform, opacity;
}

.refine-fade-enter-from,
.refine-fade-leave-to {
  opacity: 0;
}

.refine-fade-enter-from .refine-card {
  transform: scale(0.94);
  opacity: 0;
}

.refine-fade-leave-to .refine-card {
  transform: scale(0.96);
  opacity: 0;
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
.composer-markdown-editor {
  width: 100%;
  min-height: 120px;
  padding: 8px 10px;
  font-family: inherit;
  font-size: 11.5px;
  line-height: 1.6;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--bg-modifier-hover);
  color: var(--text-primary);
  resize: vertical;
  box-sizing: border-box;
}
.composer-markdown-editor:focus {
  outline: none;
  border-color: var(--color-primary-accent);
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
.summary-markdown { color: var(--text-secondary); line-height: 1.85; font-size: 14.5px; word-break: break-word; }
.summary-markdown :deep(h1), .summary-markdown :deep(h2), .summary-markdown :deep(h3), .summary-markdown :deep(h4) { color: var(--text-primary); font-weight: 700; margin: 1.5em 0 0.5em; line-height: 1.3; }
.summary-markdown :deep(h1) { font-size: 1.5em; border-bottom: 0.5px solid var(--border-default); padding-bottom: 0.3em; }
.summary-markdown :deep(h2) { font-size: 1.25em; margin: 2em 0 1em; padding-bottom: 8px; border-bottom: 0.5px solid rgba(0,0,0,0.04); }
.summary-markdown :deep(h3) { font-size: 1.1em; margin: 1.5em 0 1em; }
.summary-markdown :deep(p) { margin-bottom: 16px; }
.summary-markdown :deep(ul), .summary-markdown :deep(ol) { margin: 0 0 16px 0; padding-left: 24px; }
.summary-markdown :deep(li) { margin-bottom: 6px; }
.summary-markdown :deep(li::marker) { color: var(--text-muted); }
.summary-markdown :deep(blockquote) { margin: 0 0 16px; padding: 12px 16px; border-left: 3px solid #8B9A6E; background: rgba(139, 154, 110, 0.08); border-radius: 0 8px 8px 0; color: var(--text-muted); font-style: italic; }
.summary-markdown :deep(pre) { background: #1C1C1A; padding: 16px; border-radius: 12px; overflow-x: auto; margin-bottom: 16px; border: 0.5px solid rgba(0,0,0,0.1); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
.summary-markdown :deep(code) { font-family: var(--font-family-mono); font-size: 13px; background: rgba(0,0,0,0.04); padding: 3px 6px; border-radius: 6px; color: #8B9A6E; font-weight: 500; }
.summary-markdown :deep(pre code) { background: transparent; padding: 0; color: #E6E6E4; font-weight: 400; font-size: 13.5px; }
.summary-markdown :deep(a) { color: #8B9A6E; text-decoration: none; border-bottom: 0.5px solid transparent; transition: all 0.2s; }
.summary-markdown :deep(a:hover) { border-bottom-color: #8B9A6E; }
.summary-markdown :deep(img) { max-width: 100%; border-radius: 12px; margin: 16px 0; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
.summary-markdown :deep(table) { width: 100%; border-collapse: collapse; margin-bottom: 16px; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.02); }
.summary-markdown :deep(th), .summary-markdown :deep(td) { padding: 10px 14px; border: 0.5px solid var(--border-subtle); text-align: left; }
.summary-markdown :deep(th) { background: rgba(0,0,0,0.02); font-weight: 600; color: var(--text-primary); }

html.dark .summary-markdown :deep(h2) { border-color: rgba(255,255,255,0.04); }

/* ===== Refined Zen Minimalist AI Visual Language (PC) ===== */
.ai-header { position: relative; justify-content: space-between; background: transparent; backdrop-filter: blur(12px); border-bottom: none; z-index: 10; padding: 24px 20px 12px; }
.ai-model-switch.ai-file-switch { display: flex; align-items: center; gap: 8px; border: 0.5px solid var(--border-subtle); background: var(--color-bg-tertiary, #FAF7F2); color: var(--text-secondary); font-weight: 600; cursor: pointer; padding: 6px 14px; border-radius: 999px; transition: all 0.2s; font-size: 12.5px; box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04); max-width: 210px; }
.ai-model-switch.ai-file-switch:hover { background: rgba(139, 154, 110, 0.14); border-color: rgba(139, 154, 110, 0.45); color: var(--color-primary-accent, #8B9A6E); box-shadow: 0 4px 12px rgba(139, 154, 110, 0.2); transform: translateY(-1px); }
.ai-file-switch .model-icon-top { display: flex; align-items: center; color: var(--color-primary-accent, #8B9A6E); flex-shrink: 0; }
.ai-file-switch .model-text { font-size: 12.5px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 130px; }
.chevron-icon { transition: transform 0.2s; opacity: 0.6; flex-shrink: 0; }
.chevron-icon.is-rotated { transform: rotate(180deg); opacity: 1; }
.ai-model-menu.ai-file-menu { position: absolute; top: 62px; left: 20px; z-index: 10; min-width: 240px; max-width: 300px; max-height: 380px; overflow-y: auto; padding: 8px; background: var(--color-bg-tertiary, #FAF7F2); backdrop-filter: blur(16px); border: 0.5px solid var(--border-default); border-radius: 14px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04); display: flex; flex-direction: column; gap: 3px; }
html.dark .ai-model-menu.ai-file-menu { background: var(--color-bg-secondary); border-color: var(--border-subtle); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35); }
.ai-menu-section-header { display: flex; justify-content: space-between; align-items: center; font-size: 12px; font-weight: 700; color: var(--text-muted); padding: 6px 10px 4px; letter-spacing: 0.5px; text-transform: uppercase; }
.ai-menu-header-count { font-size: 12px; color: var(--color-primary-accent, #8B9A6E); font-weight: 600; text-transform: none; }
.ai-menu-divider { height: 0.5px; background: var(--border-subtle); margin: 4px 6px; }
.mini-menu-item { position: relative; display: flex; align-items: center; gap: 10px; padding: 8px 12px 8px 14px; border-radius: 8px; cursor: pointer; transition: all 0.15s ease; user-select: none; }
.mini-menu-item:hover { background: rgba(0, 0, 0, 0.04); }
html.dark .mini-menu-item:hover { background: rgba(255, 255, 255, 0.04); }
.mini-menu-item.is-active { background: var(--color-primary-light); color: var(--color-primary-accent); font-weight: 700; }
.mini-menu-item.is-active::before { content: ''; position: absolute; left: 0; top: 6px; bottom: 6px; width: 3px; background: var(--color-primary-accent); border-radius: 1.5px; }
.mini-menu-icon { font-size: 16px; color: var(--text-muted); display: flex; align-items: center; justify-content: center; width: 18px; flex-shrink: 0; transition: color 0.15s; }
.mini-menu-item.is-active .mini-menu-icon { color: var(--color-primary-accent); }
.mini-menu-text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.mini-menu-label-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.mini-menu-label { font-size: 12.5px; font-weight: 500; color: var(--text-primary); line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
.mini-menu-current-tag { font-size: 12px; font-weight: 600; padding: 1px 5px; border-radius: 4px; background: rgba(139, 154, 110, 0.15); color: var(--color-primary-accent, #8B9A6E); line-height: 1.2; flex-shrink: 0; }
.mini-menu-item.is-active .mini-menu-current-tag { background: var(--color-primary-accent, #8B9A6E); color: #fff; }
.mini-menu-item.is-active .mini-menu-label { color: var(--color-primary-accent); font-weight: 700; }
.mini-menu-desc { font-size: 12px; color: var(--text-muted); line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mini-menu-item.is-active .mini-menu-desc { color: var(--color-primary-accent); opacity: 0.8; }
.ai-clear { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; padding: 0; border-radius: 50%; border: 0.5px solid var(--border-subtle); background: var(--color-bg-tertiary, #FAF7F2); color: var(--text-secondary); cursor: pointer; box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04); transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
.ai-clear svg { stroke: currentColor; }
.ai-clear:hover { background: rgba(139, 154, 110, 0.14); border-color: rgba(139, 154, 110, 0.4); color: var(--color-primary-accent, #8B9A6E); box-shadow: 0 4px 12px rgba(139, 154, 110, 0.2); transform: rotate(-30deg); }

.ai-welcome { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 20px 24px 28px; animation: ai-fade-in 0.4s ease-out; width: 100%; max-width: 320px; margin: 0 auto; box-sizing: border-box; }
.ai-spark-wrap, .ai-brand-wrap { position: relative; width: 56px; height: 56px; display: grid; place-items: center; margin-bottom: 16px; filter: drop-shadow(0 8px 20px rgba(139, 154, 110, 0.24)); transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
.ai-brand-wrap:hover { transform: translateY(-2px) scale(1.03); }
.ai-spark-svg, .ai-brand-svg { width: 56px; height: 56px; display: block; border-radius: 16px; }
.welcome-title { font-size: calc(22.5px + var(--ui-font-size-adjustment)); font-weight: 650; color: var(--text-primary); margin: 0 0 8px; letter-spacing: -0.3px; line-height: 1.3; }
.welcome-desc { font-size: calc(12.5px + var(--ui-font-size-adjustment)); font-weight: 400; color: var(--text-muted); margin: 0 0 26px; line-height: 1.55; max-width: 260px; }
.preset-questions { display: flex; flex-direction: column; align-items: center; gap: 9px; width: 100%; max-width: 260px; box-sizing: border-box; }
.preset-pill { width: 100%; padding: 9px 20px; border-radius: 999px; background: var(--color-bg-tertiary, #FAF7F2); border: 0.5px solid var(--border-subtle); color: var(--text-primary); font-size: 13px; font-weight: 550; letter-spacing: 0.8px; text-align: center; cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 2px 8px -1px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02); user-select: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box; }
.preset-pill:hover { background: rgba(139, 154, 110, 0.14); border-color: rgba(139, 154, 110, 0.45); color: var(--color-primary-accent, #8B9A6E); font-weight: 600; transform: translateY(-1.5px); box-shadow: 0 6px 16px -2px rgba(139, 154, 110, 0.22), 0 2px 4px rgba(0, 0, 0, 0.03); }
.preset-pill:active { transform: translateY(0); box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04); }

.assistant-spark-avatar { width: 34px; height: 34px; border: 0.5px solid var(--border-subtle); border-radius: 50%; display: grid; place-items: center; background: var(--color-bg-tertiary, #FAF7F2); flex: 0 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.02); }
.assistant-spark-avatar svg { width: 20px; height: 20px; }
.chat-msg-row.user .chat-bubble { background: var(--color-bg-card, #ffffff); color: var(--text-primary); border: 1px solid var(--border-subtle, #e0deda); border-radius: 20px 20px 6px 20px; padding: 11px 18px; font-size: calc(14px + var(--ui-font-size-adjustment)); line-height: 1.55; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.chat-msg-row.assistant .chat-bubble { background: transparent; border: none; border-radius: 0; padding: 2px 0 14px; font-size: calc(14.5px + var(--ui-font-size-adjustment)); line-height: 1.74; color: var(--text-primary); box-shadow: none; }

.ai-input-area { padding: calc(16px - var(--card-padding-reduction)) calc(20px - var(--card-padding-reduction)) calc(24px - var(--card-padding-reduction)); background: transparent; backdrop-filter: blur(12px); border-top: none; width: 100%; box-sizing: border-box; }
.ai-chat-capsule { display: flex; align-items: flex-end; width: 100%; box-sizing: border-box; min-height: 52px; border-radius: 26px; padding: 6px 6px 6px 18px; gap: 10px; background: var(--color-bg-card, #ffffff); border: 1px solid var(--border-default, #e0deda); box-shadow: 0 4px 16px -2px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.02); transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.ai-chat-capsule:focus-within { background: var(--color-bg-card, #ffffff); border-color: var(--color-primary-accent, #8B9A6E); box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18), 0 4px 14px rgba(0,0,0,0.05); transform: translateY(-1px); }
.ai-input { flex: 1; background: transparent; font-size: calc(14.5px + var(--ui-font-size-adjustment)); line-height: 1.5; padding: 6px 0; color: var(--text-primary); border: none; outline: none; resize: none; overflow-y: auto; }
.ai-input::placeholder { color: var(--text-muted); }
.ai-send-btn { width: 36px; height: 36px; border-radius: 50%; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); flex-shrink: 0; background: var(--color-bg-card, #ffffff); border: 0.5px solid var(--border-subtle); color: var(--color-primary-accent, #8B9A6E); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.ai-send-btn.is-ready { background: var(--btn-primary-bg, linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%)) !important; color: #fff !important; box-shadow: 0 2px 8px rgba(139, 154, 110, 0.4) !important; }
.ai-send-btn.is-ready:hover { transform: scale(1.06); background: #76855B !important; box-shadow: 0 4px 14px rgba(139, 154, 110, 0.55) !important; }

.ai-typing-dots { display: flex; align-items: center; gap: 6px; min-height: 24px; padding: 4px 6px; }
.ai-typing-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); animation: ai-dot-bounce 1.4s ease-in-out infinite both; }
.ai-typing-dot:nth-child(1) { animation-delay: -.32s; }
.ai-typing-dot:nth-child(2) { animation-delay: -.16s; }


html.dark .ai-header, html.dark .ai-model-menu, html.dark .ai-chat-capsule, html.dark .assistant-spark-avatar { background: #1C1C1C; border-color: rgba(255,255,255,0.08); }
html.dark .chat-msg-row.user .chat-bubble { background: var(--color-bg-secondary, #232220) !important; color: var(--text-primary, #e6e4df) !important; border-color: rgba(255,255,255,0.08) !important; }
html.dark .chat-msg-row.assistant .chat-bubble { background: transparent !important; border: none !important; }
html.dark .ai-reply :deep(pre) { background: #232220; border-color: rgba(255, 255, 255, 0.08); color: #e6e4df; }
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
.drag-hint { margin-top: 6px; color: var(--text-muted); font-size: 12px; }
html.dark .drag-drop-zone { border-color: rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); }
html.dark .drag-drop-zone:hover { border-color: rgba(255,255,255,0.2); background: rgba(0,0,0,0.4); }
html.dark .drag-drop-zone.is-active { border-color: #9AB08F; background: rgba(154, 176, 143, 0.1); }

/* Home Modal Styles for Register Modal */
.modal-container { width: 90%; max-width: 520px; background: var(--color-bg-primary, #F7F2EB); border-radius: 20px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.04); border: 0.5px solid var(--border-subtle); display: flex; flex-direction: column; overflow: hidden; animation: scale-up 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
html.dark .modal-container { background: var(--color-bg-primary, #1f1e1c); border-color: rgba(163, 177, 155, 0.25); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4); }
@keyframes scale-up { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.modal-container .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 0.5px solid var(--border-subtle); }
.modal-container .modal-header h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.3px; }
.close-btn { background: none; border: none; font-size: 20px; color: var(--text-muted); cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: all var(--transition-fast); }
.close-btn:hover { background: rgba(0, 0, 0, 0.04); color: var(--text-primary); }
html.dark .close-btn:hover { background: rgba(255, 255, 255, 0.06); }
.modal-container .modal-body { padding: 22px 28px; display: flex; flex-direction: column; gap: 20px; max-height: 70vh; overflow-y: auto; }
.form-group label { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.styled-input, .styled-textarea { width: 100%; padding: 12px 14px; background: var(--color-bg-tertiary, #FAF7F2); border: 0.5px solid var(--border-default); border-radius: 12px; font-size: 13.5px; color: var(--text-primary); transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); outline: none; box-sizing: border-box; font-family: inherit; }
.styled-input:focus, .styled-textarea:focus { border-color: #8B9A6E; background: var(--color-bg-tertiary, #FAF7F2); box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18); }
html.dark .styled-input:focus, html.dark .styled-textarea:focus { border-color: #9AB08F; background: rgba(255, 255, 255, 0.05); box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.2); }
.styled-textarea { resize: vertical; line-height: 1.6; min-height: 100px; }
.styled-el-select { width: 100%; }
.styled-el-select :deep(.el-input__wrapper) { background: var(--color-bg-tertiary, #FAF7F2); border-radius: 12px; box-shadow: 0 0 0 1px var(--border-default) inset; padding: 4px 14px; transition: all 0.2s; }
.styled-el-select :deep(.el-input__wrapper.is-focus) { background: var(--color-bg-tertiary, #FAF7F2); box-shadow: 0 0 0 1px #8B9A6E inset, 0 0 0 3px rgba(139, 154, 110, 0.18) !important; }
html.dark .styled-el-select :deep(.el-input__wrapper.is-focus) { background: rgba(255, 255, 255, 0.05); box-shadow: 0 0 0 1px #9AB08F inset, 0 0 0 3px rgba(139, 154, 110, 0.2) !important; }
.modal-container .modal-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 28px 22px; border-top: 0.5px solid var(--border-subtle); background: transparent; }
.btn-secondary { background: var(--color-bg-tertiary, #FAF7F2); border: 0.5px solid var(--border-default); color: var(--text-secondary); padding: 8px 20px; border-radius: 9999px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-secondary:hover { background: rgba(0, 0, 0, 0.05); color: var(--text-primary); }
.btn-primary { background: var(--btn-primary-bg, linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%)); border: none; color: #FFFFFF; padding: 8px 26px; border-radius: 9999px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 2px 8px rgba(139, 154, 110, 0.3); }
.btn-primary:hover:not(:disabled) { background: #76855B; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(139, 154, 110, 0.45); }
.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
html.dark .btn-primary { background: #9AB08F; color: #1a1a1a; }
html.dark .btn-primary:hover { background: #b0c2a7; box-shadow: 0 4px 12px rgba(154, 176, 143, 0.2); }

/* Center workspace view transition & preview wrapper */
.preview-pane-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.workspace-view-fade-enter-active,
.workspace-view-fade-leave-active {
  transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform;
}

.workspace-view-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.workspace-view-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.chat-msg-citations {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 22%, var(--border-subtle, #E0DEDA));
  font-size: 12px;
}
.chat-msg-citations .citation-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 650;
  color: var(--color-sage-dark, #5C6B44);
  margin-bottom: 8px;
  font-size: 11.5px;
  letter-spacing: -0.01em;
}
.chat-msg-citations .citation-title-icon {
  color: var(--color-zen-sage, #8B9A6E);
  flex-shrink: 0;
}
.chat-msg-citations .citation-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 14%, var(--color-bg-card, #FFFFFF));
  color: var(--color-sage-dark, #5C6B44);
  font-size: 10px;
  font-weight: 700;
}
.chat-msg-citations .citation-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chat-msg-citations .citation-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 4px 9px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 22%, var(--border-subtle, #E0DEDA));
  background: color-mix(in srgb, var(--color-bg-card, #FFFFFF) 85%, var(--color-bg-primary, #F5F1EB));
  color: var(--text-primary);
  font-size: 11.5px;
  line-height: 1.4;
  cursor: pointer;
  user-select: none;
  transition: all 0.16s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}
.chat-msg-citations .citation-chip:hover {
  background: color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 12%, var(--color-bg-card, #FFFFFF));
  border-color: color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 45%, var(--border-subtle, #E0DEDA));
  color: var(--color-sage-dark, #5C6B44);
  transform: translateY(-1px);
  box-shadow: 0 2px 6px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 10%, transparent);
}
.chat-msg-citations .citation-idx {
  font-family: var(--font-mono, monospace);
  font-weight: 700;
  font-size: 10.5px;
  color: var(--color-zen-sage, #8B9A6E);
  flex-shrink: 0;
}
.chat-msg-citations .citation-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
  color: var(--text-secondary);
}
.chat-msg-citations .citation-chip:hover .citation-name {
  color: var(--color-sage-dark, #5C6B44);
}

.chat-msg-interrupted-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--color-warning, #d9822b) 8%, var(--color-bg-card, #ffffff));
  border: 1px solid color-mix(in srgb, var(--color-warning, #d9822b) 22%, transparent);
}

.interrupted-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.chat-retry-reply-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 30%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-zen-sage, #8b9a6e) 12%, var(--color-bg-card, #ffffff));
  color: var(--color-sage-dark, #5c6b44);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.16s ease;
}

.chat-retry-reply-btn:hover {
  background: var(--color-zen-sage, #8b9a6e);
  color: #ffffff;
}

/* ===== Responsive Flex Optimization for Smaller Screens & 125%/150% DPI ===== */
@media (max-width: 1280px) {
  .workspace-center {
    min-width: 340px;
  }
  .tier2-drawer.is-open {
    max-width: 280px;
  }
  .workspace-right.is-open {
    min-width: 280px;
    max-width: 480px;
  }
}

@media (max-width: 1080px) {
  .workspace-center {
    min-width: 320px;
  }
  .tier1-strip {
    width: 64px;
    padding: 16px 0 12px;
  }
  .tier1-btn {
    width: 52px;
    height: 50px;
  }
  .tier2-drawer.is-open {
    max-width: 240px;
  }
}

@media (max-width: 960px) {
  .workspace-center {
    min-width: 280px;
  }
  .tier2-drawer.is-open {
    max-width: 200px;
  }
  .workspace-right.is-open {
    min-width: 260px;
    max-width: 360px;
  }
}
</style>
