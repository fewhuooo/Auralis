import request from './request.ts'
import type { components } from './generated/schema.ts'

export type SourceView = components['schemas']['SourceResponse']
export type SourceCreateRequest = components['schemas']['SourceCreateRequest']
export type SourceUpdateRequest = components['schemas']['SourceUpdateRequest']
export type SourceVersionRequest = components['schemas']['SourceVersionRequest']
export type ParsedDocumentUploadIntentRequest = components['schemas']['ParsedDocumentUploadIntentRequest']
export type ParsedDocumentUploadIntentResponse = components['schemas']['ParsedDocumentUploadIntentResponse']
export type ParsedDocumentCompleteResponse = components['schemas']['ParsedDocumentCompleteResponse']

export interface SourceQuery {
  cursor?: string
  limit?: number
}

export interface SourceListResponse {
  items?: SourceView[]
  nextCursor?: string
  hasMore?: boolean
}

export const useSourceApi = {
  list(params?: SourceQuery): Promise<SourceListResponse> {
    return request.get('/api/sources', { params }) as unknown as Promise<SourceListResponse>
  },
  listSources(params?: SourceQuery): Promise<SourceListResponse> {
    return request.get('/api/sources', { params }) as unknown as Promise<SourceListResponse>
  },
  get(id: string): Promise<SourceView> {
    return request.get(`/api/sources/${encodeURIComponent(id)}`) as unknown as Promise<SourceView>
  },
  getSource(id: string): Promise<SourceView> {
    return request.get(`/api/sources/${encodeURIComponent(id)}`) as unknown as Promise<SourceView>
  },
  create(data: SourceCreateRequest): Promise<SourceView> {
    return request.post('/api/sources', data) as unknown as Promise<SourceView>
  },
  createSource(data: SourceCreateRequest): Promise<SourceView> {
    return request.post('/api/sources', data) as unknown as Promise<SourceView>
  },
  update(id: string, data: SourceUpdateRequest): Promise<SourceView> {
    return request.put(`/api/sources/${encodeURIComponent(id)}`, data) as unknown as Promise<SourceView>
  },
  updateSource(id: string, data: SourceUpdateRequest): Promise<SourceView> {
    return request.put(`/api/sources/${encodeURIComponent(id)}`, data) as unknown as Promise<SourceView>
  },
  delete(id: string, data: SourceVersionRequest): Promise<void> {
    return request.delete(`/api/sources/${encodeURIComponent(id)}`, { data }) as unknown as Promise<void>
  },
  deleteSource(id: string, data: SourceVersionRequest): Promise<void> {
    return request.delete(`/api/sources/${encodeURIComponent(id)}`, { data }) as unknown as Promise<void>
  },
  restore(id: string, data: SourceVersionRequest): Promise<SourceView> {
    return request.post(`/api/sources/${encodeURIComponent(id)}/restore`, data) as unknown as Promise<SourceView>
  },
  restoreSource(id: string, data: SourceVersionRequest): Promise<SourceView> {
    return request.post(`/api/sources/${encodeURIComponent(id)}/restore`, data) as unknown as Promise<SourceView>
  },
  reingest(id: string, data: SourceVersionRequest): Promise<SourceView> {
    return request.post(`/api/sources/${encodeURIComponent(id)}/reingest`, data) as unknown as Promise<SourceView>
  },
  reingestSource(id: string, data: SourceVersionRequest): Promise<SourceView> {
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

export const listSources = useSourceApi.listSources
export const getSource = useSourceApi.getSource
export const createSource = useSourceApi.createSource
export const updateSource = useSourceApi.updateSource
export const deleteSource = useSourceApi.deleteSource
export const restoreSource = useSourceApi.restoreSource
export const reingestSource = useSourceApi.reingestSource
export const createParsedDocumentUploadIntent = useSourceApi.createParsedDocumentUploadIntent
export const completeParsedDocument = useSourceApi.completeParsedDocument
