import request from './request'

export const useAuthApi = {
  login(data: any) {
    return request.post('/api/auth/login', data)
  },
  register(data: any) {
    return request.post('/api/auth/register', data)
  }
}
