import type { components } from './generated/schema.ts'

export type TaskView = components['schemas']['Response']
export type TaskListResponse = components['schemas']['ListResponse']
export type TaskCreateRequest = components['schemas']['CreateRequest']
// The server accepts explicit null values to clear an existing schedule or
// deadline. Keep the generated schema untouched and widen only this write-side
// client alias so recovery and offline replay can express those operations.
export type TaskUpdateRequest = Omit<components['schemas']['UpdateRequest'], 'scheduledAt' | 'dueAt'> & {
  scheduledAt?: string | null
  dueAt?: string | null
}
export type TaskVersionRequest = components['schemas']['VersionRequest']
export type TaskScheduleSwapRequest = components['schemas']['ScheduleSwapRequest']
export type TaskScheduleSwapResponse = components['schemas']['ScheduleSwapResponse']

export type TaskScheduleInsertionRequest = components['schemas']['ScheduleInsertionRequest']
export type TaskScheduleInsertionResponse = components['schemas']['ScheduleInsertionResponse']

export interface TaskQuery {
  cursor?: string
  limit?: number
}
