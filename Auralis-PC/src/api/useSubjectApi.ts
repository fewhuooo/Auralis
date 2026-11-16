import type { components } from './generated/schema.ts'

type GeneratedResponse = components['schemas']['Response']

export type SubjectView = Pick<
  GeneratedResponse,
  'id' | 'description' | 'version' | 'createdAt' | 'updatedAt' | 'deletedAt'
> & {
  name?: string
  iconKey?: string
  sortKey?: string
}

export interface SubjectCreateRequest {
  baseVersion: components['schemas']['VersionRequest']['baseVersion']
  name: string
  description?: string
  iconKey?: string
  sortKey?: string
}

export type SubjectUpdateRequest = SubjectCreateRequest
export type SubjectVersionRequest = components['schemas']['VersionRequest']
