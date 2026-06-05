import api from './index'

export interface TaskDiagnostics {
  url?: string
  hasPageHtml: boolean
  pageHtmlSize?: number
  cookieCount: number
  localStorageKeyCount: number
  error?: string
  errorType?: string
  suggestion?: string
  itemId?: number
  itemTitle?: string
  markdownLength?: number
  htmlLength?: number
  capturedAt?: string
}

export interface JobInfo {
  id: string
  toolKey: string
  status: 'pending' | 'running' | 'active' | 'success' | 'completed' | 'failed'
  error: string | null
  createdAt: string
  diagnostics?: TaskDiagnostics
  diagnosticsSummary?: string
}

export interface JobsResponse {
  jobs: JobInfo[]
  total: number
  page: number
  pageSize: number
}

export interface JobsMetrics {
  totalItems: number
  todayItems: number
  runningCount: number
  successRate: number | null
  failedCount: number
}

export function fetchJobs(params: {
  page?: number
  pageSize?: number
  toolKey?: string
  status?: string
}) {
  return api.get<JobsResponse>('/jobs', { params })
}

export function fetchJobsMetrics(params?: { toolKey?: string }) {
  return api.get<JobsMetrics>('/jobs/metrics', { params })
}

export function retryJob(id: string) {
  return api.post(`/jobs/${id}/retry`)
}
