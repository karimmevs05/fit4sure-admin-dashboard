import axios from 'axios'
import type { Task, Milestone, ActivityLogEntry, DayNote, Expense, Owner, Tag, Urgency } from './types'

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

export async function createTask(input: {
  name: string
  owner: Owner
  tag: Tag
  urgency: Urgency
  due_date: string
  budget_cents?: number
  actor: string
}): Promise<Task> {
  const res = await axios.post(BASE(), input, authConfig())
  return res.data.data
}

export async function updateTask(id: number, patch: Partial<{
  name: string
  owner: Owner
  tag: Tag
  urgency: Urgency
  due_date: string
  budget_cents: number
  committed_cents: number
  status: 'open' | 'done'
  needs_decision: boolean
  source_ref: string
  actor: string
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

export async function addExpense(taskId: number, input: { date: string; description: string; amount_cents: number; actor: string }): Promise<Task> {
  const res = await axios.post(`${BASE()}/${taskId}/expenses`, input, authConfig())
  return res.data.data.task
}

export async function deleteExpense(taskId: number, expenseId: number, actor: string): Promise<Task> {
  const res = await axios.delete(`${BASE()}/${taskId}/expenses/${expenseId}`, { ...authConfig(), data: { actor } })
  return res.data.data
}

export async function updateNote(taskId: number, note: string, actor: string): Promise<Task> {
  const res = await axios.patch(`${BASE()}/${taskId}/note`, { note, actor }, authConfig())
  return res.data.data
}

export async function addTodo(taskId: number, text: string, urgency: Urgency, actor: string) {
  const res = await axios.post(`${BASE()}/${taskId}/todos`, { text, urgency, actor }, authConfig())
  return res.data.data
}

export async function updateTodo(taskId: number, todoId: number, patch: Partial<{ text: string; done: boolean; urgency: Urgency }>, actor: string) {
  const res = await axios.patch(`${BASE()}/${taskId}/todos/${todoId}`, { ...patch, actor }, authConfig())
  return res.data.data
}

export async function deleteTodo(taskId: number, todoId: number, actor: string) {
  await axios.delete(`${BASE()}/${taskId}/todos/${todoId}`, { ...authConfig(), data: { actor } })
}

export async function fetchMilestones(): Promise<Milestone[]> {
  const res = await axios.get(`${BASE()}/milestones`, authConfig())
  return res.data.data
}

export async function updateMilestone(id: number, status: Milestone['status'], actor: string): Promise<Milestone> {
  const res = await axios.patch(`${BASE()}/milestones/${id}`, { status, actor }, authConfig())
  return res.data.data
}

export async function fetchActivityLog(limit = 20): Promise<ActivityLogEntry[]> {
  const res = await axios.get(`${BASE()}/activity-log?limit=${limit}`, authConfig())
  return res.data.data
}

export async function fetchDayNote(date: string): Promise<DayNote> {
  const res = await axios.get(`${apiUrl()}/api/admin/launch-day-notes/${date}`, authConfig())
  return res.data.data
}

export async function saveDayNote(date: string, note: string, actor: string): Promise<DayNote> {
  const res = await axios.put(`${apiUrl()}/api/admin/launch-day-notes/${date}`, { note, actor }, authConfig())
  return res.data.data
}
