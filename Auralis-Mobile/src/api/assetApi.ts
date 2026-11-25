import type { components } from './generated/schema'
import { defaultApiCallClient, type ApiCallClient } from './apiCallClient'

type UploadIntentRequest = components['schemas']['AssetUploadIntentRequest']
type UploadIntentResponse = components['schemas']['AssetUploadIntentResponse']
export type AssetDownloadUrlResponse = components['schemas']['AssetDownloadUrlResponse']

export function createAssetApi(client: ApiCallClient = defaultApiCallClient) {
  return {
    createUploadIntent: (body: UploadIntentRequest) => client.request(
      '/api/assets/upload-intents', 'post', { body },
    ) as Promise<UploadIntentResponse>,
    complete: (id: string) => client.request(
      '/api/assets/{id}/complete', 'post', { pathParams: { id } },
    ),
    downloadUrl: (id: string) => client.request(
      '/api/assets/{id}/download-url', 'post', { pathParams: { id } },
    ) as Promise<AssetDownloadUrlResponse>,
  }
}

export const assetApi = createAssetApi()
