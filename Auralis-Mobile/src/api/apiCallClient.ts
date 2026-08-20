export interface ApiCallClient {
  request(path: string, method: string, options?: {
    pathParams?: Record<string, unknown>
    query?: Record<string, unknown>
    body?: unknown
  }): Promise<unknown>
}

export const defaultApiCallClient: ApiCallClient = {
  async request(path, method, options) {
    const { apiClient } = await import('./generated/client')
    return apiClient.request(path as never, method as never, options as never)
  },
}
