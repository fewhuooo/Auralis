export type ChatContentState = 'GENERATING' | 'READY' | 'SUBMITTED' | 'INVALID'
export type ChatVisualComponent = 'steps' | 'compare' | 'roadmap' | 'chart'
export type ChatActivityComponent = 'quiz' | 'question'
export type ChatComponent = ChatVisualComponent | ChatActivityComponent

export interface ChatTextPart {
  id: string
  kind: 'text'
  text: string
}

export interface ChatCompareEntry {
  readonly label: string
  readonly text: string
}

export interface ChatCompareItem {
  readonly title: string
  readonly entries: readonly ChatCompareEntry[]
}

export interface ChatBlockPart {
  id: string
  componentId: string
  kind: 'block'
  component: ChatComponent
  state: ChatContentState
  meta: Readonly<Record<string, unknown>>
  items: readonly Readonly<Record<string, unknown>>[]
  questionId?: string
  submittedAnswer?: ChatActivityAnswer
}

export type ChatContentPart = ChatTextPart | ChatBlockPart
export type ChatActivityDraft = string | readonly string[] | null
export type ChatActivityAnswer = string | readonly string[]

export interface ChatContentProjectionState {
  parts: readonly ChatContentPart[]
  drafts: Readonly<Record<string, ChatActivityDraft>>
}

export interface ChatActivitySubmission {
  questionId: string
  answer: ChatActivityAnswer
}
