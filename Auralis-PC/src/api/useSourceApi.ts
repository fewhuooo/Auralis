import request from './request.ts'
import type { components } from './generated/schema.ts'

export type SourceView = components['schemas']['SourceResponse']
export type SourceCreateRequest = components['schemas']['SourceCreateRequest']
export type SourceUpdateRequest = components['schemas']['SourceUpdateRequest']
export type SourceVersionRequest = components['schemas']['SourceVersionRequest']
export type ParsedDocumentUploadIntentRequest = components['schemas']['ParsedDocumentUploadIntentRequest']
export type ParsedDocumentUploadIntentResponse = components['schemas']['ParsedDocumentUploadIntentResponse']
export type ParsedDocumentCompleteResponse = components['schemas']['ParsedDocumentCompleteResponse']

export const useSourceApi = {
  get(id: string): Promise<SourceView> {
    return request.get(`/api/sources/${encodeURIComponent(id)}`) as unknown as Promise<SourceView>
  },
  reingest(id: string, data: SourceVersionRequest): Promise<SourceView> {
    return request.post(`/api/sources/${encodeURIComponent(id)}/reingest`, data) as unknown as Promise<SourceView>
  },
  createParsedDocumentUploadIntent(
    sourceId: string,
    data: ParsedDocumentUploadIntentRequest,
  ): Promise<ParsedDocumentUploadIntentResponse> {
    return request.post(
      `/api/sources/${encodeURIComponent(sourceId)}/parsed-documents/upload-intents`,
      data,
    ) as unknown as Promise<ParsedDocumentUploadIntentResponse>
  },
  completeParsedDocument(sourceId: string, parsedDocumentId: string): Promise<ParsedDocumentCompleteResponse> {
    return request.post(
      `/api/sources/${encodeURIComponent(sourceId)}/parsed-documents/${encodeURIComponent(parsedDocumentId)}/complete`,
    ) as unknown as Promise<ParsedDocumentCompleteResponse>
  },
}

export const createParsedDocumentUploadIntent = useSourceApi.createParsedDocumentUploadIntent
export const completeParsedDocument = useSourceApi.completeParsedDocument
