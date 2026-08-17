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
  userId: string;
  version: number;
  deletedAt: string | null;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
  value: T;
}

export interface LocalMutation {
  clientMutationId: string;
  userId: string;
  resourceType: string;
  resourceId: string;
  mutationType: 'CREATE' | 'UPDATE' | 'DELETE';
  baseVersion: number | null;
  payload: Record<string, unknown>;
  createdAt: string;
  status: 'pending' | 'applied' | 'conflict' | 'error';
}
