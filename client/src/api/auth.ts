import api from './index'

export interface LoginParams {
  username: string
  password: string
}

export interface LoginResult {
  token: string
  user: {
    id: number
    username: string
    avatar?: string
  }
}

export function loginApi(data: LoginParams) {
  return api.post<LoginResult>('/auth/login', data)
}

export function getUserInfoApi() {
  return api.get<LoginResult['user']>('/auth/userinfo')
}
