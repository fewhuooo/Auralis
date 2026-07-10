import type { Stroke, StrokePoint } from './handwritingEngine'

export type NoteMode =
  | 'subject-asset-annotation'
  | 'subject-handwriting-note'
  | 'quick-infinite-canvas'

export type CanvasLayout = 'paged' | 'continuous' | 'infinite'
export type NoteBackground = 'blank' | 'grid' | 'lined' | 'dotted' | 'asset'

export interface NoteViewport {
  x: number
  y: number
  scale: number
}

export interface NotePage {
  id: string
  index: number
  width: number
  height: number
  backgroundAssetId?: string
}

export type NoteStrokePoint = StrokePoint

export interface NoteStroke extends Stroke {
  pageId?: string
  createdAt: string
}

export interface NoteDocument {
  id: string
  mode: NoteMode
  subjectId?: string
  assetId?: string
  title: string
  layout: CanvasLayout
  pages: NotePage[]
  strokes: NoteStroke[]
  viewport: NoteViewport
  background: NoteBackground
  createdAt: string
  updatedAt: string
}

export interface CreateNoteDocumentInput {
  id: string
  mode: NoteMode
  title: string
  subjectId?: string
  assetId?: string
  layout?: CanvasLayout
  background?: NoteBackground
  now?: string
}

const DEFAULT_PAGE_WIDTH = 1200
const DEFAULT_PAGE_HEIGHT = 1600

export function createSubjectAssetAnnotationId(subjectId: string, assetId: string): string {
  return `subject-asset-annotation:${subjectId}:${assetId}`
}

export function createNoteDocument(input: CreateNoteDocumentInput): NoteDocument {
  const now = input.now ?? new Date().toISOString()
  const layout = input.layout ?? defaultLayoutForMode(input.mode)
  const background = input.background ?? defaultBackgroundForMode(input.mode)

  return {
    id: input.id,
    mode: input.mode,
    subjectId: input.subjectId,
    assetId: input.assetId,
    title: input.title,
    layout,
    pages: layout === 'infinite' ? [] : [createDefaultPage(input.assetId)],
    strokes: [],
    viewport: { x: 0, y: 0, scale: 1 },
    background,
    createdAt: now,
    updatedAt: now,
  }
}

export function upsertStroke(
  document: NoteDocument,
  stroke: NoteStroke,
  updatedAt = new Date().toISOString(),
): NoteDocument {
  const index = document.strokes.findIndex(item => item.id === stroke.id)
  const strokes =
    index >= 0
      ? document.strokes.map(item => (item.id === stroke.id ? stroke : item))
      : [...document.strokes, stroke]

  return {
    ...document,
    strokes,
    updatedAt,
  }
}

export function removeStroke(
  document: NoteDocument,
  strokeId: string,
  updatedAt = new Date().toISOString(),
): NoteDocument {
  return {
    ...document,
    strokes: document.strokes.filter(stroke => stroke.id !== strokeId),
    updatedAt,
  }
}

export function toLegacyStrokes(document: NoteDocument): Stroke[] {
  return document.strokes.map(({ createdAt: _createdAt, pageId: _pageId, ...stroke }) => stroke)
}

export function fromLegacyStroke(stroke: Stroke, createdAt = new Date().toISOString()): NoteStroke {
  return {
    ...stroke,
    createdAt,
  }
}

function defaultLayoutForMode(mode: NoteMode): CanvasLayout {
  return mode === 'quick-infinite-canvas' ? 'infinite' : 'paged'
}

function defaultBackgroundForMode(mode: NoteMode): NoteBackground {
  return mode === 'subject-asset-annotation' ? 'asset' : 'grid'
}

function createDefaultPage(assetId?: string): NotePage {
  return {
    id: 'page-1',
    index: 0,
    width: DEFAULT_PAGE_WIDTH,
    height: DEFAULT_PAGE_HEIGHT,
    backgroundAssetId: assetId,
  }
}
