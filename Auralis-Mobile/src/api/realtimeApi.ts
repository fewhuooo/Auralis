import type { components } from './generated/schema'
import { defaultApiCallClient, type ApiCallClient } from './apiCallClient.ts'

type TicketResponse = components['schemas']['TicketResponse']

export function createRealtimeApi(client: ApiCallClient = defaultApiCallClient) {
  return {
    issueTicket: (deviceId: string) => client.request(
      '/api/realtime/ticket', 'post', { body: { deviceId } },
    ) as Promise<TicketResponse>,
  }
}

export const realtimeApi = createRealtimeApi()
