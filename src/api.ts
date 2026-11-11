import type { QuestionRow } from '../shared/analysis'

export interface User { id: number; username: string }
export interface MockMeta { id: number; name: string; taken_on: string; has_time_data: boolean }
export interface MockSummary extends MockMeta { questions: number; score: number; reachable_score: number; max_score: number }
export interface MockData { mock: MockMeta; rows: (QuestionRow & { id: number })[] }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth?action=')) window.dispatchEvent(new Event('logged-out'))
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`)
  }
  return data as T
}

export const api = {
  me: () => call<{ user: User }>('GET', '/api/auth'),
  login: (username: string, password: string) => call<{ user: User }>('POST', '/api/auth?action=login', { username, password }),
  signup: (username: string, password: string) => call<{ user: User }>('POST', '/api/auth?action=signup', { username, password }),
  logout: () => call('POST', '/api/auth?action=logout'),
  mocks: () => call<{ mocks: MockSummary[] }>('GET', '/api/mocks'),
  mock: (id: number) => call<MockData>('GET', `/api/mocks?id=${id}`),
  updateMock: (id: number, patch: Partial<MockMeta>) => call<MockData>('PATCH', `/api/mocks?id=${id}`, patch),
  updateQuestion: (id: number, patch: Partial<QuestionRow>) =>
    call<{ row: QuestionRow & { id: number } }>('PATCH', `/api/questions?id=${id}`, patch),
  token: () => call<{ token: string; mcp_url: string }>('GET', '/api/token'),
  newToken: () => call<{ token: string; mcp_url: string }>('POST', '/api/token'),
}
