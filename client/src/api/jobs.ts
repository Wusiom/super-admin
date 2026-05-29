import api from './index'

export interface JobInfo {
  id: string
  toolKey: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  error: string | null
  createdAt: string
}

export function fetchJobs(params: {
  page?: number
  pageSize?: number
  toolKey?: string
  status?: string
}) {
  return api.get<{ jobs: JobInfo[]; total: number }>('/jobs', { params })
}

export function retryJob(id: string) {
  return api.post(`/jobs/${id}/retry`)
}
