import axios from 'axios'
import type { Goal, MobileOverview, PinMember } from './types'

function apiUrl() {
  return import.meta.env.VITE_API_BASE_URL
}

function authConfig() {
  const token = localStorage.getItem('token')
  return { headers: { Authorization: `Bearer ${token}` } }
}

// Unauthenticated -- used only to populate the "assign to" picker with the
// real team roster, not for login (the mobile page just uses whoever's
// already signed in; see MobileTeam.tsx).
export async function fetchPinMembers(): Promise<PinMember[]> {
  const res = await axios.get(`${apiUrl()}/api/auth/pin-members`)
  return res.data.data
}

export async function fetchOverview(): Promise<MobileOverview> {
  const res = await axios.get(`${apiUrl()}/api/admin/mobile-overview`, authConfig())
  return res.data.data
}

export async function fetchGoals(): Promise<Goal[]> {
  const res = await axios.get(`${apiUrl()}/api/admin/goals`, authConfig())
  return res.data.data
}

export async function createGoal(input: {
  name: string
  target_date?: string
  main_focus?: string
  steps?: { text: string }[]
}): Promise<Goal> {
  const res = await axios.post(`${apiUrl()}/api/admin/goals`, input, authConfig())
  return res.data.data
}

export async function setGoalStatus(id: number, status: 'not_started' | 'in_progress' | 'done'): Promise<Goal> {
  const res = await axios.patch(`${apiUrl()}/api/admin/goals/${id}`, { status }, authConfig())
  return res.data.data
}

export async function toggleGoalStep(stepId: number, done: boolean): Promise<void> {
  await axios.patch(`${apiUrl()}/api/admin/goals/steps/${stepId}`, { done }, authConfig())
}

export async function addGoalStep(goalId: number, text: string): Promise<void> {
  await axios.post(`${apiUrl()}/api/admin/goals/${goalId}/steps`, { text }, authConfig())
}

export async function fetchDayNote(date: string): Promise<{ date: string; note: string }> {
  const res = await axios.get(`${apiUrl()}/api/admin/launch-day-notes/${date}`, authConfig())
  return res.data.data
}

export async function saveDayNote(date: string, note: string): Promise<{ date: string; note: string }> {
  const res = await axios.put(`${apiUrl()}/api/admin/launch-day-notes/${date}`, { note }, authConfig())
  return res.data.data
}
