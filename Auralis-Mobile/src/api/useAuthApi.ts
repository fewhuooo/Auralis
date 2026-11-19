import type { components, paths } from './generated/schema'
import { defaultApiCallClient, type ApiCallClient } from './apiCallClient.ts'

type RegisterRequest = components['schemas']['RegisterRequest']
type LoginRequest = components['schemas']['LoginRequest']
type RefreshRequest = components['schemas']['RefreshRequest']
type ProfileUpdateRequest = components['schemas']['ProfileUpdateRequest']
type PasswordChangeRequest = components['schemas']['PasswordChangeRequest']
type AccountDeletionRequest = components['schemas']['AccountDeletionRequest']
type AccountDeletionResponse = components['schemas']['AccountDeletionResponse']
type AuthResult = components['schemas']['AuthResult']
type UserView = components['schemas']['UserView']
type SessionListResponse = components['schemas']['SessionListResponse']

type AuthPostBody<Path extends keyof paths> = paths[Path] extends {
  post: { requestBody: { content: { 'application/json': infer Body } } }
} ? Body : never

export function createAuthApi(client: ApiCallClient = defaultApiCallClient) {
  return {
    sendRegistrationEmailCode: (body: AuthPostBody<'/api/auth/register/email-code'>) => client.request(
      '/api/auth/register/email-code', 'post', { body },
    ) as Promise<void>,
    sendPasswordResetEmailCode: (body: AuthPostBody<'/api/auth/password/reset/email-code'>) => client.request(
      '/api/auth/password/reset/email-code', 'post', { body },
    ) as Promise<void>,
    resetPassword: (body: AuthPostBody<'/api/auth/password/reset'>) => client.request(
      '/api/auth/password/reset', 'post', { body },
    ) as Promise<void>,
    register: (body: RegisterRequest) => client.request(
      '/api/auth/register', 'post', { body },
    ) as Promise<AuthResult>,
    login: (body: LoginRequest) => client.request(
      '/api/auth/login', 'post', { body },
    ) as Promise<AuthResult>,
    refresh: (body: RefreshRequest) => client.request(
      '/api/auth/refresh', 'post', { body },
    ) as Promise<AuthResult>,
    logout: () => client.request('/api/auth/logout', 'post') as Promise<void>,
    me: () => client.request('/api/auth/me', 'get') as Promise<UserView>,
    updateProfile: (body: ProfileUpdateRequest) => client.request(
      '/api/auth/me', 'put', { body },
    ) as Promise<UserView>,
    deleteAccount: (body: AccountDeletionRequest) => client.request(
      '/api/auth/me', 'delete', { body },
    ) as Promise<AccountDeletionResponse>,
    changePassword: (body: PasswordChangeRequest) => client.request(
      '/api/auth/password', 'put', { body },
    ) as Promise<void>,
    sessions: () => client.request('/api/auth/sessions', 'get') as Promise<SessionListResponse>,
    revokeSession: (sessionId: string) => client.request(
      '/api/auth/sessions/{sessionId}', 'delete', { pathParams: { sessionId } },
    ) as Promise<void>,
    revokeOtherSessions: () => client.request('/api/auth/sessions/others', 'delete') as Promise<void>,
  }
}

export const useAuthApi = createAuthApi()
