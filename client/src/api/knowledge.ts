import api from './index'

export interface KnowledgeItem {
  id: number
  title: string
  url: string
  source: string
  contentMarkdown: string
  capturedAt: string
  status: string
  errorMessage: string | null
}

export interface CapturePayload {
  url: string
  cookies?: string
  localStorage?: string
}

export interface CaptureResult {
  jobId: string
}

export function captureUrl(payload: CapturePayload) {
  return api.post<CaptureResult>('/tools/knowledge-capture/capture', payload)
}

export function fetchKnowledgeItems(params: { page?: number; pageSize?: number }) {
  return api.get<{ items: KnowledgeItem[]; total: number }>(
    '/tools/knowledge-capture/items',
    { params },
  )
}

export function fetchKnowledgeItem(id: number) {
  return api.get<KnowledgeItem>(`/tools/knowledge-capture/items/${id}`)
}

export function deleteKnowledgeItem(id: number) {
  return api.delete(`/tools/knowledge-capture/items/${id}`)
}
