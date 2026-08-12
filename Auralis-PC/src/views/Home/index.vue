<template>
  <div class="home-container" ref="containerRef">
    <!-- LEFT PANEL: Subjects & Workspace (Top), Knowledge Blocks (Bottom) -->
    <div class="home-left" :style="{ width: activeSubjectId ? '100%' : leftWidthPercent + '%', flex: 'none' }">
      
      <!-- LEFT TOP: Subject Area -->
      <section class="subject-pane">
        <!-- PATH A: Subject Hall View (No active subject selected) -->
        <div v-if="!activeSubjectId" class="hall-view">
          <div class="pane-header">
            <div>
              <h2 class="pane-title">我的学科空间</h2>
              <p class="pane-desc">选择或创建一个专属的学科空间，进行深度的材料解析与大纲提炼</p>
            </div>
            <button class="pane-action-btn primary" @click="openCreateSubject(null)">＋ 新建学科</button>
          </div>

          <div class="subjects-grid">
            <div 
              v-for="subj in subjectStore.subjects" 
              :key="subj.id" 
              class="subject-card"
              :style="{ '--subj-theme-color': subj.color || 'rgba(99, 102, 241, 0.15)' }"
              @click="selectSubject(subj.id)"
            >
              <div class="subject-card-header">
                <div class="subject-card-icon" :style="{ backgroundColor: subj.color }">
                  <ElIcon v-if="isSubjectIconKey(subj.icon) || !getLegacySubjectIcon(subj.icon)" :size="28">
                    <component :is="getSubjectIconComponent(subj.icon)" />
                  </ElIcon>
                  <span v-else>{{ getLegacySubjectIcon(subj.icon) }}</span>
                </div>
                <div class="subject-card-actions" @click.stop>
                  <button class="card-action-btn" title="编辑" @click="openCreateSubject(subj)">✎</button>
                  <button class="card-action-btn delete" title="删除" @click="confirmDeleteSubject(subj)">✕</button>
                </div>
              </div>
              <h4 class="subject-card-title">{{ subj.name }}</h4>
              <p class="subject-card-desc">{{ subj.description || '这是您的专属学科知识沉淀空间。' }}</p>
              <div class="subject-card-footer">
                <span class="card-stat"><b>{{ subj.blockCount || 0 }}</b> 知识块</span>
                <span class="card-stat"><b>{{ subj.fileCount || 0 }}</b> 材料</span>
              </div>
            </div>

            <!-- Add Subject Card -->
            <div class="subject-card add-card" @click="openCreateSubject(null)">
              <span class="add-plus">＋</span>
              <span class="add-label">新建学科空间</span>
            </div>
          </div>
        </div>

        <!-- PATH B: Subject Workspace View (Active subject is selected) -->
        <div v-else class="workspace-view">
          <header class="workspace-header">
            <div class="header-left">
              <button class="back-btn" @click="selectSubject(null)">🏛️ 返回大厅</button>
              <div class="subject-title-area">
                <span class="subject-emoji" :style="{ backgroundColor: activeSubject?.color }">
                  <ElIcon v-if="isSubjectIconKey(activeSubject?.icon) || !getLegacySubjectIcon(activeSubject?.icon)" :size="24">
                    <component :is="getSubjectIconComponent(activeSubject?.icon)" />
                  </ElIcon>
                  <span v-else>{{ getLegacySubjectIcon(activeSubject?.icon) }}</span>
                </span>
                <div class="subject-meta-text">
                  <h2 class="subject-title">{{ activeSubject?.name }}</h2>
                  <p class="subject-description">{{ activeSubject?.description || '这是您的专属学科知识沉淀空间。' }}</p>
                </div>
              </div>
            </div>
          </header>

          <div class="workspace-tabs-container">
            <div class="tabs-header">
              <button 
                class="tab-btn" 
                :class="{ 'is-active': activeTab === 'materials' }"
                @click="activeTab = 'materials'"
              >
                📚 学习材料 ({{ activeSourceFiles.length }})
              </button>
              <button 
                class="tab-btn" 
                :class="{ 'is-active': activeTab === 'outlines' }"
                @click="activeTab = 'outlines'"
              >
                📖 目录大纲
              </button>
              <button 
                class="tab-btn" 
                :class="{ 'is-active': activeTab === 'graph' }"
                @click="activeTab = 'graph'"
              >
                ⬡ 关联图谱
              </button>
              <button 
                class="tab-btn" 
                :class="{ 'is-active': activeTab === 'pdf' }"
                @click="activeTab = 'pdf'"
                :disabled="!selectedFileId"
              >
                📖 PDF伴读
              </button>
            </div>

            <div class="tab-body">
              <!-- TAB 1: Materials -->
              <div v-if="activeTab === 'materials'" class="tab-content materials-tab">
                <div class="materials-header">
                  <h3>已登记的本地参考材料</h3>
                  <button class="register-file-btn" @click="showRegisterModal = true">+ 登记本地文件</button>
                </div>

                <div class="materials-list" v-if="activeSourceFiles.length > 0">
                  <div v-for="file in activeSourceFiles" :key="file.id" class="file-item">
                    <div class="file-icon-wrapper">
                      <span class="file-icon">{{ getFileIcon(file.file_type) }}</span>
                    </div>
                    <div class="file-meta-info">
                      <span class="file-name">{{ file.name }}</span>
                      <span class="file-path" :title="file.file_path">{{ file.file_path }}</span>
                    </div>
                    <div class="file-stats">
                      <span class="file-size">{{ (file.file_size / (1024 * 1024)).toFixed(2) }} MB</span>
                      <span class="file-blocks" v-if="file.block_count !== undefined && file.block_count > 0">{{ file.block_count }} 知识块</span>
                    </div>
                    <div class="file-actions">
                      <button class="file-action-btn" title="PDF伴读" @click="openPdfCompanion(file.id)">📖 伴读</button>
                      <button class="file-action-btn" title="查看大纲" @click="viewFileOutline(file.id)">📋 大纲</button>
                      <button class="file-action-btn delete" title="删除记录" @click="deleteSourceFile(file.id)">✕</button>
                    </div>
                  </div>
                </div>
                <div class="empty-state" v-else>
                  <div class="empty-icon">📁</div>
                  <p>暂无参考材料，请点击右上角按钮登记本地文件路径。</p>
                </div>
              </div>

              <!-- TAB 2: Outlines -->
              <div v-if="activeTab === 'outlines'" class="tab-content outlines-tab">
                <div class="outlines-header">
                  <div class="file-selector-row">
                    <label>选择学习材料：</label>
                    <select v-model="selectedFileId" class="file-select-dropdown">
                      <option v-for="file in activeSourceFiles" :key="file.id" :value="file.id">
                        {{ file.name }}
                      </option>
                      <option v-if="activeSourceFiles.length === 0" value="" disabled>无可用文件，请先登记材料</option>
                    </select>
                  </div>
                </div>

                <!-- Outline Content -->
                <div v-if="selectedFile" class="outline-body">
                  <!-- If no catalog exists -->
                  <div v-if="!selectedFile.catalog_json || selectedFile.catalog_json === '[]'" class="paste-catalog-prompt">
                    <p class="catalog-hint">💡 <b>此参考书尚未解析目录</b>。请粘贴目录文本，我们将通过 AI 结构化提炼为章节节点大纲。</p>
                    <textarea 
                      v-model="pasteCatalogText" 
                      class="catalog-textarea" 
                      placeholder="粘贴目录文本，如：
第一章 计算机网络和因特网
1.1 什么是因特网
1.2 网络边缘
1.3 网络核心
..."
                      rows="6"
                    ></textarea>
                    <button 
                      class="analyze-catalog-btn" 
                      :disabled="isAnalyzingCatalog || !pasteCatalogText.trim()"
                      @click="handleAnalyzeCatalog"
                    >
                      <span class="loading-spinner" v-if="isAnalyzingCatalog"></span>
                      <span v-else>✨ AI 智能解析目录</span>
                    </button>
                  </div>

                  <!-- If catalog exists -->
                  <div v-else class="catalog-tree">
                    <div 
                      v-for="(chap, cIndex) in parsedCatalog" 
                      :key="cIndex" 
                      class="chapter-accordion"
                    >
                      <div class="chapter-title" @click="toggleChapter(cIndex)">
                        <span class="chapter-arrow">{{ isChapterExpanded(cIndex) ? '▼' : '▶' }}</span>
                        <span class="chapter-name">{{ chap.title }}</span>
                      </div>
                      <div v-if="isChapterExpanded(cIndex)" class="sections-list">
                        <div v-for="(sec, sIndex) in chap.sections" :key="sIndex" class="section-item">
                          <div class="section-left">
                            <span class="section-bullet">•</span>
                            <span class="section-name">{{ sec }}</span>
                          </div>
                          <div class="section-actions">
                            <button class="sec-action-btn ai" title="AI 精细提炼" @click="triggerAiRefine(chap.title, sec)">
                              ✨ AI 提炼
                            </button>
                            <button class="sec-action-btn task" title="转入学习排期" @click="triggerAddTask(sec)">
                              🎯 排期
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="empty-state" v-else>
                  <div class="empty-icon">📖</div>
                  <p>请在上方选择一个学习材料以浏览或解析其目录大纲。</p>
                </div>
              </div>

              <!-- TAB 3: Graph -->
              <div v-if="activeTab === 'graph'" class="tab-content graph-tab">
                <KnowledgeGraph 
                  :subjectId="activeSubjectId" 
                  :blocks="subjectBlocks" 
                  :subjectName="activeSubject?.name || '学科图谱'" 
                  :subjectColor="activeSubject?.color || 'rgba(99, 102, 241, 0.2)'"
                  @open-block-detail="handleBlockClick"
                />
              </div>

              <!-- TAB 4: PDF Companion -->
              <div v-if="activeTab === 'pdf'" class="tab-content pdf-tab">
                <PdfViewer 
                  v-if="selectedFile"
                  :filePath="selectedFile.file_path"
                  :fileName="selectedFile.name"
                />
                <div class="empty-state" v-else>
                  <div class="empty-icon">📕</div>
                  <p>请在左侧“学习材料”列表点击“伴读”以载入 PDF 阅读器。</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- LEFT BOTTOM: Knowledge Blocks Area -->
      <section class="blocks-pane">
        <div class="pane-header">
          <div class="pane-header-left">
            <h3 class="pane-title">{{ activeSubjectId ? `${activeSubject?.name} · 知识库` : '最近入库的知识块' }}</h3>
            <div class="block-search-box">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input v-model="blockSearchQuery" class="block-search-input" placeholder="搜索知识块标题或内容..." />
            </div>
          </div>
          <button class="pane-action-btn secondary" @click="openCreateDialog">＋ 手动录入</button>
        </div>

        <div class="blocks-grid-scroll" v-if="filteredBlocks.length > 0">
          <div class="blocks-grid-inner">
            <div
              v-for="block in filteredBlocks"
              :key="block.id"
              class="block-card"
              @click="handleBlockClick(block)"
            >
              <div class="block-tag" :style="{ background: block.color || 'var(--border-subtle)' }">
                {{ block.subject || '知识片' }}
              </div>
              <h4 class="block-title">{{ block.title }}</h4>
              <p class="block-preview">{{ block.preview }}</p>
              <div class="block-meta">
                <span class="block-time">{{ block.time }}</span>
                <span class="block-source">{{ block.source }}</span>
              </div>
            </div>
            <!-- View All fade card -->
            <div class="block-card view-all-card" @click="blockSearchQuery = ''">
              <div class="view-all-inner">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                <span class="view-all-text">查看全部</span>
              </div>
            </div>
          </div>
        </div>
        <div class="no-results-card" v-else>
          <span>🔍 没有找到匹配的知识块</span>
          <button class="section-action" @click="blockSearchQuery = ''" style="font-size: 11px;">清除搜索条件</button>
        </div>
      </section>
    </div>

    <!-- Drag Splitter Handle (Only visible in Subject Hall) -->
    <div v-if="!activeSubjectId" class="resize-handle" @mousedown="startResize"></div>

    <!-- RIGHT PANEL: Timetable hourly slots and Pending tasks sidebar (Only visible in Subject Hall) -->
    <div v-if="!activeSubjectId" class="home-right" :style="{ width: (100 - leftWidthPercent) + '%', flex: 'none' }">
      <div class="sidebar-header">
        <h3 class="sidebar-title">日程看板</h3>
        <button class="add-task-btn" @click="openCreateTaskDialog" title="新建任务">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      <!-- Segmented Controls: View Mode Tabs -->
      <div class="view-tabs">
        <button
          class="view-tab-btn"
          :class="{ 'is-active': viewMode === 'timeline' }"
          @click="viewMode = 'timeline'"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          日视图
        </button>
        <button
          class="view-tab-btn"
          :class="{ 'is-active': viewMode === 'weekly' }"
          @click="viewMode = 'weekly'"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          周视图
        </button>
      </div>

      <!-- Time slots timeline -->
      <div class="schedule-section" v-show="viewMode === 'timeline'">
        <div class="time-slots">
          <div
            v-for="slot in filteredTimeSlots"
            :key="slot.time"
            class="time-slot"
            :class="{ 'has-task': slot.task, 'is-current': slot.isCurrent, 'drag-over': dragOverSlot === slot.time }"
            @dragover.prevent="handleDragOver(slot.time)"
            @dragleave.prevent="handleDragLeave"
            @drop.prevent="handleDrop(slot.time)"
          >
            <span class="slot-time">{{ slot.time }}</span>

            <div
              v-if="slot.task"
              class="slot-task"
              :style="{ borderLeftColor: slot.task.color }"
              draggable="true"
              @dragstart.stop="handleDragStart($event, 'scheduled', slot.time)"
            >
              <div class="task-header">
                <span class="task-name" :title="slot.task.name">{{ slot.task.name }}</span>
                <button class="task-delete-btn" @click.stop="handleDeleteScheduledTask(slot)" title="移出排期">✕</button>
              </div>
              <span class="task-tag" :style="{ backgroundColor: slot.task.color || 'rgba(255,255,255,0.08)' }">
                {{ slot.task.subject }}
              </span>
            </div>

            <div v-else class="slot-empty-pill" :class="{ 'is-drag-over': dragOverSlot === slot.time }">
              <span class="pill-text">空闲</span>
              <span class="pill-hint">拖入任务</span>
            </div>

            <div v-if="slot.isCurrent" class="current-indicator">
              <span class="current-dot"></span>
              <span class="current-line"></span>
            </div>
          </div>
        </div>
      </div>

      <!-- Weekly View (placeholder) -->
      <div class="schedule-section" v-show="viewMode === 'weekly'">
        <div class="weekly-placeholder">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span class="placeholder-title">周视图</span>
          <span class="placeholder-desc">可视化一周学习排期，即将上线</span>
        </div>
      </div>

      <!-- Pending tasks checklist -->
      <div class="pending-section" v-show="viewMode === 'checklist'">
        <div
          class="pending-tasks-list"
          :class="{ 'drag-over': dragOverPending }"
          @dragover.prevent="dragOverPending = true"
          @dragleave.prevent="dragOverPending = false"
          @drop.prevent="handleDropOnPending"
        >
          <div
            v-for="task in filteredPendingTasks"
            :key="task.id"
            class="pending-card"
            draggable="true"
            @dragstart.stop="handleDragStart($event, 'pending', task.id || '')"
          >
            <div class="card-left">
              <input
                type="checkbox"
                :checked="task.status === 'completed'"
                @change="toggleTaskCompletion(task)"
                class="task-checkbox"
                @click.stop
              />
              <div class="pending-color" :style="{ background: task.color }"></div>
              <div class="pending-body">
                <span class="pending-name" :title="task.name">{{ task.name }}</span>
                <span class="pending-subject">{{ task.subject }}</span>
              </div>
            </div>
            <span class="drag-handle" title="按住拖拽至时间轴">⠿</span>
          </div>

          <div v-if="filteredPendingTasks.length === 0" class="empty-pending">
            <span>🎉 所有待办任务已排期或完成</span>
          </div>
        </div>
      </div>
    </div>

    <!-- AI Refine Loading Overlay -->
    <div v-if="isRefiningAi" class="refine-loading-overlay">
      <div class="refine-loading-card">
        <div class="refine-spinner"></div>
        <span class="refine-text">{{ aiRefiningText }}</span>
        <span class="refine-hint">AI 正在阅读参考材料，提炼核心概念要点...</span>
      </div>
    </div>

    <!-- Register File Modal -->
    <div class="modal-overlay" v-if="showRegisterModal" @click="showRegisterModal = false"></div>
    <div class="modal-container" v-if="showRegisterModal">
      <div class="modal-header">
        <h3>登记本地参考材料</h3>
        <button class="close-btn" @click="showRegisterModal = false">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>材料名称 *</label>
          <input v-model="registerForm.name" class="styled-input" placeholder="例如: 计算机网络 自顶向下方法.pdf" />
        </div>
        <div class="form-group">
          <label>本地绝对路径 *</label>
          <input v-model="registerForm.filePath" class="styled-input" placeholder="例如: D:/Books/Computer Network.pdf" />
        </div>
        <div class="form-group">
          <label>类型 *</label>
          <select v-model="registerForm.fileType" class="styled-select">
            <option value="PDF">PDF 电子书</option>
            <option value="Markdown">Markdown 文档</option>
            <option value="PPT">PowerPoint 课件</option>
            <option value="Word">Word 文档</option>
            <option value="Other">其他类型</option>
          </select>
        </div>
        <div class="form-group">
          <label>文件大小 (MB)</label>
          <input type="number" v-model="registerForm.fileSize" class="styled-input" placeholder="例如: 15.4" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" @click="showRegisterModal = false">取消</button>
        <button class="btn-primary" :disabled="!registerForm.name.trim() || !registerForm.filePath.trim()" @click="handleRegisterFile">
          确认登记
        </button>
      </div>
    </div>

    <!-- Create Task Modal -->
    <div class="modal-overlay" v-if="showTaskModal" @click="showTaskModal = false"></div>
    <div class="modal-container" v-if="showTaskModal">
      <div class="modal-header">
        <h3>创建学习任务</h3>
        <button class="close-btn" @click="showTaskModal = false">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>任务名称 *</label>
          <input v-model="taskForm.name" class="styled-input" placeholder="例如: 学习网络层协议" />
        </div>
        <div class="form-group" v-if="!activeSubjectId">
          <label>归属学科 *</label>
          <select v-model="taskForm.subjectId" class="styled-select">
            <option v-for="subj in subjectStore.subjects" :key="subj.id" :value="subj.id">
              {{ isSubjectIconKey(subj.icon) || !getLegacySubjectIcon(subj.icon) ? '' : `${getLegacySubjectIcon(subj.icon)} ` }}{{ subj.name }}
            </option>
            <option value="" disabled v-if="subjectStore.subjects.length === 0">暂无学科，请先创建</option>
          </select>
        </div>
        <div class="form-group">
          <label>预计专注时长</label>
          <select v-model.number="taskForm.duration" class="styled-select">
            <option :value="30">0.5 小时 (30分钟)</option>
            <option :value="60">1.0 小时 (60分钟)</option>
            <option :value="90">1.5 小时 (90分钟)</option>
            <option :value="120">2.0 小时 (120分钟)</option>
            <option :value="150">2.5 小时 (150分钟)</option>
            <option :value="180">3.0 小时 (180分钟)</option>
            <option :value="240">4.0 小时 (240分钟)</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" @click="showTaskModal = false">取消</button>
        <button class="btn-primary" :disabled="!taskForm.name.trim() || (!activeSubjectId && !taskForm.subjectId)" @click="handleAddTask">
          加入排期
        </button>
      </div>
    </div>

    <!-- Knowledge Block Detail / Create / Edit Modal -->
    <div class="modal-overlay" v-if="blockDialogVisible" @click.self="handleModalOverlayClick">
      <div class="modal-container" v-if="blockDialogVisible">
        <div class="modal-header">
          <div class="modal-tags" v-if="!isEditMode">
            <span class="modal-tag" :style="{ background: selectedBlock?.color || 'var(--color-bg-secondary)' }">
              {{ selectedBlock?.subject || '知识片' }}
            </span>
            <span class="modal-source-tag">来源: {{ selectedBlock?.source }}</span>
          </div>
          <h3 v-else>{{ isCreateMode ? '录入新知识块' : '编辑知识内容' }}</h3>
          <button class="close-btn" @click="closeBlockDialog">✕</button>
        </div>

        <!-- EDIT & CREATE MODE FORM -->
        <div class="modal-body" v-if="isEditMode" style="display: flex; flex-direction: column; gap: 14px;">
          <div class="form-group">
            <label>分类 (Subject) <span style="color: #ef4444; margin-left: 4px;">*</span></label>
            <input v-model="editForm.subject" class="styled-input" placeholder="例如：Java, 算法, 操作系统, 英语..." />
          </div>
          <div class="form-group">
            <label>标题 (Title) <span style="color: #ef4444; margin-left: 4px;">*</span></label>
            <input v-model="editForm.title" class="styled-input" placeholder="输入知识点的核心概念名称" />
          </div>
          <div class="form-group">
            <label>色彩标签 (Theme Color)</label>
            <div class="color-options">
              <span 
                v-for="color in themeColors" 
                :key="color.value"
                class="color-dot"
                :class="{ 'is-selected': editForm.color === color.value }"
                :style="{ background: color.value }"
                :title="color.name"
                @click="editForm.color = color.value"
              ></span>
            </div>
          </div>
          <div class="form-group">
            <label>知识内容 (Content) <span style="color: #ef4444; margin-left: 4px;">*</span></label>
            <textarea v-model="editForm.preview" class="styled-textarea" rows="8" placeholder="在此处输入详细的知识点解析或定义描述... (支持 Markdown)"></textarea>
          </div>
        </div>

        <!-- VIEW MODE -->
        <div class="modal-body" v-else>
          <div class="block-read-header">
            <h2 class="modal-title">{{ selectedBlock?.title }}</h2>
            <div class="modal-meta-row">
              <span class="modal-time-badge">
                <ElIcon style="margin-right:4px;"><Clock /></ElIcon>
                记于 {{ selectedBlock?.time }}
              </span>
            </div>
          </div>
          <div class="modal-divider"></div>
          <div class="modal-content summary-markdown" v-html="renderMarkdown(selectedBlock?.content || selectedBlock?.preview || '')"></div>
        </div>

        <!-- MODAL FOOTER -->
        <div class="modal-footer" :style="{ justifyContent: isEditMode ? 'flex-end' : 'space-between' }">
          <template v-if="isEditMode">
            <button class="btn-secondary" @click="cancelEdit">取消</button>
            <button class="btn-primary" @click="handleSaveBlock">
              {{ isCreateMode ? '创建知识块' : '保存修改' }}
            </button>
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

    <!-- Subject Create/Edit Modal (For Hall View) -->
    <SubjectCreateModal 
      v-if="showSubjectModal" 
      :subjectData="selectedSubjectForEdit || undefined"
      @close="closeCreateSubject"
      @save="handleSaveSubject"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ElIcon, ElNotification, ElMessageBox } from 'element-plus'
import { Clock } from '@element-plus/icons-vue'
import 'element-plus/theme-chalk/el-notification.css'
import 'element-plus/theme-chalk/el-message-box.css'

import { useBlockStore } from '@/store/useBlockStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useSubjectStore, type Subject } from '@/store/useSubjectStore'
import { getLegacySubjectIcon, getSubjectIconComponent, isSubjectIconKey } from '@/utils/subjectIcon'
import { useTaskStore, type Task } from '@/store/useTaskStore'
import { streamFetch } from '@/utils/streamFetch'

// Import components
import KnowledgeGraph from '@/components/subject/KnowledgeGraph.vue'
import SubjectCreateModal from '@/components/subject/SubjectCreateModal.vue'
import PdfViewer from '@/components/subject/PdfViewer.vue'

const openPdfCompanion = (fileId: string) => {
  selectedFileId.value = fileId
  activeTab.value = 'pdf'
}

marked.setOptions({
  breaks: true,
  gfm: true
})

const renderMarkdown = (content: string) => {
  if (!content) return ''
  return DOMPurify.sanitize(marked.parse(content) as string)
}

const blockStore = useBlockStore()
const { recentBlocks } = storeToRefs(blockStore)

const subjectStore = useSubjectStore()
const { activeSubjectId, activeSubject, activeSourceFiles } = storeToRefs(subjectStore)

const taskStore = useTaskStore()
const { pendingTasks, timeSlots } = storeToRefs(taskStore)

// Drag Resizing States
const leftWidthPercent = ref(50) // Default to 50/50 (左右均分)
const containerRef = ref<HTMLElement | null>(null)

const startResize = (e: MouseEvent) => {
  e.preventDefault()
  const startX = e.clientX
  const startLeftPercent = leftWidthPercent.value
  const containerWidth = containerRef.value?.getBoundingClientRect().width || window.innerWidth

  const doDrag = (moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - startX
    const deltaPercent = (deltaX / containerWidth) * 100
    // Limit the percentage between 20% and 80%
    leftWidthPercent.value = Math.max(20, Math.min(80, startLeftPercent + deltaPercent))
  }

  const stopDrag = () => {
    document.removeEventListener('mousemove', doDrag)
    document.removeEventListener('mouseup', stopDrag)
  }

  document.addEventListener('mousemove', doDrag)
  document.addEventListener('mouseup', stopDrag)
}

// Local UI states
const activeTab = ref<'materials' | 'outlines' | 'graph' | 'pdf'>('materials')
const viewMode = ref<'timeline' | 'weekly' | 'checklist'>('timeline')
const selectedFileId = ref<string | null>(null)
const pasteCatalogText = ref('')
const isAnalyzingCatalog = ref(false)
const expandedChapters = ref<Record<number, boolean>>({ 0: true })

// Subject Modal
const showSubjectModal = ref(false)
const selectedSubjectForEdit = ref<Subject | null>(null)

// Materials registration
const showRegisterModal = ref(false)
const registerForm = ref({
  name: '',
  filePath: '',
  fileType: 'PDF',
  fileSize: 0
})

// Task creation dialog
const showTaskModal = ref(false)
const taskForm = ref({
  name: '',
  subjectId: '',
  duration: 60,
  load: 'medium' as 'low' | 'medium' | 'high',
  loadText: '2.0 🧠'
})

// AI refinement states
const isRefiningAi = ref(false)
const aiRefiningText = ref('')
let abortController: AbortController | null = null

// Knowledge block search and edit form
const blockDialogVisible = ref(false)
const selectedBlock = ref<any>(null)
const isEditMode = ref(false)
const isCreateMode = ref(false)
const blockSearchQuery = ref('')
const editForm = ref({
  id: '',
  subject: '',
  title: '',
  color: 'rgba(230, 223, 216, 0.5)',
  preview: '',
  source: '手动添加'
})
const formErrors = ref({ subject: false, title: false, preview: false })
const resetFormErrors = () => {
  formErrors.value = { subject: false, title: false, preview: false }
}

const themeColors = [
  { name: '清新绿 (Nordic Green)', value: 'rgba(181, 196, 177, 0.4)' },
  { name: '温柔沙 (Warm Sand)', value: 'rgba(217, 197, 178, 0.4)' },
  { name: '复古粉 (Dusty Rose)', value: 'rgba(212, 163, 163, 0.4)' },
  { name: '极光蓝 (Soft Blue)', value: 'rgba(179, 192, 207, 0.4)' },
  { name: '麦芽黄 (Oatmeal)', value: 'rgba(230, 223, 216, 0.5)' }
]

// Drag & Drop Timeline states
const draggedItem = ref<{ type: 'pending' | 'scheduled', idOrTime: string } | null>(null)
const dragOverSlot = ref<string | null>(null)
const dragOverPending = ref(false)

// Lifecycle
onMounted(async () => {
  await blockStore.fetchBlocks(undefined, activeSubjectId.value || undefined)
  await taskStore.fetchTasks()
  if (activeSubjectId.value) {
    await subjectStore.loadSourceFiles(activeSubjectId.value)
  }
  window.addEventListener('open-block-detail', handleOpenBlockDetailEvent)
})

onUnmounted(() => {
  window.removeEventListener('open-block-detail', handleOpenBlockDetailEvent)
  if (abortController) abortController.abort()
})

// Computeds
const selectedFile = computed(() => {
  return activeSourceFiles.value.find(f => f.id === selectedFileId.value) || null
})

const subjectBlocks = computed(() => {
  if (!activeSubjectId.value) return recentBlocks.value.filter(b => b.subject !== 'AI 回答' && b.source !== 'RAG 推理引擎')
  return recentBlocks.value.filter(b => b.subjectId === activeSubjectId.value)
})

const parsedCatalog = computed(() => {
  if (!selectedFile.value || !selectedFile.value.catalog_json) return []
  try {
    return JSON.parse(selectedFile.value.catalog_json)
  } catch (e) {
    console.error('Failed to parse catalog_json:', e)
    return []
  }
})

const realBlocks = computed(() => {
  return recentBlocks.value.filter(b => b.subject !== 'AI 回答' && b.source !== 'RAG 推理引擎')
})

const filteredBlocks = computed(() => {
  const queryText = blockSearchQuery.value.trim().toLowerCase()
  const sourceList = activeSubjectId.value ? subjectBlocks.value : realBlocks.value
  if (!queryText) return sourceList
  return sourceList.filter(b => 
    (b.title && b.title.toLowerCase().includes(queryText)) || 
    (b.subject && b.subject.toLowerCase().includes(queryText)) ||
    (b.preview && b.preview.toLowerCase().includes(queryText))
  )
})

// Timetable filtering computed
const filteredPendingTasks = computed(() => {
  let list = pendingTasks.value.filter(t => t.status === 'pending')
  if (activeSubjectId.value) {
    list = list.filter(t => t.subjectId === activeSubjectId.value)
  }
  return list
})

const filteredTimeSlots = computed(() => {
  return timeSlots.value.map(slot => {
    if (activeSubjectId.value && slot.task && slot.task.subjectId !== activeSubjectId.value) {
      return { ...slot, task: null }
    }
    return slot
  })
})

// Helpers
const getFileIcon = (fileType: string) => {
  const type = (fileType || '').toLowerCase()
  if (type.includes('pdf')) return '📕'
  if (type.includes('md') || type.includes('markdown')) return '📝'
  if (type.includes('ppt')) return '📊'
  if (type.includes('doc')) return '📘'
  return '📄'
}

const toggleChapter = (index: any) => {
  expandedChapters.value[index] = !expandedChapters.value[index]
}
const isChapterExpanded = (index: any) => {
  return expandedChapters.value[index] !== false
}

const selectSubject = (id: string | null) => {
  subjectStore.setActiveSubject(id)
  activeTab.value = 'materials'
  selectedFileId.value = null
}

const viewFileOutline = (fileId: string) => {
  selectedFileId.value = fileId
  activeTab.value = 'outlines'
}

// Ingest catalog via AI
const handleAnalyzeCatalog = async () => {
  if (!selectedFile.value || !pasteCatalogText.value.trim()) return
  isAnalyzingCatalog.value = true
  try {
    await subjectStore.analyzeCatalogViaAi(selectedFile.value.id, pasteCatalogText.value.trim())
    pasteCatalogText.value = ''
    ElNotification({
      title: '✨ 目录大纲解析完成',
      message: 'AI 已成功结构化提取该学习材料的章节大纲！',
      type: 'success',
      position: 'top-right'
    })
  } catch (e) {
    console.error(e)
    ElNotification({
      title: '⚠️ 目录解析失败',
      message: '解析失败，请检查网络或 AI 接口。',
      type: 'error',
      position: 'top-right'
    })
  } finally {
    isAnalyzingCatalog.value = false
  }
}

// Register materials
const handleRegisterFile = async () => {
  if (!registerForm.value.name.trim() || !registerForm.value.filePath.trim()) return
  if (!activeSubjectId.value) return

  try {
    const sizeInBytes = Math.round(registerForm.value.fileSize * 1024 * 1024)
    const newFileId = await subjectStore.addSourceFile(
      activeSubjectId.value,
      registerForm.value.name.trim(),
      registerForm.value.filePath.trim(),
      registerForm.value.fileType,
      sizeInBytes
    )
    if (!selectedFileId.value) {
      selectedFileId.value = newFileId
    }
    showRegisterModal.value = false
    registerForm.value = { name: '', filePath: '', fileType: 'PDF', fileSize: 0 }
    
    ElNotification({
      title: '📁 材料登记成功',
      message: '已成功在本地登记了该参考材料路径。',
      type: 'success',
      position: 'top-right'
    })
  } catch (e) {
    console.error(e)
  }
}

const deleteSourceFile = async (fileId: string) => {
  if (confirm('确定要移除此材料的登记记录吗？此操作将同步断开其目录大纲。')) {
    try {
      await subjectStore.deleteSourceFile(fileId)
      if (selectedFileId.value === fileId) {
        selectedFileId.value = null
      }
      ElNotification({
        title: '🗑️ 登记已移除',
        message: '参考材料记录已从本地 SQLite 中清除。',
        type: 'success',
        position: 'top-right'
      })
    } catch (e) {
      console.error(e)
    }
  }
}

// Subject Hall actions
const openCreateSubject = (subject: Subject | null) => {
  selectedSubjectForEdit.value = subject
  showSubjectModal.value = true
}
const closeCreateSubject = () => {
  showSubjectModal.value = false
  selectedSubjectForEdit.value = null
}
const handleSaveSubject = async (formData: any) => {
  try {
    if (formData.id) {
      await subjectStore.updateSubject(formData)
    } else {
      await subjectStore.addSubject(formData.name, formData.description, formData.icon, formData.color)
    }
    closeCreateSubject()
  } catch (e) {
    console.error('Failed to save subject:', e)
  }
}
const confirmDeleteSubject = async (subject: Subject) => {
  if (confirm(`确定要删除学科空间“${subject.name}”吗？这将同步删除登记的材料。`)) {
    try {
      await subjectStore.deleteSubject(subject.id)
      ElNotification({
        title: '🗑️ 学科空间已删除',
        message: `“${subject.name}” 空间已彻底从本地数据库移除。`,
        type: 'success',
        position: 'top-right'
      })
    } catch (e) {
      console.error(e)
    }
  }
}

// Watch subject change
watch(activeSubjectId, (newId) => {
  blockStore.fetchBlocks(undefined, newId || undefined)
  if (newId) {
    subjectStore.loadSourceFiles(newId)
    setTimeout(() => {
      if (activeSourceFiles.value.length > 0 && !selectedFileId.value) {
        selectedFileId.value = activeSourceFiles.value[0].id
      }
    }, 100)
  }
})

// Knowledge Block Detail & CRUD
const handleBlockClick = (block: any) => {
  selectedBlock.value = block
  blockDialogVisible.value = true
}

const startEdit = () => {
  resetFormErrors()
  isEditMode.value = true
  isCreateMode.value = false
  if (selectedBlock.value) {
    editForm.value = {
      id: selectedBlock.value.id || '',
      subject: selectedBlock.value.subject || '',
      title: selectedBlock.value.title || '',
      color: selectedBlock.value.color || 'rgba(230, 223, 216, 0.5)',
      preview: selectedBlock.value.preview || '',
      source: selectedBlock.value.source || '手动编辑'
    }
  }
}

const openCreateDialog = () => {
  resetFormErrors()
  selectedBlock.value = null
  isEditMode.value = true
  isCreateMode.value = true
  editForm.value = {
    id: '',
    subject: activeSubject.value ? activeSubject.value.name : '',
    title: '',
    color: activeSubject.value ? activeSubject.value.color : 'rgba(181, 196, 177, 0.4)',
    preview: '',
    source: '手动创建'
  }
  blockDialogVisible.value = true
}

const openCreateDialogWithContent = (title: string, content: string) => {
  resetFormErrors()
  selectedBlock.value = null
  isEditMode.value = true
  isCreateMode.value = true
  editForm.value = {
    id: '',
    subject: activeSubject.value ? activeSubject.value.name : '学科要点',
    title: title,
    color: activeSubject.value ? activeSubject.value.color : 'rgba(181, 196, 177, 0.4)',
    preview: content,
    source: 'AI 提炼生成'
  }
  blockDialogVisible.value = true
}

const cancelEdit = () => {
  resetFormErrors()
  if (isCreateMode.value) {
    blockDialogVisible.value = false
  } else {
    isEditMode.value = false
  }
}

const closeBlockDialog = () => {
  resetFormErrors()
  blockDialogVisible.value = false
  isEditMode.value = false
  isCreateMode.value = false
}

const handleModalOverlayClick = () => {
  closeBlockDialog()
}

const handleSaveBlock = async () => {
  formErrors.value.subject = !editForm.value.subject.trim()
  formErrors.value.title   = !editForm.value.title.trim()
  formErrors.value.preview = !editForm.value.preview.trim()
  if (formErrors.value.subject || formErrors.value.title || formErrors.value.preview) {
    ElNotification({
      title: '⚠️ 无法保存',
      message: '请完整填写所有必选字段！',
      type: 'warning',
      position: 'top-right'
    })
    return
  }

  if (isCreateMode.value) {
    const newBlock = {
      subject: editForm.value.subject,
      title: editForm.value.title,
      preview: editForm.value.preview,
      time: new Date().toLocaleString(),
      source: editForm.value.source,
      color: editForm.value.color,
      subjectId: activeSubjectId.value || undefined,
      sourceFileId: selectedFileId.value || undefined
    }
    await blockStore.addBlock(newBlock)
    ElNotification({
      title: '✨ 知识已录入本地',
      message: `已成功保存 [${editForm.value.subject}] 知识块。`,
      type: 'success',
      position: 'top-right'
    })
  } else {
    const updatedBlock = {
      ...selectedBlock.value,
      subject: editForm.value.subject,
      title: editForm.value.title,
      preview: editForm.value.preview,
      color: editForm.value.color,
      time: new Date().toLocaleString()
    }
    await blockStore.updateBlock(updatedBlock)
    selectedBlock.value = updatedBlock
    ElNotification({
      title: '📝 知识块更新成功',
      message: '修改已保存并准备同步。',
      type: 'success',
      position: 'top-right'
    })
  }
  isEditMode.value = false
  isCreateMode.value = false
  blockDialogVisible.value = false
}

const handleDeleteBlock = async (id: string) => {
  if (!id) return
  if (confirm('确定要删除这个知识块吗？此操作将同步至所有设备。')) {
    try {
      await blockStore.removeBlock(id)
      blockDialogVisible.value = false
      ElNotification({
        title: '🗑️ 知识已删除',
        message: '该知识块已成功移除。',
        type: 'success',
        position: 'top-right'
      })
    } catch (e) {
      console.error(e)
    }
  }
}

const handleCopyBlockContent = (content: string) => {
  if (!content) return
  navigator.clipboard.writeText(content)
  ElNotification({
    title: '📋 已复制',
    message: '内容已成功复制到剪贴板。',
    type: 'success',
    position: 'top-right',
    duration: 2000
  })
}

const handleOpenBlockDetailEvent = (e: Event) => {
  const customEvent = e as CustomEvent
  if (customEvent.detail) {
    selectedBlock.value = customEvent.detail
    isEditMode.value = false
    blockDialogVisible.value = true
  }
}

// Background AI refinement for specific outline section
const triggerAiRefine = async (chapterTitle: string, sectionName: string) => {
  if (!selectedFile.value) return
  
  isRefiningAi.value = true
  aiRefiningText.value = `AI 正在提炼章节 [${sectionName}]`
  
  const refinePrompt = `请针对学习材料《${selectedFile.value.name}》中“${chapterTitle} - ${sectionName}”的知识要点进行精细提炼。提炼出其核心概念、工作机制或流程，并以结构化、易于复习的 Markdown 形式输出。`
  
  let responseContent = ''
  abortController = new AbortController()
  
  try {
    const authStore = useAuthStore()
    const token = authStore.token || ''
    
    let url = `/api/ai/chat?message=${encodeURIComponent(refinePrompt)}`
    if (activeSubjectId.value) {
      url += `&subjectId=${encodeURIComponent(activeSubjectId.value)}`
    }
    if (selectedFile.value) {
      url += `&sourceFileName=${encodeURIComponent(selectedFile.value.name)}`
    }
    
    await streamFetch(
      url,
      token,
      (chunk) => {
        responseContent += chunk
      },
      () => {
        isRefiningAi.value = false
        abortController = null
        openCreateDialogWithContent(sectionName, responseContent)
      },
      (err) => {
        isRefiningAi.value = false
        abortController = null
        if (err.name !== 'AbortError') {
          ElNotification({
            title: '⚠️ AI 提炼失败',
            message: err.message || '网络连接异常',
            type: 'error',
            position: 'top-right'
          })
        }
      },
      abortController.signal
    )
  } catch (error) {
    console.error('AI refinement failed:', error)
    isRefiningAi.value = false
  }
}

// Tasks Actions inside Home Sidebar Timetable
const openCreateTaskDialog = () => {
  taskForm.value = {
    name: '',
    subjectId: activeSubjectId.value || '',
    duration: 60,
    load: 'medium' as 'low' | 'medium' | 'high',
    loadText: '2.0 🧠'
  }
  showTaskModal.value = true
}

const triggerAddTask = (sectionName: string) => {
  taskForm.value.name = `学习 ${sectionName}`
  taskForm.value.subjectId = activeSubjectId.value || ''
  taskForm.value.duration = 60
  taskForm.value.load = 'medium'
  taskForm.value.loadText = '2.0 🧠'
  showTaskModal.value = true
}


const handleAddTask = async () => {
  const currentSubjId = activeSubjectId.value || taskForm.value.subjectId
  const subjObj = subjectStore.subjects.find(s => s.id === currentSubjId)
  if (!taskForm.value.name.trim() || !subjObj) return

  try {
    await taskStore.addTask({
      name: taskForm.value.name.trim(),
      subject: subjObj.name,
      desc: `新建任务。`,
      color: subjObj.color,
      duration: taskForm.value.duration,
      load: taskForm.value.load,
      loadText: taskForm.value.loadText,
      status: 'pending',
      subjectId: subjObj.id
    })
    showTaskModal.value = false
    ElNotification({
      title: '🎯 任务已生成',
      message: `“${taskForm.value.name}” 已加入待安排列表。`,
      type: 'success',
      position: 'top-right'
    })
  } catch (e) {
    console.error(e)
  }
}

const toggleTaskCompletion = async (task: Task) => {
  if (!task.id) return
  const newStatus = task.status === 'completed' ? 'pending' : 'completed'
  await taskStore.updateTaskStatus(task.id, newStatus)
  ElNotification({
    title: newStatus === 'completed' ? '🎯 任务已完成' : '📋 任务已设为待办',
    message: `“${task.name}” 的状态已同步更新。`,
    type: 'success',
    position: 'top-right',
    duration: 2000
  })
}

const handleDeleteScheduledTask = async (slot: any) => {
  if (slot.task && slot.task.id) {
    try {
      await ElMessageBox.confirm(
        '确定要删除这个排期任务吗？',
        '删除提示',
        {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )
      await taskStore.deleteTask(slot.task.id)
      ElNotification({
        title: '🗑️ 任务已删除',
        message: '排期任务已成功移除。',
        type: 'success',
        position: 'top-right'
      })
    } catch (e) {
      if (e !== 'cancel') {
        console.error(e)
      }
    }
  }
}

// Drag & Drop Timeline event handlers
const handleDragStart = (e: DragEvent, type: 'pending' | 'scheduled', idOrTime: string) => {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', idOrTime)
  }
  draggedItem.value = { type, idOrTime }
}

const handleDragOver = (slotTime: string) => {
  if (!(draggedItem.value?.type === 'scheduled' && draggedItem.value.idOrTime === slotTime)) {
    dragOverSlot.value = slotTime
  } else {
    dragOverSlot.value = null
  }
}

const handleDragLeave = () => {
  dragOverSlot.value = null
}

const handleDrop = (slotTime: string) => {
  if (draggedItem.value) {
    if (draggedItem.value.type === 'pending') {
      taskStore.scheduleTask(draggedItem.value.idOrTime, slotTime)
    } else if (draggedItem.value.type === 'scheduled' && draggedItem.value.idOrTime !== slotTime) {
      taskStore.rescheduleTask(draggedItem.value.idOrTime, slotTime)
    }
  }
  draggedItem.value = null
  dragOverSlot.value = null
  dragOverPending.value = false
}

const handleDropOnPending = () => {
  if (draggedItem.value?.type === 'scheduled') {
    taskStore.unscheduleTask(draggedItem.value.idOrTime)
  }
  draggedItem.value = null
  dragOverPending.value = false
}
</script>

<style scoped>
.home-container {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--color-bg-primary);
  flex-direction: row;
}

/* LEFT WORKSPACE */
.home-left {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 24px;
  gap: 20px;
  min-width: 0;
}

.resize-handle {
  width: 8px;
  cursor: col-resize;
  background: transparent;
  position: relative;
  z-index: 5;
  transition: background var(--transition-fast);
  margin: 0 -4px;
  flex-shrink: 0;
}

.resize-handle::after {
  content: '';
  position: absolute;
  left: 3px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--border-subtle);
  transition: background var(--transition-fast);
}

.resize-handle:hover::after,
.resize-handle:active::after {
  background: var(--color-oatmeal-dark);
}

.subject-pane {
  flex: 1.1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.01);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  padding: 20px;
}

.blocks-pane {
  flex: 0.9;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.01);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  padding: 20px;
  overflow: hidden;
}

.pane-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.pane-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.pane-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.pane-desc {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.pane-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}

.pane-action-btn.primary {
  background: var(--accent-gradient);
  color: white;
  border: none;
}

.pane-action-btn.primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.pane-action-btn.secondary {
  background: transparent;
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
}

.pane-action-btn.secondary:hover {
  border-color: var(--border-accent);
  color: var(--text-primary);
}

/* Subjects Hall grid styling */
.hall-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.subjects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
  overflow-y: auto;
  flex: 1;
  padding-bottom: 10px;
}

.subject-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  padding: 16px;
  cursor: pointer;
  transition: all var(--transition-normal);
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  box-shadow: var(--glass-shadow);
}

.subject-card:hover {
  transform: translateY(-4px);
  border-color: var(--border-strong);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.05);
}

.subject-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 3px;
  background: var(--subj-theme-color);
}

.subject-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.subject-card-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.subject-card-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.subject-card:hover .subject-card-actions {
  opacity: 1;
}

.card-action-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all var(--transition-fast);
}

.card-action-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

.card-action-btn.delete:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.subject-card-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.subject-card-desc {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.4;
  margin-bottom: 12px;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.subject-card-footer {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--text-muted);
  border-top: 1px solid var(--border-subtle);
  padding-top: 8px;
}

.add-card {
  border: 1px dashed var(--border-default);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
}

.add-card:hover {
  background: rgba(255, 255, 255, 0.02);
  border-color: var(--text-primary);
}

.add-plus {
  font-size: 24px;
  color: var(--text-muted);
}

.add-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}

/* Workspace Active Mode */
.workspace-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.workspace-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.back-btn {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 5px 12px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.subject-title-area {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}

.subject-emoji {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.subject-meta-text {
  display: flex;
  flex-direction: column;
}

.subject-title {
  font-size: 15px;
  font-weight: 800;
  color: var(--text-primary);
}

.subject-description {
  font-size: 11px;
  color: var(--text-muted);
}

/* Workspace Tabs */
.workspace-tabs-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tabs-header {
  display: flex;
  gap: 4px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-subtle);
  padding: 3px;
  border-radius: 10px;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  background: none;
  border: none;
  padding: 6px 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  border-radius: 8px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.tab-btn:hover {
  color: var(--text-primary);
}

.tab-btn.is-active {
  background: var(--border-subtle);
  color: var(--text-primary);
}

.tab-body {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.tab-content {
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* Reference Materials Tab */
.materials-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.materials-header h3 {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}

.register-file-btn {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.register-file-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.materials-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: var(--radius-md);
}

.file-icon-wrapper {
  font-size: 16px;
}

.file-meta-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.file-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-path {
  font-size: 9px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-stats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 10px;
  color: var(--text-muted);
  gap: 1px;
}

.file-actions {
  display: flex;
  gap: 6px;
  margin-left: 8px;
}

.file-action-btn {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-default);
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.file-action-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

.file-action-btn.delete:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.25);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px;
  color: var(--text-muted);
  text-align: center;
}

.empty-icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.empty-state p {
  font-size: 11px;
}

/* Outline Tab */
.outlines-tab {
  height: 100%;
  overflow: hidden;
}

.outlines-header {
  margin-bottom: 12px;
  flex-shrink: 0;
}

.file-selector-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-selector-row label {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 600;
}

.file-select-dropdown {
  flex: 1;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 5px 10px;
  color: var(--text-primary);
  font-size: 11px;
  outline: none;
  cursor: pointer;
}

.outline-body {
  flex: 1;
  overflow-y: auto;
}

.paste-catalog-prompt {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.catalog-hint {
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.catalog-textarea {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  color: var(--text-primary);
  font-size: 11px;
  resize: none;
  outline: none;
}

.analyze-catalog-btn {
  background: var(--accent-gradient);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--transition-fast);
  align-self: flex-start;
}

.analyze-catalog-btn:hover {
  opacity: 0.9;
}

.catalog-tree {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chapter-accordion {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  overflow: hidden;
}

.chapter-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
  transition: background var(--transition-fast);
}

.chapter-title:hover {
  background: rgba(255, 255, 255, 0.04);
}

.chapter-arrow {
  font-size: 9px;
  color: var(--text-muted);
}

.chapter-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
}

.sections-list {
  display: flex;
  flex-direction: column;
  padding: 4px 12px 10px 24px;
  gap: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.02);
}

.section-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
}

.section-item:hover {
  background: rgba(255, 255, 255, 0.02);
}

.section-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.section-bullet {
  color: var(--text-muted);
}

.section-name {
  font-size: 11.5px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-actions {
  display: flex;
  gap: 4px;
}

.sec-action-btn {
  background: none;
  border: none;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.sec-action-btn.ai {
  color: var(--color-oatmeal-dark);
  background: rgba(197, 168, 128, 0.12);
}

.sec-action-btn.ai:hover {
  background: rgba(197, 168, 128, 0.22);
}

.sec-action-btn.task {
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-default);
}

.sec-action-btn.task:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

.graph-tab {
  height: 100%;
}

/* LEFT BOTTOM: Knowledge Blocks */
.blocks-grid-scroll {
  flex: 1;
  overflow-x: auto;
  overflow-y: auto;
}

.blocks-grid-inner {
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(2, 120px);
  grid-auto-columns: 200px;
  gap: 14px;
  padding-bottom: 8px;
}

.block-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: 16px;
  cursor: pointer;
  transition: all var(--transition-normal);
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.block-card:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.15);
}

.block-tag {
  align-self: flex-start;
  font-size: 9px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-weight: 500;
  margin-bottom: 8px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.block-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.block-preview {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.65;
  margin-bottom: 8px;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.block-meta {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: var(--text-muted);
}

.no-results-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--text-muted);
  gap: 8px;
}

.block-search-box {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 4px 10px;
  width: 160px;
}

.search-icon {
  color: var(--text-muted);
  margin-right: 6px;
  flex-shrink: 0;
}

.block-search-input {
  background: transparent;
  border: none;
  outline: none;
  font-size: 11px;
  color: var(--text-primary);
  width: 100%;
}

/* RIGHT TIMELINE SIDEBAR */
.home-right {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.005);
  padding: 24px 18px;
  gap: 20px;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.sidebar-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.add-task-btn {
  width: 32px;
  height: 32px;
  background: var(--accent-gradient);
  border: none;
  color: white;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.add-task-btn:hover {
  opacity: 0.9;
}

/* Segmented Controls: View Mode Tabs */
.view-tabs {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 5px;
}

.view-tab-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 7px 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.view-tab-btn:hover {
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.03);
}

.view-tab-btn.is-active {
  background: var(--color-bg-primary);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
  font-weight: 700;
}

/* Weekly Placeholder */
.weekly-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-muted);
  padding: 20px;
}

.placeholder-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
}

.placeholder-desc {
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
}

.schedule-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.01);
  border: 1px solid rgba(255, 255, 255, 0.02);
  border-radius: var(--radius-lg);
  padding: 12px;
}

.section-subtitle {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.time-slots {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.time-slot {
  display: flex;
  align-items: stretch;
  gap: 10px;
  min-height: 48px;
  position: relative;
}

.slot-time {
  width: 44px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-secondary);
  padding-top: 4px;
  flex-shrink: 0;
  text-align: right;
  letter-spacing: -0.2px;
}

.slot-time.current-time {
  color: var(--color-oatmeal-dark);
  font-weight: 800;
}

.slot-task {
  flex: 1;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-left: 3px solid;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  cursor: grab;
  transition: all var(--transition-normal);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.slot-task:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.12);
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}

.task-name {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-tag {
  align-self: flex-start;
  font-size: 8.5px;
  padding: 0 4px;
  border-radius: 3px;
  font-weight: 500;
  color: var(--text-primary);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-delete-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 9px;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--transition-fast);
  padding: 2px;
}

.slot-task:hover .task-delete-btn {
  opacity: 0.8;
}

.task-delete-btn:hover {
  color: #ef4444;
}

.slot-empty-pill {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.015);
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-full);
  color: var(--text-secondary);
  font-size: 11.5px;
  transition: all var(--transition-fast);
  cursor: default;
}

.slot-empty-pill:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.slot-empty-pill.is-drag-over {
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--border-accent);
  border-style: solid;
}

.pill-text {
  font-weight: 600;
}

.pill-hint {
  font-size: 10px;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.slot-empty-pill:hover .pill-hint {
  opacity: 1;
}

/* Current Indicator */
.is-current .slot-time {
  color: var(--color-oatmeal-dark);
  font-weight: 800;
}

.current-indicator {
  position: absolute;
  left: 54px;
  right: 0;
  top: 0;
  display: flex;
  align-items: center;
  pointer-events: none;
}

.current-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-oatmeal-dark);
  z-index: 1;
}

.current-line {
  flex: 1;
  height: 1px;
  background: var(--color-oatmeal-dark);
  opacity: 0.3;
}

/* Pending checklist */
.pending-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.01);
  border: 1px solid rgba(255, 255, 255, 0.02);
  border-radius: var(--radius-lg);
  padding: 12px;
}

.pending-tasks-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pending-tasks-list.drag-over {
  background: rgba(255, 255, 255, 0.02);
}

.pending-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: var(--radius-md);
  cursor: grab;
  transition: all var(--transition-normal);
}

.pending-card:hover {
  border-color: rgba(255, 255, 255, 0.1);
  transform: translateX(-1px);
}

.card-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.task-checkbox {
  width: 13px;
  height: 13px;
  border-radius: 4px;
  cursor: pointer;
}

.pending-color {
  width: 3px;
  height: 24px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.pending-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.pending-name {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pending-subject {
  font-size: 9px;
  color: var(--text-muted);
}

.drag-handle {
  color: var(--text-muted);
  font-size: 14px;
  opacity: 0.3;
  cursor: grab;
}

.pending-card:hover .drag-handle {
  opacity: 0.7;
}

.empty-pending {
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
  padding: 20px 0;
}

/* AI Refine Loading Overlay Styles */
.refine-loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  animation: fade-in 0.25s ease-out;
}

.refine-loading-card {
  background: var(--glass-bg, rgba(28, 28, 30, 0.85));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius-xl, 24px);
  padding: 32px;
  width: 340px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  box-shadow: var(--glass-shadow);
  gap: 16px;
}

.refine-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: var(--color-oatmeal-dark);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.refine-text {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-primary);
}

.refine-hint {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
}

/* ===== Modals ===== */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center; }

.modal-container { width: 90%; max-width: 520px; background: #FFFFFF; border-radius: 20px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.04); border: 1px solid var(--border-subtle); display: flex; flex-direction: column; overflow: hidden; animation: scale-up 0.3s cubic-bezier(0.16, 1, 0.3, 1); z-index: 1001; position: relative; margin: 0 auto; max-height: 90vh; }
html.dark .modal-container { background: #181D18; border-color: rgba(163, 177, 155, 0.25); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4); }
@keyframes scale-up { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.modal-container .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid var(--border-subtle); }
.modal-container .modal-header h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.3px; }
.close-btn { background: none; border: none; font-size: 20px; color: var(--text-muted); cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: all var(--transition-fast); }
.close-btn:hover { background: rgba(0, 0, 0, 0.04); color: var(--text-primary); }
html.dark .close-btn:hover { background: rgba(255, 255, 255, 0.06); }
.modal-container .modal-body { padding: 22px 28px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; }
.form-group label { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.styled-input, .styled-textarea, .styled-select { width: 100%; padding: 12px 14px; background: var(--color-bg-secondary); border: 1px solid var(--border-default); border-radius: 12px; font-size: 13.5px; color: var(--text-primary); transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); outline: none; box-sizing: border-box; font-family: inherit; }
.styled-input:focus, .styled-textarea:focus, .styled-select:focus { border-color: #7D9372; background: var(--color-bg-primary); box-shadow: 0 0 0 3px rgba(125, 147, 114, 0.15); }
html.dark .styled-input:focus, html.dark .styled-textarea:focus, html.dark .styled-select:focus { border-color: #9AB08F; background: rgba(255, 255, 255, 0.05); box-shadow: 0 0 0 3px rgba(125, 147, 114, 0.2); }
.styled-textarea { resize: vertical; line-height: 1.6; min-height: 100px; }
.modal-container .modal-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 28px 22px; border-top: 1px solid var(--border-subtle); background: transparent; }
.btn-secondary { background: transparent; border: 1px solid var(--border-default); color: var(--text-secondary); padding: 8px 20px; border-radius: 9999px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-secondary:hover { background: var(--color-bg-secondary); color: var(--text-primary); }
.btn-primary { background: var(--btn-primary-bg, linear-gradient(135deg, #A3B19B 0%, #7D9372 100%)); border: none; color: #FFFFFF; padding: 8px 26px; border-radius: 9999px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 2px 8px rgba(125, 147, 114, 0.3); }
.btn-primary:hover:not(:disabled) { background: #6E8364; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(125, 147, 114, 0.45); }
.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
html.dark .btn-primary { background: #9AB08F; color: #1a1a1a; }
html.dark .btn-primary:hover { background: #b0c2a7; box-shadow: 0 4px 12px rgba(154, 176, 143, 0.2); }

.modal-tags { display: flex; align-items: center; gap: 8px; }
.modal-tag { font-size: 11px; padding: 4px 12px; border-radius: 999px; color: var(--text-primary); font-weight: 600; border: 1px solid var(--border-default); box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
.modal-source-tag { font-size: 11.5px; color: var(--text-muted); font-weight: 500; }
.block-read-header { display: flex; flex-direction: column; gap: 12px; }
.modal-title { font-size: 22px; font-weight: 800; color: var(--text-primary); margin: 0; letter-spacing: -0.5px; line-height: 1.3; }
.modal-meta-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.modal-time-badge { display: inline-flex; align-items: center; font-size: 11.5px; font-weight: 600; color: var(--text-secondary); background: var(--color-bg-secondary); padding: 4px 12px; border-radius: 999px; border: 1px solid var(--border-default); }
.modal-divider { height: 1px; background: linear-gradient(90deg, transparent, var(--border-subtle) 15%, var(--border-subtle) 85%, transparent); margin: 20px 0; border: none; }

.color-options { display: flex; gap: 8px; }
.color-dot { width: 22px; height: 22px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: all var(--transition-fast); }
.color-dot:hover { transform: scale(1.1); }
.color-dot.is-selected { border-color: var(--text-primary); transform: scale(1.15); }

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
html.dark .summary-markdown :deep(h2) { border-bottom-color: rgba(255,255,255,0.04); }
html.dark .summary-markdown :deep(code) { background: rgba(255,255,255,0.06); color: #9AB08F; }
html.dark .summary-markdown :deep(blockquote) { background: rgba(154, 176, 143, 0.08); border-left-color: #9AB08F; }
html.dark .summary-markdown :deep(th) { background: rgba(255,255,255,0.02); }
</style>
