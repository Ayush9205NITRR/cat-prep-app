import type { QuestionRow } from '../shared/analysis'

export interface User { id: number; username: string }
export interface MockMeta { id: number; name: string; taken_on: string; has_time_data: boolean; section: string | null; source: 'mock' | 'test' | 'retest'; topic: string | null; scope: string | null }
export interface MockSummary extends MockMeta { questions: number; score: number; reachable_score: number; max_score: number }
export interface MockData { mock: MockMeta; rows: (QuestionRow & { id: number })[] }

export interface PracticeQuestion {
  id: number; topic: string; difficulty: 'easy' | 'medium' | 'hard'; text: string; options: string[]; correct_index: number
  ideal_seconds: number; type_options: string[]; type_answer: number; approach_options: string[]; approach_answer: number
  solution_notes: string; hints: string[]; source: string
}
export interface PracticeSummary { id: number; topic: string; difficulty: string; text: string; source: string; attempts: number; right_attempts: number; last_correct: boolean | null }
export interface SolvingQuestion { question_id: number; topic: string; difficulty: string; text: string; options: string[]; ideal_seconds: number }
export interface Attempt {
  id: number; question_id: number; topic: string; chosen_index: number; correct: boolean; seconds: number
  type_tap: number | null; approach_tap: number | null; error_class: 'A' | 'B' | 'C' | null; repeat: boolean | null; created_at: string
}
export interface TopicHistory {
  topic: string; attempts: number; right: number
  errors: { A: number; B: number; C: number; not_tapped: number; repeats: number }
  history: (Attempt & { text: string; difficulty: string; ideal_seconds: number })[]
}
export type NoteKind = 'summary' | 'text' | 'link' | 'file' | 'fix'
export interface NoteSummary {
  id: number; topic: string; title: string; click_type: string | null; cards: number; due: number
  kind: NoteKind; link_url: string | null; preview: string; file_id: number | null; file_mime: string | null
  fix_row_id: number | null; fix_mock_id: number | null; file_read: boolean
}
export interface Note { id: number; topic: string; title: string; summary: string; formulas: string[]; click_type: string | null; source: string; kind: NoteKind; link_url: string | null; fix_row_id: number | null; fix_mock_id: number | null; file_read: boolean }
export interface NoteFile { id: number; name: string; mime: string; size: number }
export interface Card { id: number; note_id: number; front: string; back: string; streak: number; due_on: string; reviews: number }

export interface TopicStats { notes: number; questions: number; due: number; open: number; fixed: number; repeated: number; last_test: string | null }
export interface MistakeItem {
  status: 'Open' | 'Fixed' | 'Repeated'; error: 'A' | 'B' | 'C' | 'not reviewed' | null; times_wrong: number
  row_id: number; mock_id: number; mock_name: string; text: string; options: string[]; chosen_index: number | null; correct_index: number
  seconds: number | null; ideal_seconds: number; over_time: boolean; fix: { note_id: number; title: string; summary: string } | null
}
export interface TopicData {
  topic: string; section: string; mistakes: MistakeItem[]; notes: NoteSummary[]; flashcards_due: number; retestable: number
  questions: { id: number; difficulty: string; text: string; source: string; answered: number }[]
}
export type DueCard = Card & { title: string; topic: string; kind: string; fix_row_id: number | null; fix_mock_id: number | null }

export interface MockUploadItem { id: number; kind: 'mock' | 'assignment' | 'notes'; mime: string; result_link: string | null; name: string; section: string | null; pages: number; chars: number | null; pdf_kept: boolean; status: 'new' | 'saved'; mock_id: number | null }

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
  deleteMock: (id: number) => call('DELETE', `/api/mocks?id=${id}`),
  mockUploads: () => call<{ uploads: MockUploadItem[] }>('GET', '/api/mocks?view=uploads'),
  uploadMock: (x: { kind?: 'mock' | 'assignment' | 'notes'; mime?: string; name: string; section: string | null; page_texts: string[]; pdf_size: number; pdf_base64?: string }) =>
    call<{ id: number; pages: number; chars: number }>('POST', '/api/mocks?view=upload', x),
  deleteMockUpload: (id: number) => call('DELETE', `/api/mocks?view=upload&id=${id}`),
  updateQuestion: (id: number, patch: Partial<QuestionRow>) =>
    call<{ row: QuestionRow & { id: number } }>('PATCH', `/api/questions?id=${id}`, patch),
  // Tier 2
  practiceList: () => call<{ questions: PracticeSummary[] }>('GET', '/api/practice?view=list'),
  practiceQuestion: (id: number) => call<{ question: PracticeQuestion }>('GET', `/api/practice?view=question&id=${id}`),
  updatePracticeQuestion: (id: number, patch: Partial<PracticeQuestion>) =>
    call<{ question: PracticeQuestion }>('PATCH', `/api/practice?view=question&id=${id}`, patch),
  deletePracticeQuestion: (id: number) => call('DELETE', `/api/practice?view=question&id=${id}`),
  nextQuestion: (topic: string, difficulty?: string, skip?: number) =>
    call<{ question: SolvingQuestion | null }>('GET', `/api/practice?view=next&topic=${encodeURIComponent(topic)}${difficulty ? `&difficulty=${difficulty}` : ''}${skip ? `&skip=${skip}` : ''}`),
  submitAttempt: (question_id: number, chosen_index: number, seconds: number) =>
    call<{ attempt: Attempt; question: PracticeQuestion }>('POST', '/api/practice?view=attempt', { question_id, chosen_index, seconds }),
  setTaps: (id: number, type_tap: number | null, approach_tap: number | null) =>
    call<{ attempt: Attempt }>('PATCH', `/api/practice?view=attempt&id=${id}`, { type_tap, approach_tap }),
  history: (topic: string) => call<TopicHistory>('GET', `/api/practice?view=history&topic=${encodeURIComponent(topic)}`),
  // Tier 3
  notes: () => call<{ notes: NoteSummary[]; due: number }>('GET', '/api/notes?view=list'),
  note: (id: number) => call<{ note: Note; cards: Card[]; files: NoteFile[] }>('GET', `/api/notes?view=note&id=${id}`),
  updateNote: (id: number, patch: Partial<Note>) => call<{ note: Note; cards: Card[]; files: NoteFile[] }>('PATCH', `/api/notes?view=note&id=${id}`, patch),
  deleteNote: (id: number) => call('DELETE', `/api/notes?view=note&id=${id}`),
  addCard: (noteId: number, front: string, back: string) => call<{ card: Card }>('POST', `/api/notes?view=card&note_id=${noteId}`, { front, back }),
  updateCard: (id: number, patch: Partial<Card>) => call<{ card: Card }>('PATCH', `/api/notes?view=card&id=${id}`, patch),
  noteVersions: (id: number) => call<{ versions: { id: number; title: string; summary: string; created_at: string }[] }>('GET', `/api/notes?view=versions&id=${id}`),
  restoreVersion: (id: number, version: number) => call<{ note: Note; cards: Card[]; files: NoteFile[] }>('POST', `/api/notes?view=restore&id=${id}&version=${version}`),
  setExamDate: (exam_date: string | null) => call<{ exam_date: string | null }>('POST', '/api/auth?action=profile', { exam_date }),
  profile: () => call<{ exam_date: string | null }>('GET', '/api/auth?action=profile'),
  deleteCard: (id: number) => call('DELETE', `/api/notes?view=card&id=${id}`),
  createNote: (x: { topic: string; title?: string; content?: string; kind?: 'text'; file?: { name: string; mime: string; base64: string } }) =>
    call<{ id: number; kind: string }>('POST', '/api/notes?view=create', x),
  fileUrl: (id: number) => `/api/notes?view=file&id=${id}`,
  dueCards: (topic?: string) => call<{ cards: DueCard[] }>('GET', `/api/notes?view=due${topic ? `&topic=${encodeURIComponent(topic)}` : ''}`),
  reviewCard: (id: number, right: boolean) => call<{ card: Card; due_in_days: number }>('POST', `/api/notes?view=review&id=${id}`, { right }),
  // FIXES round 1
  topicsSummary: () => call<{ topics: Record<string, TopicStats> }>('GET', '/api/topics?view=summary'),
  topic: (t: string) => call<TopicData>('GET', `/api/topics?view=topic&topic=${encodeURIComponent(t)}`),
  testQuestions: (scope: { section?: string; area?: string; topic?: string }, count: number) =>
    call<{ questions: SolvingQuestion[] }>('GET', `/api/topics?view=test&count=${count}${Object.entries(scope).filter(([, v]) => v).map(([k, v]) => `&${k}=${encodeURIComponent(v!)}`).join('')}`),
  retestQuestions: (topic?: string) => call<{ questions: SolvingQuestion[] }>('GET', `/api/topics?view=retest${topic ? `&topic=${encodeURIComponent(topic)}` : ''}`),
  submitTest: (kind: 'test' | 'retest', scope: string, answers: { question_id: number; chosen_index: number | null; seconds: number }[]) =>
    call<{ mock_id: number }>('POST', '/api/topics?view=submit', { kind, scope, answers }),
  retestOutcome: (mockId: number) => call<{ retested: number; fixed: number; still_open: number }>('GET', `/api/topics?view=outcome&mock_id=${mockId}`),
  token: () => call<{ token: string; mcp_url: string }>('GET', '/api/token'),
  newToken: () => call<{ token: string; mcp_url: string }>('POST', '/api/token'),
}
