import {
  documentLocalPackageBegin,
  documentLocalPackageAppend,
  documentLocalPackageFinish,
  isLocalCacheReceiptV1,
  type LocalCacheReceipt,
  type LocalPackageHeader,
  type ParsedDocumentBlockCommand,
} from '@/api/tauri'
import type {
  LocalParsedDocumentRecord,
  LocalParsedDocumentPhase,
} from '@/types/localParsedDocument'
import type { LocalParsedDocumentRepository } from '@/services/localParsedDocumentRepository'
import type { ParsedBlock, DocumentParserProgress } from '@/services/documentParser/types'
import {
  isAppClosed,
  isNetworkFailure,
  isAutomaticallyRetryable,
  MAX_AUTOMATIC_RETRIES,
  errorCode,
} from './checkpointPolicy'
import { OcrDocumentEmptyError } from '@/services/documentParser/types'
import type { LocalAssetService } from '@/services/localAssetService'

export interface LocalParsedPackageMetadata {
  parserId?: string
  parserVersion?: string
  normalizationVersion?: string
  ocrModelVersion?: string | null
}

export interface CoordinateLocalParseInput {
  localSourceId: string
  localContentRevision: string
  localAssetId: string
  sourceAssetSha256: string
  originalName?: string
  mimeType?: string
  sizeBytes?: number
  metadata?: LocalParsedPackageMetadata
}

export interface LocalPackagerAdapter {
  begin(header: LocalPackageHeader): Promise<string>
  append(packageId: string, block: ParsedDocumentBlockCommand): Promise<void>
  finish(packageId: string): Promise<LocalCacheReceipt>
  abort?(packageId: string): Promise<void>
}

export type LocalParser = (
  sink: (block: ParsedBlock) => Promise<void>,
  onProgress: (event: DocumentParserProgress) => Promise<void>,
) => Promise<void>

export interface LocalParsedDocumentCoordinatorOptions {
  repository: LocalParsedDocumentRepository
  localAssetService?: LocalAssetService
  readAssetBytes?: (localAssetId: string, expectedSize?: number, expectedSha256?: string) => Promise<{
    receipt: { localAssetId: string; safeExtension: string; sizeBytes: number; sha256: string }
    bytes: Uint8Array
  }>
  packager?: LocalPackagerAdapter
  parserFactory: (record: LocalParsedDocumentRecord, file: File) => Promise<LocalParser> | LocalParser
  maxAutomaticRetries?: number
}

export class LocalParsedDocumentCoordinator {
  readonly repository: LocalParsedDocumentRepository
  private readonly localAssetService?: LocalAssetService
  private readonly readAssetBytes?: LocalParsedDocumentCoordinatorOptions['readAssetBytes']
  private readonly packager: LocalPackagerAdapter
  private readonly parserFactory: LocalParsedDocumentCoordinatorOptions['parserFactory']
  private readonly maxAutomaticRetries: number
  private readonly active = new Map<string, Promise<LocalParsedDocumentRecord>>()
  private readonly cancelled = new Set<string>()

  constructor(options: LocalParsedDocumentCoordinatorOptions) {
    this.repository = options.repository
    this.localAssetService = options.localAssetService
    this.readAssetBytes = options.readAssetBytes
    this.packager = options.packager ?? {
      begin: documentLocalPackageBegin,
      append: documentLocalPackageAppend,
      finish: documentLocalPackageFinish,
    }
    this.parserFactory = options.parserFactory
    this.maxAutomaticRetries = options.maxAutomaticRetries ?? MAX_AUTOMATIC_RETRIES
  }

  async coordinate(input: CoordinateLocalParseInput): Promise<LocalParsedDocumentRecord> {
    const key = `${input.localSourceId}:${input.localContentRevision}`
    const running = this.active.get(key)
    if (running) return running

    const task = this.process(input)
    this.active.set(key, task)
    try {
      return await task
    } finally {
      if (this.active.get(key) === task) {
        this.active.delete(key)
      }
      this.cancelled.delete(input.localSourceId)
    }
  }

  async cancel(localSourceId: string): Promise<void> {
    this.cancelled.add(localSourceId)
  }

  private assertNotCancelled(localSourceId: string): void {
    if (this.cancelled.has(localSourceId)) {
      throw new Error('DOCUMENT_CANCELLED')
    }
  }

  private isCancelled(localSourceId: string, error: unknown): boolean {
    return (
      this.cancelled.has(localSourceId)
      || (error instanceof Error && error.message === 'DOCUMENT_CANCELLED')
    )
  }

  private receiptMatchesRecord(receipt: LocalCacheReceipt, record: LocalParsedDocumentRecord): boolean {
    return isLocalCacheReceiptV1(receipt)
      && receipt.cacheId === record.localCacheId
      && receipt.localSourceId === record.localSourceId
      && receipt.localContentRevision === record.localContentRevision
      && receipt.sourceAssetSha256 === record.sourceAssetSha256
      && receipt.parserId === record.parserId
      && receipt.parserVersion === record.parserVersion
      && receipt.normalizationVersion === record.normalizationVersion
      && (receipt.ocrModelVersion ?? null) === (record.ocrModelVersion ?? null)
  }

  private async process(input: CoordinateLocalParseInput): Promise<LocalParsedDocumentRecord> {
    this.assertNotCancelled(input.localSourceId)

    let record = await this.repository.get(input.localSourceId, input.localContentRevision)
    if (!record) {
      record = await this.repository.create({
        localSourceId: input.localSourceId,
        localContentRevision: input.localContentRevision,
        localAssetId: input.localAssetId,
        sourceAssetSha256: input.sourceAssetSha256,
        parserId: input.metadata?.parserId ?? 'auralis-document-parser',
        parserVersion: input.metadata?.parserVersion ?? '1.0.0',
        normalizationVersion: input.metadata?.normalizationVersion ?? 'nfkc-lf-trim',
        ocrModelVersion: input.metadata?.ocrModelVersion ?? null,
        phase: 'QUEUED',
      })
    }

    // Reuse existing local receipt without re-reading bytes or re-running OCR
    if (record.phase === 'WAITING_SERVER_REVISION' || record.phase === 'LOCAL_PARSED_READY') {
      if (record.localReceipt && this.receiptMatchesRecord(record.localReceipt, record)) {
        if (record.phase === 'LOCAL_PARSED_READY') {
          record = await this.repository.updatePhase(
            record.localSourceId,
            record.localContentRevision,
            'WAITING_SERVER_REVISION',
          )
        }
        return record
      }
    }

    if (record.phase === 'READY') {
      return record
    }

    if (record.phase === 'FAILED_LOCAL') {
      return record
    }

    let retries = record.attempt

    while (true) {
      let packageId: string | null = null
      try {
        this.assertNotCancelled(input.localSourceId)

        if (record.phase === 'QUEUED' || record.phase === 'PAUSED_NETWORK') {
          record = await this.repository.updatePhase(
            record.localSourceId,
            record.localContentRevision,
            'EXTRACTING',
            {
              attempt: retries,
              safeErrorCode: null,
              safeErrorDetail: null,
            },
          )
        }

        this.assertNotCancelled(input.localSourceId)

        // Read bytes from local asset repository / service
        const readResult = this.readAssetBytes
          ? await this.readAssetBytes(record.localAssetId, input.sizeBytes, record.sourceAssetSha256)
          : await this.localAssetService!.readAssetBytes(record.localAssetId, input.sizeBytes, record.sourceAssetSha256)

        this.assertNotCancelled(input.localSourceId)

        const extension = readResult.receipt.safeExtension || 'bin'
        const fileName = input.originalName || `content.${extension}`
        const fileType = input.mimeType || (extension === 'pdf' ? 'application/pdf' : 'application/octet-stream')
        const buffer = readResult.bytes.buffer.slice(
          readResult.bytes.byteOffset,
          readResult.bytes.byteOffset + readResult.bytes.byteLength,
        ) as ArrayBuffer
        const file = new File([buffer], fileName, { type: fileType })

        packageId = await this.packager.begin({
          schemaVersion: 1,
          userId: this.repository.userId,
          deviceId: this.repository.serverDeviceId,
          localSourceId: record.localSourceId,
          localContentRevision: record.localContentRevision,
          sourceAssetSha256: record.sourceAssetSha256,
          parserId: record.parserId,
          parserVersion: record.parserVersion,
          normalizationVersion: record.normalizationVersion,
          ocrModelVersion: record.ocrModelVersion ?? null,
        })

        const parser = await this.parserFactory(record, file)
        this.assertNotCancelled(input.localSourceId)

        await parser(
          async (block) => {
            this.assertNotCancelled(input.localSourceId)
            const currentRecord = await this.repository.get(input.localSourceId, input.localContentRevision)
            const currentPhase = currentRecord?.phase ?? 'EXTRACTING'
            const phase: LocalParsedDocumentPhase = (block.kind === 'ocr-page' || currentPhase === 'OCR_RUNNING')
              ? 'OCR_RUNNING'
              : 'EXTRACTING'

            await this.packager.append(packageId!, {
              ordinal: block.ordinal,
              kind: block.kind,
              text: block.text,
              pageNumber: block.pageNumber,
              anchorIndex: block.anchorIndex,
              startLine: block.startLine,
            })

            this.assertNotCancelled(input.localSourceId)
            record = await this.repository.updatePhase(
              input.localSourceId,
              input.localContentRevision,
              phase,
              {
                attempt: retries,
                checkpointPage: block.pageNumber ?? currentRecord?.checkpointPage ?? 0,
                checkpointOrdinal: block.ordinal,
                safeErrorCode: null,
                safeErrorDetail: null,
              },
            )
          },
          async (event) => {
            this.assertNotCancelled(input.localSourceId)
            const currentRecord = await this.repository.get(input.localSourceId, input.localContentRevision)
            const currentPhase = currentRecord?.phase ?? 'EXTRACTING'
            const phase: LocalParsedDocumentPhase = (event.type === 'before-recognize' || currentPhase === 'OCR_RUNNING')
              ? 'OCR_RUNNING'
              : currentPhase

            record = await this.repository.updatePhase(
              input.localSourceId,
              input.localContentRevision,
              phase,
              {
                attempt: retries,
                checkpointPage: event.pageNumber,
                checkpointJson: JSON.stringify(event),
                safeErrorCode: null,
                safeErrorDetail: null,
              },
            )
          },
        )

        this.assertNotCancelled(input.localSourceId)
        const localReceipt = await this.packager.finish(packageId)
        this.assertNotCancelled(input.localSourceId)

        const receiptRecord = { ...record, localCacheId: localReceipt.cacheId }
        if (!this.receiptMatchesRecord(localReceipt, receiptRecord)) {
          throw new Error('LOCAL_PARSED_DOCUMENT_RECEIPT_INVALID: Invalid local receipt produced')
        }

        await this.repository.updatePhase(
          record.localSourceId,
          record.localContentRevision,
          'LOCAL_PARSED_READY',
          {
            attempt: retries,
            localCacheId: localReceipt.cacheId,
            localReceipt,
            safeErrorCode: null,
            safeErrorDetail: null,
          },
        )

        record = await this.repository.updatePhase(
          record.localSourceId,
          record.localContentRevision,
          'WAITING_SERVER_REVISION',
          {
            attempt: retries,
            localCacheId: localReceipt.cacheId,
            localReceipt,
            safeErrorCode: null,
            safeErrorDetail: null,
          },
        )

        return record
      } catch (error) {
        if (packageId && this.packager.abort) {
          await this.packager.abort(packageId).catch(() => undefined)
        }

        if (this.isCancelled(input.localSourceId, error)) {
          record = await this.repository.markFailed(
            record.localSourceId,
            record.localContentRevision,
            'DOCUMENT_CANCELLED',
            'Cancelled by the user',
          )
          return record
        }

        if (isAppClosed(error)) {
          return record
        }

        const message = error instanceof Error ? error.message : String(error)
        if (isNetworkFailure(error) || /\b(?:NETWORK_OFFLINE|NETWORK_ERROR|FETCH_FAILED)\b/i.test(message)) {
          record = await this.repository.updatePhase(
            record.localSourceId,
            record.localContentRevision,
            'PAUSED_NETWORK',
            {
              attempt: retries,
              safeErrorCode: 'NETWORK_OFFLINE',
              safeErrorDetail: errorCode(error),
            },
          )
          return record
        }

        if (isAutomaticallyRetryable(error) && retries + 1 < this.maxAutomaticRetries) {
          retries += 1
          record = await this.repository.updatePhase(
            record.localSourceId,
            record.localContentRevision,
            'QUEUED',
            {
              attempt: retries,
              safeErrorCode: errorCode(error),
              safeErrorDetail: 'Automatic retry scheduled',
            },
          )
          continue
        }

        const empty = error instanceof OcrDocumentEmptyError
        const code = empty
          ? 'OCR_DOCUMENT_EMPTY'
          : isAutomaticallyRetryable(error)
            ? 'OCR_RETRY_EXHAUSTED'
            : errorCode(error)
        const detail = error instanceof Error ? error.message : String(error)

        record = await this.repository.markFailed(
          record.localSourceId,
          record.localContentRevision,
          code,
          detail,
        )
        return record
      }
    }
  }
}
