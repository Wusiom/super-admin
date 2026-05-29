import api from './index'

export interface ToolInfo {
  key: string
  name: string
  icon: string
  route: string
  enabled: boolean
}

export function fetchTools() {
  return api.get<ToolInfo[]>('/tools')
}
