export type ResourceMutationType = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE'

export interface SubjectModel {
  id: string
  name: string
  description: string
  icon: string
  iconKey: string
  color: string
  sortKey?: string
  defaultSubject?: boolean
  version: number
  createdAt?: string
  updatedAt?: string
  deletedAt: string | null
  blockCount?: number
  fileCount?: number
}

export interface SourceFileModel {
  id: string
  subjectId: string
  name: string
  filePath: string
  fileType: string
  fileSize: number
  catalogJson: string
  blockCount: number
  assetId?: string
  originUrl?: string
  rawText?: string
  outline?: string
  ingestionStatus?: 'PENDING' | 'PARSING' | 'INDEXING' | 'READY' | 'FAILED'
  safeErrorCode?: string
  safeErrorDetail?: string
  version: number
  createdAt?: string
  updatedAt?: string
  deletedAt: string | null
}

export interface KnowledgeBlockModel {
  id: string
  subject: string
  subjectId: string
  title: string
  preview: string
  content: string
  time: string
  source: string
  color: string
  version: number
  createdAt?: string
  updatedAt?: string
  deletedAt: string | null
  sourceFileId?: string
  tags: string[]
  difficulty?: 'easy' | 'medium' | 'hard'
  mastery: number
  reviewAt?: string
  relatedBlockIds: string[]
}

export interface AssetModel {
  id: string
  name: string
  sizeBytes: number
  mimeType: string
  sha256?: string
  status: 'UPLOADING' | 'READY' | 'FAILED' | 'ORPHANED'
  completedAt?: string
  createdAt?: string
  updatedAt?: string
}

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'
export type CognitiveLoad = 'LOW' | 'MEDIUM' | 'HIGH'

export interface TaskModel {
  id: string
  subjectId: string
  title: string
  description: string
  status: TaskStatus
  scheduledAt?: string
  dueAt?: string
  durationMinutes: number
  cognitiveLoad: CognitiveLoad
  sortKey?: string
  colorOverride?: string
  version: number
  createdAt?: string
  updatedAt?: string
  deletedAt: string | null
}

export interface ReviewStateModel {
  id?: string
  knowledgeBlockId: string
  dueAt?: string
  difficulty?: number
  stability?: number
  lastReviewedAt?: string
  reps: number
  lapses: number
  version: number
  createdAt?: string
}

export interface StatsOverviewModel {
  activeKnowledgeBlocks: number
  activeTasks: number
  dueReviews: number
  completedReviewEvents: number
  activeSources: number
}

export interface SubjectDtoLike {
  id?: string
  name?: string
  description?: string
  iconKey?: string
  color?: string
  sortKey?: string
  defaultSubject?: boolean
  version?: number
  createdAt?: string
  updatedAt?: string
  deletedAt?: string | null
}

export interface SourceDtoLike {
  id?: string
  subjectId?: string
  type?: 'FILE' | 'TEXT' | 'URL'
  title?: string
  assetId?: string
  assetSizeBytes?: number | null
  originUrl?: string
  rawText?: string
  outline?: string
  ingestionStatus?: SourceFileModel['ingestionStatus']
  safeErrorCode?: string
  safeErrorDetail?: string
  version?: number
  createdAt?: string
  updatedAt?: string
  deletedAt?: string | null
}

export interface KnowledgeBlockDtoLike {
  id?: string
  subjectId?: string
  sourceId?: string
  title?: string
  description?: string
  summary?: string
  content?: string
  tags?: string[]
  colorOverride?: string
  version?: number
  createdAt?: string
  updatedAt?: string
  deletedAt?: string | null
}

export interface AssetDtoLike {
  id?: string
  originalName?: string
  sizeBytes?: number
  mimeType?: string
  sha256?: string
  uploadStatus?: AssetModel['status']
  completedAt?: string
  createdAt?: string
  updatedAt?: string
}

export interface TaskDtoLike {
  id?: string
  subjectId?: string
  title?: string
  description?: string
  status?: TaskStatus
  scheduledAt?: string
  dueAt?: string
  durationMinutes?: number
  cognitiveLoad?: CognitiveLoad
  sortKey?: string
  colorOverride?: string
  version?: number
  createdAt?: string
  updatedAt?: string
  deletedAt?: string | null
}

export interface ReviewStateDtoLike {
  id?: string
  knowledgeBlockId?: string
  dueAt?: string
  difficulty?: number
  stability?: number
  lastReviewedAt?: string
  reps?: number
  lapses?: number
  version?: number
  createdAt?: string
}

export interface StatsOverviewDtoLike {
  activeKnowledgeBlocks?: number
  activeTasks?: number
  dueReviews?: number
  completedReviewEvents?: number
  activeSources?: number
}

function requiredId(id: string | undefined, resource: string): string {
  if (!id) throw new Error(`${resource} DTO is missing id`)
  return id
}

export function mapSubjectView(view: SubjectDtoLike, counts: Pick<SubjectModel, 'blockCount' | 'fileCount'> = {}): SubjectModel {
  const iconKey = view.iconKey || 'book'
  return {
    id: requiredId(view.id, 'Subject'),
    name: view.name || '未命名学科',
    description: view.description || '',
    icon: iconKey,
    iconKey,
    color: view.color || '#7D9372',
    sortKey: view.sortKey,
    defaultSubject: view.defaultSubject,
    version: view.version ?? 0,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
    deletedAt: view.deletedAt ?? null,
    ...counts,
  }
}

function fileTypeForSource(view: SourceDtoLike): string {
  if (view.type === 'TEXT') return 'text/plain'
  if (view.type === 'URL') return 'text/html'
  return 'application/octet-stream'
}

export function mapSourceView(view: SourceDtoLike): SourceFileModel {
  const name = view.title || '未命名资料'
  return {
    id: requiredId(view.id, 'Source'),
    subjectId: view.subjectId || '',
    name,
    filePath: view.assetId || view.originUrl || '',
    fileType: fileTypeForSource(view),
    fileSize: view.assetSizeBytes ?? 0,
    catalogJson: view.outline || '[]',
    blockCount: 0,
    assetId: view.assetId,
    originUrl: view.originUrl,
    rawText: view.rawText,
    outline: view.outline,
    ingestionStatus: view.ingestionStatus,
    safeErrorCode: view.safeErrorCode,
    safeErrorDetail: view.safeErrorDetail,
    version: view.version ?? 0,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
    deletedAt: view.deletedAt ?? null,
  }
}

export function mapKnowledgeBlockView(view: KnowledgeBlockDtoLike): KnowledgeBlockModel {
  const summary = view.summary || view.description || view.content || ''
  return {
    id: requiredId(view.id, 'Knowledge block'),
    subject: view.subjectId || '',
    subjectId: view.subjectId || '',
    title: view.title || '无标题块',
    preview: summary,
    content: view.content || summary,
    time: view.updatedAt || view.createdAt || '',
    source: view.sourceId || '未分类材料',
    color: view.colorOverride || 'rgba(181,196,177,0.4)',
    version: view.version ?? 0,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
    deletedAt: view.deletedAt ?? null,
    sourceFileId: view.sourceId,
    tags: [...(view.tags || [])],
    mastery: 0,
    relatedBlockIds: [],
  }
}

export function mapAssetView(view: AssetDtoLike): AssetModel {
  return {
    id: requiredId(view.id, 'Asset'),
    name: view.originalName || '未命名资产',
    sizeBytes: view.sizeBytes ?? 0,
    mimeType: view.mimeType || 'application/octet-stream',
    sha256: view.sha256,
    status: view.uploadStatus || 'UPLOADING',
    completedAt: view.completedAt,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  }
}

export function mapTaskView(view: TaskDtoLike): TaskModel {
  return {
    id: requiredId(view.id, 'Task'),
    subjectId: view.subjectId || '',
    title: view.title || '未命名任务',
    description: view.description || '',
    status: view.status || 'TODO',
    scheduledAt: view.scheduledAt,
    dueAt: view.dueAt,
    durationMinutes: view.durationMinutes ?? 25,
    cognitiveLoad: view.cognitiveLoad || 'MEDIUM',
    sortKey: view.sortKey,
    colorOverride: view.colorOverride,
    version: view.version ?? 0,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
    deletedAt: view.deletedAt ?? null,
  }
}

export function mapReviewStateView(view: ReviewStateDtoLike): ReviewStateModel {
  return {
    id: view.id,
    knowledgeBlockId: view.knowledgeBlockId || '',
    dueAt: view.dueAt,
    difficulty: view.difficulty,
    stability: view.stability,
    lastReviewedAt: view.lastReviewedAt,
    reps: view.reps ?? 0,
    lapses: view.lapses ?? 0,
    version: view.version ?? 0,
    createdAt: view.createdAt,
  }
}

export function mapStatsOverviewView(view: StatsOverviewDtoLike): StatsOverviewModel {
  return {
    activeKnowledgeBlocks: view.activeKnowledgeBlocks ?? 0,
    activeTasks: view.activeTasks ?? 0,
    dueReviews: view.dueReviews ?? 0,
    completedReviewEvents: view.completedReviewEvents ?? 0,
    activeSources: view.activeSources ?? 0,
  }
}

export interface OptimisticMutationInput {
  resourceType: string
  resourceId: string
  mutationType: ResourceMutationType
  baseVersion: number
  payload: Record<string, unknown>
  clientMutationId: string
}

export function createOptimisticMutation(input: OptimisticMutationInput): OptimisticMutationInput {
  return {
    ...input,
    payload: { ...input.payload },
  }
}

export function nextPageCursor(page: { hasMore?: boolean; nextCursor?: string }): string | undefined {
  return page.hasMore && page.nextCursor ? page.nextCursor : undefined
}
