<template>
  <TabletLayout>
    <view class="t-workspace">
      <!-- Left: Unified Workspace Sidebar Card -->
      <view class="workspace-sidebar-card" :class="{ 'drawer-collapsed': !showDrawer || showSummarySidePanel }">
        <!-- Tier-1: Icon Strip -->
        <view class="tier1-strip">
          <view class="strip-btn" @click="goBack">
            <LineIcon name="arrow-left" size="26rpx" color="var(--color-zen-graphite, #1C1C1A)" />
            <text class="strip-label">返回</text>
          </view>
          <view class="strip-divider"></view>
          <view
            v-for="panel in panelOptions"
            :key="panel.key"
            class="strip-btn"
            :class="{ active: activePanel === panel.key }"
            @click="activePanel = panel.key"
          >
            <LineIcon :name="panel.icon" size="28rpx" />
            <text class="strip-label">{{ panel.label }}</text>
          </view>
          <view class="strip-spacer"></view>
          <view class="strip-subject" v-if="activeSubject">
            <view class="subject-mini-icon">
              <LineIcon v-if="isSubjectIconKey(activeSubject?.icon) || !getLegacySubjectIcon(activeSubject?.icon)" :name="`subj-${activeSubject?.icon || 'book'}`" size="32rpx" />
              <text v-else>{{ getLegacySubjectIcon(activeSubject?.icon) }}</text>
            </view>
          </view>
        </view>

        <!-- Tier-2: Left Drawer -->
        <view class="tier2-drawer">
          <!-- Files Panel -->
          <view v-if="activePanel === 'files'" class="drawer-content">
            <view class="drawer-header">
              <text class="drawer-title">{{ tabletHandwritingNotesEnabled ? '文件与笔记' : '文件' }}</text>
              <view class="drawer-actions-row">
                <view v-if="tabletHandwritingNotesEnabled" class="drawer-action" @click="handleCreateNote">
                  <text>+ 笔记</text>
                </view>
                <view class="drawer-action primary" @click="handleAddFile">
                  <text>+ 导入</text>
                </view>
              </view>
            </view>
            <scroll-view scroll-y class="drawer-scroll">
              <view v-if="visibleSourceFiles.length === 0" class="drawer-empty">
                <text>暂无相关文件</text>
                <text class="drawer-hint">{{ filesPanelEmptyHint }}</text>
              </view>
              <view
                v-for="file in visibleSourceFiles"
                :key="file.id"
                class="file-item"
                :class="{ active: activeFileId === file.id }"
                @click="selectFile(file)"
              >
                <text class="file-icon">{{ getFileIcon(file.file_type) }}</text>
                <view class="file-info">
                  <text class="file-name" :title="file.name">{{ file.name }}</text>
                  <text class="file-meta">{{ file.file_type }} · {{ formatFileSize(file.file_size) }}</text>
                </view>
                <view class="file-delete" @click.stop="handleDeleteFile(file.id)">
                  <LineIcon name="close" size="22rpx" />
                </view>
              </view>
            </scroll-view>
          </view>

          <!-- Review Panel -->
          <view v-if="activePanel === 'review'" class="drawer-content">
            <view class="drawer-header">
              <text class="drawer-title">复习</text>
              <view class="drawer-action" @click="resetReview">
                <text>🔄 重置</text>
              </view>
            </view>
            <view class="review-mini-stats">
              <view class="mini-stat">
                <text class="ms-val">{{ remainingCount }}</text>
                <text class="ms-label">待练</text>
              </view>
              <view class="mini-stat">
                <text class="ms-val">{{ completedCount }}</text>
                <text class="ms-label">掌握</text>
              </view>
              <view class="mini-stat">
                <text class="ms-val">{{ masteryRate }}%</text>
                <text class="ms-label">进度</text>
              </view>
            </view>
            <scroll-view scroll-y class="drawer-scroll">
              <view v-if="sessionQueue.length === 0" class="drawer-empty">
                <text>队列为空</text>
              </view>
              <view
                v-for="(item, idx) in sessionQueue"
                :key="idx"
                class="review-queue-item"
                :class="{ current: idx === currentIndex, done: idx < currentIndex }"
                @click="currentIndex = idx; isFlipped = false"
              >
                <text class="rq-icon">{{ idx < currentIndex ? '✓' : (idx === currentIndex ? '▶' : '○') }}</text>
                <text class="rq-title">{{ item.title }}</text>
              </view>
            </scroll-view>
          </view>

          <!-- Knowledge Base Panel -->
          <view v-if="activePanel === 'blocks'" class="drawer-content">
            <view class="drawer-header">
              <text class="drawer-title">知识块</text>
              <view class="drawer-action" @click="showCreateBlock = true">
                <text>+ 新建</text>
              </view>
            </view>
            <scroll-view scroll-y class="drawer-scroll">
              <view v-if="subjectBlocks.length === 0" class="drawer-empty">
                <text>暂无知识块</text>
              </view>
              <view
                v-for="block in subjectBlocks"
                :key="block.id"
                class="block-item"
                :class="{ active: activeBlockId === block.id }"
                @click="selectBlock(block)"
              >
                <text class="block-title">{{ block.title }}</text>
                <text class="block-time">{{ formatTime(block.time) }}</text>
              </view>
            </scroll-view>
          </view>
        </view>
      </view>

      <!-- Center: Main Content Area -->
      <view class="main-area">
        <!-- Status Bar -->
        <view class="status-bar">
          <view class="status-subject" v-if="activeSubject">
            <LineIcon v-if="isSubjectIconKey(activeSubject.icon) || !getLegacySubjectIcon(activeSubject.icon)" :name="`subj-${activeSubject.icon || 'book'}`" size="28rpx" />
            <text v-else>{{ getLegacySubjectIcon(activeSubject.icon) }}</text>
            <text class="status-subject-name">{{ activeSubject.name }}</text>
          </view>
          <text class="status-info">{{ subjectBlocks.length }} 知识块 · {{ visibleSourceFiles.length }} 文件</text>
          <view class="status-actions">
            <view class="status-btn" @click="showDrawer = !showDrawer">
              <LineIcon :name="showDrawer ? 'chevron-left' : 'chevron-right'" size="22rpx" />
            </view>
          </view>
        </view>

        <!-- Content Body -->
        <view class="content-body">
          <!-- Review Deck Workspace -->
          <view v-if="activePanel === 'review'" class="review-deck-workspace">
            <view class="card-stack-container">
              <view v-if="activeCard" class="card-stack">
                <!-- Layer 3 -->
                <view v-if="sessionQueue[currentIndex + 2]" class="stack-card card-layer-3">
                  <view class="dummy-card-face">
                    <text class="dummy-subject">{{ sessionQueue[currentIndex + 2].subject || activeSubject?.name }}</text>
                  </view>
                </view>

                <!-- Layer 2 -->
                <view v-if="sessionQueue[currentIndex + 1]" class="stack-card card-layer-2">
                  <view class="dummy-card-face">
                    <text class="dummy-subject">{{ sessionQueue[currentIndex + 1].subject || activeSubject?.name }}</text>
                  </view>
                </view>

                <!-- Layer 1 (Active) -->
                <view 
                  class="stack-card card-layer-1" 
                  :style="activeCardStyle"
                  @touchstart="onTouchStart"
                  @touchmove="onTouchMove"
                  @touchend="onTouchEnd"
                >
                  <FlashCard
                    :front="activeCard.title"
                    :back="activeCard.preview"
                    :subject="activeCard.subject || activeSubject?.name"
                    :color="activeCard.color || activeSubject?.color"
                    v-model:flipped="isFlipped"
                  />

                  <!-- Stamps -->
                  <view class="stamp-container">
                    <view class="stamp stamp-mastered" :style="{ opacity: stampOpacity.up }">掌握</view>
                    <view class="stamp stamp-retry" :style="{ opacity: stampOpacity.down }">不熟</view>
                    <view class="stamp stamp-skip" :style="{ opacity: stampOpacity.left }">下一张</view>
                    <view class="stamp stamp-prev" :style="{ opacity: stampOpacity.right }">上一张</view>
                  </view>
                </view>
              </view>

              <!-- Finished State -->
              <view v-else class="finished-state">
                <LineIcon name="star" size="100rpx" color="#7D9372" class="finish-icon" />
                <text class="finish-title">完成当前复习队列</text>
                <text class="finish-desc">你已经复习完了当前所有知识块，继续保持！</text>
                <button class="reset-btn" @click="resetReview">
                  <LineIcon name="sync" size="30rpx" color="#fff" style="margin-right: 10rpx;" /> 重新本轮复习
                </button>
              </view>
            </view>

            <!-- Gesture Legend -->
            <view class="gesture-legend" v-if="activeCard">
              <view class="legend-row">
                <text class="legend-item">← 左滑 下一张</text>
                <text class="legend-dot">·</text>
                <text class="legend-item">右滑 上一张 →</text>
                <text class="legend-dot">·</text>
                <text class="legend-item">↑ 上滑 掌握</text>
                <text class="legend-dot">·</text>
                <text class="legend-item">下滑 不熟 ↓</text>
              </view>
            </view>
          </view>

          <!-- File Detail / Preview & Handwriting Workspace (可手写大屏研读与标注专区) -->
          <view v-else-if="activeFileId && selectedFile" class="file-detail-workspace">
            <!-- 头部简约文件信息与手写控制栏 -->
            <view class="file-detail-header">
              <view class="file-title-group">
                <text class="detail-file-name" :title="selectedFile.name">{{ selectedFile.name }}</text>
                <text class="detail-file-sub">{{ isImageFileType(selectedFile.file_type) ? '照片/图片' : 'PDF文档' }} · {{ formatFileSize(selectedFile.file_size) }}</text>
              </view>

              <!-- 简约手写与浏览交互工具条 (Zen Minimalist Toolbar) -->
              <view v-if="tabletHandwritingNotesEnabled" class="hw-mini-bar">
                <view class="hw-tool" :class="{ active: hwTool === 'none' }" @click="hwTool = 'none'" title="浏览/缩放页面">
                  <text>✋ 浏览</text>
                </view>
                <view class="hw-tool" :class="{ active: hwTool === 'pen' }" @click="hwTool = 'pen'" title="钢笔手写">
                  <text>╱ 钢笔</text>
                </view>
                <view class="hw-tool" :class="{ active: hwTool === 'highlighter' }" @click="hwTool = 'highlighter'" title="荧光笔重点标注">
                  <text>═ 荧光</text>
                </view>
                <view class="hw-tool" :class="{ active: hwTool === 'eraser' }" @click="hwTool = 'eraser'" title="橡皮擦">
                  <text>◌ 橡皮</text>
                </view>
                <view class="hw-divider" v-if="hwTool !== 'none' && hwTool !== 'eraser'" />
                <view class="hw-colors" v-if="hwTool !== 'none' && hwTool !== 'eraser'">
                  <view class="hw-color-dot" style="background: #1C1C1A" :class="{ active: hwColor === '#1C1C1A' }" @click="hwColor = '#1C1C1A'" />
                  <view class="hw-color-dot" style="background: #7D9372" :class="{ active: hwColor === '#7D9372' }" @click="hwColor = '#7D9372'" />
                  <view class="hw-color-dot" style="background: #DC2626" :class="{ active: hwColor === '#DC2626' }" @click="hwColor = '#DC2626'" />
                  <view class="hw-color-dot" style="background: #2563EB" :class="{ active: hwColor === '#2563EB' }" @click="hwColor = '#2563EB'" />
                </view>
                <view class="hw-divider" />
                <view class="hw-tool icon-only" @click="hwUndo" title="撤销笔迹"><text>↩</text></view>
                <view class="hw-tool icon-only" @click="hwClear" title="清空标注"><text>✕</text></view>
              </view>

              <!-- 右侧简约功能按钮群 (Zen Minimalist Action Buttons) -->
              <view class="minimal-actions">
                <view class="min-btn" :class="{ active: showSummarySidePanel }" @click="toggleSummarySidePanel" title="查看总结与大纲">
                  <text>总结</text>
                </view>
                <view class="min-btn" @click="extractFileToBlock(selectedFile)" title="一键提炼至知识库">
                  <text>提炼知识</text>
                </view>
              </view>
            </view>

            <!-- 主体：照片与 PDF 呈现及可手写标注页面 (Photo/PDF View & Interactive Handwriting Page) -->
            <view class="file-detail-body">
              <view class="study-stage-container">
                <!-- 1. 底层：照片 / PDF 阅读与渲染展示层 -->
                <scroll-view scroll-y scroll-x class="doc-view-layer" :scroll-with-animation="false">
                  <view class="doc-content-wrapper">
                    <!-- 照片/图片展示 -->
                    <image
                      v-if="isImageFileType(selectedFile.file_type)"
                      :src="selectedFile.file_path"
                      mode="widthFix"
                      class="study-photo-img"
                      @click="(!tabletHandwritingNotesEnabled || hwTool === 'none') && previewImage(selectedFile.file_path)"
                    />
                    <!-- PDF 文档展示 -->
                    <view v-else-if="isPdfFileType(selectedFile)" class="study-pdf-container">
                      <iframe :src="selectedFile.file_path" class="study-pdf-frame" />
                      <!-- 移动端或跨域环境下的高保真 PDF 手写纸张提示 -->
                      <view class="pdf-paper-sheet">
                        <view class="sheet-header">
                          <text class="sheet-title">{{ selectedFile.name }}</text>
                          <text class="sheet-badge">PDF 智能学习与手写专页</text>
                        </view>
                        <text class="sheet-desc">当前文件为 PDF 格式，已为您开启全屏手写标注与深度伴读区域。您可使用上方钢笔或荧光笔直接在本页进行圈画、批注与推演。</text>
                        <view class="sheet-grid-lines">
                          <view v-for="n in 18" :key="n" class="grid-row-line" />
                        </view>
                      </view>
                    </view>
                    <!-- 其他普通资料文档手写纸张 -->
                    <view v-else class="study-doc-container">
                      <view class="pdf-paper-sheet">
                        <view class="sheet-header">
                          <text class="sheet-title">{{ selectedFile.name }}</text>
                          <text class="sheet-badge">{{ selectedFile.file_type }} 学习与手写草稿页</text>
                        </view>
                        <view class="sheet-grid-lines">
                          <view v-for="n in 18" :key="n" class="grid-row-line" />
                        </view>
                      </view>
                    </view>
                  </view>
                </scroll-view>

                <!-- 2. 顶层：自研手写笔迹渲染与标注交互层 (Interactive Canvas Layer) -->
                <view
                  v-if="tabletHandwritingNotesEnabled"
                  class="hw-canvas-layer"
                  :style="{ pointerEvents: hwTool === 'none' ? 'none' : 'auto' }"
                >
                  <canvas
                    ref="fileCanvasRef"
                    id="file-study-canvas"
                    class="file-study-canvas"
                    @pointerdown="onFilePointerDown"
                    @pointermove="onFilePointerMove"
                    @pointerup="onFilePointerUp"
                    @pointercancel="onFilePointerUp"
                    @pointerleave="onFilePointerUp"
                  />
                </view>
              </view>
            </view>
          </view>

          <!-- Onboarding / Empty State -->
          <view v-else-if="!activeBlockId && !showCreateBlock" class="onboarding">
            <view class="onboard-icon">
              <LineIcon v-if="isSubjectIconKey(activeSubject?.icon) || !getLegacySubjectIcon(activeSubject?.icon)" :name="`subj-${activeSubject?.icon || 'book'}`" size="88rpx" />
              <text v-else>{{ getLegacySubjectIcon(activeSubject?.icon) }}</text>
            </view>
            <text class="onboard-title">{{ activeSubject?.name || '学科工作区' }}</text>
            <text class="onboard-hint">从左侧选择学习材料或知识块查看详情，也可新建内容</text>
            <view class="onboard-actions">
              <view class="btn primary-btn" @click="showCreateBlock = true">
                <text>+ 新建知识块</text>
              </view>
              <view class="btn secondary-btn" @click="activePanel = 'files'; showDrawer = true">
                <text>管理学习材料</text>
              </view>
              <view class="btn secondary-btn" @click="toggleSummarySidePanel()">
                <text>总结</text>
              </view>
            </view>
          </view>

          <!-- Block Detail View -->
          <view v-else-if="activeBlockId && selectedBlock" class="block-detail">
            <view class="detail-header">
              <text class="detail-title">{{ selectedBlock.title }}</text>
              <view class="detail-actions">
                <view class="mini-btn" @click="editBlock(selectedBlock)"><text>编辑</text></view>
                <view class="mini-btn danger" @click="deleteBlock(selectedBlock.id)"><text>删除</text></view>
              </view>
            </view>
            <view class="detail-meta">
              <text :style="{ color: selectedBlock.color }">{{ selectedBlock.subject }}</text>
              <text>· {{ formatTime(selectedBlock.time) }}</text>
              <text v-if="selectedBlock.source">· {{ selectedBlock.source }}</text>
            </view>
            <view class="detail-tags" v-if="selectedBlock.tags?.length">
              <view v-for="tag in selectedBlock.tags" :key="tag" class="tag">
                <text>{{ tag }}</text>
              </view>
            </view>
            <scroll-view scroll-y class="detail-body">
              <text class="detail-text">{{ selectedBlock.preview }}</text>
            </scroll-view>
          </view>

          <!-- Create Block Form -->
          <view v-else-if="showCreateBlock" class="create-form">
            <view class="form-header">
              <text class="form-title">新建知识块</text>
              <view class="form-close" @click="showCreateBlock = false"><LineIcon name="close" size="26rpx" /></view>
            </view>
            <scroll-view scroll-y class="form-body">
              <view class="form-group">
                <text class="form-label">标题</text>
                <input class="form-input" v-model="newBlock.title" placeholder="知识块标题" />
              </view>
              <view class="form-group">
                <text class="form-label">内容</text>
                <textarea class="form-textarea" v-model="newBlock.preview" placeholder="知识内容..." />
              </view>
              <view class="form-group">
                <text class="form-label">来源</text>
                <input class="form-input" v-model="newBlock.source" placeholder="来源 (可选)" />
              </view>
              <view class="form-group">
                <text class="form-label">难度</text>
                <view class="difficulty-options">
                  <view
                    v-for="opt in difficultyOptions"
                    :key="opt.value"
                    class="diff-option"
                    :class="{ selected: newBlock.difficulty === opt.value }"
                    @click="newBlock.difficulty = opt.value"
                  >
                    <text>{{ opt.label }}</text>
                  </view>
                </view>
              </view>
            </scroll-view>
            <view class="form-footer">
              <view class="btn secondary-btn" @click="showCreateBlock = false"><text>取消</text></view>
              <view class="btn primary-btn" @click="handleCreateBlock"><text>创建</text></view>
            </view>
          </view>
        </view>
      </view>

      <!-- Right: New Summary & Outline Side Panel -->
      <transition name="summary-slide">
        <view v-if="showSummarySidePanel" class="summary-side-panel">
          <!-- Header -->
          <view class="s-panel-header">
            <view class="s-title-group">
              <text class="s-panel-title">总结</text>
              <text class="s-panel-sub">{{ activeFileId && selectedFile ? selectedFile.name : (activeSubject ? activeSubject.name + ' 全科总结' : '当前要点') }}</text>
            </view>
            <view class="s-header-actions">
              <view class="s-action-btn icon-only" @click="closeSummarySidePanel" title="关闭总结侧栏">
                <LineIcon name="close" size="28rpx" />
              </view>
            </view>
          </view>

          <!-- 总结要点内容滚动区 (不用切换，专显当前选择文件的核心要点) -->
          <scroll-view scroll-y class="s-panel-body">
            <view class="s-tab-content">
              <view v-if="!currentAiSummary" class="s-empty">
                <text class="s-empty-title">暂无要点总结</text>
                <text class="s-empty-hint">正在智能梳理分析并呈现当前材料的核心导读与知识体系要点</text>
              </view>
              <view v-else class="summary-card">
                <text class="summary-badge">{{ activeFileId && selectedFile ? selectedFile.name + ' 核心要点' : '核心要点' }}</text>
                <text class="summary-text">{{ currentAiSummary }}</text>
                <view class="summary-card-actions">
                  <view class="s-action-pill" @click="extractSummaryToBlock">
                    <text>+ 归纳至知识块</text>
                  </view>
                </view>
              </view>
            </view>
          </scroll-view>
        </view>
      </transition>
    </view>

    <!-- 挂载到 #modal 插槽，跳出 main-content 的 transform 堆叠上下文，确保 position: fixed 绝对定位相对于全屏 window 定位，彻底解决刚打开时右下方溢出页面的问题 -->
    <template #modal>
      <!-- 右下角 AI 悬浮球 (打开浮窗时隐藏，保持界面清爽) -->
      <view class="ai-fab-btn" v-if="!showAiPanel" @click="openAiWindow">
        <text class="ai-fab-icon">◈</text>
        <text class="ai-fab-text">AI 助手</text>
      </view>

      <!-- AI 自由拖拽与响应式缩放浮窗卡片 (无遮罩，不阻挡工作区底层交互) -->
      <view 
        v-if="showAiPanel"
        class="ai-floating-window" 
        :class="{ 'is-dragging': isDraggingAi, 'is-resizing': isResizingAi }"
        :style="{
          left: `${aiPos.x}px`,
          top: `${aiPos.y}px`,
          width: `${aiSize.width}px`,
          height: `${aiSize.height}px`
        }"
      >
        <!-- 头部按住即可在全屏任意拖拽 (嵌入模型选择与新对话) -->
        <view 
          class="ai-header drag-handle"
          @touchstart="onAiTouchStart"
          @touchmove.stop.prevent="onAiTouchMove"
          @touchend="onAiTouchEnd"
          @mousedown="onAiMouseDown"
        >
          <!-- 左侧：模型选择器与拖拽提示 -->
          <view class="ai-title-wrap">
            <view class="model-name-btn" @click.stop="isModelMenuOpen = !isModelMenuOpen">
              <text class="model-icon-top">{{ currentModelObj.icon }}</text>
              <text class="model-text">{{ currentModelObj.label }}</text>
              <svg class="chevron-icon" :class="{ 'is-rotated': isModelMenuOpen }" width="10" height="7" viewBox="0 0 10 7" fill="none">
                <path d="M1 1L5 5.5L9 1" stroke="#A8A8A5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </view>
            <text class="drag-hint">按住拖动</text>
          </view>

          <!-- 右侧：新对话与关闭 -->
          <view class="ai-header-right">
            <view class="icon-btn-small" @click.stop="startNewAiChat" title="开启新对话">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 5V19M5 12H19" stroke="#1C1C1A" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </view>
            <view class="ai-close" @click.stop="showAiPanel = false"><LineIcon name="close" size="22rpx" /></view>
          </view>
        </view>

        <!-- 模型选择下拉菜单 -->
        <view class="model-mini-dropdown" :class="{ 'is-open': isModelMenuOpen }" v-if="isModelMenuOpen" @click.stop>
          <view v-for="m in modelOptions" :key="m.id"
            class="mini-menu-item" @click.stop="selectAiModel(m.label)">
            <text class="mini-menu-icon">{{ m.icon }}</text>
            <view class="mini-menu-text">
              <text class="mini-menu-label" :class="{ 'is-active': currentModel === m.label }">{{ m.label }}</text>
              <text class="mini-menu-desc">{{ m.desc }}</text>
            </view>
            <view v-if="currentModel === m.label" class="mini-check">✓</view>
          </view>
        </view>
        <view class="dropdown-mask" v-if="isModelMenuOpen" @click.stop="isModelMenuOpen = false" />

        <!-- 聊天内容流 (参照独立 AI 页) -->
        <scroll-view scroll-y class="ai-messages" :scroll-into-view="scrollToMsg">
          <!-- 欢迎/空状态 -->
          <view class="welcome-section" v-if="chatMessages.length === 0">
            <view class="spark-icon-wrap">
              <view class="spark-ring" />
              <svg class="spark-svg" width="56" height="56" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="url(#sparkGrad)" />
                <defs>
                  <linearGradient id="sparkGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#A2B396" />
                    <stop offset="1" stop-color="#6A805E" />
                  </linearGradient>
                </defs>
              </svg>
            </view>
            <view class="greeting-main">{{ currentModelObj.welcomeDesc }}</view>
            <view class="greeting-sub">你好！我是当前学科智能助手，随时为你效劳</view>
            
            <view class="minimal-chips-wrap">
              <text class="chips-label">试试问我</text>
              <view class="chips-list">
                <view v-for="(chip, idx) in presetPrompts" :key="idx"
                  class="minimal-chip" @click="askAi(chip)">
                  <text class="chip-text">{{ chip }}</text>
                </view>
              </view>
            </view>
          </view>

          <!-- 气泡流 -->
          <view class="chat-stream" v-else>
            <view v-for="(msg, i) in chatMessages" :key="i" :id="'msg-' + i" class="chat-bubble" :class="msg.role">
              <view class="assistant-avatar" v-if="msg.role === 'assistant'">
                <text style="font-size: 30rpx; color: #7D9372;">◈</text>
              </view>
              <view class="bubble-body">
                <view class="bubble-content" v-if="msg.role === 'assistant'" v-html="formatMarkdown(msg.content)" />
                <view class="bubble-content" v-else><text>{{ msg.content }}</text></view>
                <!-- 操作栏：复制与提炼为知识块 -->
                <view class="bubble-actions" v-if="msg.role === 'assistant' && msg.content">
                  <view class="action-btn icon-only" @click="copyText(msg.content)" title="复制">
                    <LineIcon name="copy" size="24rpx" color="#A8A8A5" />
                  </view>
                  <view class="action-btn text-btn" @click="extractToBlock(msg.content)">
                    <text>+ 提炼为知识块</text>
                  </view>
                </view>
              </view>
            </view>

            <!-- 打字指示器 -->
            <view class="typing-indicator" v-if="isStreaming">
              <view class="assistant-avatar small">
                <text style="font-size: 24rpx; color: #7D9372;">◈</text>
              </view>
              <view class="typing-dots">
                <view class="dot" />
                <view class="dot" />
                <view class="dot" />
              </view>
            </view>
            <view id="bottom-anchor" class="bottom-anchor" />
          </view>
        </scroll-view>

        <!-- 底部胶囊输入栏 (参照独立 AI 页) -->
        <view class="ai-capsule-bar">
          <view class="ai-capsule" :class="{ 'is-focused': isAiInputFocused }">
            <view class="capsule-left" @click="openActionSheet">
              <view class="plus-icon-wrap" :class="{ 'is-rotated': isActionOpen }">
                <LineIcon name="plus" size="44rpx" color="#A8A8A5" />
              </view>
            </view>
            <input
              class="ai-capsule-input"
              v-model="chatInput"
              placeholder="问问 Auralis AI..."
              placeholder-style="color: #c4bdb6; font-size: 28rpx;"
              @focus="isAiInputFocused = true"
              @blur="isAiInputFocused = false"
              @confirm="sendMessage"
              :cursor-spacing="20"
            />
            <view class="capsule-right">
              <view v-if="chatInput.trim().length === 0" class="mic-btn" @click="startVoice">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect x="9" y="2" width="6" height="11" rx="3" stroke="#A8A8A5" stroke-width="2" stroke-linecap="round"/>
                  <path d="M19 10v2a7 7 0 01-14 0v-2" stroke="#A8A8A5" stroke-width="2" stroke-linecap="round"/>
                  <path d="M12 19v3M9 22h6" stroke="#A8A8A5" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </view>
              <view v-else class="send-btn" @click="sendMessage">
                <LineIcon name="arrow-up" size="34rpx" color="#ffffff" />
              </view>
            </view>
          </view>
        </view>

        <!-- 附件操作面板 -->
        <view class="action-overlay" v-if="isActionOpen" @click="isActionOpen = false" />
        <view class="action-panel" :class="{ 'is-open': isActionOpen }">
          <view class="action-panel-row" @click="onActionTap(0)">
            <view class="action-panel-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="#A8A8A5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="12" cy="13" r="4" stroke="#7D9372" stroke-width="2"/>
              </svg>
            </view>
            <text class="action-panel-label">拍照 / 扫描题目或笔记</text>
          </view>
          <view class="action-panel-divider" />
          <view class="action-panel-row" @click="onActionTap(1)">
            <view class="action-panel-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="#A8A8A5" stroke-width="2"/>
                <circle cx="8.5" cy="8.5" r="1.5" fill="#7D9372"/>
                <path d="M21 15l-5-5L5 21" stroke="#A8A8A5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </view>
            <text class="action-panel-label">选择本地图库照片</text>
          </view>
          <view class="action-panel-divider" />
          <view class="action-panel-row" @click="onActionTap(2)">
            <view class="action-panel-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M4 6h16M4 12h10M4 18h7" stroke="#A8A8A5" stroke-width="2" stroke-linecap="round"/>
                <circle cx="19" cy="18" r="3" stroke="#7D9372" stroke-width="2"/>
                <path d="M19 16v2l1 1" stroke="#7D9372" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </view>
            <text class="action-panel-label">从现有知识块导入</text>
          </view>
        </view>

        <!-- 左下角拖拽缩放手柄 (和边缘圆角描边) -->
        <view 
          class="resize-handle bottom-left"
          @touchstart.stop.prevent="onResizeStart($event, 'left')"
          @touchmove.stop.prevent="onResizeMove($event)"
          @touchend.stop="onResizeEnd"
          @mousedown.stop.prevent="onResizeMouseDown($event, 'left')"
          title="按住缩放窗口"
        />

        <!-- 右下角拖拽缩放手柄 (和边缘圆角描边) -->
        <view 
          class="resize-handle bottom-right"
          @touchstart.stop.prevent="onResizeStart($event, 'right')"
          @touchmove.stop.prevent="onResizeMove($event)"
          @touchend.stop="onResizeEnd"
          @mousedown.stop.prevent="onResizeMouseDown($event, 'right')"
          title="按住缩放窗口"
        />
      </view>
    </template>
  </TabletLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { onLoad } from '@dcloudio/uni-app'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import FlashCard from '@/components/FlashCard.vue'
import { isSubjectIconKey, getLegacySubjectIcon } from '@/utils/subjectIcon'
import { useBlockStore, type KnowledgeBlock } from '@/store/useBlockStore'
import { useSubjectStore, type CatalogItem } from '@/store/useSubjectStore'
import { useAuthStore } from '@/store/useAuthStore'
import { chatWithAI } from '@/api/aiClient'
import { tabletHandwritingNotesEnabled } from '@/config/features'
import { HandwritingEngine, type Stroke, type StrokePoint } from '@/services/handwritingEngine'
import { NotebookStorage } from '@/services/notebookStorage'
import {
  fromLegacyStroke,
  toLegacyStrokes,
  upsertStroke,
  type NoteDocument,
  type NoteStroke,
} from '@/services/tabletNoteModel'
import { uuidv7 } from '@/utils/uuid'

const blockStore = useBlockStore()
const subjectStore = useSubjectStore()
const authStore = useAuthStore()

const { recentBlocks } = storeToRefs(blockStore)
const { subjects, activeSubject, activeSourceFiles } = storeToRefs(subjectStore)

// Cached window dimensions to avoid calling uni.getSystemInfoSync() in high-frequency events
const windowSize = ref({ width: 1024, height: 768 })

// Route params
const subjectId = ref<string>('')

// Panel state
const activePanel = ref<'files' | 'blocks' | 'review'>('files')
const showDrawer = ref(true)
const showAiPanel = ref(false)
const showSummarySidePanel = ref(false)
const activeFileId = ref<string | null>(null)
const activeBlockId = ref<string | null>(null)
const showCreateBlock = ref(false)

watch(activePanel, (newVal) => {
  if (newVal !== 'files') {
    showSummarySidePanel.value = false
  }
})

watch(showSummarySidePanel, (newVal) => {
  if (newVal) {
    showDrawer.value = false
    if (!currentAiSummary.value) {
      void generateAiSummary()
    }
  } else {
    showDrawer.value = true
  }
})

watch(activeFileId, () => {
  if (showSummarySidePanel.value && !currentAiSummary.value) {
    void generateAiSummary()
  }
})

const panelOptions: Array<{ key: 'files' | 'blocks' | 'review'; icon: string; label: string }> = [
  { key: 'files', icon: 'file', label: '文件' },
  { key: 'blocks', icon: 'grid', label: '知识' },
  { key: 'review', icon: 'refresh', label: '复习' }
]

// AI Chat
const chatMessages = ref<Array<{ role: 'user' | 'assistant'; content: string }>>([])
const chatInput = ref('')
const scrollToMsg = ref('')
const isStreaming = ref(false)

// AI 自由拖拽与响应式缩放浮窗状态与逻辑
const aiPos = ref({ x: -1, y: -1 })
const aiSize = ref({ width: 340, height: 480 })
const isDraggingAi = ref(false)
const dragStart = ref({ x: 0, y: 0, startLeft: 0, startTop: 0 })

const openAiWindow = () => {
  showAiPanel.value = true
  if (aiPos.value.x === -1 || aiPos.value.y === -1) {
    let winW = windowSize.value.width
    let winH = windowSize.value.height
    try {
      const sys = uni.getSystemInfoSync()
      if (sys.windowWidth) winW = sys.windowWidth
      if (sys.windowHeight) winH = sys.windowHeight
      windowSize.value = { width: winW, height: winH }
    } catch {}
    // 自适应屏幕比例计算默认尺寸 (宽约 380px，高约 520px)
    const defW = Math.min(460, Math.max(340, Math.floor(winW * 0.38)))
    const defH = Math.min(720, Math.max(480, Math.floor(winH * 0.68)))
    aiSize.value = { width: defW, height: defH }
    aiPos.value = {
      x: Math.max(20, winW - defW - 28),
      y: Math.max(30, winH - defH - 40)
    }
  }
}

const onAiTouchStart = (e: any) => {
  isDraggingAi.value = true
  const touch = e.touches ? e.touches[0] : e
  dragStart.value = {
    x: touch.clientX,
    y: touch.clientY,
    startLeft: aiPos.value.x,
    startTop: aiPos.value.y
  }
}

const onAiTouchMove = (e: any) => {
  if (!isDraggingAi.value) return
  const touch = e.touches ? e.touches[0] : e
  const deltaX = touch.clientX - dragStart.value.x
  const deltaY = touch.clientY - dragStart.value.y
  
  const winW = windowSize.value.width
  const winH = windowSize.value.height
  
  let newX = dragStart.value.startLeft + deltaX
  let newY = dragStart.value.startTop + deltaY
  
  // 限制在屏幕可见区域内
  newX = Math.max(10, Math.min(winW - 320, newX))
  newY = Math.max(10, Math.min(winH - 100, newY))
  
  aiPos.value = { x: newX, y: newY }
}

const onAiTouchEnd = () => {
  isDraggingAi.value = false
}

const onAiMouseDown = (e: MouseEvent) => {
  isDraggingAi.value = true
  dragStart.value = {
    x: e.clientX,
    y: e.clientY,
    startLeft: aiPos.value.x,
    startTop: aiPos.value.y
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('mousemove', onAiMouseMove)
    window.addEventListener('mouseup', onAiMouseUp)
  }
}

const onAiMouseMove = (e: MouseEvent) => {
  if (!isDraggingAi.value) return
  const deltaX = e.clientX - dragStart.value.x
  const deltaY = e.clientY - dragStart.value.y
  
  const winW = windowSize.value.width
  const winH = windowSize.value.height
  
  let newX = dragStart.value.startLeft + deltaX
  let newY = dragStart.value.startTop + deltaY
  
  newX = Math.max(10, Math.min(winW - 320, newX))
  newY = Math.max(10, Math.min(winH - 100, newY))
  
  aiPos.value = { x: newX, y: newY }
}

const onAiMouseUp = () => {
  isDraggingAi.value = false
  if (typeof window !== 'undefined') {
    window.removeEventListener('mousemove', onAiMouseMove)
    window.removeEventListener('mouseup', onAiMouseUp)
  }
}

// 左右下角响应式拖拽缩放逻辑
const isResizingAi = ref(false)
const resizeDir = ref<'left' | 'right'>('right')
const resizeStart = ref({ x: 0, y: 0, startW: 0, startH: 0, startX: 0, startY: 0 })

const onResizeStart = (e: any, dir: 'left' | 'right') => {
  isResizingAi.value = true
  resizeDir.value = dir
  const touch = e.touches ? e.touches[0] : e
  resizeStart.value = {
    x: touch.clientX,
    y: touch.clientY,
    startW: aiSize.value.width,
    startH: aiSize.value.height,
    startX: aiPos.value.x,
    startY: aiPos.value.y
  }
}

const onResizeMove = (e: any) => {
  if (!isResizingAi.value) return
  const touch = e.touches ? e.touches[0] : e
  const deltaX = touch.clientX - resizeStart.value.x
  const deltaY = touch.clientY - resizeStart.value.y
  
  const winW = windowSize.value.width
  const winH = windowSize.value.height
  
  const minW = 320
  const maxW = winW - 20
  const minH = 380
  const maxH = winH - 20
  
  let newH = resizeStart.value.startH + deltaY
  newH = Math.max(minH, Math.min(maxH, newH))
  
  if (resizeDir.value === 'right') {
    let newW = resizeStart.value.startW + deltaX
    newW = Math.max(minW, Math.min(maxW - aiPos.value.x, newW))
    aiSize.value = { width: newW, height: newH }
  } else {
    let newW = resizeStart.value.startW - deltaX
    let newX = resizeStart.value.startX + deltaX
    
    const rightBound = resizeStart.value.startX + resizeStart.value.startW
    if (newW < minW) {
      newW = minW
      newX = rightBound - minW
    } else if (newX < 10) {
      newX = 10
      newW = rightBound - 10
    }
    
    aiSize.value = { width: newW, height: newH }
    aiPos.value = { x: newX, y: aiPos.value.y }
  }
}

const onResizeEnd = () => {
  isResizingAi.value = false
}

const onResizeMouseDown = (e: MouseEvent, dir: 'left' | 'right') => {
  isResizingAi.value = true
  resizeDir.value = dir
  resizeStart.value = {
    x: e.clientX,
    y: e.clientY,
    startW: aiSize.value.width,
    startH: aiSize.value.height,
    startX: aiPos.value.x,
    startY: aiPos.value.y
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('mousemove', onResizeMouseMove)
    window.addEventListener('mouseup', onResizeMouseUp)
  }
}

const onResizeMouseMove = (e: MouseEvent) => {
  if (!isResizingAi.value) return
  const deltaX = e.clientX - resizeStart.value.x
  const deltaY = e.clientY - resizeStart.value.y
  
  const winW = windowSize.value.width
  const winH = windowSize.value.height
  
  const minW = 320
  const maxW = winW - 20
  const minH = 380
  const maxH = winH - 20
  
  let newH = resizeStart.value.startH + deltaY
  newH = Math.max(minH, Math.min(maxH, newH))
  
  if (resizeDir.value === 'right') {
    let newW = resizeStart.value.startW + deltaX
    newW = Math.max(minW, Math.min(maxW - aiPos.value.x, newW))
    aiSize.value = { width: newW, height: newH }
  } else {
    let newW = resizeStart.value.startW - deltaX
    let newX = resizeStart.value.startX + deltaX
    
    const rightBound = resizeStart.value.startX + resizeStart.value.startW
    if (newW < minW) {
      newW = minW
      newX = rightBound - minW
    } else if (newX < 10) {
      newX = 10
      newW = rightBound - 10
    }
    
    aiSize.value = { width: newW, height: newH }
    aiPos.value = { x: newX, y: aiPos.value.y }
  }
}

const onResizeMouseUp = () => {
  isResizingAi.value = false
  if (typeof window !== 'undefined') {
    window.removeEventListener('mousemove', onResizeMouseMove)
    window.removeEventListener('mouseup', onResizeMouseUp)
  }
}

// New block form
const newBlock = ref({
  title: '',
  preview: '',
  source: '',
  difficulty: 'medium' as 'easy' | 'medium' | 'hard'
})

const difficultyOptions: Array<{ value: 'easy' | 'medium' | 'hard'; label: string }> = [
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' }
]

// Computed
const subjectBlocks = computed(() => {
  if (!subjectId.value) return recentBlocks.value
  return recentBlocks.value.filter(b => b.subjectId === subjectId.value)
})

const selectedBlock = computed(() => {
  if (!activeBlockId.value) return null
  return recentBlocks.value.find(b => b.id === activeBlockId.value) || null
})

const visibleSourceFiles = computed(() => {
  return activeSourceFiles.value.filter(file => tabletHandwritingNotesEnabled || !isHandwritingNoteFile(file))
})

const filesPanelEmptyHint = computed(() => {
  return tabletHandwritingNotesEnabled
    ? '点击「+ 导入」或「+ 笔记」开始建立知识体系'
    : '点击「+ 导入」开始建立知识体系'
})

const selectedFile = computed(() => {
  if (!activeFileId.value) return null
  return visibleSourceFiles.value.find(f => f.id === activeFileId.value) || null
})

const catalog = computed<CatalogItem[]>(() => {
  if (!activeFileId.value) return []
  const file = visibleSourceFiles.value.find(f => f.id === activeFileId.value)
  if (!file?.catalog_json) return []
  try {
    return JSON.parse(file.catalog_json)
  } catch {
    return []
  }
})

// Methods
const goBack = () => {
  uni.navigateBack()
}

const getFileIcon = (type: string): string => {
  if (!type) return '□'
  if (type === 'handwriting/note') return '✎'
  if (type.includes('pdf')) return '■'
  if (type.includes('image') || type.includes('png') || type.includes('jpg')) return '◇'
  if (type.includes('doc') || type.includes('txt') || type.includes('note') || type.includes('md') || type.includes('markdown')) return '∿'
  if (type.includes('ppt')) return '⊞'
  return '□'
}

const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes < 1024) return (bytes || 0) + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}

const formatTime = (time: string | number): string => {
  if (!time) return ''
  try {
    const d = new Date(time)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
    return d.toLocaleDateString()
  } catch {
    return String(time)
  }
}

const selectBlock = (block: KnowledgeBlock) => {
  activeBlockId.value = block.id
  activeFileId.value = null
  showCreateBlock.value = false
}

const selectFile = (file: any) => {
  if (isHandwritingNoteFile(file)) {
    if (tabletHandwritingNotesEnabled) {
      openHandwritingNoteFile(file)
    }
    return
  }

  activeFileId.value = file.id
  activeBlockId.value = null
  showCreateBlock.value = false
  void initFileHandwriting()
}

function isHandwritingNoteFile(file: any) {
  return file?.file_type === 'handwriting/note' || String(file?.file_path || '').startsWith('local://tablet-note/')
}

const openHandwritingNoteFile = (file: any) => {
  const noteId = String(file?.file_path || '').replace('local://tablet-note/', '')
  if (!noteId) return
  uni.navigateTo({
    url: `/pages/tablet/handwriting/index?id=${encodeURIComponent(noteId)}`
  })
}

const isImageFileType = (type: string) => {
  if (!type) return false
  const lower = type.toLowerCase()
  return lower.includes('image') || lower.includes('jpg') || lower.includes('png') || lower.includes('jpeg') || lower.includes('gif')
}

const isPdfFileType = (file: any) => {
  return file?.file_type?.toLowerCase().includes('pdf') || file?.name?.toLowerCase().endsWith('.pdf') || false
}

// -------------------------------------------------------------
// 文件大屏手写标注与涂鸦引擎 (File Handwriting Annotation Engine)
// -------------------------------------------------------------
const hwTool = ref<'none' | 'pen' | 'highlighter' | 'eraser'>('none')
const hwColor = ref('#1C1C1A')
const hwSize = ref(4)
const fileCanvasRef = ref<HTMLCanvasElement | null>(null)
let fileHwEngine: HandwritingEngine | null = null
let fileActiveStroke: NoteStroke | null = null
let isFileDrawing = false
let fileAnnotationInitSeq = 0

const fileAnnotationDocs = ref<Record<string, NoteDocument>>({})

const initFileHandwriting = async () => {
  if (!tabletHandwritingNotesEnabled) return

  const currentId = activeFileId.value
  const currentFile = selectedFile.value
  if (!currentId || !currentFile || !subjectId.value) return

  const seq = ++fileAnnotationInitSeq
  const document = await NotebookStorage.loadOrCreateAssetAnnotation(subjectId.value, currentId, currentFile.name)
  fileAnnotationDocs.value = {
    ...fileAnnotationDocs.value,
    [currentId]: document,
  }

  await nextTick()
  if (seq !== fileAnnotationInitSeq || activeFileId.value !== currentId || !fileCanvasRef.value) return

  const canvas = fileCanvasRef.value
  const rect = canvas.getBoundingClientRect()
  if (rect.width && rect.height) {
    canvas.width = rect.width
    canvas.height = rect.height
  } else {
    canvas.width = 1200
    canvas.height = 1600
  }
  const ctx = canvas.getContext('2d')
  if (ctx) {
    fileHwEngine = new HandwritingEngine(ctx)
    fileHwEngine.loadStrokes(toLegacyStrokes(document))
  }
}

const syncFileAnnotationFromEngine = (): NoteDocument | null => {
  const currentId = activeFileId.value
  if (!currentId || !fileHwEngine) return null

  const document = fileAnnotationDocs.value[currentId]
  if (!document) return null

  const now = new Date().toISOString()
  const nextDocument: NoteDocument = {
    ...document,
    strokes: fileHwEngine.getStrokes().map(stroke => {
      const noteStroke = stroke as NoteStroke
      return noteStroke.createdAt ? noteStroke : fromLegacyStroke(stroke, now)
    }),
    updatedAt: now,
  }

  fileAnnotationDocs.value = {
    ...fileAnnotationDocs.value,
    [currentId]: nextDocument,
  }
  return nextDocument
}

const saveFileAnnotation = async (document: NoteDocument | null) => {
  if (!document) return
  await NotebookStorage.saveNoteDocument(document)
}

const getFileCanvasPoint = (e: PointerEvent): StrokePoint => {
  const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
    pressure: e.pressure || 0.5,
    tiltX: e.tiltX || 0,
    tiltY: e.tiltY || 0,
    timestamp: Date.now()
  }
}

const putFileAnnotationDocument = (fileId: string, document: NoteDocument) => {
  fileAnnotationDocs.value = {
    ...fileAnnotationDocs.value,
    [fileId]: document,
  }
}

const addFileAnnotationStroke = (stroke: NoteStroke): NoteDocument | null => {
  const currentId = activeFileId.value
  if (!currentId) return null

  const document = fileAnnotationDocs.value[currentId]
  if (!document) return null

  const nextDocument = upsertStroke(document, stroke)
  putFileAnnotationDocument(currentId, nextDocument)
  return nextDocument
}

const clearFileAnnotationDocument = (): NoteDocument | null => {
  const currentId = activeFileId.value
  if (!currentId) return null

  const document = fileAnnotationDocs.value[currentId]
  if (!document) return null

  const nextDocument: NoteDocument = {
    ...document,
    strokes: [],
    updatedAt: new Date().toISOString(),
  }
  putFileAnnotationDocument(currentId, nextDocument)
  return nextDocument
}

watch(activeFileId, (newId) => {
  if (tabletHandwritingNotesEnabled && newId && activePanel.value === 'files') {
    void initFileHandwriting()
  }
})

const onFilePointerDown = (e: PointerEvent) => {
  if (!tabletHandwritingNotesEnabled) return
  if (!fileHwEngine || hwTool.value === 'none') return
  isFileDrawing = true
  e.preventDefault()

  const pt = getFileCanvasPoint(e)

  if (hwTool.value === 'eraser') {
    fileHwEngine.erase([pt], 24)
  } else {
    fileActiveStroke = {
      id: uuidv7(),
      points: [pt],
      tool: hwTool.value as Stroke['tool'],
      color: hwColor.value,
      size: hwSize.value,
      createdAt: new Date().toISOString(),
    }
  }
}

const onFilePointerMove = (e: PointerEvent) => {
  if (!tabletHandwritingNotesEnabled) return
  if (!isFileDrawing || !fileHwEngine || hwTool.value === 'none') return
  e.preventDefault()

  const events = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : [e]
  const newPoints: StrokePoint[] = events.map((ev: PointerEvent) => getFileCanvasPoint(ev))

  if (hwTool.value === 'eraser') {
    fileHwEngine.erase(newPoints, 24)
  } else if (fileActiveStroke) {
    fileActiveStroke.points.push(...newPoints)
    fileHwEngine.render()
    const ctx = fileCanvasRef.value?.getContext('2d')
    if (ctx) {
      ctx.beginPath()
      const pts = fileActiveStroke.points
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.strokeStyle = fileActiveStroke.color
      ctx.lineWidth = fileActiveStroke.size
      ctx.lineCap = 'round'
      ctx.stroke()
    }
  }
}

const onFilePointerUp = (e: PointerEvent) => {
  if (!tabletHandwritingNotesEnabled) return
  if (!isFileDrawing || !fileHwEngine || hwTool.value === 'none') return
  isFileDrawing = false

  if (fileActiveStroke && hwTool.value !== 'eraser') {
    fileHwEngine.addStroke(fileActiveStroke)
    void saveFileAnnotation(addFileAnnotationStroke(fileActiveStroke))
    fileActiveStroke = null
    return
  }

  if (hwTool.value === 'eraser') {
    void saveFileAnnotation(syncFileAnnotationFromEngine())
  }
}

const hwUndo = () => {
  if (!tabletHandwritingNotesEnabled) return
  if (fileHwEngine) {
    fileHwEngine.undo()
    void saveFileAnnotation(syncFileAnnotationFromEngine())
  }
}

const hwClear = () => {
  if (!tabletHandwritingNotesEnabled) return
  if (fileHwEngine) {
    fileHwEngine.loadStrokes([])
    void saveFileAnnotation(clearFileAnnotationDocument())
  }
}

const previewImage = (url: string) => {
  if (!url) return
  uni.previewImage({
    urls: [url],
    current: url
  })
}

const askAiAboutFile = (file: any) => {
  openAiWindow()
  askAi(`请帮我深度解读学习材料《${file.name}》，梳理出最重要的核心考点和知识架构。`)
}

const askAiAboutSection = (chapterTitle: string, sectionTitle: string) => {
  openAiWindow()
  askAi(`请帮我深度讲解《${chapterTitle}》中「${sectionTitle}」这个知识点的核心内涵、常考题型和易错注意点。`)
}

const extractFileToBlock = (file: any) => {
  const subject = activeSubject.value
  uni.showModal({
    title: '提炼为知识块',
    content: `确认将《${file.name}》作为核心学习卡片归类至本学科知识库吗？`,
    success: async (res) => {
      if (res.confirm) {
        await blockStore.addBlock({
          subject: subject?.name || '学科材料',
          title: `材料提炼：${file.name}`,
          preview: `来源文件：${file.name} (${file.file_type || '通用材料'})。\n\n核心要点记录：\n1. 已建立材料关联，可直接点击左侧材料面板查看完整构架。\n2. 建议通过 AI 深度伴读提炼具体章节要点并补充至此卡片。`,
          source: file.name,
          color: subject?.color || '#7D9372',
          subjectId: subjectId.value,
          difficulty: 'medium',
          mastery: 0
        })
        uni.showToast({ title: '已成功存入知识库', icon: 'success' })
      }
    }
  })
}

const openExternalDocument = (file: any) => {
  if (!file || !file.file_path) return
  if (file.file_path.startsWith('http') || file.file_path.startsWith('file:') || file.file_path.startsWith('/') || file.file_path.startsWith('wxfile:')) {
    uni.showLoading({ title: '正在准备打开...' })
    uni.openDocument({
      filePath: file.file_path,
      success: () => uni.hideLoading(),
      fail: () => {
        uni.hideLoading()
        uni.showToast({ title: '当前平台环境不支持直接外部打开，请阅读上方智能导读或向 AI 提问', icon: 'none' })
      }
    })
  } else {
    uni.showToast({ title: '此为离线笔记或草稿，请直接查看页面导读与大纲', icon: 'none' })
  }
}

const handleAddFile = () => {
  uni.chooseImage({
    count: 1,
    success: (res) => {
      const file = (Array.isArray(res.tempFiles) ? res.tempFiles[0] : res.tempFiles) as any
      if (subjectId.value) {
        subjectStore.addSourceFile(
          subjectId.value,
          file.name || '未命名文件',
          file.path,
          file.type || 'image/jpeg',
          file.size
        )
        uni.showToast({ title: '文件已添加', icon: 'success' })
      }
    }
  })
}

const handleDeleteFile = async (id: string) => {
  uni.showModal({
    title: '确认删除',
    content: '删除文件',
    success: async (res) => {
      if (res.confirm) {
        await subjectStore.deleteSourceFile(id)
        if (activeFileId.value === id) {
          activeFileId.value = null
        }
        uni.showToast({ title: '已删除', icon: 'success' })
      }
    }
  })
}

const handleCreateBlock = async () => {
  if (!newBlock.value.title.trim()) {
    uni.showToast({ title: '请输入标题', icon: 'none' })
    return
  }
  const subject = activeSubject.value
  await blockStore.addBlock({
    subject: subject?.name || '未分类',
    title: newBlock.value.title,
    preview: newBlock.value.preview,
    source: newBlock.value.source,
    color: subject?.color || '#6d635b',
    subjectId: subjectId.value,
    difficulty: newBlock.value.difficulty,
    mastery: 0
  })
  showCreateBlock.value = false
  newBlock.value = { title: '', preview: '', source: '', difficulty: 'medium' }
  uni.showToast({ title: '知识块已创建', icon: 'success' })
}

const editBlock = (block: KnowledgeBlock) => {
  uni.showModal({
    title: '编辑知识块',
    content: `标题: ${block.title}\n\n编辑功能开发中...`,
    showCancel: false
  })
}

const deleteBlock = async (id: string) => {
  uni.showModal({
    title: '确认删除',
    content: '删除后不可恢复',
    success: async (res) => {
      if (res.confirm) {
        await blockStore.removeBlock(id)
        activeBlockId.value = null
        uni.showToast({ title: '已删除', icon: 'success' })
      }
    }
  })
}

// AI Chat
const sendMessage = async () => {
  const text = chatInput.value.trim()
  if (!text || isStreaming.value) return

  chatMessages.value.push({ role: 'user', content: text })
  chatInput.value = ''
  isStreaming.value = true

  const assistantIdx = chatMessages.value.length
  chatMessages.value.push({ role: 'assistant', content: '' })

  await nextTick()
  scrollToMsg.value = 'msg-' + assistantIdx

  try {
    await chatWithAI(text, chatMessages.value.slice(0, -1), (chunk) => {
      chatMessages.value[assistantIdx].content += chunk
      nextTick(() => {
        scrollToMsg.value = 'msg-' + assistantIdx
      })
    })
  } catch (e: any) {
    chatMessages.value[assistantIdx].content = '抱歉，发生了错误: ' + (e.message || '未知错误')
  } finally {
    isStreaming.value = false
  }
}

const askAi = (prompt: string) => {
  chatInput.value = prompt
  sendMessage()
}

// 参照独立 AI 页：模型切换、富文本解析、复制与知识块提炼
const isAiInputFocused = ref(false)
const currentModel = ref('通用模式')
const isModelMenuOpen = ref(false)
const isActionOpen = ref(false)

const modelOptions = [
  { id: 1, icon: '✦', label: '学霸模式', desc: '深度推演与严谨解析', welcomeDesc: '深度严谨，逻辑清晰，为你推演每道难题' },
  { id: 2, icon: '◈', label: '通用模式', desc: '全能助手与问答探索', welcomeDesc: '今天想探索点什么？' },
  { id: 3, icon: '✧', label: '翻译模式', desc: '学术润色与精准翻译', welcomeDesc: '精准翻译，流畅润色，打造地道学术语篇' },
]

const currentModelObj = computed(() => {
  return modelOptions.find(m => m.label === currentModel.value) || modelOptions[1]
})

const presetPrompts = [
  '帮我总结这个学科的核心知识点',
  '生成一组考点复习与自测题目',
  '梳理本章节思维导图与结构大纲',
  '分析当前知识块与复习进度的关联'
]

// 基础 HTML 转义，防止 AI 返回内容中的 XSS 注入
const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const formatMarkdown = (text: string) => {
  if (!text) return ''
  const lines = text.split('\n')
  const htmlLines = []
  for (let line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('### ')) {
      htmlLines.push(`<h3 style="font-size: 30rpx; font-weight: 700; margin: 14rpx 0 8rpx; color: #1C1C1A;">${escapeHtml(trimmed.slice(4))}</h3>`)
      continue
    }
    if (trimmed.startsWith('## ')) {
      htmlLines.push(`<h2 style="font-size: 32rpx; font-weight: 700; margin: 18rpx 0 10rpx; color: #1C1C1A; border-bottom: 1rpx solid #E6E6E4; padding-bottom: 6rpx;">${escapeHtml(trimmed.slice(3))}</h2>`)
      continue
    }
    if (trimmed.startsWith('# ')) {
      htmlLines.push(`<h1 style="font-size: 34rpx; font-weight: 700; margin: 22rpx 0 14rpx; color: #1C1C1A;">${escapeHtml(trimmed.slice(2))}</h1>`)
      continue
    }
    if (trimmed.startsWith('> ')) {
      htmlLines.push(`<blockquote style="border-left: 6rpx solid #A8A8A5; padding-left: 16rpx; margin: 12rpx 0; color: #6d635b; font-style: italic;">${escapeHtml(trimmed.slice(2))}</blockquote>`)
      continue
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const content = escapeHtml(trimmed.slice(2))
      htmlLines.push(`<div style="display:flex;align-items:flex-start;margin:8rpx 0;padding-left:10rpx;"><span style="color:#7D9372;margin-right:10rpx;font-weight:bold;">•</span><div style="flex:1;font-size:28rpx;color:#1C1C1A;">${content}</div></div>`)
      continue
    }
    const numMatch = trimmed.match(/^(\d+)\.\s(.*)/)
    if (numMatch) {
      htmlLines.push(`<div style="display:flex;align-items:flex-start;margin:8rpx 0;padding-left:10rpx;"><span style="color:#7D9372;margin-right:10rpx;font-weight:bold;">${numMatch[1]}.</span><div style="flex:1;font-size:28rpx;color:#1C1C1A;">${escapeHtml(numMatch[2])}</div></div>`)
      continue
    }
    if (trimmed === '') {
      htmlLines.push('<div style="height:10rpx;"></div>')
    } else {
      htmlLines.push(`<div style="margin-bottom:6rpx;min-height:34rpx;">${escapeHtml(line)}</div>`)
    }
  }
  let formatted = htmlLines.join('')
  // Bold and code formatting applied after escaping (safe: only wraps already-escaped content)
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight:700;color:#1C1C1A;">$1</strong>')
  formatted = formatted.replace(/`(.*?)`/g, '<code style="font-family:monospace;background:#f0f0ee;padding:2rpx 8rpx;border-radius:6rpx;font-size:26rpx;color:#7D9372;border:1rpx solid #E6E6E4;">$1</code>')
  return `<div style="line-height:1.6;font-size:28rpx;color:#1C1C1A;">${formatted}</div>`
}

const copyText = (text: string) => {
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '已复制', icon: 'none' })
  })
}

const extractToBlock = (content: string) => {
  const subject = activeSubject.value
  uni.showModal({
    title: '提炼为知识块',
    content: '确认将此回复提炼并保存至当前知识库吗？',
    success: async (res) => {
      if (res.confirm) {
        await blockStore.addBlock({
          subject: subject?.name || 'AI 伴读',
          title: 'AI 重点考点提炼',
          preview: content,
          source: 'AI 伴读浮窗',
          color: subject?.color || '#7D9372',
          subjectId: subjectId.value,
          difficulty: 'medium',
          mastery: 0
        })
        uni.showToast({ title: '已提炼至知识库', icon: 'success' })
      }
    }
  })
}

const startNewAiChat = () => {
  chatMessages.value = []
  chatInput.value = ''
}

const selectAiModel = (model: string) => {
  currentModel.value = model
  isModelMenuOpen.value = false
}

const openActionSheet = () => {
  isActionOpen.value = !isActionOpen.value
}

const onActionTap = (index: number) => {
  isActionOpen.value = false
  if (index === 0 || index === 1) {
    scanPhoto()
  } else {
    uni.showToast({ title: '请在上方知识库面板中直接点选', icon: 'none' })
  }
}

const scanPhoto = () => uni.showToast({ title: '相机调起中...', icon: 'none' })
const startVoice = () => uni.showToast({ title: '正在录制语音...', icon: 'none' })

// --- NOTES & SUMMARY LOGIC ---
const handleCreateNote = () => {
  if (!tabletHandwritingNotesEnabled) return

  uni.showModal({
    title: '新建学科笔记',
    editable: true,
    placeholderText: '请输入笔记标题，如：核心定理推导',
    success: async (res) => {
      if (res.confirm && res.content) {
        if (subjectId.value) {
          const note = NotebookStorage.createSubjectHandwritingNote(subjectId.value, res.content)
          const saved = await NotebookStorage.saveNoteDocument(note)
          if (!saved) {
            uni.showToast({ title: '笔记创建失败', icon: 'none' })
            return
          }

          await subjectStore.addSourceFile(
            subjectId.value,
            `${note.title}.note`,
            `local://tablet-note/${note.id}`,
            'handwriting/note',
            0
          )
          uni.showToast({ title: '学科笔记已建立', icon: 'success' })
          uni.navigateTo({
            url: `/pages/tablet/handwriting/index?id=${encodeURIComponent(note.id)}`
          })
        }
      }
    }
  })
}

const aiSummaryMap = ref<Record<string, string>>({})

const currentAiSummary = computed(() => {
  const key = activeFileId.value || 'subject'
  return aiSummaryMap.value[key] || ''
})

const selectSummarySubject = () => {
  activeFileId.value = null
  activeBlockId.value = null
  showCreateBlock.value = false
}

const selectSummaryFile = (file: any) => {
  activeFileId.value = file.id
  activeBlockId.value = null
  showCreateBlock.value = false
  void initFileHandwriting()
}

const generateAiSummary = async () => {
  const key = activeFileId.value || 'subject'
  const targetName = activeFileId.value ? (selectedFile.value?.name || '当前材料') : (activeSubject.value?.name || '当前学科')
  uni.showLoading({ title: 'AI 智能提炼中...' })
  try {
    await new Promise(r => setTimeout(r, 1200))
    if (!activeFileId.value) {
      aiSummaryMap.value[key] = `《${targetName}》全科知识架构概览与核心体系要点：\n\n1. 基础认知层：深度解析核心概念定义与基础公理，构建完整学科思维脑图架构。\n2. 逻辑进阶层：掌握关键公式定理推导逻辑与典型解错模式，梳理跨章节联动关系。\n3. 重点难点分析：精炼高频易混淆考点与典型真题解构模型，建议配合复习卡片进行巩固。`
    } else {
      aiSummaryMap.value[key] = `《${targetName}》重点导读与精炼要点总结：\n\n1. 核心论点与概要：精准提炼本篇资料中心思想、基础定义与关键公式结论。\n2. 重难点考向剖析：针对重点段落与图表深入解析，提炼典型问题解决模型。\n3. 延伸学习建议：建议结合左侧大纲结构精读具体章节，并可通过「AI 伴读」深入解惑。`
    }
    uni.hideLoading()
    uni.showToast({ title: '总结提纲已生成', icon: 'success' })
  } catch {
    uni.hideLoading()
  }
}

const toggleSummarySidePanel = () => {
  showSummarySidePanel.value = !showSummarySidePanel.value
}

const closeSummarySidePanel = () => {
  showSummarySidePanel.value = false
}

const extractSummaryToBlock = () => {
  if (!currentAiSummary.value || !activeSubject.value) return
  const title = activeFileId.value ? `${selectedFile.value?.name || '当前材料'} AI 总结` : `${activeSubject.value?.name || '学科'} 全科概览总结`
  subjectStore.createBlock(activeSubject.value.id, {
    title,
    preview: currentAiSummary.value,
    source: activeFileId.value ? selectedFile.value?.name : '全科总结',
    color: activeSubject.value?.color || '#7D9372',
    tags: ['AI总结', '提纲'],
    difficulty: 'medium'
  })
  uni.showToast({ title: '已归纳至知识块', icon: 'success' })
}

// --- REVIEW LOGIC ---
const sessionQueue = ref<any[]>([])
const currentIndex = ref(0)
const isFlipped = ref(false)
const completedCount = ref(0)
const historyStack = ref<any[]>([])

const startX = ref(0)
const startY = ref(0)
const deltaX = ref(0)
const deltaY = ref(0)
const isDragging = ref(false)
const flyDirection = ref<'left' | 'right' | 'up' | 'down' | null>(null)
const animateReset = ref(false)
const animateFly = ref(false)

const resetReview = () => {
  sessionQueue.value = [...subjectBlocks.value]
  currentIndex.value = 0
  completedCount.value = 0
  isFlipped.value = false
  historyStack.value = []
  resetDrag()
}

const remainingCount = computed(() => {
  if (currentIndex.value >= sessionQueue.value.length) return 0
  return sessionQueue.value.length - currentIndex.value
})

const masteryRate = computed(() => {
  const blocks = subjectBlocks.value
  if (blocks.length === 0) return 0
  const total = blocks.reduce((acc, curr) => acc + (curr.mastery || 0), 0)
  return Math.round(total / blocks.length)
})

const activeCard = computed(() => {
  if (currentIndex.value < 0 || currentIndex.value >= sessionQueue.value.length) {
    return null
  }
  return sessionQueue.value[currentIndex.value]
})

const activeCardStyle = computed(() => {
  if (animateReset.value) {
    return {
      transform: 'translate3d(0, 0, 0) rotate(0deg)',
      transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.2), opacity 0.4s'
    }
  }
  if (animateFly.value) {
    let dest = 'translate3d(0, 0, 0)'
    if (flyDirection.value === 'left') dest = 'translate3d(-150vw, 0, 0) rotate(-45deg)'
    else if (flyDirection.value === 'right') dest = 'translate3d(150vw, 0, 0) rotate(45deg)'
    else if (flyDirection.value === 'up') dest = 'translate3d(0, -150vh, 0)'
    else if (flyDirection.value === 'down') dest = 'translate3d(0, 150vh, 0)'
    return {
      transform: dest,
      opacity: '0',
      transition: 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.35s'
    }
  }
  if (isDragging.value) {
    const rot = deltaX.value * 0.05
    return {
      transform: `translate3d(${deltaX.value}px, ${deltaY.value}px, 0) rotate(${rot}deg)`,
      transition: 'none'
    }
  }
  return {
    transform: 'translate3d(0, 0, 0) rotate(0deg)',
    transition: 'none'
  }
})

const stampOpacity = computed(() => {
  const threshold = 60
  const maxDist = 180
  const getOpacity = (val: number) => {
    if (val <= threshold) return 0
    return Math.min((val - threshold) / (maxDist - threshold), 1)
  }
  const absX = Math.abs(deltaX.value)
  const absY = Math.abs(deltaY.value)
  const stampValues = { up: 0, down: 0, left: 0, right: 0 }
  if (!isDragging.value) return stampValues
  if (absX > absY) {
    if (deltaX.value < 0) stampValues.left = getOpacity(absX)
    else stampValues.right = getOpacity(absX)
  } else {
    if (deltaY.value < 0) stampValues.up = getOpacity(absY)
    else stampValues.down = getOpacity(absY)
  }
  return stampValues
})

const onTouchStart = (e: TouchEvent) => {
  if (animateReset.value || animateFly.value) return
  const touch = e.touches[0]
  startX.value = touch.clientX
  startY.value = touch.clientY
  deltaX.value = 0
  deltaY.value = 0
  isDragging.value = true
}

const onTouchMove = (e: TouchEvent) => {
  if (!isDragging.value) return
  const touch = e.touches[0]
  deltaX.value = touch.clientX - startX.value
  deltaY.value = touch.clientY - startY.value
}

const onTouchEnd = () => {
  if (!isDragging.value) return
  isDragging.value = false
  const threshold = 100
  const absX = Math.abs(deltaX.value)
  const absY = Math.abs(deltaY.value)
  if (absX < threshold && absY < threshold) {
    triggerResetAnimation()
    return
  }
  if (absX > absY) {
    if (deltaX.value < 0) triggerFlyAnimation('left')
    else {
      if (historyStack.value.length > 0) triggerFlyAnimation('right')
      else triggerResetAnimation()
    }
  } else {
    if (deltaY.value < 0) triggerFlyAnimation('up')
    else triggerFlyAnimation('down')
  }
}

const resetDrag = () => {
  deltaX.value = 0
  deltaY.value = 0
  isDragging.value = false
  animateReset.value = false
  animateFly.value = false
  flyDirection.value = null
}

const triggerResetAnimation = () => {
  animateReset.value = true
  setTimeout(() => { resetDrag() }, 400)
}

const triggerFlyAnimation = (dir: 'left' | 'right' | 'up' | 'down') => {
  flyDirection.value = dir
  animateFly.value = true
  setTimeout(() => {
    handleSwipeAction(dir)
    resetDrag()
  }, 350)
}

const handleSwipeAction = async (dir: 'left' | 'right' | 'up' | 'down') => {
  const card = activeCard.value
  if (!card) return
  if (dir === 'right') {
    const lastAction = historyStack.value.pop()
    if (lastAction) {
      currentIndex.value = Math.max(0, currentIndex.value - 1)
      if (lastAction.requeued) sessionQueue.value.pop()
      if (lastAction.actionType === 'mastered') completedCount.value = Math.max(0, completedCount.value - 1)
      await blockStore.updateBlock({
        ...sessionQueue.value[currentIndex.value],
        mastery: lastAction.prevMastery
      })
    }
    isFlipped.value = false
    return
  }
  let actionType: 'mastered' | 'retry' | 'skip' = 'skip'
  let requeued = false
  const prevMastery = card.mastery || 50
  if (dir === 'up') {
    actionType = 'mastered'
    completedCount.value++
    const newMastery = Math.min(prevMastery + 15, 100)
    await blockStore.updateBlock({ ...card, mastery: newMastery, difficulty: 'easy' })
  } else if (dir === 'down') {
    actionType = 'retry'
    requeued = true
    const newMastery = Math.max(prevMastery - 15, 10)
    await blockStore.updateBlock({ ...card, mastery: newMastery, difficulty: 'hard' })
    sessionQueue.value.push({ ...card, mastery: newMastery })
  } else if (dir === 'left') {
    actionType = 'skip'
  }
  historyStack.value.push({ blockId: card.id, prevMastery, actionType, requeued })
  currentIndex.value++
  isFlipped.value = false
}

watch(activePanel, (val) => {
  if (val === 'review' && sessionQueue.value.length === 0) {
    resetReview()
  }
})

// Load data on page mount
onLoad((options) => {
  if (options?.id) {
    subjectId.value = options.id
    subjectStore.setActiveSubject(options.id)
  }
})

onMounted(async () => {
  await NotebookStorage.initSchema()

  // 缓存窗口尺寸，避免在 touchmove/mousemove 高频事件中重复调用 getSystemInfoSync()
  try {
    const sys = uni.getSystemInfoSync()
    windowSize.value = { width: sys.windowWidth || 1024, height: sys.windowHeight || 768 }
  } catch (e) {}

  await subjectStore.loadSubjects()
  // 只调用一次 fetchBlocks：有 subjectId 时按学科过滤，否则全量
  await blockStore.fetchBlocks(undefined, subjectId.value || undefined)
  if (subjectId.value) {
    await subjectStore.loadSourceFiles(subjectId.value)
    if (activePanel.value === 'files' && visibleSourceFiles.value.length > 0 && !activeFileId.value && !activeBlockId.value) {
      selectFile(visibleSourceFiles.value[0])
    }
  }
})

// 清理 window 事件监听，防止组件卸载后内存泄漏
onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('mousemove', onAiMouseMove)
    window.removeEventListener('mouseup', onAiMouseUp)
    window.removeEventListener('mousemove', onResizeMouseMove)
    window.removeEventListener('mouseup', onResizeMouseUp)
  }
})
</script>

<style scoped>
.t-workspace {
  display: flex;
  width: 100%;
  height: 100%;
  background: var(--color-zen-ivory, #F9F9F7);
  padding: 24rpx;
  box-sizing: border-box;
  gap: 24rpx;
  position: relative;
}

/* 统一侧边栏圆角浮动卡片 */
.workspace-sidebar-card {
  height: calc(100vh - 48rpx);
  background: var(--color-zen-white, #FFFFFF);
  border-radius: 36rpx;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.02);
  display: flex;
  overflow: hidden;
  flex-shrink: 0;
}

/* Tier-1 Strip */
.tier1-strip {
  width: 110rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  border-right: 1px solid var(--color-zen-hairline, #E6E6E4);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28rpx 0;
  gap: 16rpx;
}
.strip-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  padding: 16rpx 10rpx;
  border-radius: 24rpx;
  width: 80rpx;
  opacity: 0.6;
  cursor: pointer;
  transition: all 0.2s;
}
.strip-btn:hover {
  opacity: 0.9;
  background: #EEEEEC;
}
.strip-btn.active {
  opacity: 1;
  background: #7D9372;
  color: #FFFFFF;
  box-shadow: 0 6rpx 16rpx rgba(125, 147, 114, 0.3);
}
.strip-btn.active .strip-label {
  color: #FFFFFF;
}
.strip-label {
  font-size: 20rpx;
  font-weight: 700;
  color: var(--color-zen-graphite, #1C1C1A);
}
.strip-divider {
  width: 48rpx;
  height: 1px;
  background: var(--color-zen-hairline, #E6E6E4);
  margin: 8rpx 0;
}
.strip-spacer { flex: 1; }
.strip-subject {
  padding: 12rpx;
}
.subject-mini-icon {
  margin-right: 8rpx;
  font-size: 32rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Tier-2 Drawer (响应式宽度架构) */
.tier2-drawer {
  width: 440rpx;
  min-width: 380rpx;
  max-width: 45vw;
  background: var(--color-zen-white, #FFFFFF);
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  flex-shrink: 0;
  transition: width 0.35s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.35s cubic-bezier(0.16, 1, 0.3, 1), max-width 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
  overflow: hidden;
  position: relative;
}
.drawer-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  box-sizing: border-box;
}
.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 28rpx;
  height: 120rpx;
  min-height: 120rpx;
  max-height: 120rpx;
  border-bottom: 1px solid var(--color-zen-hairline, #E6E6E4);
  background: var(--color-zen-white, #FFFFFF);
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden;
}
.drawer-title {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--color-zen-graphite, #1C1C1A);
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
  flex-shrink: 0;
}
.drawer-actions-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-wrap: wrap;
  justify-content: flex-end;
  min-width: 0;
}
.drawer-action {
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  font-size: 22rpx;
  font-weight: 600;
  color: var(--color-zen-graphite, #1C1C1A);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.drawer-action:hover {
  background: #f0f0ee;
}
.drawer-scroll {
  flex: 1;
  height: 0;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding: 12rpx;
  box-sizing: border-box;
  overflow: hidden;
}
.drawer-empty {
  padding: 60rpx 20rpx;
  text-align: center;
  color: var(--color-zen-stone, #A8A8A5);
  font-size: 26rpx;
}
.drawer-hint {
  font-size: 22rpx;
  display: block;
  margin-top: 8rpx;
}

/* 响应式文件列表项 (Zen Minimalist) */
.file-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 22rpx 24rpx;
  border-radius: 28rpx;
  margin-bottom: 16rpx;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  border: 1px solid transparent;
  background: var(--color-zen-ivory, #F9F9F7);
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden;
}
.file-item:hover {
  background: #EEEEEC;
  transform: translateY(-2rpx);
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.04);
}
.file-item.active {
  background: rgba(125, 147, 114, 0.14);
  border-color: #7D9372;
  box-shadow: 0 6rpx 16rpx rgba(125, 147, 114, 0.15);
}
.file-icon { font-size: 32rpx; flex-shrink: 0; }
.file-info { flex: 1; min-width: 0; max-width: 100%; display: flex; flex-direction: column; gap: 4rpx; overflow: hidden; }
.file-name {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--color-zen-graphite, #1C1C1A);
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  word-break: break-all;
}
.file-meta {
  font-size: 22rpx;
  color: var(--color-zen-stone, #A8A8A5);
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-delete {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background: var(--color-zen-ivory, #F9F9F7);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-zen-stone, #A8A8A5);
  opacity: 0.6;
  flex-shrink: 0;
  transition: all 0.2s;
}
.file-item:hover .file-delete,
.file-item.active .file-delete { opacity: 1; }
.file-delete:hover { background: rgba(220, 38, 38, 0.12); color: #DC2626; }

/* 总结页面响应式大纲选择横条 */
.summary-file-selector {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  background: var(--color-zen-ivory, #F9F9F7);
  border-bottom: 1px solid var(--color-zen-hairline, #E6E6E4);
  padding: 16rpx 20rpx;
  box-sizing: border-box;
  white-space: nowrap;
  overflow: hidden;
  display: block;
}
.selector-pills {
  display: inline-flex;
  gap: 12rpx;
  align-items: center;
}
.file-pill {
  display: inline-flex;
  align-items: center;
  gap: 10rpx;
  padding: 10rpx 22rpx;
  border-radius: 999rpx;
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  font-size: 24rpx;
  color: var(--color-zen-graphite, #1C1C1A);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.file-pill:hover { background: #EEEEEC; }
.file-pill.active {
  background: #7D9372;
  color: #FFFFFF;
  border-color: #7D9372;
  box-shadow: 0 4rpx 12rpx rgba(125, 147, 114, 0.25);
}
.pill-icon { font-size: 26rpx; flex-shrink: 0; }
.pill-name { font-weight: 600; max-width: 200rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 大屏文件详情工作区 (响应式架构) */
.file-detail-workspace {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--color-zen-white, #FFFFFF);
  border-radius: 36rpx;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.02);
  overflow: hidden;
}
.file-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 36rpx;
  height: 120rpx;
  min-height: 120rpx;
  max-height: 120rpx;
  box-sizing: border-box;
  border-bottom: 1px solid var(--color-zen-hairline, #E6E6E4);
  background: var(--color-zen-white, #FFFFFF);
  flex-wrap: nowrap;
  gap: 20rpx;
  overflow: hidden;
}
.file-title-group {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  min-width: 0;
  max-width: 320rpx;
}
.detail-file-name {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--color-zen-graphite, #1C1C1A);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.detail-file-sub {
  font-size: 22rpx;
  color: var(--color-zen-stone, #A8A8A5);
}

/* 简约手写与浏览交互工具条 (Zen Minimalist Toolbar) */
.hw-mini-bar {
  display: flex;
  align-items: center;
  gap: 10rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  flex-wrap: wrap;
}
.hw-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  color: var(--color-zen-graphite, #1C1C1A);
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}
.hw-tool:hover { background: rgba(0,0,0,0.05); }
.hw-tool.active {
  background: #7D9372;
  color: #FFFFFF;
  box-shadow: 0 2rpx 8rpx rgba(125, 147, 114, 0.25);
}
.hw-tool.icon-only {
  padding: 8rpx 14rpx;
  font-size: 26rpx;
}
.hw-divider {
  width: 1px;
  height: 28rpx;
  background: var(--color-zen-hairline, #E6E6E4);
  margin: 0 4rpx;
}
.hw-colors {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 0 4rpx;
}
.hw-color-dot {
  width: 30rpx;
  height: 30rpx;
  border-radius: 50%;
  cursor: pointer;
  border: 2rpx solid transparent;
  transition: transform 0.2s;
}
.hw-color-dot:hover { transform: scale(1.15); }
.hw-color-dot.active {
  border-color: #1C1C1A;
  transform: scale(1.2);
  box-shadow: 0 0 0 2rpx #FFFFFF inset;
}

/* 右侧简约功能按钮群 (Minimalist Action Buttons) */
.minimal-actions {
  display: flex;
  align-items: center;
  gap: 14rpx;
  flex-wrap: wrap;
}
.min-btn {
  padding: 12rpx 24rpx;
  border-radius: 999rpx;
  background: transparent;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  font-size: 24rpx;
  font-weight: 500;
  color: var(--color-zen-graphite, #1C1C1A);
  cursor: pointer;
  transition: all 0.2s;
}
.min-btn:hover { background: var(--color-zen-ivory, #F9F9F7); border-color: #D6D6D4; }
.min-btn.primary {
  background: #7D9372;
  color: #FFFFFF;
  border-color: #7D9372;
}
.min-btn.primary:hover { background: #6A805E; }
.min-btn.danger {
  color: #DC2626;
  border-color: transparent;
}
.min-btn.danger:hover { background: rgba(220, 38, 38, 0.08); border-color: rgba(220, 38, 38, 0.2); }

/* 主体：照片与 PDF 呈现及可手写标注页面 */
.file-detail-body {
  flex: 1;
  height: 0;
  padding: 0;
  position: relative;
  background: #F2F2F0;
  overflow: hidden;
}
.study-stage-container {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
}
.doc-view-layer {
  width: 100%;
  height: 100%;
}
.doc-content-wrapper {
  min-height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40rpx;
  box-sizing: border-box;
}
.study-photo-img {
  max-width: 90%;
  max-height: 90%;
  border-radius: 12rpx;
  box-shadow: 0 12rpx 36rpx rgba(0,0,0,0.1);
  background: #FFFFFF;
}
.study-pdf-container, .study-doc-container {
  width: 100%;
  max-width: 1400rpx;
  min-height: 1600rpx;
  background: #FFFFFF;
  border-radius: 16rpx;
  box-shadow: 0 12rpx 36rpx rgba(0,0,0,0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.study-pdf-frame {
  width: 100%;
  height: 1200rpx;
  border: none;
}
.pdf-paper-sheet {
  flex: 1;
  padding: 60rpx 80rpx;
  display: flex;
  flex-direction: column;
  position: relative;
  background-image: radial-gradient(var(--color-zen-hairline, #E6E6E4) 1px, transparent 1px);
  background-size: 32rpx 32rpx;
}
.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2rpx solid var(--color-zen-graphite, #1C1C1A);
  padding-bottom: 20rpx;
  margin-bottom: 30rpx;
}
.sheet-title {
  font-size: 36rpx;
  font-weight: 700;
  color: var(--color-zen-graphite, #1C1C1A);
}
.sheet-badge {
  font-size: 24rpx;
  color: #7D9372;
  font-weight: 600;
  background: rgba(125, 147, 114, 0.12);
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
}
.sheet-desc {
  font-size: 28rpx;
  color: var(--color-zen-stone, #A8A8A5);
  line-height: 1.8;
  margin-bottom: 40rpx;
}
.sheet-grid-lines {
  display: flex;
  flex-direction: column;
  gap: 60rpx;
  margin-top: 20rpx;
}
.grid-row-line {
  width: 100%;
  height: 1px;
  background: var(--color-zen-hairline, #E6E6E4);
}

/* 顶层手写标注层 */
.hw-canvas-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  overflow: hidden;
}
.file-study-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.section-actions { margin-left: auto; }
.section-ai-btn {
  font-size: 22rpx;
  color: #7D9372;
  font-weight: 600;
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
  background: rgba(125, 147, 114, 0.12);
  cursor: pointer;
}
.section-ai-btn:hover { background: rgba(125, 147, 114, 0.25); }
.block-item.active {
  background: rgba(125, 147, 114, 0.12);
  border-color: #7D9372;
  box-shadow: 0 4rpx 12rpx rgba(125, 147, 114, 0.12);
}
.block-title {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--color-zen-graphite, #1C1C1A);
  display: block;
  margin-bottom: 4rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.block-time {
  font-size: 20rpx;
  color: var(--color-zen-stone, #A8A8A5);
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Catalog */
.catalog-chapter {
  padding: 16rpx 24rpx;
  border-bottom: 1px solid var(--color-zen-hairline, #E6E6E4);
}
.chapter-title {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--color-zen-graphite, #1C1C1A);
  display: block;
  margin-bottom: 8rpx;
}
.catalog-section {
  padding: 4rpx 0 4rpx 24rpx;
}
.section-text {
  font-size: 24rpx;
  color: var(--color-zen-stone, #A8A8A5);
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Main Area (圆角卡片) */
.main-area {
  flex: 1;
  height: calc(100vh - 48rpx);
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--color-zen-white, #FFFFFF);
  border-radius: 36rpx;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.02);
  overflow: hidden;
}
.status-bar {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 18rpx 28rpx;
  border-bottom: 1px solid var(--color-zen-hairline, #E6E6E4);
  background: var(--color-zen-ivory, #F9F9F7);
}
.status-subject {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--color-zen-graphite, #1C1C1A);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.status-subject-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-info {
  font-size: 22rpx;
  color: var(--color-zen-stone, #A8A8A5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.status-actions {
  display: flex;
  gap: 8rpx;
}
.status-btn {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}
.status-btn:hover {
  background: var(--color-zen-hairline, #E6E6E4);
}
.content-body {
  flex: 1;
  height: 0;
  position: relative;
}

/* Onboarding */
.onboarding {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16rpx;
  padding: 40rpx;
}
.onboard-icon { 
  font-size: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;
}
.onboard-title {
  font-size: 40rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}
.onboard-hint {
  font-size: 28rpx;
  color: var(--color-zen-stone, #A8A8A5);
  text-align: center;
}
.onboard-actions {
  display: flex;
  gap: 20rpx;
  margin-top: 24rpx;
}

/* Block Detail */
.block-detail {
  padding: 40rpx 48rpx;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 36rpx;
  height: 120rpx;
  min-height: 120rpx;
  max-height: 120rpx;
  box-sizing: border-box;
  border-bottom: 1px solid var(--color-zen-hairline, #E6E6E4);
  background: var(--color-zen-white, #FFFFFF);
  overflow: hidden;
}
.detail-title {
  font-size: 40rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  flex: 1;
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}
.detail-actions {
  display: flex;
  gap: 12rpx;
}
.mini-btn {
  padding: 10rpx 24rpx;
  border-radius: 999rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  font-size: 22rpx;
  font-weight: 600;
  color: var(--color-zen-graphite, #1C1C1A);
  cursor: pointer;
  transition: all 0.2s;
}
.mini-btn:hover {
  background: #f0f0ee;
}
.mini-btn.danger {
  color: #b05555;
  border-color: rgba(212, 163, 163, 0.4);
}
.detail-meta {
  display: flex;
  gap: 12rpx;
  font-size: 24rpx;
  color: var(--color-zen-stone, #A8A8A5);
  margin-bottom: 20rpx;
}
.detail-tags {
  display: flex;
  gap: 8rpx;
  margin-bottom: 24rpx;
}
.tag {
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  font-size: 20rpx;
  color: var(--color-zen-stone, #A8A8A5);
}
.detail-body {
  flex: 1;
  height: 0;
}
.detail-text {
  font-size: 28rpx;
  color: var(--color-zen-graphite, #1C1C1A);
  line-height: 1.7;
}

/* Create Form */
.create-form {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 28rpx 36rpx;
  border-bottom: 1px solid var(--color-zen-hairline, #E6E6E4);
}
.form-title {
  font-size: 32rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}
.form-close {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.form-body {
  flex: 1;
  height: 0;
  padding: 36rpx;
}
.form-group {
  margin-bottom: 28rpx;
}
.form-label {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--color-zen-graphite, #1C1C1A);
  display: block;
  margin-bottom: 12rpx;
}
.form-input {
  width: 100%;
  padding: 24rpx 32rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 999rpx;
  font-size: 28rpx;
  color: var(--color-zen-graphite, #1C1C1A);
  box-sizing: border-box;
  min-height: 48rpx;
  line-height: 1.5;
}
.form-textarea {
  width: 100%;
  min-height: 220rpx;
  padding: 24rpx 32rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 28rpx;
  font-size: 28rpx;
  color: var(--color-zen-graphite, #1C1C1A);
  box-sizing: border-box;
}
.difficulty-options {
  display: flex;
  gap: 12rpx;
}
.diff-option {
  flex: 1;
  padding: 16rpx;
  text-align: center;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 999rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  font-size: 26rpx;
  font-weight: 600;
  color: var(--color-zen-stone, #A8A8A5);
  cursor: pointer;
  transition: all 0.2s;
}
.diff-option.selected {
  background: var(--color-zen-white, #FFFFFF);
  border-color: var(--color-zen-graphite, #1C1C1A);
  color: var(--color-zen-graphite, #1C1C1A);
  font-weight: 700;
  box-shadow: 0 4rpx 12rpx rgba(0,0,0,0.04);
}
.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
  padding: 24rpx 36rpx;
  border-top: 1px solid var(--color-zen-hairline, #E6E6E4);
}

/* Buttons */
.btn {
  padding: 18rpx 36rpx;
  border-radius: 999rpx;
  font-weight: 600;
  font-size: 28rpx;
  cursor: pointer;
  transition: all 0.2s;
}
.btn:active { transform: scale(0.96); }
.primary-btn {
  background: var(--color-zen-graphite, #1C1C1A);
  color: var(--color-zen-white, #FFFFFF);
}
.secondary-btn {
  background: var(--color-zen-ivory, #F9F9F7);
  color: var(--color-zen-graphite, #1C1C1A);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
}

/* AI 右下角悬浮球 */
.ai-fab-btn {
  position: fixed;
  right: 60rpx;
  bottom: 60rpx;
  z-index: 500;
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 24rpx 40rpx;
  background: var(--color-zen-graphite, #1C1C1A);
  color: var(--color-zen-white, #FFFFFF);
  border-radius: 999rpx;
  box-shadow: 0 16rpx 40rpx rgba(28, 28, 26, 0.25), 0 0 0 4rpx rgba(125, 147, 114, 0.3);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.ai-fab-btn:hover {
  transform: translateY(-6rpx) scale(1.04);
  box-shadow: 0 24rpx 50rpx rgba(28, 28, 26, 0.35);
  background: #2a2a27;
}
.ai-fab-icon {
  font-size: 36rpx;
  color: #7D9372;
  animation: fabSpin 6s infinite linear;
}
@keyframes fabSpin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.ai-fab-text {
  font-size: 30rpx;
  font-weight: 700;
  letter-spacing: 1rpx;
}

/* AI 自由拖拽与响应式缩放浮窗卡片 */
.ai-floating-window {
  position: fixed;
  min-width: 320px;
  min-height: 380px;
  max-width: 95vw;
  max-height: 92vh;
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 36rpx;
  box-shadow: 0 24rpx 80rpx rgba(0, 0, 0, 0.14), 0 4rpx 16rpx rgba(0, 0, 0, 0.04);
  z-index: 601;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: box-shadow 0.2s ease;
  animation: floatPopIn 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
}
.ai-floating-window.is-dragging,
.ai-floating-window.is-resizing {
  box-shadow: 0 32rpx 100rpx rgba(0, 0, 0, 0.22), 0 8rpx 24rpx rgba(0, 0, 0, 0.08);
}
@keyframes floatPopIn {
  from { opacity: 0; transform: scale(0.92) translateY(24rpx); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

/* 缩放手柄 (边缘圆角描边) */
.resize-handle {
  position: absolute;
  bottom: 0;
  width: 44rpx;
  height: 44rpx;
  z-index: 701;
  transition: border-color 0.2s ease;
}
.resize-handle.bottom-left {
  left: 0;
  cursor: sw-resize;
  border-bottom: 6rpx solid #C4BDB6;
  border-left: 6rpx solid #C4BDB6;
  border-bottom-left-radius: 36rpx;
}
.resize-handle.bottom-left:hover {
  border-color: #7D9372;
}
.resize-handle.bottom-right {
  right: 0;
  cursor: se-resize;
  border-bottom: 6rpx solid #C4BDB6;
  border-right: 6rpx solid #C4BDB6;
  border-bottom-right-radius: 36rpx;
}
.resize-handle.bottom-right:hover {
  border-color: #7D9372;
}
.ai-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 28rpx 36rpx;
  border-bottom: 1px solid var(--color-zen-hairline, #E6E6E4);
  background: #FCFCFA;
}
.ai-header.drag-handle {
  cursor: move;
  user-select: none;
}
.drag-hint {
  font-size: 20rpx;
  color: var(--color-zen-stone, #A8A8A5);
  margin-left: 12rpx;
  font-weight: 500;
  padding: 4rpx 12rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  border-radius: 999rpx;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
}
.ai-title-wrap {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.ai-title-icon {
  font-size: 32rpx;
  color: #7D9372;
}
.ai-title {
  font-size: 30rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}
.ai-close {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.ai-messages {
  flex: 1;
  height: 0;
  width: 100%;
  box-sizing: border-box;
  padding: 24rpx 32rpx;
  display: flex;
  flex-direction: column;
}
.chat-msg {
  margin-bottom: 24rpx;
  max-width: 90%;
}
.chat-msg.user {
  margin-left: auto;
}
.msg-content {
  display: inline-block;
  padding: 20rpx 28rpx;
  font-size: 26rpx;
  line-height: 1.6;
}
.chat-msg.user .msg-content {
  background: var(--color-zen-graphite, #1C1C1A);
  color: var(--color-zen-white, #FFFFFF);
  border-radius: 28rpx 28rpx 4rpx 28rpx;
}
.chat-msg.assistant .msg-content {
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  color: var(--color-zen-graphite, #1C1C1A);
  border-radius: 28rpx 28rpx 28rpx 4rpx;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.02);
}
/* AI 浮窗内部嵌入正常 AI 页样式 */
.ai-header-right {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.icon-btn-small {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}
.icon-btn-small:hover {
  background: rgba(125, 147, 114, 0.12);
  transform: scale(0.96);
}
.model-name-btn {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 8rpx 20rpx;
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 999rpx;
  cursor: pointer;
  transition: all 0.2s;
}
.model-icon-top {
  font-size: 26rpx;
  color: #7D9372;
}
.model-text {
  font-size: 26rpx;
  font-weight: 700;
  color: #1C1C1A;
}
.chevron-icon {
  transition: transform 0.2s;
}
.chevron-icon.is-rotated {
  transform: rotate(180deg);
}
.model-mini-dropdown {
  position: absolute;
  top: 90rpx;
  left: 24rpx;
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 24rpx;
  box-shadow: 0 16rpx 48rpx rgba(0, 0, 0, 0.12);
  padding: 12rpx 0;
  width: 380rpx;
  z-index: 700;
}
.mini-menu-item {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 18rpx 24rpx;
  cursor: pointer;
}
.mini-menu-item:hover {
  background: rgba(125, 147, 114, 0.08);
}
.mini-menu-icon {
  font-size: 30rpx;
  width: 36rpx;
  text-align: center;
}
.mini-menu-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}
.mini-menu-label {
  font-size: 26rpx;
  font-weight: 600;
  color: #1C1C1A;
}
.mini-menu-label.is-active {
  color: #7D9372;
  font-weight: 700;
}
.mini-menu-desc {
  font-size: 20rpx;
  color: #A8A8A5;
}
.mini-check {
  font-size: 26rpx;
  color: #7D9372;
  font-weight: 700;
}
.dropdown-mask {
  position: fixed;
  inset: 0;
  z-index: 699;
}

/* 聊天流与气泡 */
.welcome-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 460rpx;
  width: 100%;
  box-sizing: border-box;
  padding: 40rpx 20rpx;
  margin: auto 0;
}
.spark-icon-wrap {
  position: relative;
  width: 100rpx;
  height: 100rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;
}
.spark-ring {
  position: absolute;
  inset: -12rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(125, 147, 114, 0.22) 0%, transparent 70%);
  animation: sparkPulse 3s ease-in-out infinite;
}
@keyframes sparkPulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.15); opacity: 1; }
}
.greeting-main {
  font-size: 38rpx;
  font-weight: 800;
  color: #1C1C1A;
  text-align: center;
  line-height: 1.3;
}
.greeting-sub {
  font-size: 26rpx;
  color: #A8A8A5;
  text-align: center;
  margin-top: 10rpx;
}
.minimal-chips-wrap {
  margin-top: 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  width: 100%;
}
.chips-label {
  font-size: 24rpx;
  color: #A8A8A5;
  font-weight: 600;
}
.chips-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12rpx;
  width: 100%;
}
.minimal-chip {
  padding: 12rpx 24rpx;
  background: #FFFFFF;
  border: 1px solid #E6E6E4;
  border-radius: 999rpx;
  cursor: pointer;
  transition: all 0.2s;
}
.minimal-chip:hover {
  background: rgba(125, 147, 114, 0.1);
  border-color: #7D9372;
}
.chip-text {
  font-size: 24rpx;
  color: #1C1C1A;
  font-weight: 600;
}

.chat-stream {
  padding: 20rpx 0;
  display: flex;
  flex-direction: column;
}
.chat-bubble {
  display: flex;
  align-items: flex-start;
  margin-bottom: 32rpx;
  gap: 16rpx;
}
.chat-bubble.user {
  flex-direction: row-reverse;
}
.assistant-avatar {
  width: 60rpx;
  height: 60rpx;
  border-radius: 50%;
  background: #FFFFFF;
  border: 1px solid #E6E6E4;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.assistant-avatar.small {
  width: 48rpx;
  height: 48rpx;
}
.bubble-body {
  display: flex;
  flex-direction: column;
  max-width: 85%;
}
.chat-bubble.user .bubble-body {
  align-items: flex-end;
}
.chat-bubble.user .bubble-content {
  background: #1C1C1A;
  color: #FFFFFF;
  border-radius: 28rpx 28rpx 6rpx 28rpx;
  padding: 20rpx 30rpx;
  font-size: 28rpx;
  line-height: 1.5;
}
.chat-bubble.assistant .bubble-content {
  background: #FFFFFF;
  border: 1px solid #E6E6E4;
  border-radius: 6rpx 28rpx 28rpx 28rpx;
  padding: 24rpx 32rpx;
  font-size: 28rpx;
  line-height: 1.6;
}
.bubble-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 12rpx;
}
.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.action-btn.icon-only {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: #FFFFFF;
  border: 1px solid #E6E6E4;
}
.action-btn.text-btn {
  font-size: 22rpx;
  border: 1px solid #E6E6E4;
  border-radius: 999rpx;
  padding: 8rpx 24rpx;
  font-weight: 600;
  color: #4b8054;
  background: #FFFFFF;
}

.typing-indicator {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 24rpx;
}
.typing-dots {
  display: flex;
  align-items: center;
  gap: 8rpx;
  background: #FFFFFF;
  border: 1px solid #E6E6E4;
  border-radius: 6rpx 24rpx 24rpx 24rpx;
  padding: 18rpx 28rpx;
}
.dot {
  width: 10rpx;
  height: 10rpx;
  background: #7D9372;
  border-radius: 50%;
  animation: dotBounce 1.4s ease-in-out infinite both;
}
.dot:nth-child(1) { animation-delay: -0.32s; }
.dot:nth-child(2) { animation-delay: -0.16s; }
@keyframes dotBounce {
  0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
  40% { transform: scale(1); opacity: 1; }
}
.bottom-anchor { height: 20rpx; }

/* 底部胶囊输入栏 */
.ai-capsule-bar {
  padding: 16rpx 24rpx 24rpx;
  background: #FFFFFF;
  border-top: 1px solid #E6E6E4;
  width: 100%;
  box-sizing: border-box;
}
.ai-capsule {
  height: 104rpx;
  background: #F9F9F7;
  border-radius: 52rpx;
  display: flex;
  align-items: center;
  padding: 0 12rpx;
  border: 1px solid #E6E6E4;
  transition: all 0.25s ease;
  width: 100%;
  box-sizing: border-box;
}
.ai-capsule.is-focused {
  background: #FFFFFF;
  border-color: #7D9372;
  box-shadow: 0 8rpx 24rpx rgba(125, 147, 114, 0.12);
}
.capsule-left {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.ai-capsule-input {
  flex: 1;
  height: 100%;
  font-size: 28rpx;
  color: #1C1C1A;
  background: transparent;
  border: none;
  margin: 0 8rpx;
}
.capsule-right {
  width: 80rpx;
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mic-btn {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.send-btn {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: #1C1C1A;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.plus-icon-wrap {
  transition: transform 0.28s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.plus-icon-wrap.is-rotated {
  transform: rotate(45deg);
}

/* 附件菜单 */
.action-overlay {
  position: fixed;
  inset: 0;
  z-index: 698;
}
.action-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 699;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(24rpx);
  border-top: 1px solid #E6E6E4;
  border-radius: 32rpx 32rpx 0 0;
  padding: 20rpx 0;
  box-shadow: 0 -12rpx 48rpx rgba(0, 0, 0, 0.08);
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}
.action-panel.is-open {
  transform: translateY(0);
}
.action-panel-row {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 24rpx 36rpx;
  cursor: pointer;
}
.action-panel-icon {
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.action-panel-label {
  font-size: 28rpx;
  font-weight: 600;
  color: #1C1C1A;
}
.action-panel-divider {
  height: 1px;
  background: #E6E6E4;
  margin: 0 36rpx;
}


/* Files Drawer Actions */
.drawer-action.primary {
  background: var(--color-zen-graphite, #1C1C1A);
  color: var(--color-zen-white, #FFFFFF);
  border-color: var(--color-zen-graphite, #1C1C1A);
}
.drawer-action.primary:hover {
  background: #2e2e2b;
}

/* 左侧栏折叠或在总结弹窗展开时的响应式收起收窄规则 */
.workspace-sidebar-card.drawer-collapsed {
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.workspace-sidebar-card.drawer-collapsed .tier2-drawer {
  width: 0 !important;
  min-width: 0 !important;
  max-width: 0 !important;
  opacity: 0 !important;
  pointer-events: none;
  border: none !important;
  margin: 0 !important;
  padding: 0 !important;
}

/* 左侧栏在总结弹窗展开时自动缩小缩简响应式规则 */
.workspace-sidebar-card.drawer-shrunk {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.workspace-sidebar-card.drawer-shrunk .tier2-drawer {
  width: 240rpx !important;
  min-width: 240rpx !important;
  max-width: 240rpx !important;
}
.workspace-sidebar-card.drawer-shrunk .drawer-header {
  padding: 24rpx 16rpx;
}
.workspace-sidebar-card.drawer-shrunk .drawer-title {
  font-size: 26rpx;
}
.workspace-sidebar-card.drawer-shrunk .drawer-actions-row {
  gap: 6rpx;
}
.workspace-sidebar-card.drawer-shrunk .drawer-action text {
  font-size: 20rpx;
}
.workspace-sidebar-card.drawer-shrunk .file-name {
  font-size: 24rpx;
}

/* 右侧独立总结与大纲浮动卡片侧栏 */
.summary-side-panel {
  width: 580rpx;
  min-width: 480rpx;
  max-width: 42vw;
  height: calc(100vh - 48rpx);
  background: var(--color-zen-white, #FFFFFF);
  border-radius: 36rpx;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  box-shadow: -8rpx 0 24rpx rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
  animation: summarySlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes summarySlideIn {
  from {
    opacity: 0;
    transform: translateX(80rpx);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.s-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 28rpx;
  height: 120rpx;
  min-height: 120rpx;
  max-height: 120rpx;
  box-sizing: border-box;
  border-bottom: 1px solid var(--color-zen-hairline, #E6E6E4);
  background: var(--color-zen-white, #FFFFFF);
  overflow: hidden;
}
.s-title-group {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  overflow: hidden;
  flex: 1;
  min-width: 0;
}
.s-panel-title {
  font-size: 30rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}
.s-panel-sub {
  font-size: 22rpx;
  color: var(--color-zen-stone, #A8A8A5);
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}
.s-header-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-shrink: 0;
}
.s-action-btn {
  padding: 10rpx 20rpx;
  border-radius: 999rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  font-size: 22rpx;
  font-weight: 700;
  color: var(--color-zen-graphite, #1C1C1A);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}
.s-action-btn:hover {
  background: #EEEEEC;
}
.s-action-btn.primary {
  background: #7D9372;
  color: #FFFFFF;
  border-color: #7D9372;
  box-shadow: 0 4rpx 12rpx rgba(125, 147, 114, 0.25);
}
.s-action-btn.icon-only {
  padding: 10rpx;
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
}

.s-panel-tabs {
  display: flex;
  background: var(--color-zen-ivory, #F9F9F7);
  padding: 8rpx;
  margin: 16rpx 24rpx 8rpx;
  border-radius: 20rpx;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  gap: 8rpx;
}
.s-tab {
  flex: 1;
  text-align: center;
  padding: 12rpx 0;
  border-radius: 14rpx;
  font-size: 24rpx;
  font-weight: 700;
  color: var(--color-zen-stone, #A8A8A5);
  cursor: pointer;
  transition: all 0.2s;
}
.s-tab.active {
  background: var(--color-zen-white, #FFFFFF);
  color: #7D9372;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.05);
}

.s-panel-body {
  flex: 1;
  padding: 16rpx 24rpx 32rpx;
  box-sizing: border-box;
}
.s-tab-content {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.s-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80rpx 32rpx;
  text-align: center;
  gap: 12rpx;
}
.s-empty-title {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--color-zen-graphite, #1C1C1A);
}
.s-empty-hint {
  font-size: 22rpx;
  color: var(--color-zen-stone, #A8A8A5);
  line-height: 1.5;
}

.summary-container {
  display: flex;
  flex-direction: column;
  gap: 28rpx;
}
.summary-card {
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 24rpx;
  padding: 28rpx;
  box-shadow: 0 4rpx 12rpx rgba(0,0,0,0.02);
}
.summary-badge {
  display: inline-block;
  padding: 6rpx 16rpx;
  background: rgba(125, 147, 114, 0.15);
  color: #7D9372;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 700;
  margin-bottom: 16rpx;
}
.summary-text {
  font-size: 26rpx;
  color: var(--color-zen-graphite, #1C1C1A);
  line-height: 1.6;
  white-space: pre-wrap;
}
.summary-card-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 24rpx;
  padding-top: 20rpx;
  border-top: 1px dashed var(--color-zen-hairline, #E6E6E4);
}
.s-action-pill {
  padding: 10rpx 22rpx;
  border-radius: 999rpx;
  background: rgba(125, 147, 114, 0.12);
  color: #7D9372;
  font-size: 22rpx;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.s-action-pill:hover {
  background: rgba(125, 147, 114, 0.22);
}
.catalog-section-wrap {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.catalog-label {
  font-size: 24rpx;
  font-weight: 700;
  color: var(--color-zen-stone, #A8A8A5);
}

/* Review Mini Stats & Queue */
.review-mini-stats {
  display: flex;
  justify-content: space-around;
  padding: 20rpx 12rpx;
  background: var(--color-zen-white, #FFFFFF);
  border-bottom: 1px solid var(--color-zen-hairline, #E6E6E4);
}
.mini-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.ms-val {
  font-size: 32rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
}
.ms-label {
  font-size: 22rpx;
  color: var(--color-zen-stone, #A8A8A5);
}
.review-queue-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 24rpx;
  border-radius: 16rpx;
  margin-bottom: 8rpx;
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  cursor: pointer;
}
.review-queue-item.current {
  border-color: #7D9372;
  background: rgba(125, 147, 114, 0.08);
}
.review-queue-item.done {
  opacity: 0.5;
}
.rq-icon {
  font-size: 24rpx;
  color: #7D9372;
}
.rq-title {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--color-zen-graphite, #1C1C1A);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Review Deck Workspace */
.review-deck-workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
  height: 100%;
  box-sizing: border-box;
}
.card-stack-container {
  flex: 1;
  width: 100%;
  max-width: 680rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.card-stack {
  position: relative;
  width: 100%;
  height: 700rpx;
}
.stack-card {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 40rpx;
}
.card-layer-1 { z-index: 3; }
.card-layer-2 {
  z-index: 2;
  transform: translate3d(0, 24rpx, 0) scale(0.95);
  opacity: 0.7;
}
.card-layer-3 {
  z-index: 1;
  transform: translate3d(0, 48rpx, 0) scale(0.9);
  opacity: 0.4;
}
.dummy-card-face {
  width: 100%;
  height: 100%;
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 40rpx;
  padding: 40rpx;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dummy-subject {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--color-zen-stone, #A8A8A5);
}
.stamp-container {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 10;
}
.stamp {
  position: absolute;
  padding: 16rpx 36rpx;
  border-radius: 16rpx;
  font-size: 40rpx;
  font-weight: 900;
  letter-spacing: 4rpx;
  text-transform: uppercase;
  border: 6rpx solid;
}
.stamp-mastered {
  top: 80rpx;
  left: 60rpx;
  color: #6b8a65;
  border-color: #6b8a65;
  transform: rotate(-15deg);
}
.stamp-retry {
  bottom: 120rpx;
  right: 60rpx;
  color: #b05555;
  border-color: #b05555;
  transform: rotate(15deg);
}
.stamp-skip {
  top: 80rpx;
  right: 60rpx;
  color: #5a7fa0;
  border-color: #5a7fa0;
  transform: rotate(15deg);
}
.stamp-prev {
  top: 80rpx;
  left: 60rpx;
  color: #a0845e;
  border-color: #a0845e;
  transform: rotate(-15deg);
}
.finished-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 20rpx;
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 40rpx;
  padding: 60rpx 40rpx;
  width: 100%;
}
.finish-title {
  font-size: 40rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
}
.finish-desc {
  font-size: 28rpx;
  color: var(--color-zen-stone, #A8A8A5);
  margin-bottom: 20rpx;
}
.reset-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20rpx 48rpx;
  background: var(--color-zen-graphite, #1C1C1A);
  color: #fff;
  border-radius: 999rpx;
  font-size: 28rpx;
  font-weight: 700;
  border: none;
}
.gesture-legend {
  margin-top: 24rpx;
}
.legend-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  font-size: 24rpx;
  color: var(--color-zen-stone, #A8A8A5);
  font-weight: 600;
}
.legend-dot { opacity: 0.5; }
</style>
