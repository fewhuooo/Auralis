import request from './request'
import type { components } from './generated/schema'

export type AuthResult = components['schemas']['AuthResult']
export type UserView = components['schemas']['UserView']
export type TokenPair = components['schemas']['TokenPair']
export type RegisterRequest = components['schemas']['RegisterRequest']
export type LoginRequest = components['schemas']['LoginRequest']
export type RefreshRequest = components['schemas']['RefreshRequest']
export type SessionListResponse = components['schemas']['SessionListResponse']
export type SessionResponse = components['schemas']['SessionResponse']

export const useAuthApi = {
  login(data: LoginRequest): Promise<AuthResult> {
    return request.post('/api/auth/login', data) as unknown as Promise<AuthResult>
  },
  register(data: RegisterRequest): Promise<AuthResult> {
    return request.post('/api/auth/register', data) as unknown as Promise<AuthResult>
  },
  refresh(data: RefreshRequest): Promise<AuthResult> {
    return request.post('/api/auth/refresh', data) as unknown as Promise<AuthResult>
  },
  logout(): Promise<void> {
    return request.post('/api/auth/logout') as unknown as Promise<void>
  },
  getMe(): Promise<UserView> {
    return request.get('/api/auth/me') as unknown as Promise<UserView>
  },
  listSessions(): Promise<SessionListResponse> {
    return request.get('/api/auth/sessions') as unknown as Promise<SessionListResponse>
  },
  revokeSession(sessionId: string): Promise<void> {
    return request.delete(`/api/auth/sessions/${encodeURIComponent(sessionId)}`) as unknown as Promise<void>
  },
  revokeOtherSessions(): Promise<void> {
    return request.delete('/api/auth/sessions/others') as unknown as Promise<void>
  },
}
