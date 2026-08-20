import mobileRequest from '@/api/request'
import type { paths } from './schema'

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options' | 'head' | 'trace'
type MobileMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export type ApiPath = Extract<keyof paths, string>
export type ApiMethod<Path extends ApiPath> = Extract<keyof paths[Path], HttpMethod>

type OperationAt<Path extends ApiPath, Method extends ApiMethod<Path>> =
  Path extends keyof paths
    ? Method extends keyof paths[Path]
      ? paths[Path][Method]
      : never
    : never

type ContentPayload<Value> = Value extends { content: infer Content }
  ? Content extends Record<string, infer Payload> ? Payload : void
  : void

type SuccessResponse<Responses extends object> =
  200 extends keyof Responses ? ContentPayload<Responses[200 & keyof Responses]> :
  201 extends keyof Responses ? ContentPayload<Responses[201 & keyof Responses]> :
  202 extends keyof Responses ? ContentPayload<Responses[202 & keyof Responses]> :
  204 extends keyof Responses ? ContentPayload<Responses[204 & keyof Responses]> : void

type ParametersAt<Path extends ApiPath, Method extends ApiMethod<Path>> =
  OperationAt<Path, Method> extends { parameters: infer Parameters } ? Parameters : never

export type ApiResponse<Path extends ApiPath, Method extends ApiMethod<Path>> =
  OperationAt<Path, Method> extends { responses: infer Responses }
    ? Responses extends object ? SuccessResponse<Responses> : never
    : never

export type ApiRequestBody<Path extends ApiPath, Method extends ApiMethod<Path>> =
  OperationAt<Path, Method> extends { requestBody: infer Body }
    ? Body extends { content: infer Content }
      ? Content extends Record<string, infer Payload> ? Payload : never
      : never
    : never

export type ApiPathParams<Path extends ApiPath, Method extends ApiMethod<Path>> =
  ParametersAt<Path, Method> extends { path?: infer Parameters } ? Parameters : never

export type ApiQueryParams<Path extends ApiPath, Method extends ApiMethod<Path>> =
  ParametersAt<Path, Method> extends { query?: infer Parameters } ? Parameters : never

export interface ApiRequestOptions<Path extends ApiPath, Method extends ApiMethod<Path>> {
  pathParams?: ApiPathParams<Path, Method>
  query?: ApiQueryParams<Path, Method>
  body?: ApiRequestBody<Path, Method>
  timeout?: number
}

export type ApiTransport = <Response>(options: {
  url: string
  method: MobileMethod
  data?: unknown
  params?: Record<string, unknown>
  timeout?: number
}) => Promise<Response>

function resolvePath(path: string, pathParams: unknown): string {
  if (!pathParams || typeof pathParams !== 'object') {
    return path
  }

  return path.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = (pathParams as Record<string, unknown>)[key]
    if (value === undefined || value === null) {
      throw new Error(`Missing path parameter: ${key}`)
    }
    return encodeURIComponent(String(value))
  })
}

function toMobileMethod(method: string): MobileMethod {
  const normalized = method.toUpperCase()
  if (normalized === 'GET' || normalized === 'POST' || normalized === 'PUT' || normalized === 'DELETE') {
    return normalized
  }
  throw new Error(`Mobile transport does not support ${method}`)
}

function defaultTransport<Response>(options: Parameters<ApiTransport>[0]): Promise<Response> {
  const method = toMobileMethod(options.method)
  switch (method) {
    case 'GET':
      return mobileRequest.get<Response>(options.url, options.params)
    case 'POST':
      return mobileRequest.post<Response>(options.url, options.data)
    case 'PUT':
      return mobileRequest.put<Response>(options.url, options.data)
    case 'DELETE':
      return mobileRequest.delete<Response>(options.url, options.data, options.params)
  }
}

export function createApiClient(transport: ApiTransport = defaultTransport): {
  request<Path extends ApiPath, Method extends ApiMethod<Path>>(
    path: Path,
    method: Method,
    options?: ApiRequestOptions<Path, Method>
  ): Promise<ApiResponse<Path, Method>>
} {
  return {
    async request<Path extends ApiPath, Method extends ApiMethod<Path>>(
      path: Path,
      method: Method,
      options?: ApiRequestOptions<Path, Method>
    ): Promise<ApiResponse<Path, Method>> {
      return transport<ApiResponse<Path, Method>>({
        url: resolvePath(path, options?.pathParams),
        method: toMobileMethod(method),
        data: options?.body,
        params: options?.query as Record<string, unknown> | undefined,
        timeout: options?.timeout
      })
    }
  }
}

export const apiClient = createApiClient()
