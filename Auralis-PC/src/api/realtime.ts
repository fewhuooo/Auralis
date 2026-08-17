import request from './request.ts'
import type { components } from './generated/schema.ts'
import { getDeviceIdentity } from '../auth/deviceIdentity.ts'

export type TicketRequest = components['schemas']['TicketRequest']
export type TicketResponse = components['schemas']['TicketResponse']

export async function requestRealtimeTicket(deviceId?: string): Promise<TicketResponse> {
  const targetDeviceId = deviceId || getDeviceIdentity().deviceId
  const body: TicketRequest = { deviceId: targetDeviceId }
  return request.post('/api/realtime/ticket', body) as unknown as Promise<TicketResponse>
}

export const realtimeApi = {
  requestRealtimeTicket,
}

export default realtimeApi
