// Pure computed-value functions, ported directly from the kiosk_launch_tab.html
// mockup's JS (computeMetrics, computeIndicators, collectTodoAttentionItems,
// buildFocus, buildDigest) -- the logic there is correct, only the data
// source changed (real API instead of DOM attributes / localStorage).
import type { Task, AttentionItem, AttentionIcon, FocusItem, StaffUser } from './types'

const DAY_MS = 86400000
const PROJECT_START = { y: 2026, m: 8, d: 1 } // fixed anchor, not relative to "today"

// Backend returns due_date as an ISO timestamp derived from a DATE column.
// Take the calendar-date digits directly and build a local midnight Date,
// exactly like the mockup's `[y,m,d] = dateStr.split('-')` -- never let the
// browser's own timezone re-interpret the instant, which can shift the day.
export function dateOnly(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS)
}

export function computeDueBucket(dueDate: Date, today: Date): 'overdue' | 'thisweek' | 'later' {
  const days = daysBetween(dueDate, today)
  if (days < 0) return 'overdue'
  if (days <= 7) return 'thisweek'
  return 'later'
}

export function dueBucketForTask(task: Task, today: Date): 'overdue' | 'thisweek' | 'later' | 'done' {
  if (task.status === 'done') return 'done'
  return computeDueBucket(dateOnly(task.due_date), today)
}

export function phaseForDate(dueDate: Date): 'week 1-2' | 'week 3-4' | 'week 5-8' {
  const start = new Date(PROJECT_START.y, PROJECT_START.m - 1, PROJECT_START.d)
  const days = daysBetween(dueDate, start)
  if (days <= 13) return 'week 1-2'
  if (days <= 27) return 'week 3-4'
  return 'week 5-8'
}

function taskWeight(task: Task): number {
  return task.urgency === 'critical' ? 2 : 1
}

export function computeReadinessPct(tasks: Task[]): number {
  let totalWeight = 0
  let doneWeight = 0
  for (const t of tasks) {
    const w = taskWeight(t)
    totalWeight += w
    if (t.status === 'done') doneWeight += w
  }
  return totalWeight ? Math.round((doneWeight / totalWeight) * 100) : 0
}

export type ScheduleBudget = {
  expectedPct: number
  actualPct: number
  scheduleStatus: 'good' | 'watch' | 'risk'
  scheduleLabel: string
  budget: number
  committed: number
  paid: number
  committedPct: number
  paidPct: number
  budgetStatus: 'good' | 'watch' | 'risk'
  budgetLabel: string
}

export function computeScheduleAndBudget(tasks: Task[], today: Date): ScheduleBudget {
  const dates = tasks.map((t) => dateOnly(t.due_date).getTime())
  const start = dates.length ? Math.min(...dates) : today.getTime()
  const end = dates.length ? Math.max(...dates) : today.getTime()
  const totalSpan = end - start || 1
  const elapsed = Math.min(Math.max((today.getTime() - start) / totalSpan, 0), 1)
  const expectedPct = Math.round(elapsed * 100)

  const actualPct = computeReadinessPct(tasks)
  const diff = actualPct - expectedPct

  let scheduleStatus: ScheduleBudget['scheduleStatus']
  let scheduleLabel: string
  if (diff >= 0) { scheduleStatus = 'good'; scheduleLabel = 'On track' }
  else if (diff >= -20) { scheduleStatus = 'watch'; scheduleLabel = 'Slightly behind' }
  else { scheduleStatus = 'risk'; scheduleLabel = 'Behind schedule' }

  const budget = tasks.reduce((s, t) => s + t.budget_cents, 0)
  const committed = tasks.reduce((s, t) => s + t.committed_cents, 0)
  const paid = tasks.reduce((s, t) => s + t.paid_cents, 0)
  const committedPct = budget ? Math.round((committed / budget) * 100) : 0
  const paidPct = budget ? Math.round((paid / budget) * 100) : 0
  const paceDiff = committedPct - expectedPct

  let budgetStatus: ScheduleBudget['budgetStatus']
  let budgetLabel: string
  if (paceDiff <= 15) { budgetStatus = 'good'; budgetLabel = 'On pace' }
  else if (paceDiff <= 40) { budgetStatus = 'watch'; budgetLabel = 'Ahead of pace' }
  else { budgetStatus = 'risk'; budgetLabel = 'Committing fast' }

  return { expectedPct, actualPct, scheduleStatus, scheduleLabel, budget, committed, paid, committedPct, paidPct, budgetStatus, budgetLabel }
}

function cleanTaskName(name: string): string {
  return name.replace(/OVERDUE|BLOCKED|NEEDS DECISION/g, '').trim()
}

// Union of overdue todos, critical todos due <=7d, and todos on
// needs_decision tasks -- grouped/deduped exactly as collectTodoAttentionItems
// in the mockup.
export function collectTodoAttentionItems(tasks: Task[], today: Date): AttentionItem[] {
  const items: AttentionItem[] = []
  for (const t of tasks) {
    const taskName = cleanTaskName(t.name)
    const days = daysBetween(dateOnly(t.due_date), today)
    const openTodos = t.todos.filter((td) => !td.done)
    if (!openTodos.length) continue

    const isOverdue = days < 0

    for (const td of openTodos) {
      const todoUrgency = td.urgency || t.urgency
      if (isOverdue) {
        items.push({ icon: 'overdue', name: td.text, task: taskName, reason: 'Overdue', priority: 0 })
      } else if (todoUrgency === 'critical' && days >= 0 && days <= 7 && t.status !== 'done') {
        items.push({ icon: 'critical', name: td.text, task: taskName, reason: `Due in ${days}d`, priority: 1 })
      }
      if (t.needs_decision) {
        items.push({ icon: 'decision', name: td.text, task: taskName, reason: 'Needs decision', priority: 3 })
      }
    }
  }
  return items
}

export function buildAttention(tasks: Task[], today: Date, limit = 5): AttentionItem[] {
  return [...collectTodoAttentionItems(tasks, today)].sort((a, b) => a.priority - b.priority).slice(0, limit)
}

export type MeetingGroup = { key: AttentionIcon; label: string; items: { name: string; meta: string }[] }

export function buildMeetingZone(tasks: Task[], today: Date): MeetingGroup[] {
  const raw = collectTodoAttentionItems(tasks, today)
  const groups: Record<AttentionIcon, { name: string; meta: string }[]> = { overdue: [], critical: [], decision: [] }
  for (const it of raw) groups[it.icon].push({ name: it.name, meta: `${it.task} · ${it.reason}` })

  const defs: { key: AttentionIcon; label: string }[] = [
    { key: 'overdue', label: 'Overdue' },
    { key: 'critical', label: 'Critical, due soon' },
    { key: 'decision', label: 'Needs decision' },
  ]
  return defs.filter((d) => groups[d.key].length).map((d) => ({ ...d, items: groups[d.key] }))
}

export function buildFocus(tasks: Task[], today: Date, owners: StaffUser[]): Record<number, FocusItem[]> {
  const result: Record<number, FocusItem[]> = {}
  for (const owner of owners) {
    const ownerTasks = tasks.filter((t) => t.owner_id === owner.user_id && t.status !== 'done')
    const items: FocusItem[] = []
    for (const t of ownerTasks) {
      const name = cleanTaskName(t.name)
      const days = daysBetween(dateOnly(t.due_date), today)
      if (dueBucketForTask(t, today) === 'overdue') {
        items.push({ icon: 'overdue', name, reason: 'Overdue', priority: 0 })
      } else if (t.urgency === 'critical' && days >= 0 && days <= 7) {
        items.push({ icon: 'critical', name, reason: `Due in ${days}d`, priority: 1 })
      }
    }
    items.sort((a, b) => a.priority - b.priority)
    result[owner.user_id] = items.slice(0, 3)
  }
  return result
}

export function buildDigest(tasks: Task[], today: Date): string {
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const dueToday = tasks.filter((t) => t.due_date.slice(0, 10) === todayStr).length
  const overdue = tasks.filter((t) => dueBucketForTask(t, today) === 'overdue').length
  const doneRecent = tasks.filter((t) => t.status === 'done' && daysBetween(today, dateOnly(t.due_date)) <= 2).length
  const decisions = tasks.filter((t) => t.needs_decision).length

  const parts: string[] = []
  if (overdue) parts.push(`${overdue} overdue`)
  if (dueToday) parts.push(`${dueToday} due today`)
  if (doneRecent) parts.push(`${doneRecent} completed in the last 2 days`)
  if (decisions) parts.push(`${decisions} waiting on a decision`)
  return parts.length ? parts.join(' · ') : 'Nothing urgent — quiet day.'
}

export type Metrics = {
  criticalCount: number
  doneCount: number
  totalCount: number
  thisWeekCount: number
  overdueCount: number
  readinessPct: number
}

export function computeMetrics(tasks: Task[], today: Date): Metrics {
  const criticalCount = tasks.filter((t) => t.urgency === 'critical').length
  const doneCount = tasks.filter((t) => t.status === 'done').length
  const thisWeekCount = tasks.filter((t) => dueBucketForTask(t, today) === 'thisweek').length
  const overdueCount = tasks.filter((t) => dueBucketForTask(t, today) === 'overdue').length
  return { criticalCount, doneCount, totalCount: tasks.length, thisWeekCount, overdueCount, readinessPct: computeReadinessPct(tasks) }
}

export function tagProgress(tasks: Task[], tag: Task['tag']): { done: number; total: number; pct: number } {
  const inTag = tasks.filter((t) => t.tag === tag)
  const done = inTag.filter((t) => t.status === 'done').length
  const total = inTag.length
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 }
}

export function formatCents(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`
}

export function formatDueLabel(iso: string): string {
  return dateOnly(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase()
}
