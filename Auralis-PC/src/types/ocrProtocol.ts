export const OCR_PROTOCOL_VERSION = 1 as const

export type OcrErrorCode =
  | 'OCR_PROTOCOL_INVALID'
  | 'OCR_TIMEOUT'
  | 'OCR_MODEL_FAILED'
  | 'OCR_RESPONSE_TOO_LARGE'

export interface OcrPageRequest {
  protocolVersion: typeof OCR_PROTOCOL_VERSION
  taskId: string
  pageNumber: number
  imagePath: string
  timeoutMs: number
}

export interface OcrTextLine {
  text: string
  score?: number
}

export interface OcrPageResponse {
  protocolVersion: typeof OCR_PROTOCOL_VERSION
  ok: boolean
  taskId: string
  pageNumber: number
  lines: OcrTextLine[]
  timingMs: {
    det: number
    rec: number
    total: number
  }
  errorCode?: OcrErrorCode
}
