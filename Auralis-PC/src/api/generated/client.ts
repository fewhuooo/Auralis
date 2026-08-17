import type { AxiosRequestConfig } from 'axios'
import request from '@/api/request'
import type { paths } from './schema'

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options' | 'head' | 'trace'

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
  signal?: AbortSignal
  timeout?: number
}

export type ApiTransport = <Response>(config: AxiosRequestConfig) => Promise<Response>

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

async function defaultTransport<Response>(config: AxiosRequestConfig): Promise<Response> {
  const result = await request.request<Response>(config)
  // The existing request adapter unwraps its response in an interceptor.
  return result as unknown as Response
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
      const config: AxiosRequestConfig = {
        url: resolvePath(path, options?.pathParams),
        method: method.toUpperCase() as AxiosRequestConfig['method'],
        params: options?.query,
        data: options?.body,
        signal: options?.signal,
        timeout: options?.timeout
      }
      return transport<ApiResponse<Path, Method>>(config)
    }
  }
}

export const apiClient = createApiClient()
