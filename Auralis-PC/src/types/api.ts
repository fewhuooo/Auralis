export interface ApiProblem {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: Record<string, string[]>;
}

export interface AuthSession {
  user: Record<string, unknown>;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt?: string;
  };
  sessionId: string;
  deviceId: string;
}

export interface SyncCursorState {
  cursor: string | null;
  resetRequired: boolean;
}

export interface RealtimeEvent {
  type: string;
  resourceType: string;
  resourceId: string;
  cursor: string;
  occurredAt: string;
}

export interface LocalEntity<T> {
  id: string;
  resourceType: string;
  userId: string;
  version: number;
  deletedAt: string | null;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
  value: T;
}

export type LocalResourceType =
  | 'SUBJECT'
  | 'KNOWLEDGE_BLOCK'
  | 'TASK'
  | 'SOURCE'
  | 'ASSET'
  | 'RELATION'
  | 'REVIEW'
  | 'STATS'
  | 'CHAT';

export type LocalSyncStatus = 'synced' | 'pending' | 'conflict' | 'error';
export type LocalMutationType = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';
export type LocalMutationStatus = 'pending' | 'applied' | 'conflict' | 'error';

export interface LocalMutation {
  clientMutationId: string;
  userId: string;
  resourceType: string;
  resourceId: string;
  mutationType: LocalMutationType;
  baseVersion: number;
  payload: Record<string, unknown>;
  createdAt: string;
  status: LocalMutationStatus;
  error?: string;
}
