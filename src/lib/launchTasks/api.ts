import axios from 'axios'
import type { Task, ActivityLogEntry, DayNote, Expense, StaffUser, Tag, Urgency, MeetingHighlight } from './types'

function apiUrl() {
  return import.meta.env.VITE_API_BASE_URL
}

function authConfig() {
  const token = localStorage.getItem('token')
  return { headers: { Authorization: `Bearer ${token}` } }
}

const BASE = () => `${apiUrl()}/api/admin/launch-tasks`

export async function fetchTasks(): Promise<Task[]> {
  const res = await axios.get(BASE(), authConfig())
  return res.data.data
}

export async function fetchUsers(): Promise<StaffUser[]> {
  const res = await axios.get(`${apiUrl()}/api/admin/users`, authConfig())
  return (res.data.data as StaffUser[]).filter((u) => u.is_active)
}

export async function fetchCurrentUser(): Promise<{ user_id: number; display_name: string; email: string }> {
  const res = await axios.get(`${apiUrl()}/api/auth/me`, authConfig())
  return res.data
}

export type WeekSummary = {
  weekStart: string
  totalMeals: number
  totalRevenueCents: number
  totalCogsCents: number
  profitCents: number
  marginPct: number
  prepTimeMinutes: number
}

export async function fetchThisWeekSummary(): Promise<WeekSummary> {
  const res = await axios.get(`${apiUrl()}/api/admin/prep/this-week/summary`, authConfig())
  return res.data.data
}

export async function createTask(input: {
  name: string
  owner_id: number
  tag: Tag
  urgency: Urgency
  due_date: string
  budget_cents?: number
}): Promise<Task> {
  const res = await axios.post(BASE(), input, authConfig())
  return res.data.data
}

export async function updateTask(id: number, patch: Partial<{
  name: string
  owner_id: number
  tag: Tag
  urgency: Urgency
  due_date: string
  budget_cents: number
  committed_cents: number
  status: 'open' | 'done'
  needs_decision: boolean
  source_ref: string
}>): Promise<Task> {
  const res = await axios.patch(`${BASE()}/${id}`, patch, authConfig())
  return res.data.data
}

export async function deleteTask(id: number): Promise<void> {
  await axios.delete(`${BASE()}/${id}`, authConfig())
}

export async function fetchExpenses(taskId: number): Promise<Expense[]> {
  const res = await axios.get(`${BASE()}/${taskId}/expenses`, authConfig())
  return res.data.data
}

export async function addExpense(taskId: number, input: { date: string; description: string; amount_cents: number }): Promise<Task> {
  const res = await axios.post(`${BASE()}/${taskId}/expenses`, input, authConfig())
  return res.data.data.task
}

export async function deleteExpense(taskId: number, expenseId: number): Promise<Task> {
  const res = await axios.delete(`${BASE()}/${taskId}/expenses/${expenseId}`, authConfig())
  return res.data.data
}

export async function updateNote(taskId: number, note: string): Promise<Task> {
  const res = await axios.patch(`${BASE()}/${taskId}/note`, { note }, authConfig())
  return res.data.data
}

export async function addTodo(taskId: number, text: string, urgency: Urgency) {
  const res = await axios.post(`${BASE()}/${taskId}/todos`, { text, urgency }, authConfig())
  return res.data.data
}

export async function updateTodo(taskId: number, todoId: number, patch: Partial<{ text: string; done: boolean; urgency: Urgency }>) {
  const res = await axios.patch(`${BASE()}/${taskId}/todos/${todoId}`, patch, authConfig())
  return res.data.data
}

export async function deleteTodo(taskId: number, todoId: number) {
  await axios.delete(`${BASE()}/${taskId}/todos/${todoId}`, authConfig())
}

export async function fetchActivityLog(limit = 20): Promise<ActivityLogEntry[]> {
  const res = await axios.get(`${BASE()}/activity-log?limit=${limit}`, authConfig())
  return res.data.data
}

export async function fetchDayNote(date: string): Promise<DayNote> {
  const res = await axios.get(`${apiUrl()}/api/admin/launch-day-notes/${date}`, authConfig())
  return res.data.data
}

export async function saveDayNote(date: string, note: string): Promise<DayNote> {
  const res = await axios.put(`${apiUrl()}/api/admin/launch-day-notes/${date}`, { note }, authConfig())
  return res.data.data
}

export async function fetchMeetingHighlights(): Promise<MeetingHighlight[]> {
  const res = await axios.get(`${apiUrl()}/api/admin/launch-meeting-highlights`, authConfig())
  return res.data.data
}

export async function addMeetingHighlight(text: string): Promise<MeetingHighlight> {
  const res = await axios.post(`${apiUrl()}/api/admin/launch-meeting-highlights`, { text }, authConfig())
  return res.data.data
}

export async function updateMeetingHighlight(id: number, text: string): Promise<MeetingHighlight> {
  const res = await axios.patch(`${apiUrl()}/api/admin/launch-meeting-highlights/${id}`, { text }, authConfig())
  return res.data.data
}

export async function deleteMeetingHighlight(id: number): Promise<void> {
  await axios.delete(`${apiUrl()}/api/admin/launch-meeting-highlights/${id}`, authConfig())
}
