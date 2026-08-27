import { ocrRecognizePage } from '@/api/tauri'
import { normalizeOcrLines } from './normalization.ts'
import type { OcrAdapter as OcrAdapterContract, OcrPageRequest, OcrPageResult } from './types'

export { normalizeOcrLines }

export class TauriOcrAdapter implements OcrAdapterContract {
  readonly model = 'PP-OCRv6-small'
  private readonly timeoutMs: number

  constructor(timeoutMs = 120_000) {
    this.timeoutMs = timeoutMs
  }

  async recognizePage(request: OcrPageRequest): Promise<OcrPageResult> {
    const result = await ocrRecognizePage({
      taskId: request.taskId,
      pageNumber: request.pageNumber,
      imageBytes: [...request.imageBytes],
      timeoutMs: this.timeoutMs,
    })
    if (!result.ok) throw new Error(result.errorCode || 'OCR_MODEL_FAILED')
    return { lines: result.lines, model: this.model }
  }
}
