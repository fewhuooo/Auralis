import request from './request.ts'
import type { components } from './generated/schema.ts'

export type TicketResponse = components['schemas']['TicketResponse']

export async function requestRealtimeTicket(): Promise<TicketResponse> {
  return request.post('/api/realtime/ticket') as unknown as Promise<TicketResponse>
}

export const realtimeApi = {
  requestRealtimeTicket,
}

export default realtimeApi
