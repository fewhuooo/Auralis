<template>
  <div class="asset-studio">
    <!-- LEFT: Asset Tree (Nested Folder Explorer + Upload Inline) -->
    <aside class="studio-left">
      <div class="panel-header">
        <span class="panel-title">{{ t({ 'zh-CN': '资料库', en: 'Library', ja: '資料ライブラリ' }) }}</span>
        <button class="icon-btn" :title="t({ 'zh-CN': '导入文件', en: 'Import file', ja: 'ファイルを取り込む' })" @click="showRegisterModal = true">
          <IconPlus :size="16" :stroke-width="2" />
        </button>
      </div>

      <!-- Search -->
      <div class="tree-search">
        <div class="search-input-wrapper">
          <IconSearch :size="13" :stroke-width="2" class="search-icon" />
          <input v-model="searchQ" class="search-input" :placeholder="t({ 'zh-CN': '搜索文件、知识或任务...', en: 'Search files, knowledge, or tasks…', ja: 'ファイル・知識・タスクを検索…' })" />
          <button v-if="searchQ" class="search-clear-btn" @click="searchQ = ''" :title="t({ 'zh-CN': '清空搜索', en: 'Clear search', ja: '検索をクリア' })">✕</button>
        </div>
      </div>

      <!-- Upload Progress -->
      <div v-if="isUploading" class="upload-progress-wrapper">
        <div class="upload-progress-header">
          <span class="upload-progress-title" aria-live="polite">{{ uploadStatusText || t({ 'zh-CN': '正在导入本地文件...', en: 'Importing local files…', ja: 'ローカルファイルを取り込み中…' }) }}</span>
          <span class="upload-progress-percent">{{ uploadProgress }}%</span>
        </div>
        <div class="upload-progress-track">
          <div class="upload-progress-fill" :style="{ width: uploadProgress + '%' }"></div>
        </div>
      </div>

      <!-- Tree Hierarchy -->



      <!-- Tree Hierarchy -->
      <div class="tree-body">
        <div v-if="isLoadingAssets" class="tree-loading">
          <span class="loading-spinner"></span> {{ t({ 'zh-CN': '加载中...', en: 'Loading…', ja: '読み込み中…' }) }}
        </div>
        <div v-else-if="filteredGroups.length === 0" class="tree-empty">
          <IconArchive :size="24" :stroke-width="1.6" class="empty-tree-icon" />
          <p>{{ t({ 'zh-CN': '暂无数据', en: 'No items yet', ja: '項目がありません' }) }}</p>
        </div>
        <template v-else>
          <!-- Level 1: Groups (e.g. 全部, 学科A) -->
          <div v-for="group in filteredGroups" :key="group.id" class="tree-group">
            <div class="tree-group-header" @click="toggleTreeNode(group)">
              <span class="group-arrow">{{ group.open ? '▾' : '▸' }}</span>
              <component :is="group.lucideIcon" :size="13" class="group-icon" />
              <span class="group-name">{{ group.name }}</span>
              <button v-if="group.id !== 'all'" class="header-action-btn" :title="t({ 'zh-CN': '上传文件', en: 'Upload file', ja: 'ファイルをアップロード' })" @click.stop="openUploadForGroup(group.id)">
                <IconPlus :size="12" :stroke-width="2" />
              </button>
            </div>
            
            <div v-if="group.open" class="tree-children">
              <!-- Level 2: Folders (e.g. 全部文件, 任务) -->
              <div v-for="folder in group.children" :key="folder.id" class="tree-folder-container">
                <div class="tree-folder-header" @click="toggleTreeNode(folder)">
                  <span class="folder-arrow">{{ folder.open ? '▾' : '▸' }}</span>
                  <component :is="folder.lucideIcon" :size="13" class="folder-icon" />
                  <span class="folder-name">{{ folder.name }}</span>
                  <span class="folder-count">{{ folder.children?.length || 0 }}</span>
                </div>
                
                <div v-if="folder.open" class="tree-items">
                  <!-- Level 3: Items (File, Block, Task) or Task Categories -->
                  <template v-for="item in folder.children" :key="item.id">
                    <div v-if="item.type === 'folder'" class="tree-subfolder-container">
                      <div
                        class="tree-folder-header"
                        :class="{ 'is-focus': focusUnassigned && item.id === 'all-tasks-unassigned' }"
                        @click="toggleTreeNode(item)"
                      >
                        <span class="folder-arrow">{{ item.open ? '▾' : '▸' }}</span>
                        <component :is="item.lucideIcon" :size="13" class="folder-icon" />
                        <span class="folder-name">{{ item.name }}</span>
                        <span class="folder-count">{{ item.children?.length || 0 }}</span>
                      </div>
                      <div v-if="item.open" class="tree-items">
                        <div
                          v-for="subitem in item.children"
                          :key="subitem.id"
                          class="tree-item tree-subitem"
                          :class="{ 'is-active': selected?.id === subitem.id }"
                          @click="selectItem(subitem)"
                        >
                          <component :is="subitem.lucideIcon" :size="14" class="item-icon" />
                          <div class="item-info">
                            <span class="item-name" :class="{ 'is-done': subitem.type === 'task' && subitem.done }">{{ subitem.name }}</span>
                            <span v-if="subitem.type === 'file'" class="item-meta">{{ subitem.time }}</span>
                            <span v-else-if="subitem.type === 'task'" class="item-meta">{{ t({ 'zh-CN': '截止：{date}', en: 'Due: {date}', ja: '期限：{date}' }, { date: subitem.due || t({ 'zh-CN': unsetDueLabel, en: 'Not set', ja: '未設定' }) }) }}</span>
                          </div>
                          <span v-if="subitem.type === 'file' && subitem.status !== 'success'" class="status-dot" :class="subitem.status" :title="subitem.statusText"></span>
                          <span v-if="subitem.type === 'task' && subitem.done" class="task-done-icon"><IconCheck :size="12" :stroke-width="2" /></span>
                        </div>
                        <div v-if="!item.children?.length" class="tree-empty-folder tree-subitem-empty">{{ t({ 'zh-CN': '无内容', en: 'Empty', ja: '項目がありません' }) }}</div>
                      </div>
                    </div>
                    <div
                      v-else
                      class="tree-item"
                      :class="{ 'is-active': selected?.id === item.id }"
                      @click="selectItem(item)"
                    >
                      <component :is="item.lucideIcon" :size="14" class="item-icon" />
                      <div class="item-info">
                        <span class="item-name" :class="{ 'is-done': item.type === 'task' && item.done }">{{ item.name }}</span>
                        <span v-if="item.type === 'file'" class="item-meta">{{ item.time }}</span>
                        <span v-else-if="item.type === 'task'" class="item-meta">{{ t({ 'zh-CN': '截止：{date}', en: 'Due: {date}', ja: '期限：{date}' }, { date: item.due || t({ 'zh-CN': unsetDueLabel, en: 'Not set', ja: '未設定' }) }) }}</span>
                      </div>
                      <span v-if="item.type === 'file' && item.status !== 'success'" class="status-dot" :class="item.status" :title="item.statusText"></span>
                      <span v-if="item.type === 'task' && item.done" class="task-done-icon"><IconCheck :size="12" :stroke-width="2" /></span>
                    </div>
                  </template>
                  <div v-if="!folder.children?.length" class="tree-empty-folder">{{ t({ 'zh-CN': '无内容', en: 'Empty', ja: '項目がありません' }) }}</div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Drop Zone (Clickable) -->
      <div
        class="drop-zone"
        :class="{ 'is-over': isDragover }"
        @dragover.prevent="isDragover = true"
        @dragleave.prevent="isDragover = false"
        @drop.prevent="handleDrop"
        @click="showRegisterModal = true"
      >
        <div class="drop-icon-wrapper">
          <IconCloudUpload :size="18" :stroke-width="1.8" class="drop-icon" />
        </div>
        <div class="drop-text-group">
          <span class="drop-text-main">{{ t({ 'zh-CN': '拖拽文件或点击上传', en: 'Drop files here or click to upload', ja: 'ファイルをドロップするか、クリックしてアップロード' }) }}</span>
          <span class="drop-text-sub">{{ t({ 'zh-CN': '支持 PDF、DOC、DOCX、PPT、PPTX 文件', en: 'Supports PDF, DOC, DOCX, PPT, and PPTX', ja: 'PDF、DOC、DOCX、PPT、PPTX に対応' }) }}</span>
        </div>
      </div>
    </aside>

    <!-- COLUMN 2: MIDDLE Dynamic Viewer (File / Block / Task) -->
    <main class="studio-middle">
      <Transition name="asset-view-fade" mode="out-in">
        <div v-if="!selected" key="empty" class="empty-state">
          <div class="empty-halo">
            <div class="empty-halo-inner">
              <IconLayoutDashboard :size="36" :stroke-width="1.6" class="empty-icon" />
            </div>
          </div>
          <h2 class="empty-title">{{ t({ 'zh-CN': '资料阅览区', en: 'Library viewer', ja: '資料ビューア' }) }}</h2>
          <p class="empty-desc">{{ t({ 'zh-CN': '在左侧选择文件、知识点或任务进行查看与编辑', en: 'Select a file, knowledge block, or task to view or edit it', ja: '左側からファイル、知識ブロック、タスクを選んで表示・編集' }) }}</p>
          <div class="empty-actions">
            <button class="btn-primary sm-btn empty-upload-btn" @click="showRegisterModal = true">
              <IconPlus :size="14" :stroke-width="2" />
              <span>{{ t({ 'zh-CN': '导入新文件', en: 'Import a file', ja: 'ファイルを取り込む' }) }}</span>
            </button>
          </div>
        </div>
        <div v-else :key="selected.id" class="detail-container">
        <!-- Dynamic Header based on Type -->
        <div class="detail-header">
          <!-- File View Header -->
          <div v-if="selected.type === 'file'" class="detail-title-row">
            <component :is="selected.lucideIcon" :size="24" class="detail-icon" />
            <div class="detail-main-info">
              <h1 class="detail-name">{{ selected.name }}</h1>
              <p class="detail-path">{{ t({ 'zh-CN': '上传于 {date} · 页数 {count} · {size}', en: 'Uploaded {date} · Pages: {count} · {size}', ja: 'アップロード日 {date} · {count} ページ · {size}' }, { date: selected.time || '', count: selected.pages || 0, size: selected.size || '' }) }}</p>
            </div>
            <span class="status-badge" :class="selected.status">{{ selected.statusText }}</span>
          </div>

          <!-- Knowledge Block View Header -->
          <div v-else-if="selected.type === 'block'" class="detail-title-row editor-bar-row">
            <div class="editor-bar-left">
              <div class="header-icon-badge">
                <IconNotes :size="18" :stroke-width="1.8" />
              </div>
              <div class="header-breadcrumb">
                <span class="crumb-parent">{{ t({ 'zh-CN': '知识库', en: 'Knowledge base', ja: '知識ベース' }) }}</span>
                <span class="crumb-sep">/</span>
                <span class="crumb-subject">{{ getSubjectName(selected.groupId) }}</span>
              </div>
            </div>
            <div class="editor-bar-right">
              <span class="editor-stats-hint">{{ t({ 'zh-CN': '字符数 {count}', en: 'Characters: {count}', ja: '{count}文字' }, { count: (selected.content || selected.preview || '').length }) }}</span>
              <button class="btn-primary sm-btn header-save-btn" @click="saveBlockEdit(selected)">
                <IconCheck :size="14" :stroke-width="2.2" />
                <span>{{ t({ 'zh-CN': '保存知识块', en: 'Save knowledge block', ja: '知識ブロックを保存' }) }}</span>
              </button>
            </div>
          </div>

          <!-- Task View Header -->
          <div v-else-if="selected.type === 'task'" class="detail-title-row editor-bar-row">
            <div class="editor-bar-left">
              <div class="header-icon-badge task-icon-badge">
                <IconListCheck :size="18" :stroke-width="1.8" />
              </div>
              <div class="header-breadcrumb">
                <span class="crumb-parent">{{ t({ 'zh-CN': '任务库', en: 'Task library', ja: 'タスク一覧' }) }}</span>
                <span class="crumb-sep">/</span>
                <span class="crumb-subject">{{ getSubjectName(selected.groupId) }}</span>
              </div>
              <button
                class="header-status-pill"
                :class="{ 'is-done': selected.done }"
                  :disabled="isScheduledCompletionLocked(selected.originalData, taskStore.currentNow)"
                @click="toggleTaskDone(selected)"
                  :title="isScheduledCompletionLocked(selected.originalData, taskStore.currentNow) ? t({ 'zh-CN': '任务时段已结束，完成状态不可取消', en: 'This task\'s scheduled time has ended and completion is locked', ja: '予定時間が終了しているため完了を取り消せません' }) : selected.done ? t({ 'zh-CN': '点击标记为待处理', en: 'Mark as pending', ja: '未完了に戻す' }) : t({ 'zh-CN': '点击标记为已完成', en: 'Mark as completed', ja: '完了にする' })"
              >
                <component :is="selected.done ? IconCircleCheck : IconCircleDot" :size="14" :stroke-width="2" />
                <span>{{ selected.done ? t({ 'zh-CN': '已完成', en: 'Completed', ja: '完了' }) : t({ 'zh-CN': '待处理', en: 'Pending', ja: '未完了' }) }}</span>
              </button>
            </div>
            <div class="editor-bar-right">
              <span v-if="selected.due" class="header-meta-pill">{{ t({ 'zh-CN': '截止：{date}', en: 'Due: {date}', ja: '期限：{date}' }, { date: selected.due }) }}</span>
              <span class="header-meta-pill">{{ t({ 'zh-CN': '预计：{duration}', en: 'Est. {duration}', ja: '見積：{duration}' }, { duration: formatDuration(selected.durationMinutes || 30) }) }}</span>
              <button type="button" class="btn-secondary sm-btn" @click="deleteTask(selected)">
                {{ t({ 'zh-CN': '删除任务', en: 'Delete task', ja: 'タスクを削除' }) }}
              </button>
              <button
                class="btn-primary sm-btn header-save-btn"
                :disabled="selected.done"
                :title="selected.done ? t({ 'zh-CN': '已完成任务不可修改属性', en: 'Completed tasks cannot be edited', ja: '完了したタスクは編集できません' }) : t({ 'zh-CN': '保存任务', en: 'Save task', ja: 'タスクを保存' })"
                @click="saveTaskEdit(selected)"
              >
                <IconCheck :size="14" :stroke-width="2.2" />
                <span>{{ t({ 'zh-CN': '保存任务', en: 'Save task', ja: 'タスクを保存' }) }}</span>
              </button>
            </div>
          </div>
        </div>

        <div class="middle-content-scroll">
          <!-- View: FILE -->
          <div v-if="selected.type === 'file'" class="full-height-viewer">
            <FilePreview v-if="selectedPreviewFile" :file="selectedPreviewFile" :bare="true" />
          </div>

          <!-- View: BLOCK -->
          <div v-else-if="selected.type === 'block'" class="editor-canvas-view">
            <div class="editor-paper-card">
              <!-- Paper Meta Top -->
              <div class="paper-meta-header">
                <div class="paper-meta-left">
                  <span class="paper-subject-pill">{{ getSubjectName(selected.groupId) }}</span>
                </div>
                <div class="paper-meta-right">
                  <span class="paper-hint-text">{{ t({ 'zh-CN': 'Markdown 实时笔记', en: 'Live Markdown notes', ja: 'Markdown ノート' }) }}</span>
                </div>
              </div>

              <!-- Title Input -->
              <div class="paper-title-row">
                <input
                  v-model="selected.name"
                  class="paper-title-input"
                  :placeholder="t({ 'zh-CN': '输入知识块标题...', en: 'Enter a knowledge block title…', ja: '知識ブロックのタイトルを入力…' })"
                />
              </div>

              <!-- Editor Divider -->
              <div class="paper-divider"></div>

              <!-- Markdown Writing Area -->
              <div class="paper-editor-section">
                <div class="editor-micro-toolbar">
                  <div class="micro-toolbar-left">
                    <span class="micro-tip">{{ t({ 'zh-CN': '正文内容 (支持 Markdown 与 LaTeX 公式)', en: 'Content (Markdown and LaTeX supported)', ja: '本文（Markdown・LaTeX に対応）' }) }}</span>
                    <div class="asset-preview-toggle-group">
                      <button
                        type="button"
                        class="asset-preview-toggle-btn"
                        :class="{ 'is-active': !isBlockPreviewMode }"
                        @click="isBlockPreviewMode = false"
                      >
                        {{ t({ 'zh-CN': '编写', en: 'Write', ja: '編集' }) }}
                      </button>
                      <button
                        type="button"
                        class="asset-preview-toggle-btn"
                        :class="{ 'is-active': isBlockPreviewMode }"
                        @click="isBlockPreviewMode = true"
                      >
                        {{ t({ 'zh-CN': '实时预览', en: 'Live preview', ja: 'プレビュー' }) }}
                      </button>
                    </div>
                  </div>
                  <span class="micro-count">{{ t({ 'zh-CN': '{count} 字', en: 'Characters: {count}', ja: '{count}文字' }, { count: (selected.content || selected.preview || '').length }) }}</span>
                </div>
                <template v-if="isBlockPreviewMode">
                  <div
                    v-if="selected.content || selected.preview"
                    class="paper-preview-card modal-markdown-body"
                    v-html="renderMarkdown(selected.content || selected.preview || '')"
                  ></div>
                  <div v-else class="paper-preview-card modal-markdown-body empty-preview-tip">
                    {{ t({ 'zh-CN': '暂无内容可供预览，在编写模式下录入内容', en: 'Nothing to preview. Enter content in Write mode.', ja: 'プレビューする内容がありません。編集モードで入力してください。' }) }}
                  </div>
                </template>
                <textarea
                  v-else
                  v-model="selected.content"
                  class="paper-textarea"
                  :placeholder="t({ 'zh-CN': '在此编写知识块的核心内容、知识点脉络或关键定理（支持 Markdown 语法与 LaTeX 数学公式）...', en: 'Write notes, key ideas, or theorems here. Markdown and LaTeX are supported.', ja: '要点や定理を入力してください。Markdown と LaTeX に対応しています。' })"
                  rows="18"
                ></textarea>
              </div>
            </div>
          </div>

          <!-- View: TASK -->
          <div v-else-if="selected.type === 'task'" class="editor-canvas-view">
            <div class="editor-paper-card">
              <!-- Paper Meta Top -->
              <div class="paper-meta-header">
                <div class="paper-meta-left">
                  <span class="paper-subject-pill">{{ getSubjectName(selected.groupId) }}</span>
                  <button
                    class="paper-status-pill"
                    :class="{ 'is-done': selected.done }"
                    :disabled="isScheduledCompletionLocked(selected.originalData, taskStore.currentNow)"
                    @click="toggleTaskDone(selected)"
                    :title="isScheduledCompletionLocked(selected.originalData, taskStore.currentNow) ? t({ 'zh-CN': '任务时段已结束，完成状态不可取消', en: 'This task\'s scheduled time has ended and completion is locked', ja: '予定時間が終了しているため完了を取り消せません' }) : selected.done ? t({ 'zh-CN': '点击标记为待处理', en: 'Mark as pending', ja: '未完了に戻す' }) : t({ 'zh-CN': '点击标记为已完成', en: 'Mark as completed', ja: '完了にする' })"
                  >
                    <component :is="selected.done ? IconCircleCheck : IconCircleDot" :size="13" :stroke-width="2" />
                    <span>{{ selected.done ? t({ 'zh-CN': '已完成', en: 'Completed', ja: '完了' }) : t({ 'zh-CN': '待处理', en: 'Pending', ja: '未完了' }) }}</span>
                  </button>
                </div>
                <div class="paper-meta-right">
                  <span v-if="selected.originalData?.scheduledAt" class="scheduled-indicator">
                    <IconCalendar :size="12" /> {{ t({ 'zh-CN': '已安排在日程', en: 'Scheduled', ja: '予定済み' }) }}
                  </span>
                  <span v-else class="unscheduled-indicator">
                    {{ t({ 'zh-CN': '未排期', en: 'Unscheduled', ja: '未予定' }) }}
                  </span>
                </div>
              </div>

              <!-- Task Title Input -->
              <div class="paper-title-row">
                <input
                  v-model="selected.name"
                  class="paper-title-input"
                  :class="{ 'is-done': selected.done }"
                  :disabled="selected.done"
                  :title="selected.done ? t({ 'zh-CN': '已完成任务不可修改属性', en: 'Completed tasks cannot be edited', ja: '完了したタスクは編集できません' }) : ''"
                  :placeholder="t({ 'zh-CN': '输入任务名称或行动事项...', en: 'Enter a task name or action…', ja: 'タスク名や作業内容を入力…' })"
                />
              </div>

              <!-- Notion-like Property Panel -->
              <div class="paper-property-panel">
                <div class="property-grid">
                  <!-- Due Date Row -->
                  <div class="property-item">
                    <div class="property-label">
                      <IconCalendar :size="14" :stroke-width="1.8" />
                      <span>{{ t({ 'zh-CN': '截止日期', en: 'Due date', ja: '期限' }) }}</span>
                    </div>
                    <div class="property-control">
                      <el-date-picker
                        v-model="selected.due"
                        :disabled="selected.done"
                        type="date"
                        :placeholder="t({ 'zh-CN': '设置截止日期', en: 'Set a due date', ja: '期限を設定' })"
                        format="YYYY-MM-DD"
                        value-format="YYYY-MM-DD"
                        class="zen-date-picker"
                        popper-class="zen-date-popper"
                        @change="selected.dueDateTouched = true"
                      />
                    </div>
                  </div>

                  <!-- Duration Row -->
                  <div class="property-item">
                    <div class="property-label">
                      <IconClock :size="14" :stroke-width="1.8" />
                      <span>{{ t({ 'zh-CN': '预计用时', en: 'Estimated time', ja: '見積時間' }) }}</span>
                    </div>
                    <div class="property-control">
                      <el-select
                        v-model="selected.durationMinutes"
                        :disabled="selected.done"
                        :placeholder="t({ 'zh-CN': '选择预计用时', en: 'Choose an estimated duration', ja: '見積時間を選択' })"
                        class="zen-select"
                        popper-class="zen-select-popper"
                        style="width: 220px;"
                        :aria-label="t({ 'zh-CN': '预计用时', en: 'Estimated time', ja: '見積時間' })"
                      >
                        <el-option
                          v-for="minutes in durationOptions"
                          :key="minutes"
                          :label="formatDuration(minutes)"
                          :value="minutes"
                        />
                      </el-select>
                    </div>
                  </div>

                  <!-- Subject Row -->
                  <div class="property-item">
                    <div class="property-label">
                      <IconFolder :size="14" :stroke-width="1.8" />
                      <span>{{ t({ 'zh-CN': '所属学科', en: 'Subject', ja: '科目' }) }}</span>
                    </div>
                    <div class="property-control">
                      <el-select
                        v-model="selected.groupId"
                        :disabled="selected.done"
                        :placeholder="t({ 'zh-CN': '选择所属学科', en: 'Choose a subject', ja: '科目を選択' })"
                        class="zen-select"
                        popper-class="zen-select-popper"
                        style="width: 220px;"
                      >
                        <el-option
                          v-for="subj in subjectStore.subjects"
                          :key="subj.id"
                          :label="subj.name"
                          :value="subj.id"
                        />
                      </el-select>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Divider -->
              <div class="paper-divider"></div>

              <!-- Task Notes Section -->
              <div class="paper-notes-section">
                <div class="section-label-row">
                  <IconFileText :size="14" :stroke-width="1.8" />
                  <span>{{ t({ 'zh-CN': '任务备注与详细说明', en: 'Task notes and details', ja: 'タスクのメモと詳細' }) }}</span>
                </div>
                <textarea
                  v-model="selected.preview"
                  :disabled="selected.done"
                  class="paper-textarea task-notes-textarea"
                  :placeholder="selected.done ? t({ 'zh-CN': '已完成任务不可修改备注', en: 'Notes on completed tasks cannot be edited', ja: '完了したタスクのメモは編集できません' }) : t({ 'zh-CN': '记录该任务的详细要求、执行要点或参考资料...', en: 'Add requirements, steps, or reference materials…', ja: '要件、手順、参考資料を入力…' })"
                  rows="10"
                ></textarea>
              </div>
            </div>
          </div>
        </div>
        </div>
      </Transition>
    </main>

    <!-- COLUMN 3: RIGHT Context (Only Graph) -->
    <aside class="studio-right-context">
      <Transition name="asset-view-fade" mode="out-in">
        <div v-if="!selected" key="empty" class="graph-empty-state">
          <div class="graph-empty-halo">
            <IconNetwork :size="36" :stroke-width="1.6" class="empty-graph-icon" />
          </div>
          <p class="empty-graph-title">{{ t({ 'zh-CN': '关系星图', en: 'Relationship graph', ja: '関連グラフ' }) }}</p>
          <p class="empty-graph-desc">{{ t({ 'zh-CN': '选择左侧项目查看知识关联图谱', en: 'Select an item on the left to explore its connections', ja: '左側の項目を選ぶと関連が表示されます' }) }}</p>
        </div>
        <div v-else :key="selectedGroupForGraph ? selectedGroupForGraph.id : 'graph'" class="graph-content-wrapper">
          <div class="panel-header">
            <span class="panel-title">{{ t({ 'zh-CN': '关系星图', en: 'Relationship graph', ja: '関連グラフ' }) }}</span>
            <div v-if="selectedGroupForGraph" class="graph-header-meta">
              <span class="graph-subject-pill">{{ selectedGroupForGraph.name }}</span>
              <span class="graph-count-pill">{{ t({ 'zh-CN': '节点 {count} 个', en: 'Nodes: {count}', ja: 'ノード {count}件' }, { count: graphBlocks.length + graphSources.length }) }}</span>
            </div>
          </div>
          <div class="context-body">
            <div class="ctx-graph">
               <KnowledgeGraph
                v-if="selectedGroupForGraph"
                :subjectId="selectedGroupForGraph.id"
                :blocks="graphBlocks"
                :sources="graphSources"
                :subjects="graphSubjects"
                :subjectName="selectedGroupForGraph.name"
                :selectedAsset="selectedGraphAsset"
                @select-node="selectGraphNode"
              />
            </div>
          </div>
        </div>
      </Transition>
    </aside>

    <!-- Register File Modal -->
    <FileRegisterDialog
      v-model="showRegisterModal"
      :default-subject-id="selectedSubjectId"
      :initial-file="initialRegisterFile"
      :is-uploading="isUploading"
      :upload-progress="uploadProgress"
      :upload-stage="uploadStatusText"
      :accepted-extensions="SUPPORTED_UPLOAD_EXTENSIONS"
      @submit="handleRegisterSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { locale, t } from '@/i18n'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { LocalConflictError } from '@/services/localRepository'
import { useRoute } from 'vue-router'
import { ElMessageBox, ElNotification } from 'element-plus'
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-notification.css'
import 'element-plus/theme-chalk/el-select.css'
import 'element-plus/theme-chalk/el-option.css'
import FileRegisterDialog from '@/components/asset/FileRegisterDialog.vue'
import { SUPPORTED_UPLOAD_EXTENSIONS } from '@/utils/filePreview'

import {
  IconSearch,
  IconPlus,
  IconArchive,
  IconFileText,
  IconCloudUpload,
  IconLayoutDashboard,
  IconNetwork,
  IconCheck,
  IconFile,
  IconChartPie,
  IconPhoto,
  IconMicrophone,
  IconFolder,
  IconListCheck,
  IconCalendar,
  IconClock,
  IconFiles,
  IconChecklist,
  IconInbox,
  IconCircleDot,
  IconCircleCheck,
  IconNotes,
  IconNote
} from '@tabler/icons-vue'
import { getSubjectIconComponent } from '@/utils/subjectIcon'
import FilePreview from '@/components/FilePreview.vue'
import type { SourceFileModel } from '@/services/domainMappers'
import KnowledgeGraph from '@/components/subject/KnowledgeGraph.vue'
import { useAssetStore } from '@/store/useAssetStore'
import { useKnowledgeStore } from '@/store/useKnowledgeStore'
import { useSourceStore } from '@/store/useSourceStore'
import { useDocumentProcessingStore } from '@/store/useDocumentProcessingStore'
import { getTasksForAssetGroups, isCompletedTask, isScheduledCompletionLocked, localDateEndOfDay, type AssetTaskGroups } from '@/services/taskViewRules'
import { renderMarkdown } from '@/utils/markdown'

// ---- Layout States ----
const showRegisterModal = ref(false)
const initialRegisterFile = ref<File | null>(null)
watch(showRegisterModal, (visible) => {
  if (!visible) initialRegisterFile.value = null
})
const isBlockPreviewMode = ref(false)

// ---- Upload ----
const isDragover = ref(false)
const isUploading = ref(false)
const uploadProgress = ref(0)
const uploadStatusText = ref('')
const searchQ = ref('')
const isLoadingAssets = ref(false)

// ---- Data Models ----
type TreeNodeType = 'group' | 'folder' | 'file' | 'block' | 'task'

interface TreeNode {
  id: string
  name: string
  type: TreeNodeType
  icon?: any
  lucideIcon?: any
  open?: boolean
  children?: TreeNode[]
  // For files
  sourceId?: string
  assetId?: string
  fileType?: string
  status?: string
  statusText?: string
  time?: string
  size?: string
  pages?: number
  // Block body; preview remains the Task note field below.
  content?: string
  // For tasks
  preview?: string
  due?: string
  dueDateTouched?: boolean
  durationMinutes?: number
  done?: boolean
  // Meta
  groupId?: string
  originalData?: any
}

const selectedSubjectId = ref('')

import { useSubjectStore } from '@/store/useSubjectStore'
import { useTaskStore } from '@/store/useTaskStore'

const subjectStore = useSubjectStore()
const blockStore = useKnowledgeStore()
const sourceStore = useSourceStore()
const assetStore = useAssetStore()
const taskStore = useTaskStore()
const docProcessingStore = useDocumentProcessingStore()
const route = useRoute()

function getFileStatus(file: SourceFileModel): { status: 'success' | 'processing' | 'failed'; statusText: string } {
  const job = docProcessingStore.jobs.find(j => j.sourceId === file.id)
  if (job) {
    if (job.phase === 'READY') return { status: 'success', statusText: t({ 'zh-CN': '已就绪', en: 'Ready', ja: '準備完了' }) }
    if (job.phase === 'FAILED_LOCAL' || job.phase === 'FAILED_SERVER') return { status: 'failed', statusText: t({ 'zh-CN': '解析失败', en: 'Parsing failed', ja: '解析に失敗しました' }) }
    if (job.phase === 'OCR_RUNNING') return { status: 'processing', statusText: t({ 'zh-CN': 'OCR 识别中', en: 'Running OCR', ja: 'OCR 処理中' }) }
    if (job.phase === 'EXTRACTING') return { status: 'processing', statusText: t({ 'zh-CN': '提取文本中', en: 'Extracting text', ja: 'テキストを抽出中' }) }
    if (job.phase === 'DOWNLOADING_SOURCE') return { status: 'processing', statusText: t({ 'zh-CN': '下载文件中', en: 'Downloading file', ja: 'ファイルをダウンロード中' }) }
    if (job.phase === 'QUEUED') return { status: 'processing', statusText: t({ 'zh-CN': '排队中', en: 'Queued', ja: '待機中' }) }
    if (job.phase === 'UPLOADING') return { status: 'processing', statusText: t({ 'zh-CN': '上传中', en: 'Uploading', ja: 'アップロード中' }) }
    if (job.phase === 'SERVER_VALIDATING') return { status: 'processing', statusText: t({ 'zh-CN': '服务端校验', en: 'Server validation', ja: 'サーバーで検証中' }) }
    if (job.phase === 'SERVER_INDEXING') return { status: 'processing', statusText: t({ 'zh-CN': '构建索引', en: 'Building index', ja: 'インデックスを作成中' }) }
    if (job.phase === 'PAUSED_NETWORK') return { status: 'processing', statusText: t({ 'zh-CN': '等待网络', en: 'Waiting for connection', ja: 'ネットワーク接続を待機中' }) }
    return { status: 'processing', statusText: t({ 'zh-CN': '处理中', en: 'Processing', ja: '処理中' }) }
  }

  switch (file.ingestionStatus) {
    case 'READY':
      return { status: 'success', statusText: t({ 'zh-CN': '已就绪', en: 'Ready', ja: '準備完了' }) }
    case 'FAILED':
      return { status: 'failed', statusText: t({ 'zh-CN': '解析失败', en: 'Parsing failed', ja: '解析に失敗しました' }) }
    case 'AWAITING_CLIENT':
      return { status: 'processing', statusText: t({ 'zh-CN': '待本机处理', en: 'Waiting for local processing', ja: '端末での処理待ち' }) }
    case 'PARSING':
      return { status: 'processing', statusText: t({ 'zh-CN': '正在解析', en: 'Parsing', ja: '解析中' }) }
    case 'INDEXING':
      return { status: 'processing', statusText: t({ 'zh-CN': '构建索引', en: 'Building index', ja: 'インデックスを作成中' }) }
    case 'VALIDATING':
      return { status: 'processing', statusText: t({ 'zh-CN': '校验中', en: 'Validating', ja: '検証中' }) }
    case 'PENDING':
      return { status: 'processing', statusText: t({ 'zh-CN': '排队中', en: 'Queued', ja: '待機中' }) }
    default:
      return { status: 'success', statusText: t({ 'zh-CN': '已就绪', en: 'Ready', ja: '準備完了' }) }
  }
}

const rootNodes = ref<TreeNode[]>([])
const focusUnassigned = ref(false)

function getIconForSource(source: string): any {
  const lower = source.toLowerCase()
  if (lower.includes('pdf')) return IconFileText
  if (lower.includes('ppt') || lower.includes('课件')) return IconChartPie
  if (lower.includes('手写') || lower.includes('扫描') || lower.includes('image')) return IconPhoto
  if (lower.includes('voice') || lower.includes('语音')) return IconMicrophone
  return IconFile
}

const unsetDueLabel = computed(() => t({ 'zh-CN': '未设置', en: 'Not set', ja: '未設定' }))
const durationOptions = Array.from({ length: 16 }, (_, index) => (index + 1) * 30)

function normalizeDuration(value: unknown): number {
  const minutes = Number(value)
  if (!Number.isFinite(minutes)) return durationOptions[0]
  const rounded = Math.round(minutes / 30) * 30
  return Math.min(durationOptions[durationOptions.length - 1], Math.max(durationOptions[0], rounded))
}

function formatDuration(minutes: number): string {
  const safeMinutes = normalizeDuration(minutes)
  const hours = Math.floor(safeMinutes / 60)
  const remainder = safeMinutes % 60
  if (hours === 0) return t({ 'zh-CN': '{minutes} 分钟', en: '{minutes} min', ja: '{minutes}分' }, { minutes: remainder })
  if (remainder === 0) return t({ 'zh-CN': '{hours} 小时', en: '{hours} hr', ja: '{hours}時間' }, { hours })
  return t({ 'zh-CN': '{hours} 小时 {remainder} 分钟', en: '{hours} hr {remainder} min', ja: '{hours}時間{remainder}分' }, { hours, remainder })
}

function formatDateInput(value?: string): string {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function toDueAtValue(value?: string, originalDueAt?: string, dateTouched = false): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  if (!dateTouched && originalDueAt && trimmed === formatDateInput(originalDueAt)) return originalDueAt
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return localDateEndOfDay(trimmed)?.toISOString()
  return trimmed
}

function taskTreeNode(task: any, groupId: string): TreeNode {
  return {
    id: `t-${task.id}`,
    type: 'task',
    groupId: task.subjectId || groupId,
    name: task.title || task.name || t({ 'zh-CN': '未命名任务', en: 'Untitled task', ja: '無題のタスク' }),
    icon: IconListCheck,
    lucideIcon: IconListCheck,
    due: formatDateInput(task.dueAt),
    dueDateTouched: false,
    durationMinutes: normalizeDuration(task.durationMinutes ?? task.duration),
    preview: task.description ?? task.desc ?? '',
    done: isCompletedTask(task),
    originalData: task,
  }
}

function taskGroupFolder(id: string, name: string, tasks: any[], groupId: string, open = false, icon = IconFolder): TreeNode {
  return {
    id,
    name,
    type: 'folder',
    icon,
    lucideIcon: icon,
    open,
    children: tasks.map((task) => taskTreeNode(task, groupId)),
  }
}

function taskGroupFolders(tasks: any[], groupId: string, openUnassigned = false): TreeNode[] {
  const groups: AssetTaskGroups = getTasksForAssetGroups(tasks)
  return [
    taskGroupFolder(`${groupId}-tasks-unassigned`, t({ 'zh-CN': '未排期', en: 'Unscheduled', ja: '未予定' }), groups.unassigned, groupId, openUnassigned, IconInbox),
    taskGroupFolder(`${groupId}-tasks-pending`, t({ 'zh-CN': '未完成', en: 'Incomplete', ja: '未完了' }), groups.pending, groupId, false, IconCircleDot),
    taskGroupFolder(`${groupId}-tasks-completed`, t({ 'zh-CN': '已完成', en: 'Completed', ja: '完了' }), groups.completed, groupId, false, IconCircleCheck),
  ]
}

function rebuildAssetTree(): void {
  const selection = selected.value
  const previousBlockNode = selection?.type === 'block' ? findTreeNode(rootNodes.value, selection.id) : null
  const previousTaskNode = selection?.type === 'task' ? findTreeNode(rootNodes.value, selection.id) : null
  const openStates = new Set<string>()
  try {
    const collectOpenStates = (nodes: TreeNode[] | undefined) => {
      if (!nodes || !Array.isArray(nodes)) return
      for (const node of nodes) {
        if (!node) continue
        if (node.open && node.id) openStates.add(node.id)
        if (node.children) collectOpenStates(node.children)
      }
    }
    collectOpenStates(rootNodes.value)
  } catch (err) {
    console.error('[Asset] Failed to collect open states:', err)
  }
  const hasExistingNodes = rootNodes.value && rootNodes.value.length > 0

  const newRoots: TreeNode[] = []
    
    // --- 1. 汇总 (All) Group ---
    const allFilesRaw = sourceStore.sources
    
    const allFilesFolder: TreeNode = { id: 'all-files', name: t({ 'zh-CN': '全部文件', en: 'All files', ja: 'すべてのファイル' }), type: 'folder', icon: IconFiles, lucideIcon: IconFiles, open: false, children: [] }
    const allBlocksFolder: TreeNode = { id: 'all-blocks', name: t({ 'zh-CN': '全部知识块', en: 'All knowledge blocks', ja: 'すべての知識ブロック' }), type: 'folder', icon: IconNotes, lucideIcon: IconNotes, open: false, children: [] }
    const shouldFocusUnassigned = route.query.focus === 'unassigned-tasks'
    const allTasksFolder: TreeNode = {
      id: 'all-tasks',
      name: t({ 'zh-CN': '全部任务', en: 'All tasks', ja: 'すべてのタスク' }),
      type: 'folder',
      icon: IconChecklist,
      lucideIcon: IconChecklist,
      open: true,
      children: taskGroupFolders(taskStore.allTasks, 'all', shouldFocusUnassigned),
    }

    // Map all files
    allFilesRaw.forEach(file => {
      const srcIcon = getIconForSource(file.name)
      const { status, statusText } = getFileStatus(file)
      allFilesFolder.children!.push({
        id: `f-${file.id}`, sourceId: file.id, type: 'file', groupId: 'all', name: file.name,
        assetId: file.assetId, fileType: file.fileType, icon: srcIcon, lucideIcon: srcIcon,
        status, statusText, time: new Date(file.createdAt || Date.now()).toLocaleDateString(locale.value),
        size: (file.fileSize / (1024 * 1024)).toFixed(2) + ' MB', pages: 1, originalData: file
      })
    })

    // Map all blocks
    blockStore.recentBlocks.forEach(b => {
      allBlocksFolder.children!.push({
        id: `b-${b.id}`, type: 'block', groupId: b.subjectId || 'all', name: b.title || t({ 'zh-CN': '无标题块', en: 'Untitled block', ja: '無題のブロック' }), icon: IconNote, lucideIcon: IconNote,
        content: b.content || '', originalData: b
      })
    })

    newRoots.push({
      id: 'all', name: t({ 'zh-CN': '汇总分类', en: 'All items', ja: 'すべての項目' }), type: 'group', icon: IconArchive, lucideIcon: IconArchive, open: shouldFocusUnassigned,
      children: [allFilesFolder, allBlocksFolder, allTasksFolder]
    })

    // --- 2. 学科分类 (Subjects) ---
    for (const subj of subjectStore.subjects) {
      const files = sourceStore.sources.filter((file) => file.subjectId === subj.id)
      const blocks = blockStore.recentBlocks.filter(b => b.subjectId === subj.id)
      const tasks = taskStore.allTasks.filter(t => t.subjectId === subj.id)

      const subjFilesFolder: TreeNode = { id: `sf-${subj.id}`, name: t({ 'zh-CN': '文件', en: 'Files', ja: 'ファイル' }), type: 'folder', icon: IconFiles, lucideIcon: IconFiles, open: false, children: [] }
      const subjBlocksFolder: TreeNode = { id: `sb-${subj.id}`, name: t({ 'zh-CN': '知识块', en: 'Knowledge blocks', ja: '知識ブロック' }), type: 'folder', icon: IconNotes, lucideIcon: IconNotes, open: false, children: [] }
      const subjTasksFolder: TreeNode = { id: `st-${subj.id}`, name: t({ 'zh-CN': '任务', en: 'Tasks', ja: 'タスク' }), type: 'folder', icon: IconChecklist, lucideIcon: IconChecklist, open: false, children: taskGroupFolders(tasks, subj.id) }

      files.forEach(file => {
        const srcIcon = getIconForSource(file.name)
        const { status, statusText } = getFileStatus(file)
        subjFilesFolder.children!.push({
          id: `f-${file.id}`, sourceId: file.id, type: 'file', groupId: subj.id, name: file.name,
          assetId: file.assetId, fileType: file.fileType, icon: srcIcon, lucideIcon: srcIcon,
          status, statusText, time: new Date(file.createdAt || Date.now()).toLocaleDateString(locale.value),
          size: (file.fileSize / (1024 * 1024)).toFixed(2) + ' MB', pages: 1, originalData: file
        })
      })

      blocks.forEach(b => {
        subjBlocksFolder.children!.push({
          id: `b-${b.id}`, type: 'block', groupId: subj.id, name: b.title || t({ 'zh-CN': '无标题块', en: 'Untitled block', ja: '無題のブロック' }), icon: IconNote, lucideIcon: IconNote,
          content: b.content || '', originalData: b
        })
      })

      const subjIcon = getSubjectIconComponent(subj.icon)
      newRoots.push({
        id: subj.id, name: subj.name, type: 'group', icon: subjIcon, lucideIcon: subjIcon, open: false,
        children: [subjFilesFolder, subjBlocksFolder, subjTasksFolder]
      })
    }
    
  if (hasExistingNodes) {
    try {
      const restoreOpenStates = (nodes: TreeNode[] | undefined) => {
        if (!nodes || !Array.isArray(nodes)) return
        for (const node of nodes) {
          if (!node) continue
          // Only restore state for folders and groups, items don't have open state
          if (node.type === 'group' || node.type === 'folder') {
            if (node.id && openStates.has(node.id)) {
              node.open = true
            } else {
              node.open = false
            }
          }
          if (node.children) restoreOpenStates(node.children)
        }
      }
      restoreOpenStates(newRoots)
    } catch (err) {
      console.error('[Asset] Failed to restore open states:', err)
    }
  }

  rootNodes.value = newRoots
  if (selection?.type === 'file') {
    const group = newRoots.find(root => root.id === selection.groupId)
    selected.value = findTreeNode(group?.children ?? [], selection.id)
      ?? findTreeNode(newRoots.filter(root => root.id !== 'all'), selection.id)
      ?? allFilesFolder.children?.find(file => file.id === selection.id)
      ?? null
  } else if (selection) {
    const refreshed = findTreeNode(newRoots, selection.id)
    if (selection.type === 'block') {
      const editedName = previousBlockNode && selection.name !== previousBlockNode.name
      const editedContent = previousBlockNode && selection.content !== previousBlockNode.content
      selected.value = refreshed && {
        ...refreshed,
        name: editedName ? selection.name : refreshed.name,
        content: editedContent ? selection.content : refreshed.content,
        originalData: editedName || editedContent ? selection.originalData : refreshed.originalData,
      }
    } else if (selection.type !== 'task') selected.value = refreshed ?? selection
    else if (!refreshed || !previousTaskNode) selected.value = refreshed ? { ...refreshed } : null
    else {
      const editableFields = ['name', 'preview', 'due', 'durationMinutes', 'groupId'] as const
      const edits = Object.fromEntries(editableFields
        .filter((field) => selection[field] !== previousTaskNode[field] || field === 'due' && selection.dueDateTouched)
        .map((field) => [field, selection[field]]))
      Object.assign(selection, refreshed, edits, { dueDateTouched: selection.dueDateTouched })
    }
  }
  focusUnassigned.value = shouldFocusUnassigned
}

const loadAssetsFromBackend = async () => {
  isLoadingAssets.value = true
  try {
    const results = await Promise.allSettled([
      subjectStore.loadSubjects(),
      sourceStore.loadSources(),
      blockStore.fetchBlocks(),
      taskStore.fetchTasks(),
    ])
    for (const result of results) {
      if (result.status === 'rejected') console.warn('[Asset] local asset hydration failed', result.reason)
    }
    rebuildAssetTree()
  } finally {
    isLoadingAssets.value = false
  }
}

watch(
  [
    () => subjectStore.subjects,
    () => sourceStore.sources,
    () => blockStore.recentBlocks,
    () => taskStore.allTasks,
    () => docProcessingStore.jobs,
    locale,
  ],
  () => {
    if (!isLoadingAssets.value) rebuildAssetTree()
  },
  { deep: true },
)

// ---- Search Filter (Recursive) ----
const filterTree = (nodes: TreeNode[], query: string): TreeNode[] => {
  if (!query) return nodes
  const q = query.toLowerCase()
  return nodes.map(node => {
    const match = node.name.toLowerCase().includes(q)
    if (node.children) {
      const filteredChildren = filterTree(node.children, query)
      if (match || filteredChildren.length > 0) {
        return { ...node, open: true, children: filteredChildren }
      }
    } else if (match) {
      return { ...node }
    }
    return null
  }).filter(Boolean) as TreeNode[]
}

function findTreeNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const match = findTreeNode(node.children, id)
      if (match) return match
    }
  }
  return null
}

function toggleTreeNode(node: TreeNode): void {
  const sourceNode = findTreeNode(rootNodes.value, node.id)
  if (sourceNode) sourceNode.open = !sourceNode.open
}

const filteredGroups = computed(() => filterTree(rootNodes.value, searchQ.value))

// ---- Selection & Inline Editors ----
const selected = ref<TreeNode | null>(null)

type PreviewFile = Pick<SourceFileModel, 'id' | 'name' | 'assetId' | 'fileType'>

const selectedPreviewFile = computed<PreviewFile | null>(() => {
  if (!selected.value || selected.value.type !== 'file') return null
  return {
    id: selected.value.sourceId || selected.value.id.replace(/^f-/, ''),
    name: selected.value.name,
    assetId: selected.value.assetId,
    fileType: selected.value.fileType || '',
  }
})
const selectItem = (item: TreeNode) => {
  if (item.type !== 'file' && item.type !== 'block' && item.type !== 'task') return
  if (item.type === 'task' && selected.value?.id === item.id) return
  if (item.type === 'block' && selected.value?.id === item.id
    && selected.value.originalData?.version === item.originalData?.version) return
  selected.value = item.type === 'task' || item.type === 'block' ? { ...item } : item
  showRegisterModal.value = false
}

const getSubjectName = (id?: string) => {
  if (!id || id === 'all') return t({ 'zh-CN': '全部', en: 'All', ja: 'すべて' })
  return subjectStore.subjects.find(s => s.id === id)?.name || t({ 'zh-CN': '未知学科', en: 'Unknown subject', ja: '不明な科目' })
}

const toggleTaskDone = async (task: TreeNode) => {
  if (!task.originalData?.id || isScheduledCompletionLocked(task.originalData, taskStore.currentNow)) return
  const previousDone = task.done
  const nextDone = !previousDone
  try {
    await taskStore.updateTaskStatus(task.originalData.id, nextDone ? 'completed' : 'pending')
    task.done = nextDone
    task.originalData = { ...task.originalData, status: nextDone ? 'completed' : 'pending' }
  } catch (err) {
    task.done = previousDone
    ElNotification({ title: t({ 'zh-CN': '更新任务状态失败', en: 'Could not update task status', ja: 'タスクの状態を更新できませんでした' }), message: err instanceof Error ? err.message : t({ 'zh-CN': '请稍后重试', en: 'Try again later', ja: 'しばらくしてから再試行してください' }), type: 'error' })
  }
}

const saveTaskEdit = async (task: TreeNode) => {
  if (!task.originalData?.id) return
  if (task.done) {
    ElNotification({ title: t({ 'zh-CN': '无法修改', en: 'Editing unavailable', ja: '編集できません' }), message: t({ 'zh-CN': '已完成的任务不允许修改属性', en: 'Completed tasks cannot be edited', ja: '完了したタスクは編集できません' }), type: 'warning' })
    return
  }
  try {
    await taskStore.updateTaskDetails(task.originalData.id, {
      subjectId: task.groupId && task.groupId !== 'all' ? task.groupId : task.originalData.subjectId,
      title: task.name.trim() || '未命名任务',
      description: task.preview ?? '',
      dueAt: toDueAtValue(task.due, task.originalData.dueAt, task.dueDateTouched),
      durationMinutes: normalizeDuration(task.durationMinutes),
    })
    await loadAssetsFromBackend()
    if (selected.value === task) {
      const saved = findTreeNode(rootNodes.value, task.id)
      selected.value = saved ? { ...saved } : null
    }
    ElNotification({ title: t({ 'zh-CN': '✅ 成功', en: '✅ Saved', ja: '✅ 保存しました' }), message: t({ 'zh-CN': '任务已更新', en: 'Task updated', ja: 'タスクを更新しました' }), type: 'success' })
  } catch (err) {
    console.error('[Asset] Failed to save task:', err)
    ElNotification({ title: t({ 'zh-CN': '保存失败', en: 'Could not save', ja: '保存できませんでした' }), message: t({ 'zh-CN': '任务更新失败，请稍后重试', en: 'Could not update the task. Try again later.', ja: 'タスクを更新できませんでした。しばらくしてから再試行してください。' }), type: 'error' })
  }
}

const deleteTask = async (task: TreeNode) => {
  try {
    await ElMessageBox.confirm(t({ 'zh-CN': '确定要删除这个任务吗？', en: 'Delete this task?', ja: 'このタスクを削除しますか？' }), t({ 'zh-CN': '删除提示', en: 'Confirm deletion', ja: '削除の確認' }), {
      confirmButtonText: t({ 'zh-CN': '确定', en: 'Confirm', ja: '確定' }),
      cancelButtonText: t({ 'zh-CN': '取消', en: 'Cancel', ja: 'キャンセル' }),
      type: 'warning',
    })
    await taskStore.deleteTask(task.id.slice(2))
    if (selected.value === task) selected.value = null
    ElNotification({ title: t({ 'zh-CN': '任务已删除', en: 'Task deleted', ja: 'タスクを削除しました' }), type: 'success' })
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElNotification({ title: t({ 'zh-CN': '删除任务失败', en: 'Could not delete task', ja: 'タスクを削除できませんでした' }), message: error instanceof Error ? error.message : t({ 'zh-CN': '请稍后重试', en: 'Try again later', ja: 'しばらくしてから再試行してください' }), type: 'error' })
  }
}

const saveBlockEdit = async (block: TreeNode) => {
  if (selected.value !== block || !block.originalData) return
  try {
    const targetSubjectId = block.groupId && block.groupId !== 'all' ? block.groupId : block.originalData.subjectId
    const content = block.content ?? block.originalData.content ?? ''
    await blockStore.updateBlock({
      ...block.originalData,
      title: block.name,
      content,
      subjectId: targetSubjectId
    })
    ElNotification({ title: t({ 'zh-CN': '✅ 成功', en: '✅ Saved', ja: '✅ 保存しました' }), message: t({ 'zh-CN': '知识块已更新', en: 'Knowledge block updated', ja: '知識ブロックを更新しました' }), type: 'success' })
  } catch (err) {
    if (err instanceof LocalConflictError) {
      const deleted = !err.resource || err.resource.deletedAt !== null
      if (deleted && selected.value?.id === block.id) selected.value = null
      ElNotification({
        title: t({ 'zh-CN': '保存失败', en: 'Could not save', ja: '保存できませんでした' }),
        message: deleted ? t({ 'zh-CN': '知识块已删除', en: 'Knowledge block deleted', ja: '知識ブロックを削除しました' }) : t({ 'zh-CN': '知识块已更新，请重新打开后再编辑', en: 'This knowledge block has changed. Reopen it before editing.', ja: '知識ブロックが更新されました。開き直してから編集してください。' }),
        type: 'warning',
      })
      return
    }
    console.error('[Asset] Failed to save block:', err)
    ElNotification({ title: t({ 'zh-CN': '保存失败', en: 'Could not save', ja: '保存できませんでした' }), message: t({ 'zh-CN': '知识块更新失败，请稍后重试', en: 'Could not update the knowledge block. Try again later.', ja: '知識ブロックを更新できませんでした。しばらくしてから再試行してください。' }), type: 'error' })
  }
}


// ---- Right Panel Context (Knowledge Graph) ----
const selectedGroupForGraph = computed(() => {
  if (!selected.value || !selected.value.groupId) return null
  if (selected.value.groupId === 'all') {
    return { id: 'all', name: t({ 'zh-CN': '全局关联图', en: 'Global relationship graph', ja: '全体の関連グラフ' }), color: 'rgba(59,130,246,0.2)' }
  }
  return subjectStore.subjects.find(s => s.id === selected.value!.groupId) || null
})

const graphBlocks = computed(() => {
  if (!selectedGroupForGraph.value) return []
  if (selectedGroupForGraph.value.id === 'all') return blockStore.recentBlocks
  return blockStore.recentBlocks.filter(b => b.subjectId === selectedGroupForGraph.value!.id)
})

const graphSources = computed(() => {
  if (!selectedGroupForGraph.value) return []
  if (selectedGroupForGraph.value.id === 'all') return sourceStore.sources
  return sourceStore.sources.filter(source => source.subjectId === selectedGroupForGraph.value!.id)
})

const graphSubjects = computed(() => {
  if (!selectedGroupForGraph.value) return []
  if (selectedGroupForGraph.value.id === 'all') return subjectStore.subjects
  return subjectStore.subjects.filter(subject => subject.id === selectedGroupForGraph.value!.id)
})

const selectedGraphAsset = computed(() => {
  if (selected.value?.type === 'file') {
    return { type: 'file' as const, id: selected.value.sourceId || selected.value.id.replace(/^f-/, '') }
  }
  if (selected.value?.type === 'block') {
    return { type: 'block' as const, id: selected.value.id.replace(/^b-/, '') }
  }
  return null
})

const selectGraphNode = (node: { type: 'file' | 'block'; id: string; subjectId: string }) => {
  const group = rootNodes.value.find(root => root.id === selectedGroupForGraph.value?.id)
  const item = findTreeNode(group ? [group] : rootNodes.value, `${node.type === 'file' ? 'f' : 'b'}-${node.id}`)
  if (!item) return
  selectItem(item)
}


const handleDrop = (e: DragEvent) => {
  isDragover.value = false
  const file = e.dataTransfer?.files?.[0]
  if (!file || showRegisterModal.value) return
  if (!selectedSubjectId.value) {
    selectedSubjectId.value = subjectStore.subjects[0]?.id || ''
  }
  initialRegisterFile.value = file
  showRegisterModal.value = true
}

const openUploadForGroup = (groupId: string) => {
  selectedSubjectId.value = groupId === 'all' ? (subjectStore.subjects[0]?.id || '') : groupId
  showRegisterModal.value = true
}

const handleRegisterSubmit = async ({ file, name, subjectId }: { file: File; name: string; subjectId: string }) => {
  isUploading.value = true
  uploadProgress.value = 5
  uploadStatusText.value = t({ 'zh-CN': '校验文件...', en: 'Validating file…', ja: 'ファイルを検証中…' })

  try {
    const asset = await assetStore.upload(file, (percent, stage) => {
      uploadProgress.value = percent < 100 ? Math.round(percent * 0.7) : 70
      uploadStatusText.value = stage
    })
    uploadProgress.value = 75
    uploadStatusText.value = t({ 'zh-CN': '正在关联学科资料...', en: 'Linking file to subject…', ja: 'ファイルを科目に関連付け中…' })
    await sourceStore.createFileSource(subjectId, name, asset.id)
    uploadProgress.value = 90
    uploadStatusText.value = t({ 'zh-CN': '正在刷新资料列表...', en: 'Refreshing the library…', ja: '資料一覧を更新中…' })
    await loadAssetsFromBackend()
    uploadProgress.value = 100
    uploadStatusText.value = t({ 'zh-CN': '上传成功', en: 'Upload complete', ja: 'アップロードが完了しました' })
    ElNotification({
      title: t({ 'zh-CN': '上传成功', en: 'Upload complete', ja: 'アップロードが完了しました' }),
      message: t({ 'zh-CN': '已关联文件「{name}」', en: 'Linked file “{name}”.', ja: 'ファイル「{name}」を関連付けました。' }, { name }),
      type: 'success',
    })
    await new Promise(resolve => setTimeout(resolve, 400))
    showRegisterModal.value = false
  } catch (err: any) {
    console.error('上传失败:', err)
    uploadProgress.value = 0
    const detail = err.message || t({ 'zh-CN': '未知错误', en: 'Unknown error', ja: '不明なエラー' })
    uploadStatusText.value = t({ 'zh-CN': '上传失败：{detail}', en: 'Upload failed: {detail}', ja: 'アップロードに失敗しました：{detail}' }, { detail })
    ElNotification({
      title: t({ 'zh-CN': '上传失败', en: 'Upload failed', ja: 'アップロードに失敗しました' }),
      message: detail,
      type: 'error',
    })
  } finally {
    isUploading.value = false
  }
}

onMounted(() => {
  loadAssetsFromBackend()
})
onUnmounted(() => undefined)
</script>

<style scoped>
/* =====================================================================
   Auralis Asset Studio Design System (Awwwards / Webby Quality)
   - Architectural Elevations: Clear layered shadows for tactile depth
   - Zen Minimalist Paper Texture & Sage Tone Palette
   - Swiss International Typographic Hierarchy
   - Micro-crystalline Status Indicators & Fluid Transitions
   - Full Dark Mode Harmony
   ===================================================================== */

.asset-studio {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--color-bg-secondary, #EEEEEE); /* 页面大背景 / 次级中性底 */
  padding: calc(8px - var(--card-padding-reduction));
  gap: calc(8px - var(--layout-gap-reduction));
  box-sizing: border-box;

  /* Zen Minimalist Theme Tokens */
  --color-primary-accent: #8B9A6E;
  --color-primary-accent-hover: #78875C;
  --color-primary-light: rgba(139, 154, 110, 0.14);
  --color-primary-glow: rgba(139, 154, 110, 0.28);
  --accent-gradient: linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%);
}

html.dark .asset-studio {
  background: var(--color-bg-primary);
}

/* Common Interactive Controls */
.btn-primary {
  background: var(--btn-primary-bg, var(--accent-gradient));
  color: #FFFFFF;
  border: none;
  padding: 8px 18px;
  border-radius: 9999px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-shadow: 0 4px 14px -2px rgba(139, 154, 110, 0.36), 0 2px 4px rgba(0, 0, 0, 0.04);
}
.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px -2px rgba(139, 154, 110, 0.48), 0 3px 6px rgba(0, 0, 0, 0.06);
}
.btn-primary:active:not(:disabled) {
  transform: translateY(0);
}
.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}
html.dark .btn-primary {
  background: #9AB08F;
  color: #111411;
  box-shadow: 0 4px 14px -2px rgba(154, 176, 143, 0.25);
}
html.dark .btn-primary:hover:not(:disabled) {
  background: #B0C4A5;
  box-shadow: 0 6px 20px -2px rgba(154, 176, 143, 0.35);
}

.btn-secondary {
  background: var(--color-bg-tertiary, #FAF7F2);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  padding: 8px 18px;
  border-radius: 9999px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04);
}
.btn-secondary:hover {
  background: #FFFFFF;
  border-color: var(--color-primary-accent, #8B9A6E);
  color: var(--text-primary);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px -2px rgba(139, 154, 110, 0.16), 0 2px 6px rgba(0, 0, 0, 0.04);
}
html.dark .btn-secondary {
  background: var(--color-bg-tertiary);
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
html.dark .btn-secondary:hover {
  background: #232B23;
  border-color: #9AB08F;
  color: #FFFFFF;
}

.sm-btn {
  padding: 6px 14px;
  font-size: 12px;
}

/* =====================================================================
   COLUMN 1: STUDIO LEFT (Asset Directory & Tree)
   ===================================================================== */
.studio-left {
  width: 290px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: 20px;
  border: 0.5px solid var(--border-subtle);
  box-shadow: 0 10px 30px -4px rgba(35, 45, 30, 0.08), 0 2px 8px -1px rgba(0, 0, 0, 0.04);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

html.dark .studio-left {
  background: var(--color-bg-secondary);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.48), 0 2px 10px rgba(0, 0, 0, 0.35);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(16px - var(--card-padding-reduction)) calc(20px - var(--card-padding-reduction));
  border-bottom: 0.5px solid var(--border-subtle);
  background: var(--color-bg-primary, #F7F2EB);
  flex-shrink: 0;
}
html.dark .panel-header {
  background: var(--color-bg-secondary);
}

.panel-title {
  font-size: calc(13.5px + var(--ui-font-size-adjustment));
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.2px;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-default);
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 5px -1px rgba(0, 0, 0, 0.04);
}
.icon-btn:hover {
  background: var(--accent-gradient);
  color: white;
  border-color: transparent;
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(139, 154, 110, 0.32);
}
html.dark .icon-btn {
  background: #232B23;
  border-color: rgba(255, 255, 255, 0.1);
}
html.dark .icon-btn:hover {
  background: #9AB08F;
  color: #111411;
  box-shadow: 0 4px 12px rgba(154, 176, 143, 0.25);
}

/* Tree Search Box */
.tree-search {
  padding: 12px 16px 8px;
  flex-shrink: 0;
}
.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}
.search-icon {
  position: absolute;
  left: 11px;
  color: var(--text-muted);
  pointer-events: none;
  transition: color 0.2s ease;
}
.search-input {
  width: 100%;
  padding: 7px 30px 7px 32px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-default);
  border-radius: 9999px;
  color: var(--text-primary);
  font-family: inherit;
  font-size: calc(12px + var(--ui-font-size-adjustment));
  outline: none;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.03);
}
.search-input:focus {
  border-color: var(--color-primary-accent, #8B9A6E);
  background: #FFFFFF;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.16), 0 2px 6px -1px rgba(0, 0, 0, 0.04);
}
.search-input:focus + .search-icon {
  color: var(--color-primary-accent, #8B9A6E);
}
.search-input::placeholder {
  color: var(--text-muted);
  font-weight: 400;
}
.search-clear-btn {
  position: absolute;
  right: 10px;
  border: none;
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-muted);
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.search-clear-btn:hover {
  background: var(--color-primary-accent, #8B9A6E);
  color: #FFFFFF;
}
html.dark .search-input {
  background: #202720;
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
html.dark .search-input:focus {
  background: #262E26;
  border-color: #9AB08F;
  box-shadow: 0 0 0 3px rgba(154, 176, 143, 0.2);
}
html.dark .search-clear-btn {
  background: rgba(255, 255, 255, 0.1);
}

/* Upload Progress Pill Card */
.upload-progress-wrapper {
  margin: 6px 16px 12px;
  padding: 10px 14px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid rgba(139, 154, 110, 0.3);
  border-radius: 14px;
  box-shadow: 0 3px 10px -2px rgba(139, 154, 110, 0.15);
  animation: scale-up 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
html.dark .upload-progress-wrapper {
  background: #202720;
  border-color: rgba(154, 176, 143, 0.3);
}
.upload-progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  margin-bottom: 7px;
}
.upload-progress-title {
  color: var(--text-secondary);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 8px;
}
.upload-progress-percent {
  font-weight: 700;
  color: var(--color-primary-accent, #8B9A6E);
  font-feature-settings: 'tnum';
}
.upload-progress-track {
  height: 4px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 9999px;
  overflow: hidden;
}
html.dark .upload-progress-track {
  background: rgba(255, 255, 255, 0.08);
}
.upload-progress-fill {
  height: 100%;
  background: var(--accent-gradient);
  border-radius: 9999px;
  transition: width 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Tree Body Scrollable Area */
.tree-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px calc(6px - var(--card-padding-reduction)) calc(8px - var(--card-padding-reduction));
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
.tree-body::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}

.tree-loading {
  padding: 32px 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}
.loading-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(139, 154, 110, 0.2);
  border-radius: 50%;
  border-top-color: var(--color-primary-accent, #8B9A6E);
  animation: spin 0.8s linear infinite;
  vertical-align: middle;
  margin-right: 6px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.tree-empty {
  padding: 36px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.empty-tree-icon {
  opacity: 0.28;
  color: var(--text-muted);
}

/* Level 1: Groups */
.tree-group {
  margin-bottom: 4px;
}
.tree-group-header {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  margin: 1px 4px;
  border-radius: 10px;
  cursor: pointer;
  user-select: none;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}
.tree-group-header:hover {
  background: rgba(139, 154, 110, 0.08);
}
.group-arrow {
  font-size: 10px;
  color: var(--text-muted);
  width: 12px;
  transition: transform 0.2s ease;
}
.group-icon {
  font-size: 14px;
  color: var(--text-secondary);
  flex-shrink: 0;
}
.group-name {
  font-size: calc(12.5px + var(--ui-font-size-adjustment));
  font-weight: 700;
  color: var(--text-primary);
  flex: 1;
  letter-spacing: -0.2px;
}
.header-action-btn {
  opacity: 0;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-default);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  margin-left: auto;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.tree-group-header:hover .header-action-btn {
  opacity: 1;
}
.header-action-btn:hover {
  background: var(--accent-gradient);
  color: white;
  border-color: transparent;
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(139, 154, 110, 0.3);
}

/* Level 2: Folders */
.tree-folder-container {
  margin: 1px 0;
}
.tree-folder-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px 6px 20px;
  margin: 1px 4px;
  border-radius: 10px;
  cursor: pointer;
  user-select: none;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}
.tree-folder-header:hover {
  background: rgba(139, 154, 110, 0.08);
}
.tree-folder-header.is-focus {
  background: rgba(139, 154, 110, 0.14);
  color: var(--color-primary-accent, #8B9A6E);
  box-shadow: inset 0 0 0 1.5px var(--color-primary-accent, #8B9A6E);
}
.folder-arrow {
  font-size: 11px;
  color: var(--text-muted);
  width: 10px;
}
.folder-icon {
  font-size: 13px;
  color: var(--text-secondary);
  flex-shrink: 0;
}
.folder-name {
  font-size: calc(12px + var(--ui-font-size-adjustment));
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
}
.folder-count {
  font-size: 12px;
  font-weight: 600;
  background: rgba(0, 0, 0, 0.04);
  border: 0.5px solid var(--border-subtle);
  color: var(--text-muted);
  padding: 1px 6px;
  border-radius: 9999px;
  font-feature-settings: 'tnum';
}
html.dark .folder-count {
  background: rgba(255, 255, 255, 0.06);
}

.tree-empty-folder {
  padding: 5px 10px 5px 36px;
  font-size: 12px;
  color: var(--text-muted);
}

/* Level 3: Items (File / Block / Task) */
.tree-items {
  padding: 2px 0;
}
.tree-subfolder-container > .tree-folder-header {
  padding-left: 32px;
}
.tree-subitem {
  padding-left: 48px !important;
}
.tree-subitem-empty {
  padding-left: 48px !important;
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px 7px 32px;
  margin: 1px 4px;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  border-radius: 10px;
  border: 0.5px solid transparent;
  position: relative;
}
.tree-item:hover {
  background: rgba(139, 154, 110, 0.08);
  transform: translateX(2px);
}
.tree-item.is-active {
  background: linear-gradient(90deg, rgba(139, 154, 110, 0.15) 0%, rgba(139, 154, 110, 0.05) 100%);
  border-color: rgba(139, 154, 110, 0.32);
  box-shadow: 0 2px 8px -2px rgba(139, 154, 110, 0.16);
}
.tree-item.is-active::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 16px;
  border-radius: 9999px;
  background: var(--color-primary-accent, #8B9A6E);
}
html.dark .tree-item.is-active {
  background: linear-gradient(90deg, rgba(154, 176, 143, 0.22) 0%, rgba(154, 176, 143, 0.06) 100%);
  border-color: rgba(154, 176, 143, 0.4);
}
html.dark .tree-item.is-active::before {
  background: #9AB08F;
}

.item-icon {
  font-size: 14px;
  flex-shrink: 0;
  color: var(--text-secondary);
  transition: color 0.18s ease;
}
.tree-item.is-active .item-icon {
  color: var(--color-primary-accent, #8B9A6E);
}
html.dark .tree-item.is-active .item-icon {
  color: #9AB08F;
}

.item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1.5px;
}
.item-name {
  font-size: calc(12px + var(--ui-font-size-adjustment));
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.15px;
}
.tree-item.is-active .item-name {
  font-weight: 600;
  color: var(--color-primary-accent, #8B9A6E);
}
html.dark .tree-item.is-active .item-name {
  color: #9AB08F;
}
.item-name.is-done {
  text-decoration: line-through;
  opacity: 0.5;
}
.item-meta {
  font-size: calc(12px + var(--ui-font-size-adjustment));
  color: var(--text-muted);
  font-feature-settings: 'tnum';
}

/* Micro-Crystalline Status Dot */
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-right: 4px;
  transition: all 0.2s ease;
}
.status-dot.success {
  background: #22c55e;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.45);
}
.status-dot.processing {
  background: #d97706;
  box-shadow: 0 0 8px rgba(217, 119, 6, 0.55);
  animation: breathe-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.status-dot.failed {
  background: #ef4444;
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.45);
}
@keyframes breathe-glow {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
    box-shadow: 0 0 4px rgba(217, 119, 6, 0.4);
  }
  50% {
    opacity: 0.45;
    transform: scale(0.85);
    box-shadow: 0 0 10px rgba(217, 119, 6, 0.85);
  }
}
.task-done-icon {
  color: #22c55e;
  flex-shrink: 0;
  margin-right: 4px;
}

/* Drop Zone Bottom Hotspot */
.drop-zone {
  margin: 10px 14px 14px;
  border: 0.5px dashed rgba(139, 154, 110, 0.35);
  border-radius: 16px;
  padding: 14px 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-secondary);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  background: var(--color-bg-tertiary, #FAF7F2);
  cursor: pointer;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.03);
  flex-shrink: 0;
}
.drop-zone:hover {
  border-color: var(--color-primary-accent, #8B9A6E);
  color: var(--color-primary-accent, #8B9A6E);
  background: rgba(139, 154, 110, 0.08);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px -2px rgba(139, 154, 110, 0.16);
}
.drop-zone.is-over {
  border-color: var(--color-primary-accent, #8B9A6E);
  background: rgba(139, 154, 110, 0.16);
  color: var(--color-primary-accent, #8B9A6E);
  transform: scale(1.01);
  box-shadow: 0 6px 18px -2px rgba(139, 154, 110, 0.25);
}
.drop-icon-wrapper {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: rgba(139, 154, 110, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary-accent, #8B9A6E);
  flex-shrink: 0;
  transition: all 0.2s ease;
}
.drop-zone:hover .drop-icon-wrapper {
  background: var(--color-primary-accent, #8B9A6E);
  color: #FFFFFF;
}
.drop-text-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.drop-text-main {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}
.drop-text-sub {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.3;
}
html.dark .drop-zone {
  background: #202720;
  border-color: rgba(154, 176, 143, 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
html.dark .drop-zone:hover {
  background: #273127;
  border-color: #9AB08F;
}
html.dark .drop-icon-wrapper {
  background: rgba(154, 176, 143, 0.16);
  color: #9AB08F;
}
html.dark .drop-zone:hover .drop-icon-wrapper {
  background: #9AB08F;
  color: #111411;
}

/* =====================================================================
   COLUMN 2: STUDIO MIDDLE (Dynamic Viewer & Editor Canvas)
   ===================================================================== */
.studio-middle {
  flex: 7;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: 20px;
  border: 0.5px solid var(--border-subtle);
  box-shadow: 0 10px 30px -4px rgba(35, 45, 30, 0.08), 0 2px 8px -1px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  position: relative;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

html.dark .studio-middle {
  background: var(--color-bg-secondary);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.48), 0 2px 10px rgba(0, 0, 0, 0.35);
}

.detail-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.asset-view-fade-enter-active,
.asset-view-fade-leave-active {
  transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform;
}
.asset-view-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.asset-view-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* Middle Content Scroll */
.middle-content-scroll {
  flex: 1;
  overflow-y: auto;
  position: relative;
  background: var(--color-bg-primary, #F7F2EB);
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
.middle-content-scroll::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
html.dark .middle-content-scroll {
  background: var(--color-bg-secondary);
}

/* Awwwards Zen Empty State */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 40px;
  text-align: center;
  user-select: none;
}
.empty-halo {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(139, 154, 110, 0.16) 0%, rgba(139, 154, 110, 0.02) 70%, transparent 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  box-shadow: 0 0 24px rgba(139, 154, 110, 0.1);
  animation: float-soft 4s ease-in-out infinite;
}
.empty-halo-inner {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid rgba(139, 154, 110, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px -2px rgba(139, 154, 110, 0.18);
}
.empty-icon {
  color: var(--color-primary-accent, #8B9A6E);
  opacity: 0.9;
}
.empty-title {
  font-size: calc(19px + var(--ui-font-size-adjustment));
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
  letter-spacing: -0.3px;
}
.empty-desc {
  font-size: calc(13px + var(--ui-font-size-adjustment));
  color: var(--text-muted);
  max-width: 360px;
  line-height: 1.7;
  margin-bottom: 24px;
}
.empty-actions {
  display: flex;
  gap: 12px;
}
.empty-upload-btn {
  padding: 8px 22px;
  font-size: 13px;
}
@keyframes float-soft {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
html.dark .empty-halo {
  background: radial-gradient(circle, rgba(154, 176, 143, 0.2) 0%, rgba(154, 176, 143, 0.02) 70%, transparent 100%);
}
html.dark .empty-halo-inner {
  background: #232B23;
  border-color: rgba(154, 176, 143, 0.3);
}
html.dark .empty-icon {
  color: #9AB08F;
}

/* Detail Header */
.detail-header {
  padding: calc(16px - var(--card-padding-reduction)) calc(28px - var(--card-padding-reduction));
  border-bottom: 0.5px solid var(--border-subtle);
  background: rgba(247, 242, 235, 0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  min-height: 64px;
  display: flex;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 10;
  flex-shrink: 0;
}
html.dark .detail-header {
  background: rgba(41, 40, 37, 0.92);
}

.detail-title-row {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
}
.detail-icon {
  font-size: 26px;
  color: var(--color-primary-accent, #8B9A6E);
  flex-shrink: 0;
}
html.dark .detail-icon {
  color: #9AB08F;
}
.detail-main-info {
  flex: 1;
  min-width: 0;
}
.detail-name {
  font-size: calc(16px + var(--ui-font-size-adjustment));
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.3px;
}
.detail-path {
  font-size: 12px;
  color: var(--text-muted);
  font-feature-settings: 'tnum';
}

/* Status Badge */
.status-badge {
  margin-left: auto;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 9999px;
  flex-shrink: 0;
  letter-spacing: 0.1px;
}
.status-badge.success {
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
  border: 0.5px solid rgba(34, 197, 94, 0.25);
}
.status-badge.processing {
  background: rgba(217, 119, 6, 0.12);
  color: #d97706;
  border: 0.5px solid rgba(217, 119, 6, 0.25);
  animation: breathe-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.status-badge.failed {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  border: 0.5px solid rgba(239, 68, 68, 0.25);
}

/* Editor Top Bar in Detail Header */
.editor-bar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}
.editor-bar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.header-icon-badge {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: rgba(139, 154, 110, 0.12);
  color: var(--color-primary-accent, #8B9A6E);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.header-icon-badge.task-icon-badge {
  background: rgba(139, 154, 110, 0.14);
}
html.dark .header-icon-badge {
  background: rgba(154, 176, 143, 0.18);
  color: #9AB08F;
}

.header-breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}
.crumb-parent {
  color: var(--text-muted);
}
.crumb-sep {
  color: var(--border-default);
  font-size: 12px;
}
.crumb-subject {
  color: var(--text-primary);
  font-weight: 600;
}

.header-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  border: 0.5px solid var(--border-default);
  background: var(--color-bg-tertiary, #FAF7F2);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}
.header-status-pill:hover:not(:disabled) {
  border-color: var(--color-primary-accent, #8B9A6E);
  color: var(--color-primary-accent, #8B9A6E);
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(139, 154, 110, 0.18);
}
.header-status-pill:disabled {
  cursor: not-allowed;
  opacity: 0.72;
}
.header-status-pill.is-done {
  background: rgba(34, 197, 94, 0.1);
  border-color: rgba(34, 197, 94, 0.3);
  color: #16a34a;
}
html.dark .header-status-pill {
  background: #232B23;
  border-color: rgba(255, 255, 255, 0.1);
}

.editor-bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.editor-stats-hint {
  font-size: 12px;
  color: var(--text-muted);
  font-feature-settings: 'tnum';
}
.header-meta-pill {
  font-size: 12px;
  color: var(--text-muted);
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-subtle);
  padding: 4px 10px;
  border-radius: 9999px;
  font-feature-settings: 'tnum';
}
html.dark .header-meta-pill {
  background: #202720;
}

.header-save-btn {
  box-shadow: 0 4px 12px rgba(139, 154, 110, 0.32);
}
.header-save-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
  filter: grayscale(0.4);
}

.full-height-viewer {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* =====================================================================
   UNIFIED PAPER CANVAS VIEW (Block & Task)
   ===================================================================== */
.editor-canvas-view {
  padding: 32px 40px 56px;
  max-width: 900px;
  margin: 0 auto;
  box-sizing: border-box;
}

.editor-paper-card {
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: 24px;
  border: 0.5px solid var(--border-subtle);
  box-shadow: 0 10px 32px -4px rgba(35, 45, 30, 0.08), 0 3px 10px -2px rgba(0, 0, 0, 0.04), 0 0 1px rgba(0, 0, 0, 0.06);
  padding: 36px 44px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  transition: all var(--transition-fast);
}
html.dark .editor-paper-card {
  background: var(--color-bg-secondary);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 16px 44px -4px rgba(0, 0, 0, 0.55), 0 4px 16px rgba(0, 0, 0, 0.35);
}

.paper-meta-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.paper-meta-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.paper-subject-select {
  width: 170px;
}
.paper-subject-select :deep(.el-select__wrapper) {
  border-radius: 9999px !important;
  font-size: 12.5px !important;
  background-color: rgba(139, 154, 110, 0.08) !important;
  box-shadow: 0 0 0 1px rgba(139, 154, 110, 0.28) inset, 0 1px 3px rgba(0, 0, 0, 0.02) !important;
  min-height: 30px !important;
  height: 30px !important;
  padding: 2px 14px !important;
  transition: all var(--transition-fast) !important;
}
.paper-subject-select:hover :deep(.el-select__wrapper) {
  background-color: rgba(139, 154, 110, 0.14) !important;
  box-shadow: 0 0 0 1px rgba(139, 154, 110, 0.45) inset, 0 2px 6px -1px rgba(139, 154, 110, 0.15) !important;
}
.paper-subject-select.is-focused :deep(.el-select__wrapper),
.paper-subject-select :deep(.el-select__wrapper.is-focused) {
  background-color: rgba(139, 154, 110, 0.16) !important;
  box-shadow: 0 0 0 1px var(--color-primary-accent, #8B9A6E) inset, 0 0 0 3px rgba(139, 154, 110, 0.18) !important;
}
:global(html.dark .paper-subject-select .el-select__wrapper) {
  background-color: rgba(154, 176, 143, 0.12) !important;
  box-shadow: 0 0 0 1px rgba(154, 176, 143, 0.3) inset !important;
}
:global(html.dark .paper-subject-select:hover .el-select__wrapper) {
  background-color: rgba(154, 176, 143, 0.2) !important;
  box-shadow: 0 0 0 1px rgba(154, 176, 143, 0.5) inset !important;
}
.paper-subject-pill {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary-accent, #8B9A6E);
  background: rgba(139, 154, 110, 0.12);
  padding: 4px 12px;
  border-radius: 9999px;
  border: 0.5px solid rgba(139, 154, 110, 0.25);
}
html.dark .paper-subject-pill {
  color: #9AB08F;
  background: rgba(154, 176, 143, 0.15);
  border-color: rgba(154, 176, 143, 0.3);
}

.paper-hint-text {
  font-size: 12px;
  color: var(--text-muted);
}
.paper-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  border: 0.5px solid var(--border-default);
  background: var(--color-bg-tertiary, #FAF7F2);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}
.paper-status-pill:hover:not(:disabled) {
  border-color: var(--color-primary-accent, #8B9A6E);
  color: var(--color-primary-accent, #8B9A6E);
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(139, 154, 110, 0.18);
}
.paper-status-pill:disabled {
  cursor: not-allowed;
  opacity: 0.72;
}
.paper-status-pill.is-done {
  background: rgba(34, 197, 94, 0.1);
  border-color: rgba(34, 197, 94, 0.3);
  color: #16a34a;
}
html.dark .paper-status-pill {
  background: #232B23;
  border-color: rgba(255, 255, 255, 0.1);
}

.scheduled-indicator {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary-accent, #8B9A6E);
  background: rgba(139, 154, 110, 0.1);
  border: 0.5px solid rgba(139, 154, 110, 0.22);
  padding: 3px 10px;
  border-radius: 9999px;
}
.unscheduled-indicator {
  font-size: 12px;
  color: var(--text-muted);
  background: rgba(0, 0, 0, 0.03);
  border: 0.5px solid var(--border-subtle);
  padding: 3px 10px;
  border-radius: 9999px;
}
html.dark .unscheduled-indicator {
  background: rgba(255, 255, 255, 0.04);
}

/* Paper Title Input */
.paper-title-row {
  margin: 4px 0;
}
.paper-title-input {
  width: 100%;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  border: none;
  background: transparent;
  outline: none;
  padding: 4px 0;
  letter-spacing: -0.4px;
  transition: color var(--transition-fast);
}
.paper-title-input::placeholder {
  color: var(--text-muted);
  font-weight: 400;
  opacity: 0.6;
}
.paper-title-input.is-done {
  text-decoration: line-through;
  opacity: 0.55;
}
.paper-title-input:disabled {
  cursor: not-allowed;
}

.paper-divider {
  height: 0.5px;
  background: var(--border-subtle);
  margin: 2px 0;
}

/* Micro Toolbar & Markdown Writing Area */
.paper-editor-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.editor-micro-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-muted);
  padding-bottom: 2px;
}
.micro-toolbar-left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.micro-tip {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}

/* Segmented Control Pill */
.asset-preview-toggle-group {
  display: inline-flex;
  background: rgba(0, 0, 0, 0.04);
  padding: 3px;
  border-radius: 9999px;
  border: 0.5px solid var(--border-subtle);
}
html.dark .asset-preview-toggle-group {
  background: rgba(255, 255, 255, 0.06);
}
.asset-preview-toggle-btn {
  border: none;
  background: transparent;
  padding: 4px 14px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  line-height: 1.3;
}
.asset-preview-toggle-btn:hover {
  color: var(--text-primary);
}
.asset-preview-toggle-btn.is-active {
  background: #FFFFFF;
  color: var(--color-primary-accent, #8B9A6E);
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
}
html.dark .asset-preview-toggle-btn.is-active {
  background: #283128;
  color: #9AB08F;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.micro-count {
  font-size: 12px;
  color: var(--text-muted);
  font-feature-settings: 'tnum';
}

.paper-preview-card {
  min-height: 380px;
  border: 0.5px solid var(--border-subtle);
  background: var(--color-bg-tertiary, #FAF7F2);
  border-radius: 16px;
  padding: 24px 28px;
  line-height: 1.85;
  color: var(--text-primary);
  font-size: 14px;
  box-sizing: border-box;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.02);
}
html.dark .paper-preview-card {
  background: #202720;
  border-color: rgba(255, 255, 255, 0.08);
}
.empty-preview-tip {
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
}

.paper-textarea {
  width: 100%;
  min-height: 380px;
  border: 0.5px solid var(--border-subtle);
  background: var(--color-bg-tertiary, #FAF7F2);
  border-radius: 16px;
  padding: 20px 24px;
  outline: none;
  resize: vertical;
  font-size: 14px;
  font-weight: 400;
  font-family: inherit;
  color: var(--text-primary);
  line-height: 1.85;
  box-sizing: border-box;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.02);
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
.paper-textarea::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
.paper-textarea:focus {
  border-color: var(--color-primary-accent, #8B9A6E);
  background: #FFFFFF;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.16), inset 0 1px 3px rgba(0, 0, 0, 0.02);
}
.paper-textarea::placeholder {
  color: var(--text-muted);
  opacity: 0.65;
}
html.dark .paper-textarea {
  background: #202720;
  border-color: rgba(255, 255, 255, 0.08);
}
html.dark .paper-textarea:focus {
  background: #252D25;
  border-color: #9AB08F;
  box-shadow: 0 0 0 3px rgba(154, 176, 143, 0.2);
}

/* Notion-style Task Property Panel */
.paper-property-panel {
  background: var(--color-bg-tertiary, #FAF7F2);
  border-radius: 16px;
  border: 0.5px solid var(--border-subtle);
  padding: 16px 20px;
  margin: 4px 0;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.02);
}
html.dark .paper-property-panel {
  background: #202720;
  border-color: rgba(255, 255, 255, 0.08);
}
.property-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.property-item {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
}
.property-label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-weight: 500;
  width: 104px;
  flex-shrink: 0;
}
.property-control {
  flex: 1;
  display: flex;
  align-items: center;
}

/* Task Notes Section */
.paper-notes-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}
.section-label-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}
.task-notes-textarea {
  min-height: 180px;
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
.task-notes-textarea:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
.task-notes-textarea::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}

/* =====================================================================
   ZEN SELECT & DATE PICKER SUITE (Awwwards / Webby Quality)
   ===================================================================== */

/* Zen Date Picker Trigger */
:deep(.zen-date-picker) {
  box-shadow: none !important;
  border: none !important;
  --el-input-border-color: transparent;
  --el-input-hover-border-color: transparent;
  --el-input-focus-border-color: transparent;
}
:deep(.zen-date-picker .el-input__wrapper) {
  background-color: var(--color-bg-tertiary, #FAF7F2) !important;
  box-shadow: 0 0 0 1px var(--border-default, rgba(0, 0, 0, 0.10)) inset, 0 1px 3px rgba(0, 0, 0, 0.02) !important;
  border: none !important;
  border-radius: 9999px !important;
  transition: all var(--transition-fast) !important;
  padding: 4px 14px 4px 12px !important;
  min-height: 32px !important;
  height: 32px !important;
}
:deep(.zen-date-picker:hover .el-input__wrapper),
:deep(.zen-date-picker .el-input__wrapper:hover) {
  background-color: #FFFFFF !important;
  box-shadow: 0 0 0 1px rgba(139, 154, 110, 0.45) inset, 0 2px 6px rgba(0, 0, 0, 0.04) !important;
}
:deep(.zen-date-picker.is-active .el-input__wrapper),
:deep(.zen-date-picker.is-focus .el-input__wrapper),
:deep(.zen-date-picker .el-input__wrapper.is-focus) {
  background-color: #FFFFFF !important;
  box-shadow: 0 0 0 1px var(--color-primary-accent, #8B9A6E) inset, 0 0 0 3px rgba(139, 154, 110, 0.18) !important;
}
:deep(.zen-date-picker .el-input__inner) {
  font-size: 13px !important;
  font-weight: 500 !important;
  color: var(--text-primary) !important;
}
:deep(.zen-date-picker .el-input__prefix) {
  color: var(--text-muted) !important;
}

/* Zen Date Popper (Dropdown Panel) */
:global(.zen-date-popper),
:global(.zen-date-popper.el-popper) {
  border: 0.5px solid rgba(139, 154, 110, 0.35) !important;
  border-radius: 18px !important;
  background: var(--color-bg-tertiary, #FAF7F2) !important;
  background-color: #FAF7F2 !important;
  box-shadow: 0 12px 32px rgba(139, 154, 110, 0.16), 0 4px 12px rgba(0, 0, 0, 0.04) !important;
  overflow: hidden !important;
  padding: 8px !important;
}
:global(.zen-date-popper .el-picker-panel) {
  border: none !important;
  border-radius: 14px !important;
  background: transparent !important;
  color: var(--text-primary) !important;
}
:global(.zen-date-popper .el-date-picker__header) {
  margin: 8px 12px 10px !important;
}
:global(.zen-date-popper .el-date-picker__header-label) {
  font-size: 13.5px !important;
  font-weight: 700 !important;
  color: var(--text-primary) !important;
  transition: color 0.2s ease !important;
}
:global(.zen-date-popper .el-date-picker__header-label:hover) {
  color: var(--color-primary-accent, #8B9A6E) !important;
}
:global(.zen-date-popper .el-picker-panel__icon-btn) {
  color: var(--text-muted) !important;
  transition: all 0.2s ease !important;
}
:global(.zen-date-popper .el-picker-panel__icon-btn:hover) {
  color: var(--color-primary-accent, #8B9A6E) !important;
  transform: scale(1.1) !important;
}
:global(.zen-date-popper .el-date-table th) {
  color: var(--text-muted) !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  border-bottom: 0.5px solid var(--border-subtle) !important;
  padding: 6px 0 !important;
}
:global(.zen-date-popper .el-date-table td) {
  padding: 3px 0 !important;
}
:global(.zen-date-popper .el-date-table td .el-date-table-cell) {
  height: 30px !important;
}
:global(.zen-date-popper .el-date-table td .el-date-table-cell__text) {
  width: 28px !important;
  height: 28px !important;
  line-height: 28px !important;
  border-radius: 50% !important;
  font-size: 12.5px !important;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
}
:global(.zen-date-popper .el-date-table td.today .el-date-table-cell__text) {
  color: var(--color-primary-accent, #8B9A6E) !important;
  font-weight: 700 !important;
}
:global(.zen-date-popper .el-date-table td.current:not(.disabled) .el-date-table-cell__text) {
  background: var(--accent-gradient, linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%)) !important;
  color: #FFFFFF !important;
  font-weight: 700 !important;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.35) !important;
}
:global(.zen-date-popper .el-date-table td:not(.current) .el-date-table-cell__text:hover) {
  background: rgba(139, 154, 110, 0.14) !important;
  color: var(--color-primary-accent, #8B9A6E) !important;
}
:global(.zen-date-popper .el-popper__arrow::before) {
  border-color: rgba(139, 154, 110, 0.35) !important;
  background-color: #FAF7F2 !important;
  background: #FAF7F2 !important;
}

/* Zen Select Component Trigger */
:deep(.zen-select) {
  box-shadow: none !important;
  border: none !important;
  border-radius: 9999px !important;
}
:deep(.zen-select .el-select__wrapper) {
  background-color: var(--color-bg-tertiary, #FAF7F2) !important;
  box-shadow: 0 0 0 1px var(--border-default, rgba(0, 0, 0, 0.10)) inset, 0 1px 3px rgba(0, 0, 0, 0.02) !important;
  border: none !important;
  border-radius: 9999px !important;
  padding: 3px 14px !important;
  min-height: 32px !important;
  height: 32px !important;
  transition: all var(--transition-fast) !important;
}
:deep(.zen-select:hover .el-select__wrapper),
:deep(.zen-select .el-select__wrapper:hover) {
  background-color: #FFFFFF !important;
  box-shadow: 0 0 0 1px rgba(139, 154, 110, 0.45) inset, 0 2px 6px rgba(0, 0, 0, 0.04) !important;
}
:deep(.zen-select.is-focused .el-select__wrapper),
:deep(.zen-select .el-select__wrapper.is-focused) {
  background-color: #FFFFFF !important;
  box-shadow: 0 0 0 1px var(--color-primary-accent, #8B9A6E) inset, 0 0 0 3px rgba(139, 154, 110, 0.18) !important;
}
:deep(.zen-select .el-select__placeholder),
:deep(.zen-select .el-select__selected-item) {
  font-size: 13px !important;
  font-weight: 500 !important;
  color: var(--text-primary, #1C1C1A) !important;
}
:deep(.zen-select .el-select__caret) {
  color: var(--text-muted, #7A7A75) !important;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), color 0.2s ease !important;
}
:deep(.zen-select:hover .el-select__caret) {
  color: var(--color-primary-accent, #8B9A6E) !important;
}

/* Zen Select Popper (Dropdown Panel) */
:global(.zen-select-popper),
:global(.zen-select-popper.el-popper) {
  border: 0.5px solid rgba(139, 154, 110, 0.35) !important;
  border-radius: 16px !important;
  background-color: #FAF7F2 !important;
  background: #FAF7F2 !important;
  box-shadow: 0 12px 32px rgba(139, 154, 110, 0.15), 0 4px 12px rgba(0, 0, 0, 0.04) !important;
  padding: 6px !important;
  overflow: hidden !important;
}
:global(.zen-select-popper .el-select-dropdown),
:global(.zen-select-popper .el-scrollbar),
:global(.zen-select-popper .el-select-dropdown__wrap) {
  background: transparent !important;
  border: none !important;
  border-radius: 14px !important;
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
:global(.zen-select-popper .el-scrollbar__bar) {
  display: none !important;
  opacity: 0 !important;
  width: 0 !important;
  height: 0 !important;
  pointer-events: none !important;
}
:global(.zen-select-popper .el-scrollbar__thumb) {
  display: none !important;
}
:global(.zen-select-popper *::-webkit-scrollbar) {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
:global(.zen-select-popper .el-select-dropdown__list) {
  padding: 2px !important;
}
:global(.zen-select-popper .el-select-dropdown__item) {
  border-radius: 10px !important;
  margin: 3px 0 !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  color: var(--text-primary, #1C1C1A) !important;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
  padding: 8px 14px !important;
  line-height: 1.4 !important;
  height: auto !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
}
:global(.zen-select-popper .el-select-dropdown__item.is-hovering),
:global(.zen-select-popper .el-select-dropdown__item:hover) {
  background: rgba(139, 154, 110, 0.12) !important;
  color: var(--color-primary-accent, #8B9A6E) !important;
  transform: translateX(2px) !important;
}
:global(.zen-select-popper .el-select-dropdown__item.is-selected),
:global(.zen-select-popper .el-select-dropdown__item.selected) {
  background: rgba(139, 154, 110, 0.18) !important;
  color: var(--color-primary-accent, #8B9A6E) !important;
  font-weight: 700 !important;
}
:global(.zen-select-popper .el-popper__arrow::before) {
  border-color: rgba(139, 154, 110, 0.35) !important;
  background-color: #FAF7F2 !important;
  background: #FAF7F2 !important;
}

/* =====================================================================
   DARK MODE OVERRIDES FOR SELECTS & POPPERS
   ===================================================================== */
:global(html.dark .zen-date-picker .el-input__wrapper),
:global(html.dark .zen-select .el-select__wrapper) {
  background-color: #242622 !important;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12) inset !important;
}
:global(html.dark .zen-date-picker:hover .el-input__wrapper),
:global(html.dark .zen-date-picker .el-input__wrapper:hover),
:global(html.dark .zen-select:hover .el-select__wrapper),
:global(html.dark .zen-select .el-select__wrapper:hover) {
  background-color: #2a2c28 !important;
  box-shadow: 0 0 0 1px rgba(154, 176, 143, 0.45) inset !important;
}
:global(html.dark .zen-date-picker.is-active .el-input__wrapper),
:global(html.dark .zen-date-picker.is-focus .el-input__wrapper),
:global(html.dark .zen-date-picker .el-input__wrapper.is-focus),
:global(html.dark .zen-select.is-focused .el-select__wrapper),
:global(html.dark .zen-select .el-select__wrapper.is-focused) {
  background-color: #2a2c28 !important;
  box-shadow: 0 0 0 1px #9AB08F inset, 0 0 0 3px rgba(154, 176, 143, 0.2) !important;
}
:global(html.dark .zen-select .el-select__placeholder),
:global(html.dark .zen-select .el-select__selected-item),
:global(html.dark .zen-date-picker .el-input__inner) {
  color: #e6dfd8 !important;
}

/* Dark Mode Poppers */
:global(html.dark .zen-select-popper),
:global(html.dark .zen-select-popper.el-popper),
:global(html.dark .zen-date-popper),
:global(html.dark .zen-date-popper.el-popper),
:global(html.dark .zen-date-popper .el-picker-panel) {
  background-color: #242622 !important;
  background: #242622 !important;
  border-color: rgba(154, 176, 143, 0.3) !important;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5) !important;
}
:global(html.dark .zen-select-popper .el-popper__arrow::before),
:global(html.dark .zen-date-popper .el-popper__arrow::before) {
  background-color: #242622 !important;
  background: #242622 !important;
  border-color: rgba(154, 176, 143, 0.3) !important;
}
:global(html.dark .zen-select-popper .el-select-dropdown__item) {
  color: #e6dfd8 !important;
}
:global(html.dark .zen-select-popper .el-select-dropdown__item.is-hovering),
:global(html.dark .zen-select-popper .el-select-dropdown__item:hover) {
  background: rgba(154, 176, 143, 0.16) !important;
  color: #9AB08F !important;
}
:global(html.dark .zen-select-popper .el-select-dropdown__item.is-selected),
:global(html.dark .zen-select-popper .el-select-dropdown__item.selected) {
  background: rgba(154, 176, 143, 0.24) !important;
  color: #9AB08F !important;
}
:global(html.dark .zen-date-popper .el-date-picker__header-label) {
  color: #e6dfd8 !important;
}
:global(html.dark .zen-date-popper .el-picker-panel__icon-btn) {
  color: #8a867e !important;
}
:global(html.dark .zen-date-popper .el-picker-panel__icon-btn:hover) {
  color: #9AB08F !important;
}
:global(html.dark .zen-date-popper .el-date-table th) {
  color: #8a867e !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}
:global(html.dark .zen-date-popper .el-date-table td .el-date-table-cell__text) {
  color: #e6dfd8 !important;
}
:global(html.dark .zen-date-popper .el-date-table td.today .el-date-table-cell__text) {
  color: #9AB08F !important;
}
:global(html.dark .zen-date-popper .el-date-table td.current:not(.disabled) .el-date-table-cell__text) {
  background: #9AB08F !important;
  color: #111411 !important;
  font-weight: 700 !important;
}
:global(html.dark .zen-date-popper .el-date-table td:not(.current) .el-date-table-cell__text:hover) {
  background: rgba(154, 176, 143, 0.2) !important;
  color: #9AB08F !important;
}
/* =====================================================================
   COLUMN 3: STUDIO RIGHT (Context & Knowledge Star Graph)
   ===================================================================== */
.studio-right-context {
  flex: 3;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: 20px;
  border: 0.5px solid var(--border-subtle);
  box-shadow: 0 10px 30px -4px rgba(35, 45, 30, 0.08), 0 2px 8px -1px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}
html.dark .studio-right-context {
  background: var(--color-bg-secondary);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.48), 0 2px 10px rgba(0, 0, 0, 0.35);
}

.graph-content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.graph-header-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}
.graph-subject-pill {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary-accent, #8B9A6E);
  background: rgba(139, 154, 110, 0.12);
  border: 0.5px solid rgba(139, 154, 110, 0.25);
  padding: 2px 8px;
  border-radius: 9999px;
  white-space: nowrap;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.graph-count-pill {
  font-size: 12px;
  color: var(--text-muted);
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-subtle);
  padding: 2px 7px;
  border-radius: 9999px;
  font-feature-settings: 'tnum';
}
html.dark .graph-subject-pill {
  color: #9AB08F;
  background: rgba(154, 176, 143, 0.16);
  border-color: rgba(154, 176, 143, 0.3);
}
html.dark .graph-count-pill {
  background: #202720;
}

.graph-empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 24px;
  text-align: center;
  user-select: none;
}
.graph-empty-halo {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(139, 154, 110, 0.16) 0%, rgba(139, 154, 110, 0.02) 70%, transparent 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  animation: float-soft 4.5s ease-in-out infinite;
}
.empty-graph-icon {
  color: var(--color-primary-accent, #8B9A6E);
  opacity: 0.8;
}
.empty-graph-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}
.empty-graph-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
  max-width: 220px;
  line-height: 1.6;
}
html.dark .graph-empty-halo {
  background: radial-gradient(circle, rgba(154, 176, 143, 0.2) 0%, rgba(154, 176, 143, 0.02) 70%, transparent 100%);
}
html.dark .empty-graph-icon {
  color: #9AB08F;
}

.context-body {
  flex: 1;
  overflow: hidden;
  position: relative;
  background: var(--color-bg-primary, #F7F2EB);
}
html.dark .context-body {
  background: var(--color-bg-secondary);
}

.ctx-graph {
  height: 100%;
  width: 100%;
  min-height: 480px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex: 1;
}
.ctx-graph :deep(.knowledge-graph-wrapper) {
  border: none !important;
  border-radius: 0 !important;
  background: transparent !important;
}

/* Home Modal Styles for Register Modal (Copied from SubjectWorkspace) */
.modal-container {
  width: 90%; max-width: 520px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.04);
  border: 0.5px solid var(--border-subtle);
  display: flex; flex-direction: column; overflow: hidden;
  animation: scale-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
html.dark .modal-container { background: #181D18; border-color: rgba(163, 177, 155, 0.25); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4); }
@keyframes scale-up { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.modal-container .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 0.5px solid var(--border-subtle); }
.modal-container .modal-header h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.3px; }
.close-btn { background: none; border: none; font-size: 20px; color: var(--text-muted); cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: all var(--transition-fast); }
.close-btn:hover { background: rgba(0, 0, 0, 0.04); color: var(--text-primary); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08); }
html.dark .close-btn:hover { background: rgba(255, 255, 255, 0.06); }
.modal-container .modal-body { padding: 22px 28px; display: flex; flex-direction: column; gap: 20px; max-height: 70vh; overflow-y: auto; }
.form-group label { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.styled-input, .styled-textarea {
  width: 100%; padding: 12px 14px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-default);
  border-radius: 12px; font-size: 13.5px; color: var(--text-primary);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); outline: none; box-sizing: border-box; font-family: inherit;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04);
}
.styled-input:focus, .styled-textarea:focus {
  border-color: #8B9A6E;
  background: var(--color-bg-tertiary, #FAF7F2);
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18);
}
html.dark .styled-input:focus, html.dark .styled-textarea:focus { border-color: #9AB08F; background: rgba(255, 255, 255, 0.05); box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.2); }
.styled-textarea { resize: vertical; line-height: 1.6; min-height: 100px; }
.modal-container .modal-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 28px 22px; border-top: 0.5px solid var(--border-subtle); background: transparent; }
.btn-secondary {
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-default);
  color: var(--text-secondary);
  padding: 8px 20px; border-radius: 9999px; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04);
}
.btn-secondary:hover {
  background: var(--color-bg-tertiary, #FAF7F2);
  border-color: #8B9A6E;
  color: var(--text-primary);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.06);
}
.btn-primary {
  background: var(--btn-primary-bg, var(--accent-gradient, linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%)));
  border: none; color: #FFFFFF;
  padding: 8px 26px; border-radius: 9999px; font-size: 13px; font-weight: 700;
  cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.3);
}
.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(139, 154, 110, 0.45);
}
.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; transform: none; }
html.dark .btn-primary { background: #9AB08F; color: #1a1a1a; }
html.dark .btn-primary:hover { background: #b0c2a7; box-shadow: 0 4px 12px rgba(154, 176, 143, 0.2); }

/* Subject Capsule Grid */
.subject-capsule-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.subject-capsule-item {
  display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-default);
  border-radius: 9999px; font-size: 13px; font-weight: 600; color: var(--text-primary);
  cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 5px -1px rgba(0, 0, 0, 0.03);
}
.subject-capsule-item:hover {
  transform: translateY(-1px);
  border-color: rgba(139, 154, 110, 0.35);
  box-shadow: 0 3px 8px rgba(139, 154, 110, 0.12);
}
.subject-capsule-item.is-active {
  background: rgba(139, 154, 110, 0.12) !important;
  border-color: #8B9A6E !important;
  color: #8B9A6E !important;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.22);
}
html.dark .subject-capsule-item.is-active { background: rgba(154, 176, 143, 0.15) !important; border-color: #9AB08F !important; color: #9AB08F !important; }
.subj-capsule-name { font-size: 13px; }

/* Responsive Flex Layout for Asset Studio */
@media (max-width: 1200px) {
  .studio-left {
    width: 240px;
  }
  .editor-canvas-view {
    padding: 20px 24px 36px;
  }
  .editor-paper-card {
    padding: 24px 28px;
  }
}

@media (max-width: 960px) {
  .studio-left {
    width: 210px;
  }
}
</style>
